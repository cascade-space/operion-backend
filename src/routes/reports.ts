import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import WorkEntry from '../models/WorkEntry';
import User from '../models/User';
import Process from '../models/Process';
import Product from '../models/Product';
import Attendance from '../models/Attendance';
import Factory from '../models/Factory';
import ProcessStage from '../models/ProcessStage';
import Machine from '../models/Machine';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';
import quantityService from '../services/quantityService';
import logger, { logError } from '../utils/logger';

const router: express.Router = express.Router();

// Get production trends
router.get('/trends', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, productId, processId, employeeId, factoryId } = req.query;
    
    let query: any = {};
    
    if (factoryId) {
      query.factoryId = new mongoose.Types.ObjectId(factoryId as string);
    }
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }
    
    if (productId && productId !== 'all') {
      query.productId = new mongoose.Types.ObjectId(productId as string);
    }
    
    if (processId && processId !== 'all') {
      query.processId = new mongoose.Types.ObjectId(processId as string);
    }
    
    if (employeeId && employeeId !== 'all') {
      query.employeeId = new mongoose.Types.ObjectId(employeeId as string);
    }

    const populatedWorkEntries = await WorkEntry.find(query)
      .populate('productId', 'name')
      .populate('processId', 'name')
      .populate('employeeId', 'profile.firstName profile.lastName')
      .sort({ createdAt: 1 });

    // Group by date and calculate metrics
    const trends = populatedWorkEntries.reduce((acc: any[], entry) => {
      const date = entry.createdAt.toISOString().split('T')[0];
      const existing = acc.find(item => item.date === date);
      
      if (existing) {
        existing.production += entry.achieved || 0;
        existing.rejection += entry.rejected || 0;
        existing.efficiency = ((existing.production / (existing.production + existing.rejection)) * 100) || 0;
      } else {
        acc.push({
          date,
          production: entry.achieved || 0,
          rejection: entry.rejected || 0,
          efficiency: entry.achieved > 0 ? 100 : 0,
          attendance: 100 // Placeholder
        });
      }
      
      return acc;
    }, []);

    res.json({
      success: true,
      data: { trends }
    });
  } catch (error) {
    logError('Error fetching trends', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trends' });
  }
});

// Get production data by product
router.get('/production', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, factoryId } = req.query;
    
    let query: any = {};
    
    if (factoryId) {
      query.factoryId = new mongoose.Types.ObjectId(factoryId as string);
    }
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }

    const populatedWorkEntries = await WorkEntry.find(query)
      .populate('productId', 'name targetQuantity')
      .populate('processId', 'name');

    // Group by product and calculate metrics
    const production = populatedWorkEntries.reduce((acc: any[], entry) => {
      const productName = (entry.productId as any)?.name || 'Unknown';
      const existing = acc.find(item => item.name === productName);
      
      if (existing) {
        existing.production += entry.achieved || 0;
        existing.target += entry.targetQuantity || 0;
        existing.efficiency = existing.target > 0 ? (existing.production / existing.target) * 100 : 0;
      } else {
        acc.push({
          name: productName,
          production: entry.achieved || 0,
          target: entry.targetQuantity || 0,
          efficiency: entry.targetQuantity > 0 ? ((entry.achieved || 0) / entry.targetQuantity) * 100 : 0
        });
      }
      
      return acc;
    }, []);

    res.json({
      success: true,
      data: { production }
    });
  } catch (error) {
    logError('Error fetching production data', error);
    res.status(500).json({ success: false, error: 'Failed to fetch production data' });
  }
});

// Get quality data
router.get('/quality', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, factoryId } = req.query;
    
    let query: any = {};
    
    if (factoryId) {
      query.factoryId = new mongoose.Types.ObjectId(factoryId as string);
    }
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }

    const populatedWorkEntries = await WorkEntry.find(query);

    const totalAchieved = populatedWorkEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0);
    const totalRejected = populatedWorkEntries.reduce((sum, entry) => sum + (entry.rejected || 0), 0);
    const total = totalAchieved + totalRejected;

    const quality = [
      {
        name: 'Passed',
        value: total > 0 ? (totalAchieved / total) * 100 : 0,
        color: 'hsl(var(--success))'
      },
      {
        name: 'Rejected',
        value: total > 0 ? (totalRejected / total) * 100 : 0,
        color: 'hsl(var(--destructive))'
      }
    ];

    res.json({
      success: true,
      data: { quality }
    });
  } catch (error) {
    logError('Error fetching quality data', error);
    res.status(500).json({ success: false, error: 'Failed to fetch quality data' });
  }
});

// Get employee performance data
router.get('/employee-performance', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, factoryId } = req.query;
    
    let query: any = {};
    
    if (factoryId) {
      query.factoryId = new mongoose.Types.ObjectId(factoryId as string);
    }
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }

    const populatedWorkEntries = await WorkEntry.find(query)
      .populate('employeeId', 'profile.firstName profile.lastName');

    // Group by employee and calculate metrics
    const employeePerformance = populatedWorkEntries.reduce((acc: any[], entry) => {
      const employeeName = `${(entry.employeeId as any)?.profile?.firstName || ''} ${(entry.employeeId as any)?.profile?.lastName || ''}`.trim() || 'Unknown';
      const existing = acc.find(item => item.name === employeeName);
      
      if (existing) {
        existing.production += entry.achieved || 0;
        existing.rejections += entry.rejected || 0;
        const total = existing.production + existing.rejections;
        existing.efficiency = total > 0 ? (existing.production / total) * 100 : 0;
      } else {
        const total = (entry.achieved || 0) + (entry.rejected || 0);
        acc.push({
          name: employeeName,
          production: entry.achieved || 0,
          efficiency: total > 0 ? ((entry.achieved || 0) / total) * 100 : 0,
          rejections: entry.rejected || 0
        });
      }
      
      return acc;
    }, []);

    res.json({
      success: true,
      data: { employeePerformance }
    });
  } catch (error) {
    logError('Error fetching employee performance', error);
    res.status(500).json({ success: false, error: 'Failed to fetch employee performance' });
  }
});

// Get comprehensive report
router.get('/comprehensive', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, factoryId } = req.query;
    const userFactoryId = req.user?.factoryId;
    
    let query: any = {};
    
    // Use factoryId from query if provided, otherwise use user's factoryId
    const targetFactoryId = factoryId || userFactoryId;
    
    if (targetFactoryId) {
      query.factoryId = new mongoose.Types.ObjectId(targetFactoryId as string);
    }
    
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      query.createdAt = {
        $gte: start,
        $lte: end
      };
    }

    const factoryObjectId = targetFactoryId ? new mongoose.Types.ObjectId(targetFactoryId as string) : null;
    const [populatedWorkEntries, activeEmployees] = await Promise.all([
      WorkEntry.find(query),
      User.countDocuments({ factoryId: factoryObjectId, role: { $in: ['employee', 'supervisor'] }, isActive: true })
    ]);


    const totalProduction = populatedWorkEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0);
    const totalRejections = populatedWorkEntries.reduce((sum, entry) => sum + (entry.rejected || 0), 0);
    const totalEfficiency = totalProduction + totalRejections > 0 ? (totalProduction / (totalProduction + totalRejections)) * 100 : 0;

    // Calculate trends (last 7 days)
    const trends = populatedWorkEntries.reduce((acc: any[], entry) => {
      const date = entry.createdAt.toISOString().split('T')[0];
      const existing = acc.find(item => item.date === date);
      
      if (existing) {
        existing.production += entry.achieved || 0;
        existing.rejection += entry.rejected || 0;
        existing.efficiency = ((existing.production / (existing.production + existing.rejection)) * 100) || 0;
      } else {
        acc.push({
          date,
          production: entry.achieved || 0,
          rejection: entry.rejected || 0,
          efficiency: entry.achieved > 0 ? 100 : 0,
          attendance: 100
        });
      }
      
      return acc;
    }, []);

    // Calculate production by product
    const production = populatedWorkEntries.reduce((acc: any[], entry) => {
      const productName = (entry.productId as any)?.name || 'Unknown';
      const existing = acc.find(item => item.name === productName);
      
      if (existing) {
        existing.production += entry.achieved || 0;
        existing.target += entry.targetQuantity || 0;
        existing.efficiency = existing.target > 0 ? (existing.production / existing.target) * 100 : 0;
      } else {
        acc.push({
          name: productName,
          production: entry.achieved || 0,
          target: entry.targetQuantity || 0,
          efficiency: entry.targetQuantity > 0 ? ((entry.achieved || 0) / entry.targetQuantity) * 100 : 0
        });
      }
      
      return acc;
    }, []);

    // Calculate quality data
    const quality = [
      {
        name: 'Passed',
        value: totalProduction + totalRejections > 0 ? (totalProduction / (totalProduction + totalRejections)) * 100 : 0,
        color: 'hsl(var(--success))'
      },
      {
        name: 'Rejected',
        value: totalProduction + totalRejections > 0 ? (totalRejections / (totalProduction + totalRejections)) * 100 : 0,
        color: 'hsl(var(--destructive))'
      }
    ];

    // Calculate employee performance
    const employeePerformance = populatedWorkEntries.reduce((acc: any[], entry) => {
      const employeeName = (entry.employeeId as any)?.profile?.firstName + ' ' + (entry.employeeId as any)?.profile?.lastName || 'Unknown';
      const existing = acc.find(item => item.name === employeeName);
      
      if (existing) {
        existing.production += entry.achieved || 0;
        existing.rejections += entry.rejected || 0;
        const total = existing.production + existing.rejections;
        existing.efficiency = total > 0 ? (existing.production / total) * 100 : 0;
      } else {
        const total = (entry.achieved || 0) + (entry.rejected || 0);
        acc.push({
          name: employeeName,
          production: entry.achieved || 0,
          efficiency: total > 0 ? ((entry.achieved || 0) / total) * 100 : 0,
          rejections: entry.rejected || 0
        });
      }
      
      return acc;
    }, []);

    const summary = {
      totalProduction,
      totalEfficiency,
      totalRejections,
      activeEmployees,
      pendingValidations: 0 // Placeholder
    };

    // Comprehensive report summary calculated

    res.json({
      success: true,
      data: {
        trends,
        production,
        quality,
        employeePerformance,
        summary
      }
    });
  } catch (error) {
    logError('Error fetching comprehensive report', error);
    res.status(500).json({ success: false, error: 'Failed to fetch comprehensive report' });
  }
});

// Get employee performance for specific employee
router.get('/employee/:employeeId', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;
    
    let query: any = { employeeId: new mongoose.Types.ObjectId(employeeId) };
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }

    const populatedWorkEntries = await WorkEntry.find(query)
      .populate('productId', 'name')
      .populate('processId', 'name')
      .sort({ createdAt: 1 });

    // Calculate trends
    const trends = populatedWorkEntries.map(entry => ({
      date: entry.createdAt.toISOString().split('T')[0],
      target: entry.targetQuantity || 0,
      achieved: entry.achieved || 0,
      efficiency: entry.targetQuantity > 0 ? ((entry.achieved || 0) / entry.targetQuantity) * 100 : 0,
      rejections: entry.rejected || 0
    }));

    // Calculate weekly stats
    const weeklyStats = populatedWorkEntries.reduce((acc: any[], entry) => {
      const week = `Week ${Math.ceil((new Date().getTime() - entry.createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000))}`;
      const existing = acc.find(item => item.week === week);
      
      if (existing) {
        existing.production += entry.achieved || 0;
        existing.target += entry.targetQuantity || 0;
        existing.efficiency = existing.target > 0 ? (existing.production / existing.target) * 100 : 0;
      } else {
        acc.push({
          week,
          production: entry.achieved || 0,
          target: entry.targetQuantity || 0,
          efficiency: entry.targetQuantity > 0 ? ((entry.achieved || 0) / entry.targetQuantity) * 100 : 0
        });
      }
      
      return acc;
    }, []);

    // Calculate current stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEntries = populatedWorkEntries.filter(entry => entry.createdAt >= today);
    
    const currentStats = {
      todayTarget: todayEntries.reduce((sum, entry) => sum + (entry.targetQuantity || 0), 0),
      todayAchieved: todayEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0),
      todayEfficiency: todayEntries.reduce((sum, entry) => sum + (entry.targetQuantity || 0), 0) > 0 
        ? (todayEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0) / todayEntries.reduce((sum, entry) => sum + (entry.targetQuantity || 0), 0)) * 100 
        : 0,
      todayRejections: todayEntries.reduce((sum, entry) => sum + (entry.rejected || 0), 0),
      weeklyAverage: trends.length > 0 ? trends.reduce((sum, entry) => sum + entry.efficiency, 0) / trends.length : 0,
      monthlyAverage: trends.length > 0 ? trends.reduce((sum, entry) => sum + entry.efficiency, 0) / trends.length : 0,
      totalProduction: populatedWorkEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0),
      totalRejections: populatedWorkEntries.reduce((sum, entry) => sum + (entry.rejected || 0), 0),
      bestDay: Math.max(...trends.map(entry => entry.achieved), 0),
      streak: 0 // Placeholder
    };

    // Calculate real achievements based on actual performance data
    const achievements: Array<{ id: number; title: string; description: string; earned: boolean; date: string }> = [];
    
    // Perfect Week achievement
    if (currentStats.weeklyAverage >= 100) {
      achievements.push({
        id: 1,
        title: 'Perfect Week',
        description: 'Achieved targets for 7 consecutive days',
        earned: true,
        date: new Date().toISOString()
      });
    }
    
    // Quality Champion achievement
    if (currentStats.todayRejections === 0 && currentStats.todayAchieved > 0) {
      achievements.push({
        id: 2,
        title: 'Quality Champion',
        description: 'Zero rejections today',
        earned: true,
        date: new Date().toISOString()
      });
    }
    
    // Efficiency Master achievement
    if (currentStats.todayEfficiency >= 110) {
      achievements.push({
        id: 3,
        title: 'Efficiency Master',
        description: 'Achieved >110% efficiency today',
        earned: true,
        date: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        trends,
        weeklyStats,
        currentStats,
        achievements
      }
    });
  } catch (error) {
    logError('Error fetching employee performance', error);
    res.status(500).json({ success: false, error: 'Failed to fetch employee performance' });
  }
});

// Get factory summary
router.get('/factory-summary/:factoryId', authenticate, async (req, res) => {
  try {
    const { factoryId } = req.params;
    
    const factoryObjectId = new mongoose.Types.ObjectId(factoryId);
    const [populatedWorkEntries, allEmployees, factoryProcesses, products] = await Promise.all([
      WorkEntry.find({ factoryId: factoryObjectId }),
      User.countDocuments({ factoryId: factoryObjectId, role: { $in: ['employee', 'supervisor'] }, isActive: true }),
      Process.countDocuments({ factoryId: factoryObjectId }),
      Product.countDocuments({ factoryId: factoryObjectId })
    ]);

    const totalProduction = populatedWorkEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0);
    const totalRejections = populatedWorkEntries.reduce((sum, entry) => sum + (entry.rejected || 0), 0);
    const totalEfficiency = totalProduction + totalRejections > 0 ? (totalProduction / (totalProduction + totalRejections)) * 100 : 0;

    res.json({
      success: true,
      data: {
        totalProduction,
        totalEfficiency,
        totalRejections,
        activeEmployees: allEmployees,
        totalProcesses: factoryProcesses,
        totalProducts: products
      }
    });
  } catch (error) {
    logError('Error fetching factory summary', error);
    res.status(500).json({ success: false, error: 'Failed to fetch factory summary' });
  }
});

// Get team performance for supervisor
router.get('/team-performance/:supervisorId', authenticate, async (req, res) => {
  try {
    const { supervisorId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Get allEmployees supervised by this supervisor
    const supervisedEmployees = await User.find({ 
      supervisorId: new mongoose.Types.ObjectId(supervisorId), 
      role: 'employee',
      isActive: true 
    }).select('_id');
    
    const employeeIds = supervisedEmployees.map(emp => emp._id);
    
    let query: any = { employeeId: { $in: employeeIds } };
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }

    const populatedWorkEntries = await WorkEntry.find(query)
      .populate('employeeId', 'profile.firstName profile.lastName');

    const totalProduction = populatedWorkEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0);
    const totalRejections = populatedWorkEntries.reduce((sum, entry) => sum + (entry.rejected || 0), 0);
    const totalEfficiency = totalProduction + totalRejections > 0 ? (totalProduction / (totalProduction + totalRejections)) * 100 : 0;

    const summary = {
      totalProduction,
      totalEfficiency,
      totalRejections,
      activeEmployees: employeeIds.length,
      pendingValidations: 0
    };

    res.json({
      success: true,
      data: { summary }
    });
  } catch (error) {
    logError('Error fetching team performance', error);
    res.status(500).json({ success: false, error: 'Failed to fetch team performance' });
  }
});

// Export report
router.get('/export/:format', authenticate, async (req, res) => {
  try {
    const { format } = req.params;
    const { startDate, endDate, productId, processId, employeeId, periodType, period } = req.query;
    const userFactoryId = req.user?.factoryId;
    
    let query: any = {};
    let dateRange = { start: startDate, end: endDate };
    
    if (userFactoryId) {
      query.factoryId = new mongoose.Types.ObjectId(userFactoryId);
    }
    
    // Handle period types
    if (periodType && period) {
      const now = new Date();
      switch (periodType) {
        case 'daily':
          if (period === 'today') {
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            dateRange = { start: today.toISOString(), end: tomorrow.toISOString() };
          } else {
            // Custom date
            const customDate = new Date(period as string);
            const nextDay = new Date(customDate);
            nextDay.setDate(nextDay.getDate() + 1);
            dateRange = { start: customDate.toISOString(), end: nextDay.toISOString() };
          }
          break;
        case 'weekly':
          if (period === 'thisWeek') {
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            startOfWeek.setHours(0, 0, 0, 0);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 7);
            dateRange = { start: startOfWeek.toISOString(), end: endOfWeek.toISOString() };
          } else if (period === 'lastWeek') {
            const startOfLastWeek = new Date(now);
            startOfLastWeek.setDate(now.getDate() - now.getDay() - 7);
            startOfLastWeek.setHours(0, 0, 0, 0);
            const endOfLastWeek = new Date(startOfLastWeek);
            endOfLastWeek.setDate(startOfLastWeek.getDate() + 7);
            dateRange = { start: startOfLastWeek.toISOString(), end: endOfLastWeek.toISOString() };
          } else if (period === 'last7Days') {
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(now.getDate() - 7);
            dateRange = { start: sevenDaysAgo.toISOString(), end: now.toISOString() };
          }
          break;
        case 'monthly':
          if (period === 'thisMonth') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            dateRange = { start: startOfMonth.toISOString(), end: endOfMonth.toISOString() };
          } else if (period === 'lastMonth') {
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            dateRange = { start: startOfLastMonth.toISOString(), end: endOfLastMonth.toISOString() };
          } else if (period === 'last3Months') {
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            dateRange = { start: threeMonthsAgo.toISOString(), end: now.toISOString() };
          } else if (period === 'last6Months') {
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
            dateRange = { start: sixMonthsAgo.toISOString(), end: now.toISOString() };
          }
          break;
      }
    }
    
    if (dateRange.start && dateRange.end) {
      query.createdAt = {
        $gte: new Date(dateRange.start as string),
        $lte: new Date(dateRange.end as string)
      };
    }
    
    if (productId && productId !== 'all') {
      query.productId = new mongoose.Types.ObjectId(productId as string);
    }
    
    if (processId && processId !== 'all') {
      query.processId = new mongoose.Types.ObjectId(processId as string);
    }
    
    if (employeeId && employeeId !== 'all') {
      query.employeeId = new mongoose.Types.ObjectId(employeeId as string);
    }

    // Fetch comprehensive data for export
    const workEntries = await WorkEntry.find(query).sort({ createdAt: 1 });

    // Get all unique IDs for population
    const productIds = [...new Set(workEntries.map(entry => entry.productId?.toString()).filter(Boolean))];
    const processIds = [...new Set(workEntries.map(entry => entry.processId?.toString()).filter(Boolean))];
    const employeeIds = [...new Set(workEntries.map(entry => entry.employeeId?.toString()).filter(Boolean))];
    const factoryIds = [...new Set(workEntries.map(entry => entry.factoryId?.toString()).filter(Boolean))];

    // Fetch related data separately
    const [products, processes, employees, factories] = await Promise.all([
      Product.find({ _id: { $in: productIds } }).select('name code'),
      Process.find({ _id: { $in: processIds } }).select('name order'),
      User.find({ _id: { $in: employeeIds } }).select('profile.firstName profile.lastName'),
      Factory.find({ _id: { $in: factoryIds } }).select('name')
    ]);

    // Fetch employees, products and processes for comprehensive analysis
    const allEmployees = await User.find({ 
      factoryId: userFactoryId, 
      role: { $in: ['employee', 'supervisor'] }, 
      isActive: true 
    }).populate('profile');

    const factoryProducts = await Product.find({ factoryId: userFactoryId }).select('name code');
    const factoryProcesses = await Process.find({ factoryId: userFactoryId }).sort({ order: 1 });

    // Create lookup maps
    const productMap = new Map(products.map(p => [p._id.toString(), p]));
    const processMap = new Map(factoryProcesses.map(p => [p._id.toString(), p]));
    const employeeMap = new Map(allEmployees.map(e => [e._id.toString(), e]));
    const factoryMap = new Map(factories.map(f => [f._id.toString(), f]));

    // Attach populated data to work entries
    const populatedWorkEntries = workEntries.map(entry => ({
      ...entry.toObject(),
      productId: productMap.get(entry.productId?.toString()),
      processId: processMap.get(entry.processId?.toString()),
      employeeId: employeeMap.get(entry.employeeId?.toString()),
      factoryId: factoryMap.get(entry.factoryId?.toString())
    }));

    // Calculate comprehensive statistics
    const totalProduction = populatedWorkEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0);
    const totalRejections = populatedWorkEntries.reduce((sum, entry) => sum + (entry.rejected || 0), 0);
    const totalTarget = populatedWorkEntries.reduce((sum, entry) => sum + (entry.targetQuantity || 0), 0);
    const overallEfficiency = totalTarget > 0 ? (totalProduction / totalTarget) * 100 : 0;

    // Group data by product for process stages analysis
    const productProcessData = factoryProducts.map(product => {
      const productEntries = populatedWorkEntries.filter(entry => 
        entry.productId && (entry.productId as any)._id.toString() === product._id.toString()
      );
      
      // Get unique factoryProcesses for this product from work entries
      const productProcessIds = [...new Set(productEntries.map(entry => 
        entry.processId && (entry.processId as any)._id.toString()
      ).filter(Boolean))];
      
      const productProcesses = factoryProcesses.filter(process => 
        productProcessIds.includes(process._id.toString())
      ).sort((a, b) => (a.order || 0) - (b.order || 0));

      const processStages = productProcesses.map(process => {
        const processEntries = productEntries.filter(entry => 
          entry.processId && (entry.processId as any)._id.toString() === process._id.toString()
        );
        
        const processProduction = processEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0);
        const processRejections = processEntries.reduce((sum, entry) => sum + (entry.rejected || 0), 0);
        const processTarget = processEntries.reduce((sum, entry) => sum + (entry.targetQuantity || 0), 0);
        const processEfficiency = processTarget > 0 ? (processProduction / processTarget) * 100 : 0;
        
        return {
          processName: process.name,
          order: process.order || 0,
          production: processProduction,
          rejections: processRejections,
          target: processTarget,
          efficiency: processEfficiency,
          entries: processEntries.length
        };
      });

      return {
        productName: product.name,
        productCode: product.code,
        totalProduction: productEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0),
        totalRejections: productEntries.reduce((sum, entry) => sum + (entry.rejected || 0), 0),
        totalTarget: productEntries.reduce((sum, entry) => sum + (entry.targetQuantity || 0), 0),
        processStages
      };
    });

    if (format === 'excel') {
      // Generate comprehensive Excel file with multiple sheets
      const workbook = new ExcelJS.Workbook();
      
      // Sheet 1: Summary & Overview
      const summarySheet = workbook.addWorksheet('Summary & Overview');
      
      // Add title and metadata
      summarySheet.addRow(['Factory Production Report']);
      summarySheet.addRow([`Generated on: ${new Date().toLocaleString()}`]);
      summarySheet.addRow([`Period Type: ${periodType || 'Custom'}`]);
      summarySheet.addRow([`Period: ${period || 'Custom Range'}`]);
      summarySheet.addRow([`Date Range: ${dateRange.start ? new Date(dateRange.start as string).toLocaleDateString() : 'N/A'} to ${dateRange.end ? new Date(dateRange.end as string).toLocaleDateString() : 'N/A'}`]);
      summarySheet.addRow([]);
      
      // Add summary statistics
      summarySheet.addRow(['PRODUCTION SUMMARY']);
      summarySheet.addRow(['Metric', 'Value']);
      summarySheet.addRow(['Total Production', totalProduction]);
      summarySheet.addRow(['Total Rejections', totalRejections]);
      summarySheet.addRow(['Total Target', totalTarget]);
      summarySheet.addRow(['Overall Efficiency %', overallEfficiency.toFixed(2)]);
      summarySheet.addRow(['Active Employees', allEmployees.length]);
      summarySheet.addRow(['Total Work Entries', populatedWorkEntries.length]);
      summarySheet.addRow([]);
      
      // Add product-wise summary
      summarySheet.addRow(['PRODUCT-WISE SUMMARY']);
      summarySheet.addRow(['Product', 'Code', 'Production', 'Rejections', 'Target', 'Efficiency %']);
      productProcessData.forEach(product => {
        const productEfficiency = product.totalTarget > 0 ? (product.totalProduction / product.totalTarget) * 100 : 0;
        summarySheet.addRow([
          product.productName,
          product.productCode || 'N/A',
          product.totalProduction,
          product.totalRejections,
          product.totalTarget,
          productEfficiency.toFixed(2)
        ]);
      });
      
      // Style summary sheet
      summarySheet.getRow(1).font = { bold: true, size: 16 };
      summarySheet.getRow(7).font = { bold: true, size: 14 };
      summarySheet.getRow(8).font = { bold: true };
      summarySheet.getRow(17).font = { bold: true, size: 14 };
      summarySheet.getRow(18).font = { bold: true };
      
      // Sheet 2: Detailed Production Data
      const detailedSheet = workbook.addWorksheet('Detailed Production Data');
      
      detailedSheet.addRow(['DETAILED PRODUCTION DATA']);
      detailedSheet.addRow(['Date', 'Time', 'Employee Name', 'Product', 'Process Stage', 'Target', 'Achieved', 'Rejected', 'Efficiency %', 'Status']);
      
      populatedWorkEntries.forEach(entry => {
        const employeeName = `${(entry.employeeId as any)?.profile?.firstName || ''} ${(entry.employeeId as any)?.profile?.lastName || ''}`.trim();
        const productName = (entry.productId as any)?.name || 'Unknown';
        const processName = (entry.processId as any)?.name || 'Unknown';
        const entryEfficiency = entry.targetQuantity > 0 ? ((entry.achieved || 0) / entry.targetQuantity) * 100 : 0;
        
        detailedSheet.addRow([
          entry.createdAt.toLocaleDateString(),
          entry.createdAt.toLocaleTimeString(),
          employeeName,
          productName,
          processName,
          entry.targetQuantity || 0,
          entry.achieved || 0,
          entry.rejected || 0,
          entryEfficiency.toFixed(2),
          entry.validationStatus || 'Pending'
        ]);
      });
      
      // Style detailed sheet
      detailedSheet.getRow(1).font = { bold: true, size: 14 };
      detailedSheet.getRow(2).font = { bold: true };
      
      // Sheet 3: Process Stages Analysis
      const processSheet = workbook.addWorksheet('Process Stages Analysis');
      
      productProcessData.forEach((product, productIndex) => {
        if (productIndex > 0) processSheet.addRow([]);
        
        processSheet.addRow([`${product.productName} (${product.productCode || 'N/A'}) - Process Stages Analysis`]);
        processSheet.addRow(['Process Stage', 'Order', 'Production', 'Rejections', 'Target', 'Efficiency %', 'Entries Count']);
        
        product.processStages.forEach(stage => {
          processSheet.addRow([
            stage.processName,
            stage.order,
            stage.production,
            stage.rejections,
            stage.target,
            stage.efficiency.toFixed(2),
            stage.entries
          ]);
        });
        
        // Add product totals
        const productEfficiency = product.totalTarget > 0 ? (product.totalProduction / product.totalTarget) * 100 : 0;
        processSheet.addRow(['TOTAL', '', product.totalProduction, product.totalRejections, product.totalTarget, productEfficiency.toFixed(2), '']);
      });
      
      // Style process sheet
      productProcessData.forEach((_, index) => {
        const startRow = index * (productProcessData[index].processStages.length + 4) + 1;
        processSheet.getRow(startRow).font = { bold: true, size: 12 };
        processSheet.getRow(startRow + 1).font = { bold: true };
      });
      
      // Sheet 4: Employee Performance
      const employeeSheet = workbook.addWorksheet('Employee Performance');
      
      employeeSheet.addRow(['EMPLOYEE PERFORMANCE SUMMARY']);
      employeeSheet.addRow(['Employee Name', 'Total Production', 'Total Rejections', 'Total Target', 'Efficiency %', 'Entries Count', 'Avg Daily Production']);
      
      const employeePerformance = populatedWorkEntries.reduce((acc: any[], entry) => {
        const employeeName = `${(entry.employeeId as any)?.profile?.firstName || ''} ${(entry.employeeId as any)?.profile?.lastName || ''}`.trim();
        const existing = acc.find(item => item.name === employeeName);
        
        if (existing) {
          existing.production += entry.achieved || 0;
          existing.rejections += entry.rejected || 0;
          existing.target += entry.targetQuantity || 0;
          existing.count += 1;
        } else {
          acc.push({
            name: employeeName,
            production: entry.achieved || 0,
            rejections: entry.rejected || 0,
            target: entry.targetQuantity || 0,
            count: 1
          });
        }
        
        return acc;
      }, []);
      
      // Calculate efficiency and daily averages
      employeePerformance.forEach(emp => {
        const total = emp.production + emp.rejections;
        emp.efficiency = total > 0 ? (emp.production / total) * 100 : 0;
        emp.avgDaily = emp.count > 0 ? (emp.production / emp.count) : 0;
      });
      
      employeePerformance.forEach(emp => {
        employeeSheet.addRow([
          emp.name,
          emp.production,
          emp.rejections,
          emp.target,
          emp.efficiency.toFixed(2),
          emp.count,
          emp.avgDaily.toFixed(2)
        ]);
      });
      
      // Style employee sheet
      employeeSheet.getRow(1).font = { bold: true, size: 14 };
      employeeSheet.getRow(2).font = { bold: true };
      
      // Auto-fit columns for all sheets
      [summarySheet, detailedSheet, processSheet, employeeSheet].forEach(sheet => {
        sheet.columns.forEach(column => {
          column.width = 15;
        });
      });
      
      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const fileName = `production-report-${periodType || 'custom'}-${new Date().toISOString().split('T')[0]}.xlsx`;
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      // Write to response
      await workbook.xlsx.write(res);
      res.end();
      
    } else if (format === 'pdf') {
      // Generate comprehensive PDF file
      const doc = new PDFDocument({ margin: 50 });
      
      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      const fileName = `production-report-${periodType || 'custom'}-${new Date().toISOString().split('T')[0]}.pdf`;
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      // Pipe PDF to response
      doc.pipe(res);
      
      // Add header
      doc.fontSize(24).text('Factory Production Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.fontSize(12).text(`Period Type: ${periodType || 'Custom'}`, { align: 'center' });
      doc.fontSize(12).text(`Period: ${period || 'Custom Range'}`, { align: 'center' });
      doc.fontSize(12).text(`Date Range: ${dateRange.start ? new Date(dateRange.start as string).toLocaleDateString() : 'N/A'} to ${dateRange.end ? new Date(dateRange.end as string).toLocaleDateString() : 'N/A'}`, { align: 'center' });
      doc.moveDown(2);
      
      // Add comprehensive summary
      doc.fontSize(18).text('Production Summary', { underline: true });
      doc.moveDown();
      
      doc.fontSize(12).text(`Total Production: ${totalProduction.toLocaleString()}`);
      doc.text(`Total Rejections: ${totalRejections.toLocaleString()}`);
      doc.text(`Total Target: ${totalTarget.toLocaleString()}`);
      doc.text(`Overall Efficiency: ${overallEfficiency.toFixed(2)}%`);
      doc.text(`Active Employees: ${allEmployees.length}`);
      doc.text(`Total Work Entries: ${populatedWorkEntries.length}`);
      doc.moveDown(2);
      
      // Add product-wise summary
      doc.fontSize(16).text('Product-wise Summary', { underline: true });
      doc.moveDown();
      
      productProcessData.forEach(product => {
        const productEfficiency = product.totalTarget > 0 ? (product.totalProduction / product.totalTarget) * 100 : 0;
        doc.fontSize(12).text(`${product.productName} (${product.productCode || 'N/A'})`, { underline: true });
        doc.fontSize(10).text(`  Production: ${product.totalProduction.toLocaleString()}`);
        doc.text(`  Rejections: ${product.totalRejections.toLocaleString()}`);
        doc.text(`  Target: ${product.totalTarget.toLocaleString()}`);
        doc.text(`  Efficiency: ${productEfficiency.toFixed(2)}%`);
        doc.moveDown();
      });
      
      doc.moveDown();
      
      // Add process stages analysis
      doc.fontSize(16).text('Process Stages Analysis', { underline: true });
      doc.moveDown();
      
      productProcessData.forEach(product => {
        doc.fontSize(12).text(`${product.productName} - Process Stages`, { underline: true });
        doc.moveDown();
        
        // Table headers
        let yPos = doc.y;
        doc.fontSize(10).text('Process Stage', 50, yPos);
        doc.text('Order', 200, yPos);
        doc.text('Production', 250, yPos);
        doc.text('Rejections', 320, yPos);
        doc.text('Efficiency %', 390, yPos);
        doc.text('Entries', 460, yPos);
        
        yPos += 20;
        
        // Process stages data
        product.processStages.forEach(stage => {
          if (yPos > 700) { // Check if we need a new page
            doc.addPage();
            yPos = 50;
          }
          
          doc.fontSize(9).text(stage.processName, 50, yPos);
          doc.text(stage.order.toString(), 200, yPos);
          doc.text(stage.production.toString(), 250, yPos);
          doc.text(stage.rejections.toString(), 320, yPos);
          doc.text(stage.efficiency.toFixed(2), 390, yPos);
          doc.text(stage.entries.toString(), 460, yPos);
          
          yPos += 15;
        });
        
        // Product totals
        const productEfficiency = product.totalTarget > 0 ? (product.totalProduction / product.totalTarget) * 100 : 0;
        doc.fontSize(10).text('TOTAL', 50, yPos, { underline: true });
        doc.text('', 200, yPos);
        doc.text(product.totalProduction.toString(), 250, yPos, { underline: true });
        doc.text(product.totalRejections.toString(), 320, yPos, { underline: true });
        doc.text(productEfficiency.toFixed(2), 390, yPos, { underline: true });
        doc.text('', 460, yPos);
        
        yPos += 30;
        doc.y = yPos;
      });
      
      // Add employee performance
      doc.addPage();
      doc.fontSize(16).text('Employee Performance Summary', { underline: true });
      doc.moveDown();
      
      const employeePerformance = populatedWorkEntries.reduce((acc: any[], entry) => {
        const employeeName = `${(entry.employeeId as any)?.profile?.firstName || ''} ${(entry.employeeId as any)?.profile?.lastName || ''}`.trim();
        const existing = acc.find(item => item.name === employeeName);
        
        if (existing) {
          existing.production += entry.achieved || 0;
          existing.rejections += entry.rejected || 0;
          existing.target += entry.targetQuantity || 0;
          existing.count += 1;
        } else {
          acc.push({
            name: employeeName,
            production: entry.achieved || 0,
            rejections: entry.rejected || 0,
            target: entry.targetQuantity || 0,
            count: 1
          });
        }
        
        return acc;
      }, []);
      
      // Calculate efficiency and daily averages
      employeePerformance.forEach(emp => {
        const total = emp.production + emp.rejections;
        emp.efficiency = total > 0 ? (emp.production / total) * 100 : 0;
        emp.avgDaily = emp.count > 0 ? (emp.production / emp.count) : 0;
      });
      
      // Employee performance table
      let yPosition = doc.y;
      doc.fontSize(10).text('Employee Name', 50, yPosition);
      doc.text('Production', 200, yPosition);
      doc.text('Rejections', 280, yPosition);
      doc.text('Efficiency %', 360, yPosition);
      doc.text('Entries', 440, yPosition);
      doc.text('Avg Daily', 500, yPosition);
      
      yPosition += 20;
      
      employeePerformance.forEach(emp => {
        if (yPosition > 700) { // Check if we need a new page
          doc.addPage();
          yPosition = 50;
        }
        
        doc.fontSize(9).text(emp.name, 50, yPosition);
        doc.text(emp.production.toString(), 200, yPosition);
        doc.text(emp.rejections.toString(), 280, yPosition);
        doc.text(emp.efficiency.toFixed(2), 360, yPosition);
        doc.text(emp.count.toString(), 440, yPosition);
        doc.text(emp.avgDaily.toFixed(2), 500, yPosition);
        
        yPosition += 15;
      });
      
      // Add detailed work entries (first 50 entries to avoid PDF being too large)
      doc.addPage();
      doc.fontSize(16).text('Detailed Work Entries (Sample)', { underline: true });
      doc.moveDown();
      
      let entryYPos = doc.y;
      doc.fontSize(9).text('Date', 50, entryYPos);
      doc.text('Time', 100, entryYPos);
      doc.text('Employee', 150, entryYPos);
      doc.text('Product', 250, entryYPos);
      doc.text('Process', 350, entryYPos);
      doc.text('Achieved', 450, entryYPos);
      doc.text('Rejected', 500, entryYPos);
      
      entryYPos += 20;
      
      populatedWorkEntries.slice(0, 50).forEach(entry => {
        if (entryYPos > 700) { // Check if we need a new page
          doc.addPage();
          entryYPos = 50;
        }
        
        const employeeName = `${(entry.employeeId as any)?.profile?.firstName || ''} ${(entry.employeeId as any)?.profile?.lastName || ''}`.trim();
        const productName = (entry.productId as any)?.name || 'Unknown';
        const processName = (entry.processId as any)?.name || 'Unknown';
        
        doc.fontSize(8).text(entry.createdAt.toLocaleDateString(), 50, entryYPos);
        doc.text(entry.createdAt.toLocaleTimeString(), 100, entryYPos);
        doc.text(employeeName, 150, entryYPos);
        doc.text(productName, 250, entryYPos);
        doc.text(processName, 350, entryYPos);
        doc.text((entry.achieved || 0).toString(), 450, entryYPos);
        doc.text((entry.rejected || 0).toString(), 500, entryYPos);
        
        entryYPos += 15;
      });
      
      if (populatedWorkEntries.length > 50) {
        doc.moveDown();
        doc.fontSize(10).text(`... and ${populatedWorkEntries.length - 50} more entries`, { align: 'center' });
      }
      
      // Add footer
      doc.fontSize(8).text(`Report generated on ${new Date().toLocaleString()}`, { align: 'center' });
      
      // Finalize PDF
      doc.end();
      
    } else {
      res.status(400).json({ success: false, error: 'Invalid format. Use "excel" or "pdf"' });
    }
    
  } catch (error) {
    logError('Error exporting report', error, {
      format: req.params?.format,
      userId: (req as any).user?.id
    });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to export report',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get detailed production data
router.get('/production-detailed', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, productId, processId, employeeId, periodType, period } = req.query;
    const userFactoryId = req.user?.factoryId;
    
    let query: any = {};
    let dateRange = { start: startDate, end: endDate };
    
    if (userFactoryId) {
      query.factoryId = new mongoose.Types.ObjectId(userFactoryId);
    }
    
    // Handle period types (same logic as export)
    if (periodType && period) {
      const now = new Date();
      switch (periodType) {
        case 'daily':
          if (period === 'today') {
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            dateRange = { start: today.toISOString(), end: tomorrow.toISOString() };
          } else {
            const customDate = new Date(period as string);
            const nextDay = new Date(customDate);
            nextDay.setDate(nextDay.getDate() + 1);
            dateRange = { start: customDate.toISOString(), end: nextDay.toISOString() };
          }
          break;
        case 'weekly':
          if (period === 'thisWeek') {
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            startOfWeek.setHours(0, 0, 0, 0);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 7);
            dateRange = { start: startOfWeek.toISOString(), end: endOfWeek.toISOString() };
          } else if (period === 'lastWeek') {
            const startOfLastWeek = new Date(now);
            startOfLastWeek.setDate(now.getDate() - now.getDay() - 7);
            startOfLastWeek.setHours(0, 0, 0, 0);
            const endOfLastWeek = new Date(startOfLastWeek);
            endOfLastWeek.setDate(startOfLastWeek.getDate() + 7);
            dateRange = { start: startOfLastWeek.toISOString(), end: endOfLastWeek.toISOString() };
          } else if (period === 'last7Days') {
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(now.getDate() - 7);
            dateRange = { start: sevenDaysAgo.toISOString(), end: now.toISOString() };
          }
          break;
        case 'monthly':
          if (period === 'thisMonth') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            dateRange = { start: startOfMonth.toISOString(), end: endOfMonth.toISOString() };
          } else if (period === 'lastMonth') {
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            dateRange = { start: startOfLastMonth.toISOString(), end: endOfLastMonth.toISOString() };
          } else if (period === 'last3Months') {
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            dateRange = { start: threeMonthsAgo.toISOString(), end: now.toISOString() };
          } else if (period === 'last6Months') {
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
            dateRange = { start: sixMonthsAgo.toISOString(), end: now.toISOString() };
          }
          break;
      }
    }
    
    if (dateRange.start && dateRange.end) {
      query.createdAt = {
        $gte: new Date(dateRange.start as string),
        $lte: new Date(dateRange.end as string)
      };
    }
    
    if (productId && productId !== 'all') {
      query.productId = new mongoose.Types.ObjectId(productId as string);
    }
    
    if (processId && processId !== 'all') {
      query.processId = new mongoose.Types.ObjectId(processId as string);
    }
    
    if (employeeId && employeeId !== 'all') {
      query.employeeId = new mongoose.Types.ObjectId(employeeId as string);
    }

    const populatedWorkEntries = await WorkEntry.find(query)
      .populate('productId', 'name code')
      .populate('processId', 'name order')
      .populate('employeeId', 'profile.firstName profile.lastName')
      .populate('factoryId', 'name')
      .sort({ createdAt: 1 });

    const detailedData = populatedWorkEntries.map(entry => ({
      date: entry.createdAt,
      employee: {
        id: (entry.employeeId as any)?._id,
        firstName: (entry.employeeId as any)?.profile?.firstName || '',
        lastName: (entry.employeeId as any)?.profile?.lastName || ''
      },
      product: {
        id: (entry.productId as any)?._id,
        name: (entry.productId as any)?.name || 'Unknown',
        code: (entry.productId as any)?.code || 'N/A'
      },
      process: {
        id: (entry.processId as any)?._id,
        name: (entry.processId as any)?.name || 'Unknown',
        order: (entry.processId as any)?.order || 0
      },
      target: entry.targetQuantity || 0,
      achieved: entry.achieved || 0,
      rejected: entry.rejected || 0,
      efficiency: entry.targetQuantity > 0 ? ((entry.achieved || 0) / entry.targetQuantity) * 100 : 0,
      status: entry.validationStatus || 'Pending'
    }));

    res.json({
      success: true,
      data: detailedData,
      periodType,
      period,
      dateRange,
      totalEntries: detailedData.length
    });
  } catch (error) {
    logError('Error fetching detailed production data', error);
    res.status(500).json({ success: false, error: 'Failed to fetch detailed production data' });
  }
});

// Get process stages analysis
router.get('/process-stages-analysis', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, productId, periodType, period } = req.query;
    const userFactoryId = req.user?.factoryId;
    
    let query: any = {};
    let dateRange = { start: startDate, end: endDate };
    
    if (userFactoryId) {
      query.factoryId = new mongoose.Types.ObjectId(userFactoryId);
    }
    
    // Handle period types (same logic as export)
    if (periodType && period) {
      const now = new Date();
      switch (periodType) {
        case 'daily':
          if (period === 'today') {
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            dateRange = { start: today.toISOString(), end: tomorrow.toISOString() };
          } else {
            const customDate = new Date(period as string);
            const nextDay = new Date(customDate);
            nextDay.setDate(nextDay.getDate() + 1);
            dateRange = { start: customDate.toISOString(), end: nextDay.toISOString() };
          }
          break;
        case 'weekly':
          if (period === 'thisWeek') {
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            startOfWeek.setHours(0, 0, 0, 0);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 7);
            dateRange = { start: startOfWeek.toISOString(), end: endOfWeek.toISOString() };
          } else if (period === 'lastWeek') {
            const startOfLastWeek = new Date(now);
            startOfLastWeek.setDate(now.getDate() - now.getDay() - 7);
            startOfLastWeek.setHours(0, 0, 0, 0);
            const endOfLastWeek = new Date(startOfLastWeek);
            endOfLastWeek.setDate(startOfLastWeek.getDate() + 7);
            dateRange = { start: startOfLastWeek.toISOString(), end: endOfLastWeek.toISOString() };
          } else if (period === 'last7Days') {
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(now.getDate() - 7);
            dateRange = { start: sevenDaysAgo.toISOString(), end: now.toISOString() };
          }
          break;
        case 'monthly':
          if (period === 'thisMonth') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            dateRange = { start: startOfMonth.toISOString(), end: endOfMonth.toISOString() };
          } else if (period === 'lastMonth') {
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            dateRange = { start: startOfLastMonth.toISOString(), end: endOfLastMonth.toISOString() };
          } else if (period === 'last3Months') {
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            dateRange = { start: threeMonthsAgo.toISOString(), end: now.toISOString() };
          } else if (period === 'last6Months') {
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
            dateRange = { start: sixMonthsAgo.toISOString(), end: now.toISOString() };
          }
          break;
      }
    }
    
    if (dateRange.start && dateRange.end) {
      query.createdAt = {
        $gte: new Date(dateRange.start as string),
        $lte: new Date(dateRange.end as string)
      };
    }
    
    if (productId && productId !== 'all') {
      query.productId = new mongoose.Types.ObjectId(productId as string);
    }

    const populatedWorkEntries = await WorkEntry.find(query)
      .populate('productId', 'name code')
      .populate('processId', 'name order')
      .populate('employeeId', 'profile.firstName profile.lastName')
      .sort({ createdAt: 1 });

    const products = await Product.find({ factoryId: userFactoryId }).select('name code');
    const factoryProcesses = await Process.find({ factoryId: userFactoryId }).sort({ order: 1 });

    const productProcessData = products.map(product => {
      const productEntries = populatedWorkEntries.filter(entry => 
        entry.productId && (entry.productId as any)._id.toString() === product._id.toString()
      );
      
      // Get unique factoryProcesses for this product from work entries
      const productProcessIds = [...new Set(productEntries.map(entry => 
        entry.processId && (entry.processId as any)._id.toString()
      ).filter(Boolean))];
      
      const productProcesses = factoryProcesses.filter(process => 
        productProcessIds.includes(process._id.toString())
      ).sort((a, b) => (a.order || 0) - (b.order || 0));

      const processStages = productProcesses.map(process => {
        const processEntries = productEntries.filter(entry => 
          entry.processId && (entry.processId as any)._id.toString() === process._id.toString()
        );
        
        const processProduction = processEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0);
        const processRejections = processEntries.reduce((sum, entry) => sum + (entry.rejected || 0), 0);
        const processTarget = processEntries.reduce((sum, entry) => sum + (entry.targetQuantity || 0), 0);
        const processEfficiency = processTarget > 0 ? (processProduction / processTarget) * 100 : 0;
        
        return {
          processName: process.name,
          order: process.order || 0,
          production: processProduction,
          rejections: processRejections,
          target: processTarget,
          efficiency: processEfficiency,
          entries: processEntries.length
        };
      });

      return {
        productName: product.name,
        productCode: product.code,
        totalProduction: productEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0),
        totalRejections: productEntries.reduce((sum, entry) => sum + (entry.rejected || 0), 0),
        totalTarget: productEntries.reduce((sum, entry) => sum + (entry.targetQuantity || 0), 0),
        processStages
      };
    });

    res.json({
      success: true,
      data: productProcessData,
      periodType,
      period,
      dateRange,
      totalProducts: productProcessData.length
    });
  } catch (error) {
    logError('Error fetching process stages analysis', error);
    res.status(500).json({ success: false, error: 'Failed to fetch process stages analysis' });
  }
});

// Get employee performance data
router.get('/employee-performance', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, productId, processId, employeeId, periodType, period } = req.query;
    const userFactoryId = req.user?.factoryId;
    
    let query: any = {};
    let dateRange = { start: startDate, end: endDate };
    
    if (userFactoryId) {
      query.factoryId = new mongoose.Types.ObjectId(userFactoryId);
    }
    
    // Handle period types (same logic as export)
    if (periodType && period) {
      const now = new Date();
      switch (periodType) {
        case 'daily':
          if (period === 'today') {
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            dateRange = { start: today.toISOString(), end: tomorrow.toISOString() };
          } else {
            const customDate = new Date(period as string);
            const nextDay = new Date(customDate);
            nextDay.setDate(nextDay.getDate() + 1);
            dateRange = { start: customDate.toISOString(), end: nextDay.toISOString() };
          }
          break;
        case 'weekly':
          if (period === 'thisWeek') {
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            startOfWeek.setHours(0, 0, 0, 0);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 7);
            dateRange = { start: startOfWeek.toISOString(), end: endOfWeek.toISOString() };
          } else if (period === 'lastWeek') {
            const startOfLastWeek = new Date(now);
            startOfLastWeek.setDate(now.getDate() - now.getDay() - 7);
            startOfLastWeek.setHours(0, 0, 0, 0);
            const endOfLastWeek = new Date(startOfLastWeek);
            endOfLastWeek.setDate(startOfLastWeek.getDate() + 7);
            dateRange = { start: startOfLastWeek.toISOString(), end: endOfLastWeek.toISOString() };
          } else if (period === 'last7Days') {
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(now.getDate() - 7);
            dateRange = { start: sevenDaysAgo.toISOString(), end: now.toISOString() };
          }
          break;
        case 'monthly':
          if (period === 'thisMonth') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            dateRange = { start: startOfMonth.toISOString(), end: endOfMonth.toISOString() };
          } else if (period === 'lastMonth') {
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            dateRange = { start: startOfLastMonth.toISOString(), end: endOfLastMonth.toISOString() };
          } else if (period === 'last3Months') {
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            dateRange = { start: threeMonthsAgo.toISOString(), end: now.toISOString() };
          } else if (period === 'last6Months') {
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
            dateRange = { start: sixMonthsAgo.toISOString(), end: now.toISOString() };
          }
          break;
      }
    }
    
    if (dateRange.start && dateRange.end) {
      query.createdAt = {
        $gte: new Date(dateRange.start as string),
        $lte: new Date(dateRange.end as string)
      };
    }
    
    if (productId && productId !== 'all') {
      query.productId = new mongoose.Types.ObjectId(productId as string);
    }
    
    if (processId && processId !== 'all') {
      query.processId = new mongoose.Types.ObjectId(processId as string);
    }
    
    if (employeeId && employeeId !== 'all') {
      query.employeeId = new mongoose.Types.ObjectId(employeeId as string);
    }

    const populatedWorkEntries = await WorkEntry.find(query)
      .populate('productId', 'name code')
      .populate('processId', 'name order')
      .populate('employeeId', 'profile.firstName profile.lastName')
      .sort({ createdAt: 1 });

    const employeePerformance = populatedWorkEntries.reduce((acc: any[], entry) => {
      const employeeName = `${(entry.employeeId as any)?.profile?.firstName || ''} ${(entry.employeeId as any)?.profile?.lastName || ''}`.trim();
      const existing = acc.find(item => item.name === employeeName);
      
      if (existing) {
        existing.production += entry.achieved || 0;
        existing.rejections += entry.rejected || 0;
        existing.target += entry.targetQuantity || 0;
        existing.count += 1;
      } else {
        acc.push({
          name: employeeName,
          production: entry.achieved || 0,
          rejections: entry.rejected || 0,
          target: entry.targetQuantity || 0,
          count: 1
        });
      }
      
      return acc;
    }, []);

    // Calculate efficiency and daily averages
    employeePerformance.forEach(emp => {
      const total = emp.production + emp.rejections;
      emp.efficiency = total > 0 ? (emp.production / total) * 100 : 0;
      emp.avgDaily = emp.count > 0 ? (emp.production / emp.count) : 0;
    });

    res.json({
      success: true,
      data: employeePerformance,
      periodType,
      period,
      dateRange,
      totalEmployees: employeePerformance.length
    });
  } catch (error) {
    logError('Error fetching employee performance', error);
    res.status(500).json({ success: false, error: 'Failed to fetch employee performance' });
  }
});

// Get process stages summary report
router.get('/process-stages-summary', authenticate, async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      factoryId, 
      viewType = 'product' 
    } = req.query;
    
    const userFactoryId = req.user?.factoryId;
    const targetFactoryId = factoryId || userFactoryId;
    
    if (!targetFactoryId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Factory ID is required',
        status: 400 
      });
    }

    // Build date range query
    let dateQuery: any = {};
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      dateQuery = {
        $gte: start,
        $lte: end
      };
    } else if (startDate) {
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      dateQuery = { $gte: start };
    } else if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      dateQuery = { $lte: end };
    }

    // Build aggregation pipeline
    const pipeline: any[] = [
      {
        $match: {
          factoryId: new mongoose.Types.ObjectId(targetFactoryId as string),
          ...(Object.keys(dateQuery).length > 0 && { createdAt: dateQuery })
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
        $lookup: {
          from: 'processes',
          localField: 'processId',
          foreignField: '_id',
          as: 'process'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $unwind: '$process'
      },
      {
        $addFields: {
          stageOrder: {
            $let: {
              vars: {
                processInProduct: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$product.processes',
                        cond: { 
                          $eq: [
                            { $toString: '$$this.processId' }, 
                            { $toString: '$processId' }
                          ] 
                        }
                      }
                    },
                    0
                  ]
                }
              },
              in: '$$processInProduct.order'
            }
          }
        }
      },
      {
        $group: {
          _id: {
            productId: '$productId',
            processId: '$processId',
            productName: '$product.name',
            productCode: '$product.code',
            processName: '$process.name',
            stageOrder: '$stageOrder'
          },
          achievedQuantity: { $sum: '$achieved' },
          rejectedQuantity: { $sum: '$rejected' },
          targetQuantity: { $sum: '$targetQuantity' },
          workEntryCount: { $sum: 1 },
          latestEntry: { $max: '$createdAt' }
        }
      }
    ];

    // Get work entry data
    const workEntryData = await WorkEntry.aggregate(pipeline);

    // Get process stage data for available quantities
    const processStageQuery: any = {
      factoryId: new mongoose.Types.ObjectId(targetFactoryId as string)
    };
    
    if (Object.keys(dateQuery).length > 0) {
      processStageQuery.date = dateQuery;
    }

    const processStageData = await ProcessStage.find(processStageQuery)
      .populate('productId', 'name code')
      .populate('processId', 'name order');

    // Combine data and calculate cumulative available quantities
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const combinedData = await Promise.all(workEntryData.map(async (entry) => {
      const processStage = processStageData.find(ps => 
        ps.productId._id.toString() === entry._id.productId.toString() &&
        ps.processId._id.toString() === entry._id.processId.toString()
      );
      
      // Calculate cumulative available quantity (previous days + date of ProcessStage record)
      // Use ProcessStage record's date if available, otherwise use today for current/realtime views
      let availableQuantity = 0;
      if (processStage) {
        // Get product to find factoryId
        const product = await Product.findById(entry._id.productId);
        if (product && product.factoryId) {
          // Use ProcessStage record's date for cumulative calculation (normalized to start of day)
          const calculationDate = processStage.date ? new Date(processStage.date) : today;
          calculationDate.setHours(0, 0, 0, 0);
          
          availableQuantity = await quantityService.calculateCumulativeAvailableQuantity(
            product.factoryId,
            new mongoose.Types.ObjectId(entry._id.productId),
            new mongoose.Types.ObjectId(entry._id.processId),
            calculationDate
          );
        } else {
          // Fallback to today's value if product not found
          availableQuantity = processStage.availableQuantity || 0;
        }
      }
      
      return {
        productId: entry._id.productId,
        productName: entry._id.productName,
        productCode: entry._id.productCode,
        processId: entry._id.processId,
        processName: entry._id.processName,
        stageOrder: entry._id.stageOrder,
        achievedQuantity: entry.achievedQuantity,
        rejectedQuantity: entry.rejectedQuantity,
        availableQuantity,
        targetQuantity: entry.targetQuantity,
        workEntryCount: entry.workEntryCount,
        efficiency: entry.targetQuantity > 0 ? (entry.achievedQuantity / entry.targetQuantity) * 100 : 0,
        latestEntry: entry.latestEntry
      };
    }));

    let result: any = {
      viewType: viewType,
      dateRange: {
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: endDate || new Date().toISOString().split('T')[0]
      },
      grandTotals: {
        totalAchieved: 0,
        totalRejected: 0,
        totalAvailable: 0
      }
    };

    if (viewType === 'product') {
      // Group by product
      const productGroups = combinedData.reduce((acc: any, item) => {
        const productKey = item.productId;
        if (!acc[productKey]) {
          acc[productKey] = {
            productId: item.productId,
            productName: item.productName,
            productCode: item.productCode,
            processes: [],
            totals: {
              totalAchieved: 0,
              totalRejected: 0,
              totalAvailable: 0
            }
          };
        }
        
        acc[productKey].processes.push({
          processId: item.processId,
          processName: item.processName,
          stageOrder: item.stageOrder,
          achievedQuantity: item.achievedQuantity,
          rejectedQuantity: item.rejectedQuantity,
          availableQuantity: item.availableQuantity,
          workEntryCount: item.workEntryCount,
          targetQuantity: item.targetQuantity,
          efficiency: item.efficiency,
          latestEntry: item.latestEntry
        });
        
        acc[productKey].totals.totalAchieved += item.achievedQuantity;
        acc[productKey].totals.totalRejected += item.rejectedQuantity;
        acc[productKey].totals.totalAvailable += item.availableQuantity;
        
        return acc;
      }, {});

      result.products = Object.values(productGroups);
      
      // Calculate grand totals
      result.grandTotals = result.products.reduce((totals: any, product: any) => {
        totals.totalAchieved += product.totals.totalAchieved;
        totals.totalRejected += product.totals.totalRejected;
        totals.totalAvailable += product.totals.totalAvailable;
        return totals;
      }, { totalAchieved: 0, totalRejected: 0, totalAvailable: 0 });

    } else {
      // Group by process
      const processGroups = combinedData.reduce((acc: any, item) => {
        const processKey = item.processId;
        if (!acc[processKey]) {
          acc[processKey] = {
            processId: item.processId,
            processName: item.processName,
            stageOrder: item.stageOrder,
            products: [],
            totals: {
              totalAchieved: 0,
              totalRejected: 0,
              totalAvailable: 0
            }
          };
        }
        
        acc[processKey].products.push({
          productId: item.productId,
          productName: item.productName,
          productCode: item.productCode,
          achievedQuantity: item.achievedQuantity,
          rejectedQuantity: item.rejectedQuantity,
          availableQuantity: item.availableQuantity,
          workEntryCount: item.workEntryCount,
          targetQuantity: item.targetQuantity,
          efficiency: item.efficiency,
          latestEntry: item.latestEntry
        });
        
        acc[processKey].totals.totalAchieved += item.achievedQuantity;
        acc[processKey].totals.totalRejected += item.rejectedQuantity;
        acc[processKey].totals.totalAvailable += item.availableQuantity;
        
        return acc;
      }, {});

      result.factoryProcesses = Object.values(processGroups);
      
      // Calculate grand totals
      result.grandTotals = result.factoryProcesses.reduce((totals: any, process: any) => {
        totals.totalAchieved += process.totals.totalAchieved;
        totals.totalRejected += process.totals.totalRejected;
        totals.totalAvailable += process.totals.totalAvailable;
        return totals;
      }, { totalAchieved: 0, totalRejected: 0, totalAvailable: 0 });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logError('Error fetching process stages summary', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch process stages summary' 
    });
  }
});

// Export process stages summary report
router.get('/process-stages-summary/export/:format', authenticate, async (req, res) => {
  try {
    const { format } = req.params;
    const { 
      startDate, 
      endDate, 
      factoryId, 
      viewType = 'product' 
    } = req.query;
    
    const userFactoryId = req.user?.factoryId;
    const targetFactoryId = factoryId || userFactoryId;
    
    if (!targetFactoryId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Factory ID is required',
        status: 400 
      });
    }

    // Build date range query
    let dateQuery: any = {};
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      dateQuery = {
        $gte: start,
        $lte: end
      };
    } else if (startDate) {
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      dateQuery = { $gte: start };
    } else if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      dateQuery = { $lte: end };
    }

    // Build aggregation pipeline
    const pipeline: any[] = [
      {
        $match: {
          factoryId: new mongoose.Types.ObjectId(targetFactoryId as string),
          ...(Object.keys(dateQuery).length > 0 && { createdAt: dateQuery })
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
        $lookup: {
          from: 'processes',
          localField: 'processId',
          foreignField: '_id',
          as: 'process'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $unwind: '$process'
      },
      {
        $addFields: {
          stageOrder: {
            $let: {
              vars: {
                processInProduct: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$product.processes',
                        cond: { 
                          $eq: [
                            { $toString: '$$this.processId' }, 
                            { $toString: '$processId' }
                          ] 
                        }
                      }
                    },
                    0
                  ]
                }
              },
              in: '$$processInProduct.order'
            }
          }
        }
      },
      {
        $group: {
          _id: {
            productId: '$productId',
            processId: '$processId',
            productName: '$product.name',
            productCode: '$product.code',
            processName: '$process.name',
            stageOrder: '$stageOrder'
          },
          achievedQuantity: { $sum: '$achieved' },
          rejectedQuantity: { $sum: '$rejected' },
          targetQuantity: { $sum: '$targetQuantity' },
          workEntryCount: { $sum: 1 },
          latestEntry: { $max: '$createdAt' }
        }
      }
    ];

    // Get work entry data
    const workEntryData = await WorkEntry.aggregate(pipeline);

    // Get process stage data for available quantities
    const processStageQuery: any = {
      factoryId: new mongoose.Types.ObjectId(targetFactoryId as string)
    };
    
    if (Object.keys(dateQuery).length > 0) {
      processStageQuery.date = dateQuery;
    }

    const processStageData = await ProcessStage.find(processStageQuery)
      .populate('productId', 'name code')
      .populate('processId', 'name order');

    // Combine data and calculate cumulative available quantities
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const combinedData = await Promise.all(workEntryData.map(async (entry) => {
      const processStage = processStageData.find(ps => 
        ps.productId._id.toString() === entry._id.productId.toString() &&
        ps.processId._id.toString() === entry._id.processId.toString()
      );
      
      // Calculate cumulative available quantity (previous days + date of ProcessStage record)
      // Use ProcessStage record's date if available, otherwise use today for current/realtime views
      let availableQuantity = 0;
      if (processStage) {
        // Get product to find factoryId
        const product = await Product.findById(entry._id.productId);
        if (product && product.factoryId) {
          // Use ProcessStage record's date for cumulative calculation (normalized to start of day)
          const calculationDate = processStage.date ? new Date(processStage.date) : today;
          calculationDate.setHours(0, 0, 0, 0);
          
          availableQuantity = await quantityService.calculateCumulativeAvailableQuantity(
            product.factoryId,
            new mongoose.Types.ObjectId(entry._id.productId),
            new mongoose.Types.ObjectId(entry._id.processId),
            calculationDate
          );
        } else {
          // Fallback to today's value if product not found
          availableQuantity = processStage.availableQuantity || 0;
        }
      }
      
      return {
        productId: entry._id.productId,
        productName: entry._id.productName,
        productCode: entry._id.productCode,
        processId: entry._id.processId,
        processName: entry._id.processName,
        stageOrder: entry._id.stageOrder,
        achievedQuantity: entry.achievedQuantity,
        rejectedQuantity: entry.rejectedQuantity,
        availableQuantity,
        targetQuantity: entry.targetQuantity,
        workEntryCount: entry.workEntryCount,
        efficiency: entry.targetQuantity > 0 ? (entry.achievedQuantity / entry.targetQuantity) * 100 : 0,
        latestEntry: entry.latestEntry
      };
    }));

    if (format === 'excel') {
      // Generate Excel file
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Process Stages Summary');
      
      // Add title
      worksheet.addRow(['Process Stages Summary Report']);
      worksheet.addRow([`Generated on: ${new Date().toLocaleString()}`]);
      worksheet.addRow([`Date Range: ${startDate || 'All time'} to ${endDate || 'All time'}`]);
      worksheet.addRow([`View Type: ${viewType === 'product' ? 'Product-centric' : 'Process-centric'}`]);
      worksheet.addRow([]);
      
      // Add summary section
      const totalAchieved = combinedData.reduce((sum, item) => sum + item.achievedQuantity, 0);
      const totalRejected = combinedData.reduce((sum, item) => sum + item.rejectedQuantity, 0);
      const totalAvailable = combinedData.reduce((sum, item) => sum + item.availableQuantity, 0);
      
      worksheet.addRow(['SUMMARY']);
      worksheet.addRow(['Total Achieved', 'Total Rejected', 'Total Available', 'Overall Efficiency']);
      const overallEfficiency = totalAchieved + totalRejected > 0 ? (totalAchieved / (totalAchieved + totalRejected)) * 100 : 0;
      worksheet.addRow([totalAchieved, totalRejected, totalAvailable, `${overallEfficiency.toFixed(2)}%`]);
      worksheet.addRow([]);
      
      if (viewType === 'product') {
        // Group by product
        const productGroups = combinedData.reduce((acc: any, item) => {
          const productKey = item.productId;
          if (!acc[productKey]) {
            acc[productKey] = {
              productName: item.productName,
              productCode: item.productCode,
              processes: [],
              totals: { totalAchieved: 0, totalRejected: 0, totalAvailable: 0 }
            };
          }
          
          acc[productKey].factoryProcesses.push(item);
          acc[productKey].totals.totalAchieved += item.achievedQuantity;
          acc[productKey].totals.totalRejected += item.rejectedQuantity;
          acc[productKey].totals.totalAvailable += item.availableQuantity;
          
          return acc;
        }, {});

        // Add product details
        worksheet.addRow(['PRODUCT DETAILS']);
        worksheet.addRow(['Product', 'Process', 'Stage Order', 'Achieved', 'Rejected', 'Available', 'Target', 'Efficiency %', 'Work Entries']);
        
        Object.values(productGroups).forEach((product: any) => {
          product.factoryProcesses.forEach((process: any) => {
            worksheet.addRow([
              `${product.productCode} - ${product.productName}`,
              process.processName,
              process.stageOrder,
              process.achievedQuantity,
              process.rejectedQuantity,
              process.availableQuantity,
              process.targetQuantity,
              `${process.efficiency.toFixed(2)}%`,
              process.workEntryCount
            ]);
          });
        });
      } else {
        // Group by process
        const processGroups = combinedData.reduce((acc: any, item) => {
          const processKey = item.processId;
          if (!acc[processKey]) {
            acc[processKey] = {
              processName: item.processName,
              stageOrder: item.stageOrder,
              products: [],
              totals: { totalAchieved: 0, totalRejected: 0, totalAvailable: 0 }
            };
          }
          
          acc[processKey].products.push(item);
          acc[processKey].totals.totalAchieved += item.achievedQuantity;
          acc[processKey].totals.totalRejected += item.rejectedQuantity;
          acc[processKey].totals.totalAvailable += item.availableQuantity;
          
          return acc;
        }, {});

        // Add process details
        worksheet.addRow(['PROCESS DETAILS']);
        worksheet.addRow(['Process', 'Stage Order', 'Product', 'Achieved', 'Rejected', 'Available', 'Target', 'Efficiency %', 'Work Entries']);
        
        Object.values(processGroups).forEach((process: any) => {
          process.products.forEach((product: any) => {
            worksheet.addRow([
              process.processName,
              process.stageOrder,
              `${product.productCode} - ${product.productName}`,
              product.achievedQuantity,
              product.rejectedQuantity,
              product.availableQuantity,
              product.targetQuantity,
              `${product.efficiency.toFixed(2)}%`,
              product.workEntryCount
            ]);
          });
        });
      }
      
      // Style the worksheet
      worksheet.getRow(1).font = { bold: true, size: 16 };
      worksheet.getRow(6).font = { bold: true, size: 14 };
      worksheet.getRow(8).font = { bold: true };
      
      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="process-stages-summary-${new Date().toISOString().split('T')[0]}.xlsx"`);
      
      // Write to response
      await workbook.xlsx.write(res);
      res.end();
      
    } else if (format === 'pdf') {
      // Generate PDF file
      const doc = new PDFDocument();
      
      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="process-stages-summary-${new Date().toISOString().split('T')[0]}.pdf"`);
      
      // Pipe PDF to response
      doc.pipe(res);
      
      // Add content to PDF
      doc.fontSize(20).text('Process Stages Summary Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.fontSize(12).text(`Date Range: ${startDate || 'All time'} to ${endDate || 'All time'}`, { align: 'center' });
      doc.fontSize(12).text(`View Type: ${viewType === 'product' ? 'Product-centric' : 'Process-centric'}`, { align: 'center' });
      doc.moveDown(2);
      
      // Add summary
      doc.fontSize(16).text('Summary', { underline: true });
      doc.moveDown();
      
      const totalAchieved = combinedData.reduce((sum, item) => sum + item.achievedQuantity, 0);
      const totalRejected = combinedData.reduce((sum, item) => sum + item.rejectedQuantity, 0);
      const totalAvailable = combinedData.reduce((sum, item) => sum + item.availableQuantity, 0);
      const overallEfficiency = totalAchieved + totalRejected > 0 ? (totalAchieved / (totalAchieved + totalRejected)) * 100 : 0;
      
      doc.fontSize(12).text(`Total Achieved: ${totalAchieved}`);
      doc.text(`Total Rejected: ${totalRejected}`);
      doc.text(`Total Available: ${totalAvailable}`);
      doc.text(`Overall Efficiency: ${overallEfficiency.toFixed(2)}%`);
      doc.moveDown(2);
      
      // Add details table
      doc.fontSize(16).text('Details', { underline: true });
      doc.moveDown();
      
      let yPosition = doc.y;
      const tableTop = yPosition;
      const col1X = 50;
      const col2X = 150;
      const col3X = 250;
      const col4X = 350;
      const col5X = 450;
      
      // Table headers
      if (viewType === 'product') {
        doc.fontSize(10).text('Product', col1X, yPosition);
        doc.text('Process', col2X, yPosition);
        doc.text('Achieved', col3X, yPosition);
        doc.text('Rejected', col4X, yPosition);
        doc.text('Available', col5X, yPosition);
      } else {
        doc.fontSize(10).text('Process', col1X, yPosition);
        doc.text('Product', col2X, yPosition);
        doc.text('Achieved', col3X, yPosition);
        doc.text('Rejected', col4X, yPosition);
        doc.text('Available', col5X, yPosition);
      }
      yPosition += 20;
      
      // Table content (limit to first 20 entries for PDF)
      combinedData.slice(0, 20).forEach(item => {
        if (viewType === 'product') {
          doc.fontSize(8).text(`${item.productCode} - ${item.productName}`.substring(0, 20), col1X, yPosition);
          doc.text(item.processName.substring(0, 15), col2X, yPosition);
          doc.text(item.achievedQuantity.toString(), col3X, yPosition);
          doc.text(item.rejectedQuantity.toString(), col4X, yPosition);
          doc.text(item.availableQuantity.toString(), col5X, yPosition);
        } else {
          doc.fontSize(8).text(item.processName.substring(0, 20), col1X, yPosition);
          doc.text(`${item.productCode} - ${item.productName}`.substring(0, 15), col2X, yPosition);
          doc.text(item.achievedQuantity.toString(), col3X, yPosition);
          doc.text(item.rejectedQuantity.toString(), col4X, yPosition);
          doc.text(item.availableQuantity.toString(), col5X, yPosition);
        }
        yPosition += 15;
      });
      
      doc.end();
      
    } else {
      res.status(400).json({ success: false, error: 'Invalid format. Use "excel" or "pdf"' });
    }
    
  } catch (error) {
    logError('Error exporting process stages summary', error);
    res.status(500).json({ success: false, error: 'Failed to export process stages summary' });
  }
});

// Get product-wise process stages data
router.get('/product-process-stages', authenticate, async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      factoryId, 
      realtime = false 
    } = req.query;
    
    const userFactoryId = req.user?.factoryId;
    const targetFactoryId = factoryId || userFactoryId;
    
    if (!targetFactoryId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Factory ID is required',
        status: 400 
      });
    }

    // Build date range query
    let dateQuery: any = {};
    if (!realtime && startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      dateQuery = {
        $gte: start,
        $lte: end
      };
    } else if (!realtime && startDate) {
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      dateQuery = { $gte: start };
    } else if (!realtime && endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      dateQuery = { $lte: end };
    }

    // Build aggregation pipeline for work entries
    const pipeline: any[] = [
      {
        $match: {
          factoryId: new mongoose.Types.ObjectId(targetFactoryId as string),
          ...(Object.keys(dateQuery).length > 0 && { createdAt: dateQuery })
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
        $lookup: {
          from: 'processes',
          localField: 'processId',
          foreignField: '_id',
          as: 'process'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $unwind: '$process'
      },
      {
        $addFields: {
          stageOrder: {
            $let: {
              vars: {
                processInProduct: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$product.processes',
                        cond: { 
                          $eq: [
                            { $toString: '$$this.processId' }, 
                            { $toString: '$processId' }
                          ] 
                        }
                      }
                    },
                    0
                  ]
                }
              },
              in: '$$processInProduct.order'
            }
          }
        }
      },
      {
        $group: {
          _id: {
            productId: '$productId',
            processId: '$processId',
            productName: '$product.name',
            productCode: '$product.code',
            processName: '$process.name',
            stageOrder: '$stageOrder'
          },
          achievedQuantity: { $sum: '$achieved' },
          rejectedQuantity: { $sum: '$rejected' },
          targetQuantity: { $sum: '$targetQuantity' },
          workEntryCount: { $sum: 1 },
          latestEntry: { $max: '$createdAt' }
        }
      }
    ];

    // Get work entry data
    const workEntryData = await WorkEntry.aggregate(pipeline);

    // Get process stage data for available quantities
    const processStageQuery: any = {
      factoryId: new mongoose.Types.ObjectId(targetFactoryId as string)
    };
    
    if (Object.keys(dateQuery).length > 0) {
      processStageQuery.date = dateQuery;
    }

    const processStageData = await ProcessStage.find(processStageQuery)
      .populate('productId', 'name code')
      .populate('processId', 'name order');

    // Get active work sessions if realtime
    let activeSessions: any[] = [];
    if (realtime) {
      // Find active work sessions (allEmployees currently working)
      const activeWorkSessions = await WorkEntry.find({
        factoryId: new mongoose.Types.ObjectId(targetFactoryId as string),
        status: 'in_progress'
      })
      .populate('employeeId', 'profile.firstName profile.lastName')
      .populate('productId', 'name')
      .populate('processId', 'name');

      activeSessions = activeWorkSessions.map(session => ({
        productId: session.productId._id,
        productName: (session.productId as any).name,
        processId: session.processId._id,
        processName: (session.processId as any).name,
        employeeName: `${(session.employeeId as any).profile.firstName} ${(session.employeeId as any).profile.lastName}`,
        startTime: session.createdAt,
        currentAchieved: session.achieved,
        currentRejected: session.rejected
      }));
    }

    // Combine data and calculate cumulative available quantities
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const combinedData = await Promise.all(workEntryData.map(async (entry) => {
      const processStage = processStageData.find(ps => 
        ps.productId._id.toString() === entry._id.productId.toString() &&
        ps.processId._id.toString() === entry._id.processId.toString()
      );
      
      // Calculate cumulative available quantity (previous days + date of ProcessStage record)
      // Use ProcessStage record's date if available, otherwise use today for current/realtime views
      let availableQuantity = 0;
      if (processStage) {
        // Get product to find factoryId
        const product = await Product.findById(entry._id.productId);
        if (product && product.factoryId) {
          // Use ProcessStage record's date for cumulative calculation (normalized to start of day)
          const calculationDate = processStage.date ? new Date(processStage.date) : today;
          calculationDate.setHours(0, 0, 0, 0);
          
          availableQuantity = await quantityService.calculateCumulativeAvailableQuantity(
            product.factoryId,
            new mongoose.Types.ObjectId(entry._id.productId),
            new mongoose.Types.ObjectId(entry._id.processId),
            calculationDate
          );
        } else {
          // Fallback to today's value if product not found
          availableQuantity = processStage.availableQuantity || 0;
        }
      }
      
      return {
        productId: entry._id.productId,
        productName: entry._id.productName,
        productCode: entry._id.productCode,
        processId: entry._id.processId,
        processName: entry._id.processName,
        stageOrder: entry._id.stageOrder,
        achievedQuantity: entry.achievedQuantity,
        rejectedQuantity: entry.rejectedQuantity,
        availableQuantity,
        targetQuantity: entry.targetQuantity,
        workEntryCount: entry.workEntryCount,
        efficiency: entry.targetQuantity > 0 ? (entry.achievedQuantity / entry.targetQuantity) * 100 : 0,
        latestEntry: entry.latestEntry,
        activeWorkSessions: realtime ? activeSessions.filter(session => 
          session.productId.toString() === entry._id.productId.toString() &&
          session.processId.toString() === entry._id.processId.toString()
        ).length : 0
      };
    }));

    // Group by product
    const productGroups = combinedData.reduce((acc: any, item) => {
      const productKey = item.productId;
      if (!acc[productKey]) {
        acc[productKey] = {
          productId: item.productId,
          productName: item.productName,
          productCode: item.productCode,
          processes: [],
          totals: {
            totalAchieved: 0,
            totalRejected: 0,
            totalAvailable: 0,
            totalTarget: 0
          }
        };
      }
      
      acc[productKey].processes.push({
        processId: item.processId,
        processName: item.processName,
        stageOrder: item.stageOrder,
        achievedQuantity: item.achievedQuantity,
        rejectedQuantity: item.rejectedQuantity,
        availableQuantity: item.availableQuantity,
        targetQuantity: item.targetQuantity,
        workEntryCount: item.workEntryCount,
        efficiency: item.efficiency,
        latestEntry: item.latestEntry,
        activeWorkSessions: item.activeWorkSessions
      });
      
      acc[productKey].totals.totalAchieved += item.achievedQuantity;
      acc[productKey].totals.totalRejected += item.rejectedQuantity;
      acc[productKey].totals.totalAvailable += item.availableQuantity;
      acc[productKey].totals.totalTarget += item.targetQuantity;
      
      return acc;
    }, {});

    const products = Object.values(productGroups);
    
    // Calculate grand totals
    const grandTotals = products.reduce((totals: any, product: any) => {
      totals.totalAchieved += product.totals.totalAchieved;
      totals.totalRejected += product.totals.totalRejected;
      totals.totalAvailable += product.totals.totalAvailable;
      totals.totalTarget += product.totals.totalTarget;
      return totals;
    }, { 
      totalAchieved: 0, 
      totalRejected: 0, 
      totalAvailable: 0,
      totalTarget: 0
    });

    const result = {
      products,
      grandTotals,
      activeSessions: realtime ? activeSessions : [],
      lastUpdated: new Date().toISOString(),
      realtime: !!realtime
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logError('Error fetching product process stages', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch product process stages' 
    });
  }
});

// Get real-time display data
router.get('/realtime-display', authenticate, async (req, res) => {
  try {
    const { factoryId, startDate, endDate } = req.query;
    const userFactoryId = req.user?.factoryId;
    const targetFactoryId = factoryId || userFactoryId;
    
    if (!targetFactoryId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Factory ID is required',
        status: 400 
      });
    }

    // Add date range handling - default to last 7 days
    const currentDate = new Date();
    const defaultStartDate = new Date(currentDate);
    defaultStartDate.setDate(currentDate.getDate() - 7); // Last 7 days

    const dateFilter: any = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    } else {
      // Default: show last 7 days of data
      dateFilter.createdAt = {
        $gte: defaultStartDate
      };
    }

    // Get work entries data with date filtering
    const pipeline: any[] = [
      {
        $match: {
          factoryId: new mongoose.Types.ObjectId(targetFactoryId as string),
          ...dateFilter
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
        $lookup: {
          from: 'processes',
          localField: 'processId',
          foreignField: '_id',
          as: 'process'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $unwind: '$process'
      },
      {
        $addFields: {
          stageOrder: {
            $let: {
              vars: {
                processInProduct: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$product.processes',
                        cond: { 
                          $eq: [
                            { $toString: '$$this.processId' }, 
                            { $toString: '$processId' }
                          ] 
                        }
                      }
                    },
                    0
                  ]
                }
              },
              in: '$$processInProduct.order'
            }
          }
        }
      },
      {
        $group: {
          _id: {
            productId: '$productId',
            processId: '$processId',
            productName: '$product.name',
            productCode: '$product.code',
            processName: '$process.name',
            stageOrder: '$stageOrder'
          },
          achievedQuantity: { $sum: '$achieved' },
          rejectedQuantity: { $sum: '$rejected' },
          targetQuantity: { $sum: '$targetQuantity' },
          workEntryCount: { $sum: 1 },
          latestEntry: { $max: '$createdAt' }
        }
      }
    ];

    // Get work entry data
    const workEntryData = await WorkEntry.aggregate(pipeline);

    // Get daily production data for analytics
    const dailyPipeline = [
      {
        $match: {
          factoryId: new mongoose.Types.ObjectId(targetFactoryId as string),
          ...dateFilter
        }
      },
      {
        $addFields: {
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          dayOfWeek: {
            $dayOfWeek: '$createdAt'
          }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      {
        $unwind: '$productInfo'
      },
      {
        $addFields: {
          processStageOrder: {
            $let: {
              vars: {
                processInProduct: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$productInfo.processes',
                        cond: { 
                          $eq: [
                            { $toString: '$$this.processId' }, 
                            { $toString: '$processId' }
                          ] 
                        }
                      }
                    },
                    0
                  ]
                }
              },
              in: '$$processInProduct.order'
            }
          },
          maxStageOrder: {
            $max: '$productInfo.processes.order'
          }
        }
      },
      {
        $match: {
          $expr: { $eq: ['$processStageOrder', '$maxStageOrder'] }
        }
      },
      {
        $group: {
          _id: {
            date: '$date',
            productId: '$productId'
          },
          production: { $sum: '$achieved' },
          rejected: { $sum: '$rejected' },
          plan: { $sum: '$targetQuantity' },
          populatedWorkEntries: { $sum: 1 },
          avgCycleTime: {
            $avg: {
              $divide: [
                { $subtract: ['$endTime', '$startTime'] },
                1000 * 60 // Convert to minutes
              ]
            }
          }
        }
      },
      {
        $sort: { '_id.date': 1 as 1, '_id.productId': 1 as 1 }
      }
    ];

    const dailyData = await WorkEntry.aggregate(dailyPipeline);

    // Organize daily data by product
    const dailyDataByProduct: any = {};
    dailyData.forEach((entry: any) => {
      const productId = entry._id.productId.toString();
      const date = entry._id.date;
      
      if (!dailyDataByProduct[productId]) {
        dailyDataByProduct[productId] = [];
      }
      
      dailyDataByProduct[productId].push({
        date: date,
        production: entry.production || 0,
        totalAchieved: entry.production || 0,
        totalRejected: entry.rejected || 0,
        totalTarget: entry.plan || 0,
        plan: entry.plan || 0,
        timestamp: (() => {
          try {
            const dateObj = new Date(date);
            if (isNaN(dateObj.getTime())) {
              return new Date().toISOString();
            }
            return dateObj.toISOString();
          } catch (error) {
            return new Date().toISOString();
          }
        })()
      });
    });

    // Calculate expected production based on current time
    const currentTime = new Date();
    const startOfDay = new Date(currentTime);
    startOfDay.setHours(0, 0, 0, 0);
    const currentHour = currentTime.getHours();
    const totalWorkHours = 10; // Assuming 8 AM to 6 PM shift
    const hoursElapsed = Math.max(0, Math.min(currentHour - 8, totalWorkHours)); // 8 AM start
    
    // Get process stage data for available quantities
    const processStageData = await ProcessStage.find({
      factoryId: new mongoose.Types.ObjectId(targetFactoryId as string)
    })
    .populate('productId', 'name code')
    .populate('processId', 'name order');

    // Get active work sessions
    const activeWorkSessions = await WorkEntry.find({
      factoryId: new mongoose.Types.ObjectId(targetFactoryId as string),
      status: 'in_progress'
    })
    .populate('employeeId', 'profile.firstName profile.lastName')
    .populate('productId', 'name')
    .populate('processId', 'name');

    const activeSessions = activeWorkSessions
      .filter(session => session.productId && session.processId && session.employeeId)
      .map(session => ({
        productId: (session.productId as any)?._id || session.productId,
        productName: (session.productId as any)?.name || 'Unknown',
        processId: (session.processId as any)?._id || session.processId,
        processName: (session.processId as any)?.name || 'Unknown',
        employeeName: (session.employeeId as any)?.profile 
          ? `${(session.employeeId as any).profile.firstName || ''} ${(session.employeeId as any).profile.lastName || ''}`.trim() || 'Unknown'
          : 'Unknown',
        startTime: session.createdAt || new Date(),
        currentAchieved: session.achieved || 0,
        currentRejected: session.rejected || 0
      }));

    // Combine data and calculate cumulative available quantities
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const combinedData = await Promise.all(workEntryData.map(async (entry) => {
      try {
        const processStage = processStageData.find(ps => 
          ps.productId && ps.processId &&
          ps.productId._id && ps.processId._id &&
          ps.productId._id.toString() === entry._id.productId.toString() &&
          ps.processId._id.toString() === entry._id.processId.toString()
        );
        
        // Calculate cumulative available quantity (previous days + date of ProcessStage record)
        // Use ProcessStage record's date if available, otherwise use today for realtime views
        let availableQuantity = 0;
        if (processStage) {
          try {
            // Get product to find factoryId
            const product = await Product.findById(entry._id.productId);
            if (product && product.factoryId) {
              try {
                // Use ProcessStage record's date for cumulative calculation (normalized to start of day)
                const calculationDate = processStage.date ? new Date(processStage.date) : today;
                calculationDate.setHours(0, 0, 0, 0);
                
                availableQuantity = await quantityService.calculateCumulativeAvailableQuantity(
                  product.factoryId,
                  new mongoose.Types.ObjectId(entry._id.productId),
                  new mongoose.Types.ObjectId(entry._id.processId),
                  calculationDate
                );
              } catch (qtyError: any) {
                // Log but don't fail - use fallback
                logger.warn('Failed to calculate cumulative available quantity', { error: qtyError?.message });
                availableQuantity = processStage.availableQuantity || 0;
              }
            } else {
              // Fallback to today's value if product not found
              availableQuantity = processStage.availableQuantity || 0;
            }
          } catch (productError: any) {
            console.warn('Error fetching product for quantity calculation:', productError?.message);
            availableQuantity = processStage.availableQuantity || 0;
          }
        }
        
        return {
          productId: entry._id.productId,
          productName: entry._id.productName || 'Unknown',
          productCode: entry._id.productCode || '',
          processId: entry._id.processId,
          processName: entry._id.processName || 'Unknown',
          stageOrder: entry._id.stageOrder || 0,
          achievedQuantity: entry.achievedQuantity || 0,
          rejectedQuantity: entry.rejectedQuantity || 0,
          availableQuantity,
          targetQuantity: entry.targetQuantity || 0,
          workEntryCount: entry.workEntryCount || 0,
          efficiency: entry.targetQuantity > 0 ? (entry.achievedQuantity / entry.targetQuantity) * 100 : 0,
          latestEntry: entry.latestEntry || new Date(),
          activeWorkSessions: activeSessions.filter(session => 
            session.productId && session.processId &&
            session.productId.toString() === entry._id.productId.toString() &&
            session.processId.toString() === entry._id.processId.toString()
          ).length
        };
      } catch (entryError: any) {
        // Log error but don't fail entire request - return minimal data structure
        logger.warn('Error processing work entry data', {
          error: entryError instanceof Error ? entryError.message : String(entryError),
          entryId: entry._id
        });
        // Return minimal data structure to prevent complete failure
        return {
          productId: entry._id?.productId || '',
          productName: entry._id?.productName || 'Unknown',
          productCode: entry._id?.productCode || '',
          processId: entry._id?.processId || '',
          processName: entry._id?.processName || 'Unknown',
          stageOrder: entry._id?.stageOrder || 0,
          achievedQuantity: entry.achievedQuantity || 0,
          rejectedQuantity: entry.rejectedQuantity || 0,
          availableQuantity: 0,
          targetQuantity: entry.targetQuantity || 0,
          workEntryCount: entry.workEntryCount || 0,
          efficiency: 0,
          latestEntry: entry.latestEntry || new Date(),
          activeWorkSessions: 0
        };
      }
    }));

    // Group by product
    const productGroups = combinedData.reduce((acc: any, item) => {
      const productKey = item.productId;
      if (!acc[productKey]) {
        acc[productKey] = {
          productId: item.productId,
          productName: item.productName,
          productCode: item.productCode,
          processes: [],
          totals: {
            totalAchieved: 0,
            totalRejected: 0,
            totalAvailable: 0,
            totalTarget: 0
          }
        };
      }
      
      acc[productKey].processes.push({
        processId: item.processId,
        processName: item.processName,
        stageOrder: item.stageOrder,
        achievedQuantity: item.achievedQuantity,
        rejectedQuantity: item.rejectedQuantity,
        availableQuantity: item.availableQuantity,
        targetQuantity: item.targetQuantity,
        workEntryCount: item.workEntryCount,
        efficiency: item.efficiency,
        latestEntry: item.latestEntry,
        activeWorkSessions: item.activeWorkSessions
      });
      
      acc[productKey].totals.totalAchieved += item.achievedQuantity;
      acc[productKey].totals.totalRejected += item.rejectedQuantity;
      acc[productKey].totals.totalAvailable += item.availableQuantity;
      acc[productKey].totals.totalTarget += item.targetQuantity;
      
      return acc;
    }, {});

    const products = Object.values(productGroups).map((product: any) => ({
      ...product,
      processes: product.processes.sort((a: any, b: any) => a.stageOrder - b.stageOrder),
      dailyData: dailyDataByProduct[product.productId.toString()] || []
    }));
    
    // Calculate grand totals
    const grandTotals = products.reduce((totals: any, product: any) => {
      totals.totalAchieved += product.totals.totalAchieved;
      totals.totalRejected += product.totals.totalRejected;
      totals.totalAvailable += product.totals.totalAvailable;
      totals.totalTarget += product.totals.totalTarget;
      return totals;
    }, { 
      totalAchieved: 0, 
      totalRejected: 0, 
      totalAvailable: 0,
      totalTarget: 0
    });

    // Calculate analytics metrics
    const totalPlan = grandTotals.totalTarget;
    const totalActual = grandTotals.totalAchieved;
    const totalExpected = totalPlan > 0 ? Math.round((totalPlan * hoursElapsed) / totalWorkHours) : 0;
    
    // Calculate average cycle time
    const totalCycleTime = workEntryData.reduce((sum: number, entry: any) => {
      return sum + (entry.workEntryCount * 12); // Assuming 12 minutes average cycle time
    }, 0);
    const avgCycleTime = totalActual > 0 ? (totalCycleTime / totalActual) : 0;
    
    // Calculate efficiency
    const efficiency = totalPlan > 0 ? (totalActual / totalPlan) * 100 : 0;

    // Format daily data for frontend
    const formattedDailyData = dailyData.map((dayData: any) => {
      const dateStr = dayData._id.date;
      let timestamp;
      try {
        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) {
          timestamp = new Date().toISOString();
        } else {
          timestamp = dateObj.toISOString();
        }
      } catch (error) {
        timestamp = new Date().toISOString();
      }
      
      return {
        date: dateStr,
        production: dayData.production || 0,
        totalAchieved: dayData.production || 0,
        totalRejected: dayData.rejected || 0,
        totalTarget: dayData.plan || 0,
        plan: dayData.plan || 0,
        expected: dayData.plan || 0,
        timestamp: timestamp
      };
    });

    // Create product plan data for table - production count by last process stage
    const productPlanData = products.map((product: any, index: number) => {
      // Find the last process stage (highest stage order)
      const lastProcess = product.processes.reduce((last: any, current: any) => {
        return (current.stageOrder || 0) > (last.stageOrder || 0) ? current : last;
      }, product.processes[0] || {});
      
      const lastStageProduction = lastProcess?.achievedQuantity || 0;
      const lastStageRejected = lastProcess?.rejectedQuantity || 0;
      // Calculate efficiency based on ALL process stages' achieved and rejected quantities
      const totalAllStages = product.totals.totalAchieved + product.totals.totalRejected;
      const efficiency = totalAllStages > 0 ? (product.totals.totalAchieved / totalAllStages) * 100 : 0;
      
      return {
        sequence: index + 1,
        modelCode: product.productCode,
        modelName: product.productName,
        production: lastStageProduction,
        rejected: lastStageRejected,
        efficiency: Math.round(efficiency * 100) / 100,
        productId: product.productId,
        processId: lastProcess?.processId || '',
        processName: lastProcess?.processName || ''
      };
    });

    // Create process stages data for analytics chart - grouped by product
    const processStagesData = products.map((product: any) => ({
      productName: product.productName,
      productCode: product.productCode,
      processes: product.processes
        .sort((a: any, b: any) => (a.stageOrder || 0) - (b.stageOrder || 0))
        .map((process: any) => ({
          processName: process.processName,
          stageOrder: process.stageOrder || 0,
          achieved: process.achievedQuantity || 0,
          rejected: process.rejectedQuantity || 0,
          processId: process.processId
        }))
    }));

    // Analytics object
    const analytics = {
      plan: totalPlan,
      actual: totalActual,
      expected: totalExpected,
      avgCycleTime: Math.round(avgCycleTime * 100) / 100,
      totalProducts: products.length,
      totalProcesses: workEntryData.length,
      efficiency: Math.round(efficiency * 100) / 100
    };

    // Grand totals for analytics
    const analyticsGrandTotals = {
      totalPlan,
      totalProduction: totalActual,
      totalExpected,
      overallAchievement: Math.round(efficiency * 100) / 100
    };

    const result = {
      products,
      grandTotals,
      activeSessions,
      analytics,
      hourlyData: formattedDailyData,
      productPlanData,
      processStagesData,
      analyticsGrandTotals,
      lastUpdated: new Date().toISOString(),
      realtime: true
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logError('Realtime display error', error, {
      factoryId: req.query?.factoryId,
      userId: (req as any).user?.id
    });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch realtime display data',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});

// Export product process stages data
router.get('/product-process-stages/export/:format', authenticate, async (req, res) => {
  try {
    const { format } = req.params;
    const { 
      startDate, 
      endDate, 
      factoryId, 
      realtime = false 
    } = req.query;
    
    const userFactoryId = req.user?.factoryId;
    const targetFactoryId = factoryId || userFactoryId;
    
    if (!targetFactoryId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Factory ID is required',
        status: 400 
      });
    }

    // Build date range query
    let dateQuery: any = {};
    if (!realtime && startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      dateQuery = {
        $gte: start,
        $lte: end
      };
    } else if (!realtime && startDate) {
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      dateQuery = { $gte: start };
    } else if (!realtime && endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      dateQuery = { $lte: end };
    }

    // Build aggregation pipeline for work entries
    const pipeline: any[] = [
      {
        $match: {
          factoryId: new mongoose.Types.ObjectId(targetFactoryId as string),
          ...(Object.keys(dateQuery).length > 0 && { createdAt: dateQuery })
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
        $lookup: {
          from: 'processes',
          localField: 'processId',
          foreignField: '_id',
          as: 'process'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $unwind: '$process'
      },
      {
        $addFields: {
          stageOrder: {
            $let: {
              vars: {
                processInProduct: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$product.processes',
                        cond: { 
                          $eq: [
                            { $toString: '$$this.processId' }, 
                            { $toString: '$processId' }
                          ] 
                        }
                      }
                    },
                    0
                  ]
                }
              },
              in: '$$processInProduct.order'
            }
          }
        }
      },
      {
        $group: {
          _id: {
            productId: '$productId',
            processId: '$processId',
            productName: '$product.name',
            productCode: '$product.code',
            processName: '$process.name',
            stageOrder: '$stageOrder'
          },
          achievedQuantity: { $sum: '$achieved' },
          rejectedQuantity: { $sum: '$rejected' },
          targetQuantity: { $sum: '$targetQuantity' },
          workEntryCount: { $sum: 1 },
          latestEntry: { $max: '$createdAt' }
        }
      }
    ];

    // Get work entry data
    const workEntryData = await WorkEntry.aggregate(pipeline);

    // Get process stage data for available quantities
    const processStageQuery: any = {
      factoryId: new mongoose.Types.ObjectId(targetFactoryId as string)
    };
    
    if (Object.keys(dateQuery).length > 0) {
      processStageQuery.date = dateQuery;
    }

    const processStageData = await ProcessStage.find(processStageQuery)
      .populate('productId', 'name code')
      .populate('processId', 'name order');

    // Combine data and calculate cumulative available quantities
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const combinedData = await Promise.all(workEntryData.map(async (entry) => {
      const processStage = processStageData.find(ps => 
        ps.productId._id.toString() === entry._id.productId.toString() &&
        ps.processId._id.toString() === entry._id.processId.toString()
      );
      
      // Calculate cumulative available quantity (previous days + date of ProcessStage record)
      // Use ProcessStage record's date if available, otherwise use today for current/realtime views
      let availableQuantity = 0;
      if (processStage) {
        // Get product to find factoryId
        const product = await Product.findById(entry._id.productId);
        if (product && product.factoryId) {
          // Use ProcessStage record's date for cumulative calculation (normalized to start of day)
          const calculationDate = processStage.date ? new Date(processStage.date) : today;
          calculationDate.setHours(0, 0, 0, 0);
          
          availableQuantity = await quantityService.calculateCumulativeAvailableQuantity(
            product.factoryId,
            new mongoose.Types.ObjectId(entry._id.productId),
            new mongoose.Types.ObjectId(entry._id.processId),
            calculationDate
          );
        } else {
          // Fallback to today's value if product not found
          availableQuantity = processStage.availableQuantity || 0;
        }
      }
      
      return {
        productId: entry._id.productId,
        productName: entry._id.productName,
        productCode: entry._id.productCode,
        processId: entry._id.processId,
        processName: entry._id.processName,
        stageOrder: entry._id.stageOrder,
        achievedQuantity: entry.achievedQuantity,
        rejectedQuantity: entry.rejectedQuantity,
        availableQuantity,
        targetQuantity: entry.targetQuantity,
        workEntryCount: entry.workEntryCount,
        efficiency: entry.targetQuantity > 0 ? (entry.achievedQuantity / entry.targetQuantity) * 100 : 0,
        latestEntry: entry.latestEntry
      };
    }));

    // Group by product
    const productGroups = combinedData.reduce((acc: any, item) => {
      const productKey = item.productId;
      if (!acc[productKey]) {
        acc[productKey] = {
          productName: item.productName,
          productCode: item.productCode,
          processes: [],
          totals: { totalAchieved: 0, totalRejected: 0, totalAvailable: 0, totalTarget: 0 }
        };
      }
      
      acc[productKey].factoryProcesses.push(item);
      acc[productKey].totals.totalAchieved += item.achievedQuantity;
      acc[productKey].totals.totalRejected += item.rejectedQuantity;
      acc[productKey].totals.totalAvailable += item.availableQuantity;
      acc[productKey].totals.totalTarget += item.targetQuantity;
      
      return acc;
    }, {});

    if (format === 'excel') {
      // Generate Excel file
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Product Process Stages');
      
      // Add title
      worksheet.addRow(['Product Process Stages Report']);
      worksheet.addRow([`Generated on: ${new Date().toLocaleString()}`]);
      worksheet.addRow([`Date Range: ${startDate || 'All time'} to ${endDate || 'All time'}`]);
      worksheet.addRow([`Mode: ${realtime ? 'Real-time' : 'Historical'}`]);
      worksheet.addRow([]);
      
      // Add summary section
      const totalAchieved = combinedData.reduce((sum, item) => sum + item.achievedQuantity, 0);
      const totalRejected = combinedData.reduce((sum, item) => sum + item.rejectedQuantity, 0);
      const totalAvailable = combinedData.reduce((sum, item) => sum + item.availableQuantity, 0);
      const totalTarget = combinedData.reduce((sum, item) => sum + item.targetQuantity, 0);
      const overallEfficiency = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;
      
      worksheet.addRow(['SUMMARY']);
      worksheet.addRow(['Total Achieved', 'Total Rejected', 'Total Available', 'Total Target', 'Overall Efficiency']);
      worksheet.addRow([totalAchieved, totalRejected, totalAvailable, totalTarget, `${overallEfficiency.toFixed(2)}%`]);
      worksheet.addRow([]);
      
      // Add product details
      worksheet.addRow(['PRODUCT DETAILS']);
      worksheet.addRow(['Product', 'Process', 'Stage Order', 'Achieved', 'Rejected', 'Available', 'Target', 'Efficiency %', 'Work Entries']);
      
      Object.values(productGroups).forEach((product: any) => {
        product.factoryProcesses.forEach((process: any) => {
          worksheet.addRow([
            `${product.productCode} - ${product.productName}`,
            process.processName,
            process.stageOrder,
            process.achievedQuantity,
            process.rejectedQuantity,
            process.availableQuantity,
            process.targetQuantity,
            `${process.efficiency.toFixed(2)}%`,
            process.workEntryCount
          ]);
        });
      });
      
      // Style the worksheet
      worksheet.getRow(1).font = { bold: true, size: 16 };
      worksheet.getRow(6).font = { bold: true, size: 14 };
      worksheet.getRow(8).font = { bold: true };
      
      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="product-process-stages-${new Date().toISOString().split('T')[0]}.xlsx"`);
      
      // Write to response
      await workbook.xlsx.write(res);
      res.end();
      
    } else if (format === 'pdf') {
      // Generate PDF file
      const doc = new PDFDocument();
      
      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="product-process-stages-${new Date().toISOString().split('T')[0]}.pdf"`);
      
      // Pipe PDF to response
      doc.pipe(res);
      
      // Add content to PDF
      doc.fontSize(20).text('Product Process Stages Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.fontSize(12).text(`Date Range: ${startDate || 'All time'} to ${endDate || 'All time'}`, { align: 'center' });
      doc.fontSize(12).text(`Mode: ${realtime ? 'Real-time' : 'Historical'}`, { align: 'center' });
      doc.moveDown(2);
      
      // Add summary
      doc.fontSize(16).text('Summary', { underline: true });
      doc.moveDown();
      
      const totalAchieved = combinedData.reduce((sum, item) => sum + item.achievedQuantity, 0);
      const totalRejected = combinedData.reduce((sum, item) => sum + item.rejectedQuantity, 0);
      const totalAvailable = combinedData.reduce((sum, item) => sum + item.availableQuantity, 0);
      const totalTarget = combinedData.reduce((sum, item) => sum + item.targetQuantity, 0);
      const overallEfficiency = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;
      
      doc.fontSize(12).text(`Total Achieved: ${totalAchieved}`);
      doc.text(`Total Rejected: ${totalRejected}`);
      doc.text(`Total Available: ${totalAvailable}`);
      doc.text(`Total Target: ${totalTarget}`);
      doc.text(`Overall Efficiency: ${overallEfficiency.toFixed(2)}%`);
      doc.moveDown(2);
      
      // Add details table
      doc.fontSize(16).text('Product Details', { underline: true });
      doc.moveDown();
      
      let yPosition = doc.y;
      const tableTop = yPosition;
      const col1X = 50;
      const col2X = 150;
      const col3X = 250;
      const col4X = 350;
      const col5X = 450;
      
      // Table headers
      doc.fontSize(10).text('Product', col1X, yPosition);
      doc.text('Process', col2X, yPosition);
      doc.text('Achieved', col3X, yPosition);
      doc.text('Rejected', col4X, yPosition);
      doc.text('Available', col5X, yPosition);
      yPosition += 20;
      
      // Table content (limit to first 20 entries for PDF)
      combinedData.slice(0, 20).forEach(item => {
        doc.fontSize(8).text(`${item.productCode} - ${item.productName}`.substring(0, 20), col1X, yPosition);
        doc.text(item.processName.substring(0, 15), col2X, yPosition);
        doc.text(item.achievedQuantity.toString(), col3X, yPosition);
        doc.text(item.rejectedQuantity.toString(), col4X, yPosition);
        doc.text(item.availableQuantity.toString(), col5X, yPosition);
        yPosition += 15;
      });
      
      doc.end();
      
    } else {
      res.status(400).json({ success: false, error: 'Invalid format. Use "excel" or "pdf"' });
    }
    
  } catch (error) {
    logError('Error exporting product process stages', error);
    res.status(500).json({ success: false, error: 'Failed to export product process stages' });
  }
});

// Search-based production report endpoint
router.get('/search-production', authenticate, async (req, res) => {
  try {
    const { searchType, searchId, dateFilter, startDate, endDate } = req.query;
    
    if (!searchType || !searchId) {
      return res.status(400).json({ 
        success: false, 
        error: 'searchType and searchId are required' 
      });
    }

    const userFactoryId = req.user?.factoryId;
    if (!userFactoryId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Factory ID is required' 
      });
    }

    // Build date query based on filter
    let dateQuery: any = {};
    if (dateFilter && dateFilter !== 'all' && startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      dateQuery.createdAt = { $gte: start, $lte: end };
    }

    let searchName = '';
    let pipeline: any[] = [];

    // Build base match stage
    const matchStage: any = {
      factoryId: new mongoose.Types.ObjectId(userFactoryId),
      ...(Object.keys(dateQuery).length > 0 && dateQuery)
    };

    if (searchType === 'product') {
      // Verify product exists and get its name
      const product = await Product.findById(searchId);
      if (!product) {
        return res.status(404).json({ 
          success: false, 
          error: 'Product not found' 
        });
      }
      searchName = `${product.code} - ${product.name}`;
      matchStage.productId = new mongoose.Types.ObjectId(searchId as string);

      // Get all process stages for this product
      const productData = await Product.findById(searchId).populate('processes.processId');
      const processIds = (productData as any)?.processes?.map((p: any) => p.processId._id) || [];

      pipeline = [
        { $match: matchStage },
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
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
          $lookup: {
            from: 'machines',
            localField: 'machineId',
            foreignField: '_id',
            as: 'machine'
          }
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$process', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            stageOrder: {
              $let: {
                vars: {
                  processInProduct: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: { $ifNull: ['$product.processes', []] },
                          cond: { 
                            $eq: [
                              { $toString: '$$this.processId' }, 
                              { $toString: '$processId' }
                            ] 
                          }
                        }
                      },
                      0
                    ]
                  }
                },
                in: { $ifNull: ['$$processInProduct.order', null] }
              }
            },
            machineName: {
              $let: {
                vars: {
                  machineArray: { $ifNull: ['$machine', []] },
                  hasMachine: { $gt: [{ $size: { $ifNull: ['$machine', []] } }, 0] },
                  machineName: { $ifNull: [{ $arrayElemAt: ['$machine.name', 0] }, null] },
                  machineCode: { $ifNull: ['$machineCode', null] },
                  machineIdStr: { $ifNull: [{ $toString: '$machineId' }, null] }
                },
                in: {
                  $cond: [
                    {
                      $and: [
                        '$$hasMachine',
                        { $ne: ['$$machineName', null] },
                        { $ne: ['$$machineName', ''] }
                      ]
                    },
                    '$$machineName',
                    {
                      $cond: [
                        { $and: [{ $ne: ['$$machineCode', null] }, { $ne: ['$$machineCode', ''] }] },
                        '$$machineCode',
                        {
                          $cond: [
                            { $ne: ['$$machineIdStr', null] },
                            { $concat: ['M', '$$machineIdStr'] },
                            null
                          ]
                        }
                      ]
                    }
                  ]
                }
              }
            }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              processId: '$processId',
              processName: '$process.name'
            },
            totalAchieved: { $sum: '$achieved' },
            totalRejected: { $sum: '$rejected' },
            totalTarget: { $sum: '$targetQuantity' },
            machines: { 
              $addToSet: {
                $cond: [
                  { 
                    $and: [
                      { $ne: ['$machineName', null] },
                      { $ne: ['$machineName', ''] }
                    ]
                  },
                  '$machineName',
                  '$$REMOVE'
                ]
              }
            },
            stageOrder: { $first: '$stageOrder' }
          }
        },
        { $sort: { '_id.date': 1, 'stageOrder': 1 } }
      ];
    } else if (searchType === 'process') {
      // Verify process exists and get its name
      const process = await Process.findById(searchId);
      if (!process) {
        return res.status(404).json({ 
          success: false, 
          error: 'Process not found' 
        });
      }
      searchName = process.name;
      matchStage.processId = new mongoose.Types.ObjectId(searchId as string);

      pipeline = [
        { $match: matchStage },
        {
          $lookup: {
            from: 'machines',
            localField: 'machineId',
            foreignField: '_id',
            as: 'machine'
          }
        },
        {
          $addFields: {
            machineName: {
              $let: {
                vars: {
                  hasMachine: { $gt: [{ $size: { $ifNull: ['$machine', []] } }, 0] },
                  machineName: { $arrayElemAt: ['$machine.name', 0] },
                  machineCode: '$machineCode'
                },
                in: {
                  $cond: [
                    { $and: ['$$hasMachine', { $ne: ['$$machineName', null] }, { $ne: ['$$machineName', ''] }] },
                    '$$machineName',
                    {
                      $cond: [
                        { $and: [{ $ne: ['$$machineCode', null] }, { $ne: ['$$machineCode', ''] }] },
                        '$$machineCode',
                        {
                          $cond: [
                            { $ne: ['$machineId', null] },
                            { $concat: ['M', { $toString: '$machineId' }] },
                            null
                          ]
                        }
                      ]
                    }
                  ]
                }
              }
            }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
            },
            totalAchieved: { $sum: '$achieved' },
            totalRejected: { $sum: '$rejected' },
            totalTarget: { $sum: '$targetQuantity' },
            machines: { 
              $addToSet: {
                $cond: [
                  { $ne: ['$machineName', null] },
                  '$machineName',
                  null
                ]
              }
            }
          }
        },
        { $sort: { '_id.date': 1 } }
      ];
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid searchType. Must be "product" or "process"' 
      });
    }


    const results = await WorkEntry.aggregate(pipeline);


    // Format results
    const formattedData = results.map((item: any) => {
      // Filter out null/undefined/empty strings and get unique machine names
      const machinesUsed = [...new Set(item.machines || [])]
        .filter((m: any) => m !== null && m !== undefined && m !== '' && typeof m === 'string');


      const efficiency = item.totalTarget > 0 
        ? (item.totalAchieved / item.totalTarget) * 100 
        : 0;

      return {
        date: item._id.date,
        processStageId: searchType === 'product' ? item._id.processId?.toString() : undefined,
        processStageName: searchType === 'product' ? item._id.processName : undefined,
        stageOrder: searchType === 'product' ? item.stageOrder : undefined,
        totalAchieved: item.totalAchieved,
        totalRejected: item.totalRejected,
        machines: machinesUsed,
        machinesUsed: machinesUsed.length > 0 ? machinesUsed.join(', ') : 'N/A',
        efficiency: Math.round(efficiency * 100) / 100,
        target: item.totalTarget
      };
    });


    res.json({
      success: true,
      data: {
        searchType,
        searchName,
        data: formattedData
      }
    });
  } catch (error) {
    console.error('Error fetching search production report:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch production report' 
    });
  }
});

// Export search-based production report
router.get('/search-production/export/:format', authenticate, async (req, res) => {
  try {
    const { format } = req.params;
    const { searchType, searchId, dateFilter, startDate, endDate } = req.query;

    if (!['pdf', 'excel'].includes(format)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid format. Must be "pdf" or "excel"' 
      });
    }

    if (!searchType || !searchId) {
      return res.status(400).json({ 
        success: false, 
        error: 'searchType and searchId are required' 
      });
    }

    // Reuse the search logic from the search endpoint
    const userFactoryId = req.user?.factoryId;
    if (!userFactoryId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Factory ID is required' 
      });
    }

    // Build date query based on filter
    let dateQuery: any = {};
    if (dateFilter && dateFilter !== 'all' && startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      dateQuery.createdAt = { $gte: start, $lte: end };
    }

    let searchName = '';
    let pipeline: any[] = [];
    const matchStage: any = {
      factoryId: new mongoose.Types.ObjectId(userFactoryId),
      ...(Object.keys(dateQuery).length > 0 && dateQuery)
    };

    if (searchType === 'product') {
      const product = await Product.findById(searchId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }
      searchName = `${product.code} - ${product.name}`;
      matchStage.productId = new mongoose.Types.ObjectId(searchId as string);

      pipeline = [
        { $match: matchStage },
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $lookup: { from: 'processes', localField: 'processId', foreignField: '_id', as: 'process' } },
        { $lookup: { from: 'machines', localField: 'machineId', foreignField: '_id', as: 'machine' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$process', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            stageOrder: {
              $let: {
                vars: {
                  processInProduct: {
                    $arrayElemAt: [
                      { $filter: { input: { $ifNull: ['$product.processes', []] }, cond: { $eq: [{ $toString: '$$this.processId' }, { $toString: '$processId' }] } } },
                      0
                    ]
                  }
                },
                in: { $ifNull: ['$$processInProduct.order', null] }
              }
            },
            machineName: {
              $let: {
                vars: {
                  machineArray: { $ifNull: ['$machine', []] },
                  hasMachine: { $gt: [{ $size: { $ifNull: ['$machine', []] } }, 0] },
                  machineName: { $ifNull: [{ $arrayElemAt: ['$machine.name', 0] }, null] },
                  machineCode: { $ifNull: ['$machineCode', null] },
                  machineIdStr: { $ifNull: [{ $toString: '$machineId' }, null] }
                },
                in: {
                  $cond: [
                    {
                      $and: [
                        '$$hasMachine',
                        { $ne: ['$$machineName', null] },
                        { $ne: ['$$machineName', ''] }
                      ]
                    },
                    '$$machineName',
                    {
                      $cond: [
                        { $and: [{ $ne: ['$$machineCode', null] }, { $ne: ['$$machineCode', ''] }] },
                        '$$machineCode',
                        {
                          $cond: [
                            { $ne: ['$$machineIdStr', null] },
                            { $concat: ['M', '$$machineIdStr'] },
                            null
                          ]
                        }
                      ]
                    }
                  ]
                }
              }
            }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              processId: '$processId',
              processName: '$process.name'
            },
            totalAchieved: { $sum: '$achieved' },
            totalRejected: { $sum: '$rejected' },
            totalTarget: { $sum: '$targetQuantity' },
            machines: { 
              $addToSet: {
                $cond: [
                  { 
                    $and: [
                      { $ne: ['$machineName', null] },
                      { $ne: ['$machineName', ''] }
                    ]
                  },
                  '$machineName',
                  '$$REMOVE'
                ]
              }
            },
            stageOrder: { $first: '$stageOrder' }
          }
        },
        { $sort: { '_id.date': 1, 'stageOrder': 1 } }
      ];
    } else if (searchType === 'process') {
      const process = await Process.findById(searchId);
      if (!process) {
        return res.status(404).json({ success: false, error: 'Process not found' });
      }
      searchName = process.name;
      matchStage.processId = new mongoose.Types.ObjectId(searchId as string);

      pipeline = [
        { $match: matchStage },
        { $lookup: { from: 'machines', localField: 'machineId', foreignField: '_id', as: 'machine' } },
        {
          $addFields: {
            machineName: {
              $let: {
                vars: {
                  machineArray: { $ifNull: ['$machine', []] },
                  hasMachine: { $gt: [{ $size: { $ifNull: ['$machine', []] } }, 0] },
                  machineName: { $ifNull: [{ $arrayElemAt: ['$machine.name', 0] }, null] },
                  machineCode: { $ifNull: ['$machineCode', null] },
                  machineIdStr: { $ifNull: [{ $toString: '$machineId' }, null] }
                },
                in: {
                  $cond: [
                    {
                      $and: [
                        '$$hasMachine',
                        { $ne: ['$$machineName', null] },
                        { $ne: ['$$machineName', ''] }
                      ]
                    },
                    '$$machineName',
                    {
                      $cond: [
                        { $and: [{ $ne: ['$$machineCode', null] }, { $ne: ['$$machineCode', ''] }] },
                        '$$machineCode',
                        {
                          $cond: [
                            { $ne: ['$$machineIdStr', null] },
                            { $concat: ['M', '$$machineIdStr'] },
                            null
                          ]
                        }
                      ]
                    }
                  ]
                }
              }
            }
          }
        },
        {
          $group: {
            _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
            totalAchieved: { $sum: '$achieved' },
            totalRejected: { $sum: '$rejected' },
            totalTarget: { $sum: '$targetQuantity' },
            machines: { 
              $addToSet: {
                $cond: [
                  { $ne: ['$machineName', null] },
                  '$machineName',
                  null
                ]
              }
            }
          }
        },
        { $sort: { '_id.date': 1 } }
      ];
    }

    const results = await WorkEntry.aggregate(pipeline);
    const reportData = results.map((item: any) => {
      // Filter out null/undefined and get unique machine names
      const machinesUsed = [...new Set(item.machines)]
        .filter((m: any) => m !== null && m !== undefined && m !== '');

      const efficiency = item.totalTarget > 0 ? (item.totalAchieved / item.totalTarget) * 100 : 0;

      return {
        date: item._id.date,
        processStageId: searchType === 'product' ? item._id.processId?.toString() : undefined,
        processStageName: searchType === 'product' ? item._id.processName : undefined,
        stageOrder: searchType === 'product' ? item.stageOrder : undefined,
        totalAchieved: item.totalAchieved,
        totalRejected: item.totalRejected,
        machines: machinesUsed,
        machinesUsed: machinesUsed.length > 0 ? machinesUsed.join(', ') : 'N/A',
        efficiency: Math.round(efficiency * 100) / 100,
        target: item.totalTarget
      };
    });

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Production Report');

      // Add header
      worksheet.addRow([`Production Report: ${searchName}`]);
      worksheet.addRow([]);
      
      // Add filter info
      if (dateFilter && dateFilter !== 'all') {
        worksheet.addRow([`Date Range: ${startDate} to ${endDate}`]);
      } else {
        worksheet.addRow(['Date Range: All Dates']);
      }
      worksheet.addRow([]);

      // Add column headers
      const headers = ['Date'];
      if (searchType === 'product') {
        headers.push('Process Stage', 'Stage Order');
      }
      headers.push('Total Achieved', 'Total Rejected', 'Machines Used', 'Efficiency %', 'Target');
      worksheet.addRow(headers);

      // Style header row
      const headerRow = worksheet.getRow(worksheet.rowCount);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Add data rows
      reportData.forEach((row: any) => {
        const dataRow: any[] = [row.date];
        if (searchType === 'product') {
          dataRow.push(row.processStageName || 'N/A', row.stageOrder || '');
        }
        dataRow.push(
          row.totalAchieved,
          row.totalRejected,
          row.machinesUsed,
          row.efficiency,
          row.target
        );
        worksheet.addRow(dataRow);
      });

      // Add totals row
      worksheet.addRow([]);
      const totalsRow: any[] = ['TOTAL'];
      if (searchType === 'product') {
        totalsRow.push('', '');
      }
      const totalAchieved = reportData.reduce((sum: number, r: any) => sum + r.totalAchieved, 0);
      const totalRejected = reportData.reduce((sum: number, r: any) => sum + r.totalRejected, 0);
      const totalTarget = reportData.reduce((sum: number, r: any) => sum + r.target, 0);
      const avgEfficiency = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;
      
      totalsRow.push(
        totalAchieved,
        totalRejected,
        '',
        Math.round(avgEfficiency * 100) / 100,
        totalTarget
      );
      worksheet.addRow(totalsRow);
      worksheet.getRow(worksheet.rowCount).font = { bold: true };

      // Auto-fit columns
      worksheet.columns.forEach((column: any) => {
        if (column.header) {
          column.width = 15;
        }
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=production-report-${searchType}-${Date.now()}.xlsx`);
      
      await workbook.xlsx.write(res);
      res.end();
    } else if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=production-report-${searchType}-${Date.now()}.pdf`);
      
      doc.pipe(res);

      // Add header
      doc.fontSize(18).text(`Production Report: ${searchName}`, { align: 'center' });
      doc.moveDown();

      // Add filter info
      if (dateFilter && dateFilter !== 'all') {
        doc.fontSize(12).text(`Date Range: ${startDate} to ${endDate}`, { align: 'center' });
      } else {
        doc.fontSize(12).text('Date Range: All Dates', { align: 'center' });
      }
      doc.moveDown(2);

      // Table setup
      const tableTop = doc.y;
      const itemHeight = 20;
      const pageWidth = doc.page.width - 100;
      const colWidths = searchType === 'product' 
        ? [80, 120, 60, 80, 80, 120, 80, 80]
        : [80, 80, 80, 120, 80, 80];
      const headers = searchType === 'product'
        ? ['Date', 'Process Stage', 'Order', 'Achieved', 'Rejected', 'Machines', 'Efficiency %', 'Target']
        : ['Date', 'Achieved', 'Rejected', 'Machines', 'Efficiency %', 'Target'];

      // Draw header
      let xPos = 50;
      headers.forEach((header, idx) => {
        doc.fontSize(10).font('Helvetica-Bold').text(header, xPos, tableTop, { width: colWidths[idx] });
        xPos += colWidths[idx];
      });

      // Draw rows
      let yPos = tableTop + itemHeight;
      reportData.forEach((row: any) => {
        if (yPos > doc.page.height - 100) {
          doc.addPage();
          yPos = 50;
        }

        xPos = 50;
        const rowData = searchType === 'product'
          ? [row.date, row.processStageName || 'N/A', row.stageOrder?.toString() || '', 
             row.totalAchieved.toString(), row.totalRejected.toString(), row.machinesUsed, 
             row.efficiency.toFixed(2) + '%', row.target.toString()]
          : [row.date, row.totalAchieved.toString(), row.totalRejected.toString(), 
             row.machinesUsed, row.efficiency.toFixed(2) + '%', row.target.toString()];

        rowData.forEach((cell, idx) => {
          doc.fontSize(9).font('Helvetica').text(cell || '', xPos, yPos, { width: colWidths[idx] });
          xPos += colWidths[idx];
        });
        yPos += itemHeight;
      });

      // Add totals
      doc.moveDown();
      const totalAchieved = reportData.reduce((sum: number, r: any) => sum + r.totalAchieved, 0);
      const totalRejected = reportData.reduce((sum: number, r: any) => sum + r.totalRejected, 0);
      const totalTarget = reportData.reduce((sum: number, r: any) => sum + r.target, 0);
      const avgEfficiency = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;
      
      doc.fontSize(10).font('Helvetica-Bold')
        .text(`Totals: Achieved: ${totalAchieved}, Rejected: ${totalRejected}, Efficiency: ${Math.round(avgEfficiency * 100) / 100}%, Target: ${totalTarget}`, 50);

      doc.end();
    }
  } catch (error) {
    console.error('Error exporting search production report:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to export production report' 
    });
  }
});

export default router;
