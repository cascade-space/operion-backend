import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import WorkEntry from '@/models/WorkEntry';
import { ApiResponse } from '@/types';
import { AuthRequest } from '@/middleware/auth';
import logger from '@/utils/logger';

// Get all attendance records
export const getAllAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    logger.debug('Attendance request', {
      userId: req.user?.id,
      role: req.user?.role,
      factoryId: req.user?.factoryId
    });
    
    const { employeeId, date, status } = req.query;
    const { getPaginationParams, getPaginationMeta } = await import('@/utils/pagination');
    const { skip, limit, page } = getPaginationParams(req.query, 20, 100);

    let query: Record<string, any> = {};
    
    // Filter by factory if user is not super admin
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    // Filter by employee
    if (employeeId) {
      query.employeeId = employeeId;
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

    // Filter by status
    if (status) {
      query.status = status;
    }

    const attendance = await Attendance.find(query)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('factoryId', 'name')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Attendance.countDocuments(query);
    const pagination = getPaginationMeta(page, limit, total);

    const response: ApiResponse = {
      success: true,
      message: 'Attendance records retrieved successfully',
      status: 200,
      data: {
        attendance,
        pagination
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get attendance error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve attendance records',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get attendance by ID
export const getAttendanceById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('factoryId', 'name');

    if (!attendance) {
      const response: ApiResponse = {
        success: false,
        error: 'Attendance record not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check if user has access to this attendance record
    if (req.user && req.user.role !== 'super_admin' && attendance.factoryId?.toString() !== req.user.factoryId?.toString()) {
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
      message: 'Attendance record retrieved successfully',
      status: 200,
      data: attendance
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get attendance error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve attendance record',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get attendance by employee
export const getAttendanceByEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;
    const { getPaginationParams, getPaginationMeta } = await import('@/utils/pagination');
    const { skip, limit, page } = getPaginationParams(req.query, 20, 100);

    let query: Record<string, any> = { employeeId };
    
    // Filter by factory if user is not super admin
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    // Filter by date range
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }

    const attendance = await Attendance.find(query)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('factoryId', 'name')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Calculate work hours for each attendance record
    const attendanceWithWorkHours = await Promise.all(
      attendance.map(async (attendanceRecord) => {
        const attendanceDate = attendanceRecord.date || attendanceRecord.createdAt;
        const startOfDay = new Date(attendanceDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(attendanceDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Get all work entries for this employee on this date
        const workEntries = await WorkEntry.find({
          employeeId: employeeId,
          startTime: {
            $gte: startOfDay,
            $lte: endOfDay
          },
          endTime: { $exists: true, $ne: null }
        });

        // Calculate total work hours from work entries
        let workHours = 0;
        if (workEntries.length > 0) {
          workHours = workEntries.reduce((total, entry) => {
            if (entry.startTime && entry.endTime) {
              const duration = new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime();
              return total + (duration / (1000 * 60 * 60)); // Convert to hours
            }
            return total;
          }, 0);
          workHours = Math.round(workHours * 100) / 100; // Round to 2 decimal places
        } else if (attendanceRecord.checkIn?.time && attendanceRecord.checkOut?.time) {
          // Fallback to checkIn/checkOut calculation if no work entries
          const checkInTime = new Date(attendanceRecord.checkIn.time);
          const checkOutTime = new Date(attendanceRecord.checkOut.time);
          const duration = checkOutTime.getTime() - checkInTime.getTime();
          workHours = Math.round((duration / (1000 * 60 * 60)) * 100) / 100;
        }

        // Convert to plain object and add workHours
        const attendanceObj = attendanceRecord.toObject() as any;
        attendanceObj.workHours = workHours;
        return attendanceObj;
      })
    );

    const total = await Attendance.countDocuments(query);
    const pagination = getPaginationMeta(page, limit, total);

    const response: ApiResponse = {
      success: true,
      message: 'Employee attendance retrieved successfully',
      status: 200,
      data: {
        attendance: attendanceWithWorkHours,
        pagination
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get employee attendance error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve employee attendance',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get attendance history for a specific employee
export const getAttendanceHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query: Record<string, any> = { employeeId };
    
    // Filter by factory if user is not super admin
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    // Filter by date range - default to yesterday and earlier
    if (startDate && endDate) {
      query.$or = [
        {
          date: {
            $gte: new Date(startDate as string),
            $lte: new Date(endDate as string)
          }
        },
        {
          createdAt: {
            $gte: new Date(startDate as string),
            $lte: new Date(endDate as string)
          }
        }
      ];
    } else {
      // Default to yesterday and earlier
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      query.$or = [
        {
          date: {
            $lt: today
          }
        },
        {
          createdAt: {
            $lt: today
          }
        }
      ];
    }

    const attendance = await Attendance.find(query)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('factoryId', 'name')
      .skip(skip)
      .limit(parseInt(limit as string))
      .sort({ createdAt: -1 });

    const total = await Attendance.countDocuments(query);

    const response: ApiResponse = {
      success: true,
      message: 'Employee attendance history retrieved successfully',
      status: 200,
      data: {
        attendance,
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
    logger.error('Get employee attendance history error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve employee attendance history',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get today's attendance for a specific employee
export const getTodayAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    
    // Check if user has access to this employee's data
    if (req.user && req.user.role === 'employee' && req.user.id !== employeeId) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied - You can only view your own attendance',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await Attendance.findOne({
      employeeId,
      $or: [
        {
          date: {
            $gte: today,
            $lt: tomorrow
          }
        },
        {
          createdAt: {
            $gte: today,
            $lt: tomorrow
          }
        }
      ]
    }).populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('factoryId', 'name');

    if (!attendance) {
      const response: ApiResponse = {
        success: true,
        message: 'No attendance record found for today',
        status: 200,
        data: null
      };
      res.status(200).json(response);
      return;
    }

    // Get work entries for today to calculate check-in and check-out times
    const workEntries = await WorkEntry.find({
      employeeId,
      startTime: {
        $gte: today,
        $lt: tomorrow
      }
    }).sort({ startTime: 1 }); // Sort by start time

    let checkInTime = attendance.checkIn?.time;
    let checkOutTime = attendance.checkOut?.time;

    // If we have work entries, use the first work entry's start time as check-in
    if (workEntries.length > 0) {
      checkInTime = workEntries[0].startTime;
      
      // Use the last completed work entry's end time as check-out
      const completedWorkEntries = workEntries.filter(entry => entry.endTime && entry.validationStatus === 'pending');
      if (completedWorkEntries.length > 0) {
        const lastCompletedEntry = completedWorkEntries[completedWorkEntries.length - 1];
        if (lastCompletedEntry.endTime) {
          checkOutTime = lastCompletedEntry.endTime;
        }
      }
    }

    // Calculate work hours
    let workHours = 0;
    if (checkInTime && checkOutTime) {
      const startTime = new Date(checkInTime);
      const endTime = new Date(checkOutTime);
      workHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    }

    const attendanceWithWorkTimes = {
      ...attendance.toObject(),
      checkIn: {
        ...(attendance.checkIn || {}),
        time: checkInTime
      },
      checkOut: {
        ...(attendance.checkOut || {}),
        time: checkOutTime
      },
      workHours: Math.round(workHours * 100) / 100
    };

    const response: ApiResponse = {
      success: true,
      message: 'Today\'s attendance retrieved successfully',
      status: 200,
      data: attendanceWithWorkTimes
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get today attendance error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve today\'s attendance',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get today's attendance list
export const getTodayAttendanceList = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let query: Record<string, any> = {
      'checkIn.date': {
        $gte: today,
        $lt: tomorrow
      }
    };
    
    // Filter by factory if user is not super admin
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    const attendance = await Attendance.find(query)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('factoryId', 'name')
      .sort({ 'checkIn.date': -1 });

    const response: ApiResponse = {
      success: true,
      message: 'Today\'s attendance retrieved successfully',
      status: 200,
      data: attendance
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Get today attendance error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve today\'s attendance',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Check in
export const checkIn = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    logger.debug('Check-in request received', {
      userId: req.user?.id,
      user_id: (req.user as any)?._id,
      role: req.user?.role,
      bodyEmployeeId: req.body.employeeId,
      requestBody: req.body
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Check-in validation errors', { errors: errors.array() });
      const response: ApiResponse = {
        success: false,
        error: 'Validation failed',
        status: 400,
        data: { errors: errors.array() }
      };
      res.status(400).json(response);
      return;
    }

    const { processId, location, shiftType: requestShiftType, target } = req.body;
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not authenticated',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    // Get employeeId from request body (preferred) or fallback to authenticated user
    // Frontend sends employeeId in the request body
    let employeeId = req.body.employeeId || req.user.id || (req.user as any)._id;
    
    // Validate employeeId is present and valid MongoDB ObjectId
    if (!employeeId) {
      logger.error('Check-in error: employeeId not found', {
        hasBodyEmployeeId: !!req.body.employeeId,
        hasUser: !!req.user,
        userId: req.user.id,
        user_id: (req.user as any)._id,
        requestBody: req.body
      });
      const response: ApiResponse = {
        success: false,
        error: 'Employee ID is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Ensure employeeId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      logger.error('Check-in error: Invalid employeeId format', {
        employeeId,
        employeeIdType: typeof employeeId
      });
      const response: ApiResponse = {
        success: false,
        error: 'Invalid employee ID format',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Convert to ObjectId
    employeeId = new mongoose.Types.ObjectId(employeeId);

    // Check if employee already has an active attendance record today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingAttendance = await Attendance.findOne({
      employeeId,
      date: {
        $gte: today,
        $lt: tomorrow
      },
      status: 'present'
    });

    if (existingAttendance) {
      const response: ApiResponse = {
        success: false,
        error: 'You are already checked in today',
        status: 409
      };
      res.status(409).json(response);
      return;
    }

    // Basic location validation
    if (!location || !location.latitude || !location.longitude) {
      const response: ApiResponse = {
        success: false,
        error: 'Location data is required for attendance check-in',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Basic geofence validation
    let isWithinGeofence = true;
    
    // Get factory information for basic geofence check
    const employee = await User.findById(employeeId).populate('factoryId');
    if (!employee) {
      logger.error('Check-in error: Employee not found', { employeeId });
      const response: ApiResponse = {
        success: false,
        error: 'Employee not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    if (employee?.factoryId && (employee.factoryId as any).geofence) {
      const factory = employee.factoryId as any;
      if (factory.geofence && factory.settings?.geofencingEnabled !== false) {
        isWithinGeofence = factory.isWithinGeofence(location.latitude, location.longitude);
      }
    }
    
    // Get shift type from request body (preferred) or calculate from current hour
    let shiftType: 'morning' | 'evening' | 'night';
    if (requestShiftType && ['morning', 'evening', 'night'].includes(requestShiftType)) {
      // Use shiftType from request body
      shiftType = requestShiftType;
    } else {
      // Calculate shift type from current hour (fallback)
      const currentHour = new Date().getHours();
      if (currentHour >= 6 && currentHour < 14) {
        shiftType = 'morning';
      } else if (currentHour >= 14 && currentHour < 22) {
        shiftType = 'evening';
      } else {
        shiftType = 'night';
      }
    }

    const attendance = new Attendance({
      employeeId,
      processId,
      factoryId: req.user.factoryId || employee.factoryId,
      date: new Date(),
      checkIn: {
        time: new Date(),
        location: {
          ...location
        },
        isWithinGeofence: isWithinGeofence
      },
      shiftType: shiftType,
      target: target || 0,
      status: 'present'
    });

    await attendance.save();

    const populatedAttendance = await Attendance.findById(attendance._id)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: 'Check-in successful',
      status: 201,
      data: populatedAttendance
    };

    res.status(201).json(response);
  } catch (error: any) {
    logger.error('Check-in error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to check in',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Check out
export const checkOut = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const { location } = req.body;
    const { id: attendanceId } = req.params;
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not authenticated',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    const employeeId = req.user.id;

    // Find the specific attendance record
    const attendance = await Attendance.findOne({
      _id: attendanceId,
      employeeId,
      status: 'present'
    });

    if (!attendance) {
      const response: ApiResponse = {
        success: false,
        error: 'Attendance record not found or access denied',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Update attendance with check-out
    attendance.checkOut = {
      time: new Date(),
      location
    };
    attendance.status = 'present'; // Keep as present since work is completed

    await attendance.save();

    const populatedAttendance = await Attendance.findById(attendance._id)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: 'Check-out successful',
      status: 200,
      data: populatedAttendance
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Check-out error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to check out',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Update attendance status
export const updateAttendanceStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, notes } = req.body;

    if (!status || !['checked-in', 'checked-out', 'on-break', 'absent', 'late', 'early-leave'].includes(status)) {
      const response: ApiResponse = {
        success: false,
        error: 'Valid status is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) {
      const response: ApiResponse = {
        success: false,
        error: 'Attendance record not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check if user has access to update this attendance record
    if (req.user && req.user.role === 'factory_admin' && attendance.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Update status
    attendance.status = status;

    await attendance.save();

    const populatedAttendance = await Attendance.findById(attendance._id)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: 'Attendance status updated successfully',
      status: 200,
      data: populatedAttendance
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Update status error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update attendance status',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Create manual attendance record (for admins)
export const createManualAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const { employeeId, processId, checkInTime, checkOutTime, status, location, notes } = req.body;

    // Verify employee exists and belongs to the factory
    const employee = await User.findById(employeeId);
    if (!employee || employee.role !== 'employee') {
      const response: ApiResponse = {
        success: false,
        error: 'Employee not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    if (req.user && req.user.role === 'factory_admin' && employee.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Employee does not belong to your factory',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    const attendance = new Attendance({
      employeeId,
      processId,
      factoryId: req.user?.role === 'super_admin' ? req.body.factoryId : req.user?.factoryId,
      checkIn: {
        time: checkInTime || new Date(),
        location: location?.checkIn || location,
        photo: null
      },
      checkOut: checkOutTime ? {
        time: checkOutTime,
        location: location?.checkOut || location,
        photo: null
      } : undefined,
      status: status || 'checked-in',
      notes,
      isManual: true
    });

    await attendance.save();

    const populatedAttendance = await Attendance.findById(attendance._id)
      .populate('employeeId', 'profile.firstName profile.lastName email')
      .populate('processId', 'name')
      .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: 'Manual attendance record created successfully',
      status: 201,
      data: populatedAttendance
    };

    res.status(201).json(response);
  } catch (error: any) {
    logger.error('Create manual attendance error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to create manual attendance record',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Delete attendance record
export const deleteAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) {
      const response: ApiResponse = {
        success: false,
        error: 'Attendance record not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check if user has access to delete this attendance record
    if (req.user && req.user.role === 'factory_admin' && attendance.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    await Attendance.findByIdAndDelete(req.params.id);

    const response: ApiResponse = {
      success: true,
      message: 'Attendance record deleted successfully',
      status: 200
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Delete attendance error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete attendance record',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Mark employees as absent for today if they haven't started work
export const markAbsent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    logger.debug('Mark absent request', {
      userId: req.user?.id,
      role: req.user?.role
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all employees for the factory
    let employeeQuery: Record<string, any> = {};
    if (req.user && req.user.role !== 'super_admin') {
      employeeQuery.factoryId = req.user.factoryId;
    }

    const employees = await User.find({
      ...employeeQuery,
      role: 'employee',
      isActive: true
    });

    let markedAbsent = 0;
    let alreadyMarked = 0;

    for (const employee of employees) {
      // Check if employee already has attendance for today
      const existingAttendance = await Attendance.findOne({
        employeeId: employee._id,
        $or: [
          {
            date: {
              $gte: today,
              $lt: tomorrow
            }
          },
          {
            createdAt: {
              $gte: today,
              $lt: tomorrow
            }
          }
        ]
      });

      if (existingAttendance) {
        alreadyMarked++;
        continue;
      }

      // Check if employee has any work entries for today
      const workEntries = await WorkEntry.find({
        employeeId: employee._id,
        startTime: {
          $gte: today,
          $lt: tomorrow
        }
      });

      if (workEntries.length > 0) {
        continue;
      }

      // Mark employee as absent
      const absentAttendance = new Attendance({
        employeeId: employee._id,
        factoryId: employee.factoryId,
        date: today,
        checkIn: {
          time: null,
          location: null,
          isWithinGeofence: false,
          status: 'absent'
        },
        shiftType: 'morning', // Default shift
        processId: null, // No process assignment required
        target: 0,
        status: 'absent'
      });

      await absentAttendance.save();
      markedAbsent++;
    }

    const response: ApiResponse = {
      success: true,
      message: `Absent marking completed. Marked ${markedAbsent} employees as absent, ${alreadyMarked} already had attendance records.`,
      status: 200,
      data: {
        markedAbsent,
        alreadyMarked,
        totalEmployees: employees.length
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Mark absent error', { error: error.message, stack: error.stack });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to mark employees as absent',
      status: 500
    };
    res.status(500).json(response);
  }
};

