import { Request, Response } from 'express';
import { ApiResponse } from '@/types';
import { AuthRequest } from '@/middleware/auth';
import dashboardService from '@/services/dashboardService';
import logger from '@/utils/logger';
import Attendance from '@/models/Attendance';
import WorkEntry from '@/models/WorkEntry';
import Process from '@/models/Process';
import User from '@/models/User';
import mongoose from 'mongoose';

// Get dashboard statistics
export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    logger.debug('Dashboard stats request', {
      userId: req.user?.id,
      role: req.user?.role,
      factoryId: req.user?.factoryId
    });

    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;
    
    const factoryId = req.user?.role === 'super_admin' ? undefined : req.user?.factoryId;

    const dashboardData = await dashboardService.getDashboardStats(factoryId, start, end);

    const response: ApiResponse = {
      success: true,
      message: 'Dashboard statistics retrieved successfully',
      status: 200,
      data: dashboardData
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get dashboard stats error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve dashboard statistics',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get production statistics
export const getProductionStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, processId } = req.query;
    
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;
    const factoryId = req.user?.role === 'super_admin' ? undefined : req.user?.factoryId;

    const productionStats = await dashboardService.getProductionStats(
      factoryId,
      start,
      end,
      processId as string | undefined
    );

    const response: ApiResponse = {
      success: true,
      message: 'Production statistics retrieved successfully',
      status: 200,
      data: productionStats
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get production stats error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve production statistics',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Test endpoint
export const testEndpoint = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const response: ApiResponse = {
      success: true,
      message: 'Test endpoint working',
      status: 200,
      data: { message: 'Dashboard routes are working' }
    };
    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Test endpoint error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Test endpoint failed',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get all processes with work entry statistics
export const getProcessesWithStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    logger.debug('Processes with stats request', {
      userId: req.user?.id,
      role: req.user?.role
    });

    let factoryFilter: Record<string, any> = {};
    if (req.user && req.user.role !== 'super_admin') {
      factoryFilter.factoryId = req.user.factoryId;
    }

    // Get all processes for the factory
    const processes = await Process.find(factoryFilter).sort({ createdAt: 1 });

    // Get work entries
    const workEntries = await WorkEntry.find(factoryFilter)
      .populate('employeeId', 'profile.firstName profile.lastName')
      .limit(10000); // Limit to prevent memory issues

    // Create a map of process statistics
    const processStatsMap = new Map<string, {
      totalAchieved: number;
      totalRejected: number;
      totalTarget: number;
      workEntries: number;
      employees: Set<string>;
      latestEmployee: string | null;
    }>();
    
    workEntries.forEach(entry => {
      const processId = entry.processId?.toString();
      if (!processId) return;

      if (!processStatsMap.has(processId)) {
        processStatsMap.set(processId, {
          totalAchieved: 0,
          totalRejected: 0,
          totalTarget: 0,
          workEntries: 0,
          employees: new Set(),
          latestEmployee: null
        });
      }
      
      const stats = processStatsMap.get(processId);
      if (stats) {
        stats.totalAchieved += entry.achieved || 0;
        stats.totalRejected += entry.rejected || 0;
        stats.totalTarget += entry.targetQuantity || 0;
        stats.workEntries += 1;
        
        if (entry.employeeId && typeof entry.employeeId === 'object') {
          const employeeName = `${(entry.employeeId as any)?.profile?.firstName || ''} ${(entry.employeeId as any)?.profile?.lastName || ''}`.trim();
          if (employeeName) {
            stats.employees.add(employeeName);
            stats.latestEmployee = employeeName;
          }
        }
      }
    });

    // Combine processes with their statistics
    const processesWithStats = processes.map(process => {
      const processId = process._id.toString();
      const stats = processStatsMap.get(processId) || {
        totalAchieved: 0,
        totalRejected: 0,
        totalTarget: 0,
        workEntries: 0,
        employees: new Set<string>(),
        latestEmployee: null
      };

      return {
        _id: process._id,
        name: process.name,
        isActive: (process as any).isActive || true,
        productId: (process as any).productId || null,
        totalAchieved: stats.totalAchieved,
        totalRejected: stats.totalRejected,
        totalTarget: stats.totalTarget,
        workEntries: stats.workEntries,
        employeeCount: stats.employees.size,
        currentEmployee: stats.latestEmployee || 'No Employee',
        efficiency: stats.totalTarget > 0 ? Math.round((stats.totalAchieved / stats.totalTarget) * 100 * 100) / 100 : 0
      };
    });

    const response: ApiResponse = {
      success: true,
      message: 'Processes with statistics retrieved successfully',
      status: 200,
      data: processesWithStats
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Error fetching processes with stats', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch processes with statistics',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get production summary by process (using aggregation pipeline)
export const getProductionSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter: Record<string, any> = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string)
        }
      };
    } else {
      // Default to today if no date range provided
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateFilter = {
        createdAt: {
          $gte: today,
          $lt: tomorrow
        }
      };
    }

    let factoryFilter: Record<string, any> = {};
    if (req.user && req.user.role !== 'super_admin') {
      factoryFilter.factoryId = req.user.factoryId;
    }

    logger.debug('Production summary aggregation', {
      factoryFilter,
      dateFilter
    });
    
    // Use MongoDB aggregation pipeline for efficient querying
    const productionSummary = await WorkEntry.aggregate([
      { $match: { ...factoryFilter, ...dateFilter } },
      {
        $lookup: {
          from: 'processes',
          localField: 'processId',
          foreignField: '_id',
          as: 'process'
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $group: {
          _id: {
            processId: '$processId',
            processName: { $arrayElemAt: ['$process.name', 0] },
            productId: '$productId',
            productName: { $arrayElemAt: ['$product.name', 0] }
          },
          totalAchieved: { $sum: '$achieved' },
          totalRejected: { $sum: '$rejected' },
          totalTarget: { $sum: '$targetQuantity' },
          workEntries: { $sum: 1 },
          employees: { $addToSet: '$employeeId' }
        }
      },
      {
        $project: {
          _id: 0,
          processId: '$_id.processId',
          processName: '$_id.processName',
          productId: '$_id.productId',
          productName: '$_id.productName',
          totalAchieved: 1,
          totalRejected: 1,
          totalTarget: 1,
          totalProduction: { $add: ['$totalAchieved', '$totalRejected'] },
          workEntries: 1,
          employeeCount: { $size: '$employees' },
          efficiency: {
            $cond: [
              { $gt: ['$totalTarget', 0] },
              { $multiply: [{ $divide: ['$totalAchieved', '$totalTarget'] }, 100] },
              0
            ]
          }
        }
      },
      {
        $sort: {
          processName: 1
        }
      }
    ]).limit(1000); // Limit results to prevent excessive memory usage

    // Calculate overall totals
    const overallTotals = productionSummary.reduce((acc, item) => {
      acc.totalAchieved += item.totalAchieved || 0;
      acc.totalRejected += item.totalRejected || 0;
      acc.totalTarget += item.totalTarget || 0;
      acc.totalWorkEntries += item.workEntries || 0;
      return acc;
    }, {
      totalAchieved: 0,
      totalRejected: 0,
      totalTarget: 0,
      totalWorkEntries: 0
    });

    overallTotals.totalProduction = overallTotals.totalAchieved + overallTotals.totalRejected;
    overallTotals.overallEfficiency = overallTotals.totalTarget > 0 
      ? Math.round((overallTotals.totalAchieved / overallTotals.totalTarget) * 100 * 100) / 100
      : 0;

    const responseData = {
      summary: productionSummary,
      totals: overallTotals,
      dateRange: {
        start: dateFilter.createdAt?.$gte || new Date(),
        end: dateFilter.createdAt?.$lte || new Date()
      }
    };

    const response: ApiResponse = {
      success: true,
      message: 'Production summary retrieved successfully',
      status: 200,
      data: responseData
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get production summary error', { 
      error: error.message, 
      stack: error.stack 
    });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve production summary',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get efficiency statistics
export const getEfficiencyStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, employeeId } = req.query;
    
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;
    const factoryId = req.user?.role === 'super_admin' ? undefined : req.user?.factoryId;

    const efficiencyStats = await dashboardService.getEfficiencyStats(
      factoryId,
      start,
      end,
      employeeId as string | undefined
    );

    const response: ApiResponse = {
      success: true,
      message: 'Efficiency statistics retrieved successfully',
      status: 200,
      data: efficiencyStats
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get efficiency stats error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve efficiency statistics',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get attendance statistics
export const getAttendanceStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, employeeId } = req.query;
    
    let dateFilter: Record<string, any> = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string)
        }
      };
    }

    let factoryFilter: Record<string, any> = {};
    if (req.user && req.user.role !== 'super_admin') {
      factoryFilter.factoryId = req.user.factoryId;
    }

    if (employeeId) {
      factoryFilter.employeeId = employeeId;
    }

    const attendanceStats = await Attendance.aggregate([
      { $match: { ...factoryFilter, ...dateFilter } },
      {
        $lookup: {
          from: 'users',
          localField: 'employeeId',
          foreignField: '_id',
          as: 'employee'
        }
      },
      {
        $group: {
          _id: {
            employeeId: '$employeeId',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
          },
          employeeName: { $first: { $concat: [{ $arrayElemAt: ['$employee.profile.firstName', 0] }, ' ', { $arrayElemAt: ['$employee.profile.lastName', 0] }] } },
          status: { $first: '$status' },
          workHours: { $first: '$workHours' }
        }
      },
      {
        $group: {
          _id: '$_id.employeeId',
          employeeName: { $first: '$employeeName' },
          totalDays: { $sum: 1 },
          present: { $sum: { $cond: [{ $in: ['$status', ['checked-in', 'checked-out', 'present']] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          totalWorkHours: { $sum: '$workHours' }
        }
      },
      { $sort: { totalWorkHours: -1 } },
      { $limit: 1000 } // Limit results
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'Attendance statistics retrieved successfully',
      status: 200,
      data: attendanceStats
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get attendance stats error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve attendance statistics',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get rejection statistics
export const getRejectionStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, processId } = req.query;
    
    let dateFilter: Record<string, any> = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string)
        }
      };
    }

    let factoryFilter: Record<string, any> = {};
    if (req.user && req.user.role !== 'super_admin') {
      factoryFilter.factoryId = req.user.factoryId;
    }

    if (processId) {
      factoryFilter.processId = new mongoose.Types.ObjectId(processId as string);
    }

    const rejectionStats = await WorkEntry.aggregate([
      { $match: { ...factoryFilter, ...dateFilter } },
      {
        $lookup: {
          from: 'processes',
          localField: 'processId',
          foreignField: '_id',
          as: 'process'
        }
      },
      {
        $group: {
          _id: '$processId',
          processName: { $first: { $arrayElemAt: ['$process.name', 0] } },
          totalTarget: { $sum: '$targetQuantity' },
          totalAchieved: { $sum: '$achieved' },
          totalRejected: { $sum: '$rejected' },
          rejectionRate: {
            $avg: {
              $cond: [
                { $gt: [{ $add: ['$achieved', '$rejected'] }, 0] },
                { $multiply: [{ $divide: ['$rejected', { $add: ['$achieved', '$rejected'] }] }, 100] },
                0
              ]
            }
          }
        }
      },
      { $sort: { rejectionRate: -1 } },
      { $limit: 1000 } // Limit results
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'Rejection statistics retrieved successfully',
      status: 200,
      data: rejectionStats
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get rejection stats error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve rejection statistics',
      status: 500
    };
    res.status(500).json(response);
  }
};

