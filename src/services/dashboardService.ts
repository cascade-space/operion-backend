import mongoose from 'mongoose';
import Attendance from '@/models/Attendance';
import WorkEntry from '@/models/WorkEntry';
import Process from '@/models/Process';
import Product from '@/models/Product';
import User from '@/models/User';
import cacheService from './cacheService';
import { responseCache } from '@/middleware/cacheMiddleware';

export interface DashboardStats {
  attendance: {
    totalRecords: number;
    checkedIn: number;
    checkedOut: number;
    absent: number;
    late: number;
  };
  workEntries: {
    totalEntries: number;
    pending: number;
    approved: number;
    rejected: number;
    totalTarget: number;
    totalAchieved: number;
    totalRejected: number;
    efficiency: number;
  };
  processes: {
    totalProcesses: number;
    active: number;
    inactive: number;
    maintenance: number;
  };
  products: {
    totalProducts: number;
    active: number;
    lowStock: number;
    totalStock: number;
    totalValue: number;
  };
  employees: {
    totalEmployees: number;
    active: number;
    inactive: number;
  };
}

export interface ProductionStats {
  date: string;
  target: number;
  achieved: number;
  rejected: number;
  efficiency: number;
}

export interface EfficiencyStats {
  employeeId: string;
  employeeName: string;
  totalTarget: number;
  totalAchieved: number;
  totalRejected: number;
  averageEfficiency: number;
  totalEntries: number;
}

class DashboardService {
  /**
   * Get dashboard statistics with caching
   */
  async getDashboardStats(
    factoryId: string | mongoose.Types.ObjectId | undefined,
    startDate?: Date,
    endDate?: Date
  ): Promise<DashboardStats> {
    const factoryIdStr = factoryId?.toString() || 'all';
    const dateRange = startDate && endDate 
      ? `${startDate.toISOString()}_${endDate.toISOString()}` 
      : 'all';
    
    const cacheKey = `dashboard:stats:${factoryIdStr}:${dateRange}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        return this.fetchDashboardStats(factoryId, startDate, endDate);
      },
      {
        factoryId: factoryIdStr,
        ttl: 300 // 5 minutes
      }
    );
  }

  private async fetchDashboardStats(
    factoryId: string | mongoose.Types.ObjectId | undefined,
    startDate?: Date,
    endDate?: Date
  ): Promise<DashboardStats> {
    let dateFilter: any = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      };
    }

    let factoryFilter: any = {};
    if (factoryId && factoryId !== 'all') {
      factoryFilter.factoryId = new mongoose.Types.ObjectId(factoryId.toString());
    }

    // Get attendance statistics
    const attendanceStats = await Attendance.aggregate([
      { $match: { ...factoryFilter, ...dateFilter } },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          checkedIn: { $sum: { $cond: [{ $eq: ['$status', 'checked-in'] }, 1, 0] } },
          checkedOut: { $sum: { $cond: [{ $eq: ['$status', 'checked-out'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } }
        }
      }
    ]);

    // Get work entry statistics
    const workEntryStats = await WorkEntry.aggregate([
      { $match: { ...factoryFilter, ...dateFilter } },
      {
        $group: {
          _id: null,
          totalEntries: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$validationStatus', 'pending'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$validationStatus', 'approved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$validationStatus', 'rejected'] }, 1, 0] } },
          totalTarget: { $sum: '$targetQuantity' },
          totalAchieved: { $sum: '$achieved' },
          totalRejected: { $sum: '$rejected' }
        }
      }
    ]);

    // Get process statistics
    const processStats = await Process.aggregate([
      { $match: factoryFilter },
      {
        $group: {
          _id: null,
          totalProcesses: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
          maintenance: { $sum: { $cond: [{ $eq: ['$status', 'maintenance'] }, 1, 0] } }
        }
      }
    ]);

    // Get product statistics
    const productStats = await Product.aggregate([
      { $match: factoryFilter },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          lowStock: { $sum: { $cond: [{ $lte: ['$inventory.currentStock', '$inventory.minStock'] }, 1, 0] } },
          totalStock: { $sum: '$inventory.currentStock' },
          totalValue: { $sum: { $multiply: ['$price', '$inventory.currentStock'] } }
        }
      }
    ]);

    // Get employee statistics
    const employeeStats = await User.aggregate([
      { $match: { ...factoryFilter, role: 'employee' } },
      {
        $group: {
          _id: null,
          totalEmployees: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          inactive: { $sum: { $cond: [{ $not: '$isActive' }, 1, 0] } }
        }
      }
    ]);

    // Calculate efficiency
    const efficiency = workEntryStats[0]?.totalTarget > 0 
      ? (workEntryStats[0].totalAchieved / workEntryStats[0].totalTarget) * 100 
      : 0;

    return {
      attendance: attendanceStats[0] || {
        totalRecords: 0,
        checkedIn: 0,
        checkedOut: 0,
        absent: 0,
        late: 0
      },
      workEntries: {
        ...workEntryStats[0] || {
          totalEntries: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          totalTarget: 0,
          totalAchieved: 0,
          totalRejected: 0
        },
        efficiency: Math.round(efficiency * 100) / 100
      },
      processes: processStats[0] || {
        totalProcesses: 0,
        active: 0,
        inactive: 0,
        maintenance: 0
      },
      products: productStats[0] || {
        totalProducts: 0,
        active: 0,
        lowStock: 0,
        totalStock: 0,
        totalValue: 0
      },
      employees: employeeStats[0] || {
        totalEmployees: 0,
        active: 0,
        inactive: 0
      }
    };
  }

  /**
   * Get production statistics
   */
  async getProductionStats(
    factoryId: string | mongoose.Types.ObjectId | undefined,
    startDate?: Date,
    endDate?: Date,
    processId?: string
  ): Promise<ProductionStats[]> {
    let dateFilter: any = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      };
    }

    let factoryFilter: any = {};
    if (factoryId && factoryId !== 'all') {
      factoryFilter.factoryId = new mongoose.Types.ObjectId(factoryId.toString());
    }

    if (processId) {
      factoryFilter.processId = new mongoose.Types.ObjectId(processId);
    }

    const productionStats = await WorkEntry.aggregate([
      { $match: { ...factoryFilter, ...dateFilter } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          target: { $sum: '$targetQuantity' },
          achieved: { $sum: '$achieved' },
          rejected: { $sum: '$rejected' },
          efficiency: {
            $avg: {
              $cond: [
                { $gt: ['$targetQuantity', 0] },
                { $multiply: [{ $divide: ['$achieved', '$targetQuantity'] }, 100] },
                0
              ]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return productionStats.map(stat => ({
      date: stat._id,
      target: stat.target,
      achieved: stat.achieved,
      rejected: stat.rejected,
      efficiency: Math.round(stat.efficiency * 100) / 100
    }));
  }

  /**
   * Get efficiency statistics
   */
  async getEfficiencyStats(
    factoryId: string | mongoose.Types.ObjectId | undefined,
    startDate?: Date,
    endDate?: Date,
    employeeId?: string
  ): Promise<EfficiencyStats[]> {
    let dateFilter: any = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      };
    }

    let factoryFilter: any = {};
    if (factoryId && factoryId !== 'all') {
      factoryFilter.factoryId = new mongoose.Types.ObjectId(factoryId.toString());
    }

    if (employeeId) {
      factoryFilter.employeeId = new mongoose.Types.ObjectId(employeeId);
    }

    const efficiencyStats = await WorkEntry.aggregate([
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
        $lookup: {
          from: 'processes',
          localField: 'processId',
          foreignField: '_id',
          as: 'process'
        }
      },
      {
        $group: {
          _id: '$employeeId',
          employeeName: { 
            $first: { 
              $concat: [
                { $arrayElemAt: ['$employee.profile.firstName', 0] }, 
                ' ', 
                { $arrayElemAt: ['$employee.profile.lastName', 0] }
              ] 
            } 
          },
          totalTarget: { $sum: '$targetQuantity' },
          totalAchieved: { $sum: '$achieved' },
          totalRejected: { $sum: '$rejected' },
          averageEfficiency: {
            $avg: {
              $cond: [
                { $gt: ['$targetQuantity', 0] },
                { $multiply: [{ $divide: ['$achieved', '$targetQuantity'] }, 100] },
                0
              ]
            }
          },
          totalEntries: { $sum: 1 }
        }
      },
      { $sort: { averageEfficiency: -1 } }
    ]);

    return efficiencyStats.map(stat => ({
      employeeId: stat._id.toString(),
      employeeName: stat.employeeName || 'Unknown',
      totalTarget: stat.totalTarget,
      totalAchieved: stat.totalAchieved,
      totalRejected: stat.totalRejected,
      averageEfficiency: Math.round(stat.averageEfficiency * 100) / 100,
      totalEntries: stat.totalEntries
    }));
  }

  /**
   * Invalidate dashboard cache for a factory
   */
  invalidateCache(factoryId: string | mongoose.Types.ObjectId): void {
    const factoryIdStr = factoryId.toString();
    cacheService.invalidatePattern('dashboard:stats:*', { factoryId: factoryIdStr });
    // Also invalidate response cache for dashboard routes
    responseCache.invalidate('dashboard').catch(() => {
      // Ignore errors
    });
  }
}

export const dashboardService = new DashboardService();
export default dashboardService;

