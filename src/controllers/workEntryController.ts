import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import mongoose, { Types } from 'mongoose';
import WorkEntry from '@/models/WorkEntry';
import User from '@/models/User';
import Process from '@/models/Process';
import Product from '@/models/Product';
import ProcessStage from '@/models/ProcessStage';
import Attendance from '@/models/Attendance';
import Factory from '@/models/Factory';
import { ApiResponse } from '@/types';
import { AuthRequest } from '@/middleware/auth';
import quantityService from '@/services/quantityService';
import { wsServer } from '@/services/websocketServer';
import dashboardService from '@/services/dashboardService';
import logger from '@/utils/logger';

// Helper function to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in kilometers
  return distance * 1000; // Convert to meters
}

// Simple test endpoint
export const testEndpoint = (req: Request, res: Response): void => {
  res.json({ success: true, message: 'Work entry routes are working', timestamp: new Date().toISOString() });
};

// Debug endpoint to test work entry creation
export const debugStart = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    logger.debug('Work entry start request received', {
      body: req.body,
      userId: req.user?.id,
      userRole: req.user?.role,
      headers: req.headers
    });
    
    res.json({ 
      success: true, 
      message: 'Debug endpoint working',
      receivedData: req.body,
      user: req.user?.id,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Debug endpoint error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Debug endpoint to test validation
export const debugValidation = (req: Request, res: Response): void => {
  logger.debug('Debug validation request', { body: req.body });
  
  const { processId, productId, targetQuantity } = req.body;
  
  // Test each validation rule manually
  const errors: Array<{ field: string; message: string }> = [];
  
  if (!processId || !/^[0-9a-fA-F]{24}$/.test(processId)) {
    errors.push({ field: 'processId', message: 'Valid process ID is required (24-char hex)' });
  }
  
  if (!productId || !/^[0-9a-fA-F]{24}$/.test(productId)) {
    errors.push({ field: 'productId', message: 'Valid product ID is required (24-char hex)' });
  }
  
  if (!targetQuantity || !Number.isInteger(parseInt(targetQuantity)) || parseInt(targetQuantity) < 1) {
    errors.push({ field: 'targetQuantity', message: 'Target quantity must be a positive integer' });
  }
  
  res.json({
    success: errors.length === 0,
    errors: errors,
    receivedData: { processId, productId, targetQuantity }
  });
};

// Get current user's active work entry
export const getActiveWorkEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not authenticated',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    const userId = req.user.id;
    
    // Find active work entry for the current user
    const activeWorkEntry = await WorkEntry.findOne({
      employeeId: userId,
      validationStatus: 'pending',
      endTime: { $gt: new Date() } // End time is in the future
    }).populate('processId', 'name')
      .populate('productId', 'name')
      .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: activeWorkEntry ? 'Active work entry found' : 'No active work entry',
      status: 200,
      data: activeWorkEntry || null
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get active work entry error', { error: error instanceof Error ? error.message : String(error) });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve active work entry',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get all work entries
export const getAllWorkEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { employeeId, processId, status, date, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query: any = {};
    
    // Filter by factory if user is not super admin
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    // Filter by employee
    if (employeeId) {
      query.employeeId = employeeId;
    }

    // Filter by process
    if (processId) {
      query.processId = processId;
    }

    // Filter by status
    if (status) {
      query.validationStatus = status;
    }

    // Filter by date
    if (date) {
      const startDate = new Date(date as string);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      
      query.createdAt = {
        $gte: startDate,
        $lt: endDate
      };
    }

    const workEntries = await WorkEntry.find(query)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('validatedBy', 'profile.firstName profile.lastName')
      .populate('factoryId', 'name')
      .skip(skip)
      .limit(parseInt(limit as string))
      .sort({ createdAt: -1 });

    const total = await WorkEntry.countDocuments(query);

    const response: ApiResponse = {
      success: true,
      message: 'Work entries retrieved successfully',
      status: 200,
      data: {
        workEntries,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get work entries error', { error: error instanceof Error ? error.message : String(error) });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve work entries',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get work entry by ID
export const getWorkEntryById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workEntry = await WorkEntry.findById(req.params.id)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('validatedBy', 'profile.firstName profile.lastName')
      .populate('factoryId', 'name');

    if (!workEntry) {
      const response: ApiResponse = {
        success: false,
        error: 'Work entry not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check if user has access to this work entry
    if (req.user && req.user.role !== 'super_admin' && workEntry.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: 'Work entry retrieved successfully',
      status: 200,
      data: workEntry
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get work entry error', { error: error instanceof Error ? error.message : String(error) });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve work entry',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Debug endpoint to check user data
export const debugUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized', status: 401 });
      return;
    }
    const user = await User.findById(req.user.id).populate('assignedProcesses');
    res.json({
      success: true,
      data: {
        user: {
          id: user?._id,
          role: user?.role,
          factoryId: user?.factoryId,
          isActive: user?.isActive
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Debug failed',
      status: 500
    });
  }
};

// Start work (create work entry)
export const startWork = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Unauthorized', status: 401 });
    return;
  }
  try {
    logger.debug('Start work request received', {
      body: req.body,
      userId: req.user?.id,
      userRole: req.user?.role
    });
    
    logger.debug('Detailed request body analysis', {
      processId: req.body.processId,
      productId: req.body.productId,
      machineId: req.body.machineId,
      machineCode: req.body.machineCode,
      shiftType: req.body.shiftType,
      targetQuantity: req.body.targetQuantity,
      targetQuantityType: typeof req.body.targetQuantity
    });

    // Manual role check (temporary fix)
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    if (!['employee', 'supervisor'].includes(req.user.role)) {
      logger.debug('Role check failed', {
        userRole: req.user.role,
        allowedRoles: ['employee', 'supervisor']
      });
      const response: ApiResponse = {
        success: false,
        error: 'Insufficient permissions. Employee or supervisor role required.',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Manual validation (temporary fix)
    const { processId, productId, targetQuantity, location } = req.body;
    
    logger.debug('Field validation check', {
      processId,
      productId,
      targetQuantity,
      processIdType: typeof processId,
      productIdType: typeof productId,
      targetQuantityType: typeof targetQuantity
    });

    // Basic validation
    if (!processId || !productId || !targetQuantity) {
      const response: ApiResponse = {
        success: false,
        error: 'Missing required fields: processId, productId, targetQuantity',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Convert targetQuantity to number if it's a string
    const numericTargetQuantity = typeof targetQuantity === 'string' ? parseInt(targetQuantity, 10) : targetQuantity;
    
    if (typeof numericTargetQuantity !== 'number' || isNaN(numericTargetQuantity) || numericTargetQuantity < 1) {
      const response: ApiResponse = {
        success: false,
        error: 'Target quantity must be a positive number',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    const employeeId = req.user.id;

    // Verify process exists and employee is assigned to it
    const process = await Process.findById(processId);
    if (!process) {
      const response: ApiResponse = {
        success: false,
        error: 'Process not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const employee = await User.findById(employeeId);
    if (!employee) {
      const response: ApiResponse = {
        success: false,
        error: 'Employee not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }
    
    logger.debug('Employee and process validation', {
      employeeId,
      employeeRole: employee?.role,
      employeeFactoryId: employee?.factoryId,
      processFactoryId: process.factoryId,
      userRole: req.user?.role,
    });
    
    // Employees can work on any process in their factory
    // No process assignment check needed

    // Check if process belongs to the employee's factory
    if (process.factoryId?.toString() !== employee.factoryId?.toString()) {
      logger.debug('Factory mismatch', {
        processFactoryId: process.factoryId,
        employeeFactoryId: employee.factoryId,
        processFactoryIdString: process.factoryId?.toString(),
        employeeFactoryIdString: employee.factoryId?.toString()
      });
      const response: ApiResponse = {
        success: false,
        error: 'Process does not belong to your factory',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Verify product exists and process is assigned to it
    const product = await Product.findById(productId);
    if (!product) {
      const response: ApiResponse = {
        success: false,
        error: 'Product not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check if product belongs to the employee's factory
    if (product.factoryId?.toString() !== employee.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Product does not belong to your factory',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Check if the selected process is assigned to this product
    const isProcessAssigned = product.processes?.some(p => p.processId.toString() === processId);
    if (!isProcessAssigned) {
      const response: ApiResponse = {
        success: false,
        error: 'Selected process is not assigned to this product',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Check if work can be started on this process (quantity validation)
    const workValidation = await quantityService.canStartWork(processId, productId);
    if (!workValidation.canStart) {
      const response: ApiResponse = {
        success: false,
        error: workValidation.reason || 'Cannot start work on this process',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Simplified location handling - just use provided location or default
    const currentLocation = req.body.location || { latitude: 0, longitude: 0 };
    
    // Get factory info (without geofencing validation)
    const factory = await Factory.findById(employee.factoryId);
    if (!factory) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    logger.debug('Starting work for employee', {
      employeeId: employee._id,
      processId: processId,
      factoryId: employee.factoryId,
      location: currentLocation
    });

    // Get or create current attendance record for the employee
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let currentAttendance = await Attendance.findOne({
      employeeId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    });

    if (!currentAttendance) {
      // Auto-create attendance record for the employee (simplified)
      currentAttendance = new Attendance({
        employeeId,
        factoryId: employee.factoryId,
        processId: processId,
        checkIn: {
          time: new Date(),
          location: currentLocation,
          isWithinGeofence: true // Always true for now
        },
        shiftType: req.body.shiftType || 'morning', // Use selected shift or default
        target: numericTargetQuantity,
        status: 'present'
      });
      
      await currentAttendance.save();
      logger.info('Attendance record created for employee', { employeeId });
    }

    const startTime = new Date();
    const endTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // Set to 24 hours from now
    
    logger.debug('Creating work entry', {
      startTime,
      endTime,
      isEndTimeFuture: endTime > new Date()
    });
    
    // Convert string IDs to ObjectIds if needed
    
    const workEntry = new WorkEntry({
      employeeId,
      processId,
      productId,
      machineId: req.body.machineId ? (typeof req.body.machineId === 'string' ? new mongoose.Types.ObjectId(req.body.machineId) : req.body.machineId) : null,
      machineCode: req.body.machineCode || null,
      shiftType: req.body.shiftType || null,
      targetQuantity: numericTargetQuantity,
      achieved: 0, // Start with 0 achieved
      rejected: 0, // Start with 0 rejected
      startTime,
      endTime, // Set to 24 hours from now (will be updated when completed)
      photo: '', // Will be updated when work is completed
      factoryId: employee.factoryId,
      attendanceId: currentAttendance._id,
      validationStatus: 'pending'
    });

    await workEntry.save();
    
    // Invalidate dashboard cache
    if (workEntry.factoryId) {
      dashboardService.invalidateCache(workEntry.factoryId);
    }

    const populatedWorkEntry = await WorkEntry.findById(workEntry._id)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: 'Work entry created successfully',
      status: 201,
      data: populatedWorkEntry
    };

    // Broadcast production data update via WebSocket
    if (req.user?.factoryId) {
      wsServer.broadcastProductionUpdate(req.user.factoryId.toString());
    }

    res.status(201).json(response);
  } catch (error: any) {
    logger.error('Create work entry error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Check if it's a validation error
    if (error.name === 'ValidationError') {
      logger.error('Validation errors', { errors: error.errors });
      const response: ApiResponse = {
        success: false,
        error: 'Validation failed',
        status: 400,
        data: { errors: error.errors }
      };
      res.status(400).json(response);
      return;
    }
    
    // Check if it's a cast error
    if (error.name === 'CastError') {
      logger.error('Cast error details', {
        path: error.path,
        value: error.value,
        kind: error.kind
      });
      const response: ApiResponse = {
        success: false,
        error: `Invalid ${error.path}: ${error.value}`,
        status: 400
      };
      res.status(400).json(response);
      return;
    }
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to create work entry',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Direct work entry for first process stage (bypasses quantity validation)
export const directWorkEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    logger.debug('Direct work entry request received', {
      body: req.body,
      userId: req.user?.id,
      userRole: req.user?.role
    });
    
    logger.debug('Step 1: Request received successfully');

    // Manual role check
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    if (!['employee', 'supervisor'].includes(req.user.role)) {
      const response: ApiResponse = {
        success: false,
        error: 'Insufficient permissions. Employee or supervisor role required.',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Manual validation
    const { processId, productId, achieved, rejected, machineId, shiftType, photo, location } = req.body;
    
    logger.debug('Step 2: Extracted request data');
    logger.debug('Direct work entry validation', {
      processId, productId, achieved, rejected, machineId, shiftType
    });

    // Basic validation
    if (!processId || !productId || achieved === undefined || rejected === undefined) {
      const response: ApiResponse = {
        success: false,
        error: 'Missing required fields: processId, productId, achieved, rejected',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    const numericAchieved = typeof achieved === 'string' ? parseInt(achieved, 10) : achieved;
    const numericRejected = typeof rejected === 'string' ? parseInt(rejected, 10) : rejected;
    
    if (typeof numericAchieved !== 'number' || isNaN(numericAchieved) || numericAchieved < 0 ||
        typeof numericRejected !== 'number' || isNaN(numericRejected) || numericRejected < 0) {
      const response: ApiResponse = {
        success: false,
        error: 'Achieved and rejected quantities must be non-negative numbers',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    const employeeId = req.user._id || req.user.id;
    logger.debug('Step 3: Starting database queries', {
      employeeId: employeeId?.toString(),
      userId: req.user.id,
      _id: req.user._id?.toString(),
      userRole: req.user.role
    });

    // Verify process exists
    const process = await Process.findById(processId);
    logger.debug('Step 4: Process query completed');
    if (!process) {
      const response: ApiResponse = {
        success: false,
        error: 'Process not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Verify product exists and check if process is first stage
    const product = await Product.findById(productId);
    if (!product) {
      const response: ApiResponse = {
        success: false,
        error: 'Product not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check if the selected process is the first stage (order === 1)
    const processAssignment = product.processes?.find(p => p.processId.toString() === processId);
    if (!processAssignment || processAssignment.order !== 1) {
      const response: ApiResponse = {
        success: false,
        error: 'This endpoint is only for first process stage. Use /start for other stages.',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Get employee info - use _id (ObjectId) to ensure proper lookup
    // Since req.user is already loaded from authentication, we can use it directly
    // But we fetch again to ensure we have the latest data with all relationships
    // Don't populate factoryId - we just need the ObjectId for comparison
    const employee = await User.findById(req.user._id);
    if (!employee) {
      logger.error('Employee lookup failed', {
        employeeId: employeeId?.toString(),
        userId: req.user.id,
        _id: req.user._id?.toString(),
        userExists: !!req.user,
        userRole: req.user?.role
      });
      const response: ApiResponse = {
        success: false,
        error: 'Employee not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }
    
    // Extract factory ID - should be ObjectId since we didn't populate it
    const employeeFactoryId = employee.factoryId?.toString();
    
    // Validate employee has a factory ID (required for employees)
    if (!employeeFactoryId) {
      logger.error('Employee missing factoryId', {
        employeeId: employee._id.toString(),
        role: employee.role
      });
      const response: ApiResponse = {
        success: false,
        error: 'Employee factory assignment not found',
        status: 400
      };
      res.status(400).json(response);
      return;
    }
    
    logger.debug('Employee found successfully', {
      employeeId: employee._id.toString(),
      factoryId: employeeFactoryId,
      role: employee.role,
      processFactoryId: process.factoryId?.toString(),
      productFactoryId: product.factoryId?.toString()
    });

    // Use employee._id for consistency after verification
    const verifiedEmployeeId = employee._id;

    // Check if process belongs to the employee's factory
    const processFactoryIdStr = process.factoryId?.toString();
    if (!processFactoryIdStr || processFactoryIdStr !== employeeFactoryId) {
      logger.error('Factory ID mismatch - Process', {
        processFactoryId: processFactoryIdStr,
        employeeFactoryId: employeeFactoryId,
        processId: process._id.toString(),
        processName: process.name
      });
      const response: ApiResponse = {
        success: false,
        error: 'Process does not belong to your factory',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Check if product belongs to the employee's factory
    const productFactoryIdStr = product.factoryId?.toString();
    if (!productFactoryIdStr || productFactoryIdStr !== employeeFactoryId) {
      logger.error('Factory ID mismatch - Product', {
        productFactoryId: productFactoryIdStr,
        employeeFactoryId: employeeFactoryId,
        productId: product._id.toString(),
        productName: product.name
      });
      const response: ApiResponse = {
        success: false,
        error: 'Product does not belong to your factory',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Get or create current attendance record
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let currentAttendance = await Attendance.findOne({
      employeeId: verifiedEmployeeId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    });

    if (!currentAttendance) {
      // Auto-create attendance record with required fields
      currentAttendance = new Attendance({
        employeeId: verifiedEmployeeId,
        factoryId: employee.factoryId,
        processId: processId,
        shiftType: shiftType || 'General',
        target: (product.dailyTarget || 0),
        checkIn: {
          time: new Date(),
          location: location || { latitude: 0, longitude: 0 },
          isWithinGeofence: true
        },
        status: 'present',
        date: today
      });
      await currentAttendance.save();
    } else {
      // Ensure required fields exist on existing attendance
      let needsUpdate = false;
      if (!currentAttendance.shiftType && shiftType) {
        (currentAttendance as any).shiftType = shiftType;
        needsUpdate = true;
      }
      if (typeof (currentAttendance as any).target !== 'number') {
        (currentAttendance as any).target = (product.dailyTarget || 0);
        needsUpdate = true;
      }
      if (needsUpdate) {
        await currentAttendance.save();
      }
    }

    // Create work entry directly
    const workEntry = new WorkEntry({
      employeeId: verifiedEmployeeId,
      factoryId: employee.factoryId,
      attendanceId: currentAttendance._id,
      processId,
      productId,
      machineId: machineId || null,
      shiftType: shiftType || 'General',
      achieved: numericAchieved,
      rejected: numericRejected,
      photo: photo || null,
      targetQuantity: numericAchieved + numericRejected,
      startTime: new Date(),
      endTime: new Date(),
      validationStatus: 'approved', // Auto-approve first stage entries
      validatedBy: verifiedEmployeeId,
      validatedAt: new Date(),
      location: location || { latitude: 0, longitude: 0 }
    });

    await workEntry.save();
    
    // Invalidate dashboard cache
    if (workEntry.factoryId) {
      dashboardService.invalidateCache(workEntry.factoryId);
    }

    // Use quantityService.deductQuantity to properly handle quantity flow between stages
    logger.debug('Processing quantity deduction for direct work entry', {
      workEntryId: workEntry._id,
      processId: workEntry.processId.toString(),
      productId: workEntry.productId?.toString(),
      achieved: numericAchieved,
      rejected: numericRejected
    });
    
    const quantityResult = await quantityService.deductQuantity(
      workEntry.processId.toString(),
      numericAchieved,
      numericRejected,
      workEntry.productId?.toString()
    );

    logger.debug('Quantity deduction result (direct)', quantityResult);

    if (!quantityResult.success) {
      logger.warn('Quantity deduction failed for direct work entry', quantityResult);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to process quantity deduction',
        status: 400
      };
      res.status(400).json(response);
      return;
    }


    logger.info('Direct work entry created successfully', {
      workEntryId: workEntry._id,
      employeeId: workEntry.employeeId,
      processId: workEntry.processId,
      achieved: workEntry.achieved,
      rejected: workEntry.rejected
    });

    const response: ApiResponse = {
      success: true,
      message: 'Work entry created successfully',
      status: 201,
      data: workEntry
    };

    // Broadcast production data update via WebSocket
    if (req.user?.factoryId) {
      wsServer.broadcastProductionUpdate(req.user.factoryId.toString());
    }
    
    res.status(201).json(response);
    
  } catch (error: any) {
    logger.error('Direct work entry error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    const response: ApiResponse = {
      success: false,
      error: `Failed to create work entry: ${error.message}`,
      status: 500
    };
    res.status(500).json(response);
  }
};

// Complete work (update work entry with final data)
export const completeWork = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: ApiResponse = {
        success: false,
        error: 'Validation failed',
        status: 400,
        data: { errors: errors.array() }
      };
      res.status(400).json(response);
      return;
    }

    const workEntry = await WorkEntry.findById(req.params.id);
    if (!workEntry) {
      const response: ApiResponse = {
        success: false,
        error: 'Work entry not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check if user owns this work entry
    if (!req.user || workEntry.employeeId?.toString() !== req.user.id) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Check if work entry is already validated
    if (workEntry.validationStatus !== 'pending') {
      const response: ApiResponse = {
        success: false,
        error: 'Cannot update validated work entry',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    const { achieved, rejected, photo, reasonForLessProduction } = req.body;

    // Deduct quantity from process and handle waterfall logic
    logger.debug('Processing quantity deduction for work entry', {
      workEntryId: workEntry._id,
      processId: workEntry.processId.toString(),
      productId: workEntry.productId?.toString(),
      achieved,
      rejected,
      workEntryData: {
        employeeId: workEntry.employeeId,
        factoryId: workEntry.factoryId,
        processId: workEntry.processId,
        productId: workEntry.productId
      }
    });
    
    let quantityResult;
    try {
      quantityResult = await quantityService.deductQuantity(
        workEntry.processId.toString(),
        achieved,
        rejected,
        workEntry.productId?.toString()
      );
    } catch (error: any) {
      logger.error('Quantity service error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        workEntryId: workEntry._id,
        processId: workEntry.processId.toString(),
        productId: workEntry.productId?.toString(),
        achieved,
        rejected
      });
      const response: ApiResponse = {
        success: false,
        error: 'Failed to process quantity deduction',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    logger.debug('Quantity deduction result', quantityResult);

    if (!quantityResult.success) {
      logger.warn('Quantity deduction failed', {
        result: quantityResult,
        workEntryId: workEntry._id,
        processId: workEntry.processId.toString(),
        productId: workEntry.productId?.toString(),
        achieved,
        rejected
      });
      const response: ApiResponse = {
        success: false,
        error: 'Failed to process quantity deduction',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // ProcessStage updated atomically inside quantityService.deductQuantity transaction
    // Transfer to next stage is already handled in deductQuantity method


    // Update work entry with completion data
    const updatedWorkEntry = await WorkEntry.findByIdAndUpdate(
      req.params.id,
      {
        achieved,
        rejected,
        photo,
        reasonForLessProduction,
        endTime: new Date() // Set end time when work is completed
        // Keep validationStatus as 'pending' until validated by supervisor/admin
      },
      { new: true, runValidators: true }
    )
    .populate('employeeId', 'profile.firstName profile.lastName email')
    .populate('processId', 'name')
    .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: 'Work completed successfully',
      status: 200,
      data: updatedWorkEntry
    };

    // Broadcast production data update via WebSocket
    if (req.user?.factoryId) {
      wsServer.broadcastProductionUpdate(req.user.factoryId.toString());
    }

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Update work entry error', { error: error instanceof Error ? error.message : String(error) });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update work entry',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Delete work entry
export const deleteWorkEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workEntry = await WorkEntry.findById(req.params.id);
    if (!workEntry) {
      const response: ApiResponse = {
        success: false,
        error: 'Work entry not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check if user owns this work entry
    if (!req.user || workEntry.employeeId?.toString() !== req.user.id) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Check if work entry is already validated
    if (workEntry.validationStatus !== 'pending') {
      const response: ApiResponse = {
        success: false,
        error: 'Cannot delete validated work entry',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    await WorkEntry.findByIdAndDelete(req.params.id);

    const response: ApiResponse = {
      success: true,
      message: 'Work entry deleted successfully',
      status: 200
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Delete work entry error', { error: error instanceof Error ? error.message : String(error) });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete work entry',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get work entries by employee
export const getWorkEntriesByEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Unauthorized', status: 401 });
    return;
  }
  try {
    const { employeeId } = req.params;
    const { startDate, endDate, status, page = 1, limit = 10, today = 'true' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query: any = { employeeId };
    
    // Filter by factory if user is not super admin
    if (req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    // Filter by date range - default to today if no dates provided and today=true
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    } else if (today === 'true') {
      // Default to today's data
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      query.createdAt = {
        $gte: today,
        $lt: tomorrow
      };
    } else if (today === 'false') {
      // Don't apply any date filter - return all entries
      // This allows the frontend to get all entries when needed
    }

    // Filter by status
    if (status) {
      query.validationStatus = status;
    }

    const workEntries = await WorkEntry.find(query)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('validatedBy', 'profile.firstName profile.lastName')
      .populate('factoryId', 'name')
      .skip(skip)
      .limit(parseInt(limit as string))
      .sort({ createdAt: -1 });

    const total = await WorkEntry.countDocuments(query);

    const response: ApiResponse = {
      success: true,
      message: 'Employee work entries retrieved successfully',
      status: 200,
      data: {
        workEntries,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get employee work entries error', { error: error instanceof Error ? error.message : String(error) });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve employee work entries',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get work entries by employee for history (yesterday and earlier)
export const getWorkEntryHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Unauthorized', status: 401 });
    return;
  }
  try {
    const { employeeId } = req.params;
    const { startDate, endDate, status, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query: any = { employeeId };
    
    // Filter by factory if user is not super admin
    if (req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    // Filter by date range - default to yesterday and earlier
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    } else {
      // Default to yesterday and earlier
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      query.createdAt = {
        $lt: today
      };
    }

    // Filter by status
    if (status) {
      query.validationStatus = status;
    }

    const workEntries = await WorkEntry.find(query)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('validatedBy', 'profile.firstName profile.lastName')
      .populate('factoryId', 'name')
      .skip(skip)
      .limit(parseInt(limit as string))
      .sort({ createdAt: -1 });

    const total = await WorkEntry.countDocuments(query);

    const response: ApiResponse = {
      success: true,
      message: 'Employee work history retrieved successfully',
      status: 200,
      data: {
        workEntries,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get employee work history error', { error: error instanceof Error ? error.message : String(error) });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve employee work history',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get pending validations
export const getPendingValidations = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Unauthorized', status: 401 });
    return;
  }
  try {
    let query: any = { validationStatus: 'pending' };
    
    // Filter by factory if user is not super admin
    if (req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    const pendingWorkEntries = await WorkEntry.find(query)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('factoryId', 'name')
      .sort({ createdAt: -1 });

    const response: ApiResponse = {
      success: true,
      message: 'Pending work entries retrieved successfully',
      status: 200,
      data: pendingWorkEntries
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get pending work entries error', { error: error instanceof Error ? error.message : String(error) });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve pending work entries',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Validate work entry
export const validateWorkEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Unauthorized', status: 401 });
    return;
  }
  try {
    const { status, validationNotes } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      const response: ApiResponse = {
        success: false,
        error: 'Valid status (approved or rejected) is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    const workEntry = await WorkEntry.findById(req.params.id);
    if (!workEntry) {
      const response: ApiResponse = {
        success: false,
        error: 'Work entry not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check if user has access to validate this work entry
    if (!req.user || (req.user.role === 'factory_admin' && workEntry.factoryId?.toString() !== req.user.factoryId?.toString())) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Check if work entry is already validated
    if (workEntry.validationStatus !== 'pending') {
      const response: ApiResponse = {
        success: false,
        error: 'Work entry is already validated',
        status: 409
      };
      res.status(409).json(response);
      return;
    }

    // Update work entry with validation
    workEntry.validationStatus = status;
    workEntry.validationNotes = validationNotes;
    if (req.user) {
      workEntry.validatedBy = req.user.id;
    }
    workEntry.validatedAt = new Date();

    await workEntry.save();
    
    // Invalidate dashboard cache
    if (workEntry.factoryId) {
      dashboardService.invalidateCache(workEntry.factoryId);
    }


    const populatedWorkEntry = await WorkEntry.findById(workEntry._id)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('validatedBy', 'profile.firstName profile.lastName')
      .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: `Work entry ${status} successfully`,
      status: 200,
      data: populatedWorkEntry
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Validate work entry error', { error: error instanceof Error ? error.message : String(error) });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to validate work entry',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Update production data
export const updateProduction = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Unauthorized', status: 401 });
    return;
  }
  try {
    const { achieved, rejected } = req.body;

    if (achieved === undefined || rejected === undefined) {
      const response: ApiResponse = {
        success: false,
        error: 'Achieved and rejected values are required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    const workEntry = await WorkEntry.findById(req.params.id);
    if (!workEntry) {
      const response: ApiResponse = {
        success: false,
        error: 'Work entry not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check if user has access to update this work entry
    if (req.user.role === 'factory_admin' && workEntry.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Update production data
    workEntry.achieved = achieved;
    workEntry.rejected = rejected;

    await workEntry.save();
    
    // Invalidate dashboard cache
    if (workEntry.factoryId) {
      dashboardService.invalidateCache(workEntry.factoryId);
    }


    const populatedWorkEntry = await WorkEntry.findById(workEntry._id)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('validatedBy', 'profile.firstName profile.lastName')
      .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: 'Production data updated successfully',
      status: 200,
      data: populatedWorkEntry
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Update production error', { error: error instanceof Error ? error.message : String(error) });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update production data',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get pending validations for supervisor
export const getPendingValidationsList = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    logger.debug('Pending validations request', {
      userId: req.user?.id,
      userRole: req.user?.role,
      userFactoryId: req.user?.factoryId
    });
    
    let query: any = { validationStatus: 'pending' };
    
    // Filter by factory if user is not super admin
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    logger.debug('Pending validations query', query);

    // Use a try-catch for the database query specifically
    let basicEntries: any[] = [];
    try {
      basicEntries = await WorkEntry.find(query).lean() as any[];
      logger.debug('Basic entries found', { count: basicEntries.length });
    } catch (dbError) {
      logger.error('Database query error', { error: dbError instanceof Error ? dbError.message : String(dbError) });
      // Return empty array instead of error
      basicEntries = [];
    }

    const response: ApiResponse = {
      success: true,
      message: 'Pending validations retrieved successfully',
      status: 200,
      data: basicEntries
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get pending validations error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Return empty array instead of error
    const response: ApiResponse = {
      success: true,
      message: 'No pending validations found',
      status: 200,
      data: []
    };
    res.status(200).json(response);
  }
};

// Get product report with process-wise breakdown
export const getProductReport = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Unauthorized', status: 401 });
    return;
  }
  try {
    const { productId } = req.params;
    const { startDate, endDate, period } = req.query;

    // Validate product exists and user has access
    const product = await Product.findById(productId);
    
    if (!product) {
      const response: ApiResponse = {
        success: false,
        error: 'Product not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check access permissions
    if (req.user.role === 'factory_admin' && product.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Calculate date range based on period
    let dateFilter: any = {};
    const now = new Date();
    
    if (period === 'weekly') {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      dateFilter = { $gte: weekStart, $lte: weekEnd };
    } else if (period === 'monthly') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      dateFilter = { $gte: monthStart, $lte: monthEnd };
    } else if (period === 'yearly') {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      dateFilter = { $gte: yearStart, $lte: yearEnd };
    } else if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      dateFilter = { $gte: start, $lte: end };
    } else {
      // Default to last 7 days
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);
      dateFilter = { $gte: weekStart, $lte: now };
    }

    // Get processes assigned to this product, ordered by product's process order
    const productProcesses = product.processes || [];
    const processIds = productProcesses.map(p => p.processId);
    const processes = await Process.find({ _id: { $in: processIds } })
      .select('_id name');

    // Get work entries for this product within date range
    const workEntries = await WorkEntry.find({
      productId: new mongoose.Types.ObjectId(productId),
      createdAt: dateFilter
    })
    .populate('employeeId', 'profile.firstName profile.lastName')
    .populate('processId', 'name order')
    .sort({ createdAt: 1 });

    // Group by date and process
    const groupedData: any = {};
    
    workEntries.forEach(entry => {
      const date = entry.createdAt.toISOString().split('T')[0];
      const processId = entry.processId._id.toString();
      
      // Find the product's process order for this process
      const productProcess = productProcesses.find(p => p.processId.toString() === processId);
      const processOrder = productProcess ? productProcess.order : 1;
      
      if (!groupedData[date]) {
        groupedData[date] = {};
      }
      
      if (!groupedData[date][processId]) {
        groupedData[date][processId] = {
          processName: (entry.processId as any)?.name || 'Unknown Process',
          processOrder: processOrder,
          achieved: 0,
          rejected: 0,
          entries: []
        };
      }
      
      groupedData[date][processId].achieved += entry.achieved;
      groupedData[date][processId].rejected += entry.rejected;
      groupedData[date][processId].entries.push({
        employeeName: `${(entry.employeeId as any)?.profile?.firstName || 'Unknown'} ${(entry.employeeId as any)?.profile?.lastName || 'User'}`,
        achieved: entry.achieved,
        rejected: entry.rejected,
        startTime: entry.startTime,
        endTime: entry.endTime
      });
    });

    // Format response data
    const reportData = Object.keys(groupedData).map(date => {
      const dayData: any = { date };
      
      // Add columns for each process in product's order
      productProcesses.forEach(productProcess => {
        const process = processes.find(p => p._id.toString() === productProcess.processId.toString());
        if (process) {
          const processData = groupedData[date][process._id.toString()];
          if (processData) {
            dayData[`process_${productProcess.order}`] = {
              name: processData.processName,
              achieved: processData.achieved,
              rejected: processData.rejected,
              entries: processData.entries
            };
          } else {
            dayData[`process_${productProcess.order}`] = {
              name: process.name,
              achieved: 0,
              rejected: 0,
              entries: []
            };
          }
        }
      });
      
      return dayData;
    });

    const response: ApiResponse = {
      success: true,
      message: 'Product report retrieved successfully',
      status: 200,
      data: {
        product: {
          id: product._id,
          name: product.name,
          code: product.code,
          dailyTarget: product.dailyTarget
        },
        processes: productProcesses.map(pp => {
          const process = processes.find(p => p._id.toString() === pp.processId.toString());
          return {
            id: pp.processId,
            name: process?.name || 'Unknown Process',
            order: pp.order
          };
        }),
        reportData,
        dateRange: {
          start: dateFilter.$gte,
          end: dateFilter.$lte
        }
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get product report error', { error: error instanceof Error ? error.message : String(error) });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve product report',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get employee daily summary
export const getEmployeeDailySummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const { date } = req.query;
    
    // Check if user can access this employee's data
    if (req.user?.role !== 'super_admin' && req.user?.id !== employeeId) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied. You can only view your own data.',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Calculate date range for today or specified date
    let targetDate: Date;
    if (date) {
      targetDate = new Date(date as string);
    } else {
      targetDate = new Date();
    }
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get today's work entries for the employee
    const workEntries = await WorkEntry.find({
      employeeId: new Types.ObjectId(employeeId),
      createdAt: { $gte: targetDate, $lt: nextDay }
    })
    .populate('processId', 'name')
    .populate('productId', 'name')
    .populate('machineId', 'name')
    .sort({ createdAt: -1 });

    // Calculate totals
    const totalAchieved = workEntries.reduce((sum, entry) => sum + (entry.achieved || 0), 0);
    const totalRejected = workEntries.reduce((sum, entry) => sum + (entry.rejected || 0), 0);

    // Group by process and product
    const processGroups = new Map<string, any>();
    
    workEntries.forEach(entry => {
      const key = `${entry.processId._id}-${entry.productId._id}`;
      if (!processGroups.has(key)) {
        processGroups.set(key, {
          processId: entry.processId._id,
          processName: (entry.processId as any)?.name || 'Unknown Process',
          productId: entry.productId._id,
          productName: (entry.productId as any)?.name || 'Unknown Product',
          achieved: 0,
          rejected: 0,
          entries: 0,
          machines: new Set()
        });
      }
      
      const group = processGroups.get(key);
      group.achieved += entry.achieved || 0;
      group.rejected += entry.rejected || 0;
      group.entries += 1;
      if (entry.machineId) {
        group.machines.add((entry.machineId as any)?.name || 'Unknown Machine');
      }
    });

    // Convert Set to Array for machines
    const processSummary = Array.from(processGroups.values()).map(group => ({
      ...group,
      machines: Array.from(group.machines)
    }));

    // Get unique machines and products
    const uniqueMachines = new Set<string>();
    const uniqueProducts = new Set<string>();
    
    workEntries.forEach(entry => {
      if (entry.machineId) {
        uniqueMachines.add((entry.machineId as any)?.name || 'Unknown Machine');
      }
      uniqueProducts.add((entry.productId as any)?.name || 'Unknown Product');
    });

    const response: ApiResponse = {
      success: true,
      data: {
        employeeId,
        date: targetDate.toISOString().split('T')[0],
        totalAchieved,
        totalRejected,
        totalEntries: workEntries.length,
        uniqueMachines: Array.from(uniqueMachines),
        uniqueProducts: Array.from(uniqueProducts),
        processSummary,
        workEntries: workEntries.map(entry => ({
          id: entry._id,
          processName: (entry.processId as any)?.name || 'Unknown Process',
          productName: (entry.productId as any)?.name || 'Unknown Product',
          machineName: (entry.machineId as any)?.name || 'N/A',
          achieved: entry.achieved,
          rejected: entry.rejected,
          shiftType: entry.shiftType,
          startTime: entry.startTime,
          endTime: entry.endTime,
          validationStatus: entry.validationStatus
        }))
      },
      status: 200
    };
    
    res.status(200).json(response);
    
  } catch (error: any) {
    logger.error('Employee daily summary error', { error: error instanceof Error ? error.message : String(error) });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve employee daily summary',
      status: 500
    };
    res.status(500).json(response);
  }
};

