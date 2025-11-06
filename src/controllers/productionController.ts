import { Response } from 'express';
import mongoose, { Types } from 'mongoose';
import WorkEntry from '@/models/WorkEntry';
import User from '@/models/User';
import Product from '@/models/Product';
import Process from '@/models/Process';
import { ApiResponse, AuthRequest } from '@/types';
import logger, { logError } from '@/utils/logger';
import { wsServer } from '@/services/websocketServer';

// Check-in endpoint - Capture check-in timestamp
export const checkIn = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'Unauthorized',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    const checkinTime = new Date();
    
    logger.info('Production check-in', {
      userId: req.user.id,
      checkinTime: checkinTime.toISOString()
    });

    const response: ApiResponse = {
      success: true,
      message: 'Check-in successful',
      status: 200,
      data: {
        checkinTime: checkinTime.toISOString(),
        sessionToken: `session_${Date.now()}_${req.user.id}`
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Check-in error', error, {
      userId: req.user?.id
    });

    const response: ApiResponse = {
      success: false,
      error: 'Failed to check in',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get process stages for a product (ordered by sequence)
export const getProcessStagesByProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'Unauthorized',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    const { product_id } = (req as any).query;

    if (!product_id || typeof product_id !== 'string') {
      const response: ApiResponse = {
        success: false,
        error: 'Product ID is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    const product = await Product.findById(product_id).populate('processes.processId');

    if (!product) {
      const response: ApiResponse = {
        success: false,
        error: 'Product not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check factory access
    if (req.user.role !== 'super_admin' && product.factoryId.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Sort processes by order and populate process details
    if (!product.processes || product.processes.length === 0) {
      const response: ApiResponse = {
        success: true,
        message: 'No process stages found',
        status: 200,
        data: { stages: [] }
      };
      res.status(200).json(response);
      return;
    }
    
    const stages = product.processes
      .sort((a, b) => a.order - b.order)
      .map((p: any) => {
        const process = p.processId;
        return {
          processId: process._id.toString(),
          processName: process.name,
          stageOrder: p.order
        };
      });

    const response: ApiResponse = {
      success: true,
      message: 'Process stages retrieved successfully',
      status: 200,
      data: {
        stages
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Get process stages error', error, {
      userId: req.user?.id,
      productId: (req as any).query.product_id
    });

    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve process stages',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get process status (available quantity for a stage)
export const getProcessStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'Unauthorized',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    const { product_id, stage_id } = req.query;

    if (!product_id || typeof product_id !== 'string') {
      const response: ApiResponse = {
        success: false,
        error: 'Product ID is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    if (!stage_id || typeof stage_id !== 'string') {
      const response: ApiResponse = {
        success: false,
        error: 'Stage ID (process ID) is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    const product = await Product.findById(product_id);

    if (!product) {
      const response: ApiResponse = {
        success: false,
        error: 'Product not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Check factory access
    if (req.user.role !== 'super_admin' && product.factoryId.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Find the stage order for the given process
    if (!product.processes || product.processes.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: 'No process stages found for this product',
        status: 404
      };
      res.status(404).json(response);
      return;
    }
    
    const processStage = product.processes.find(
      (p: any) => p.processId.toString() === stage_id
    );

    if (!processStage) {
      const response: ApiResponse = {
        success: false,
        error: 'Process stage not found for this product',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const stageOrder = processStage.order;

    // Stage 1: Return unlimited
    if (stageOrder === 1) {
      const response: ApiResponse = {
        success: true,
        message: 'Process status retrieved successfully',
        status: 200,
        data: {
          availableQuantity: 999999,
          stageOrder: 1,
          isFirstStage: true
        }
      };
      res.status(200).json(response);
      return;
    }

    // Stage 2+: Calculate available quantity
    const previousStageOrder = stageOrder - 1;
    const previousProcess = product.processes?.find(
      (p: any) => p.order === previousStageOrder
    );

    if (!previousProcess) {
      const response: ApiResponse = {
        success: false,
        error: 'Previous stage not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const previousProcessId = previousProcess.processId.toString();

    // Calculate previous stage total achieved
    const previousStageAchieved = await WorkEntry.aggregate([
      {
        $match: {
          productId: new Types.ObjectId(product_id),
          stageOrder: previousStageOrder,
          factoryId: product.factoryId
        }
      },
      {
        $group: {
          _id: null,
          totalAchieved: { $sum: '$achieved' }
        }
      }
    ]);

    const previousTotalAchieved = previousStageAchieved.length > 0 
      ? previousStageAchieved[0].totalAchieved 
      : 0;

    // Calculate current stage total consumed (achieved + rejected)
    const currentStageConsumed = await WorkEntry.aggregate([
      {
        $match: {
          productId: new Types.ObjectId(product_id),
          stageOrder: stageOrder,
          factoryId: product.factoryId
        }
      },
      {
        $group: {
          _id: null,
          totalConsumed: {
            $sum: {
              $add: ['$achieved', '$rejected']
            }
          }
        }
      }
    ]);

    const currentTotalConsumed = currentStageConsumed.length > 0 
      ? currentStageConsumed[0].totalConsumed 
      : 0;

    const availableQuantity = previousTotalAchieved - currentTotalConsumed;

    logger.debug('Process status calculation', {
      productId: product_id,
      stageOrder,
      previousStageOrder,
      previousTotalAchieved,
      currentTotalConsumed,
      availableQuantity
    });

    const response: ApiResponse = {
      success: true,
      message: 'Process status retrieved successfully',
      status: 200,
      data: {
        availableQuantity: Math.max(0, availableQuantity), // Don't return negative
        stageOrder,
        isFirstStage: false,
        previousStageAchieved: previousTotalAchieved,
        currentStageConsumed: currentTotalConsumed
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Get process status error', error, {
      userId: req.user?.id,
      productId: (req as any).query.product_id,
      stageId: (req as any).query.stage_id
    });

    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve process status',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Submit production entry
export const submitProduction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'Unauthorized',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    const {
      checkinTime,
      productId,
      processId,
      machineId,
      shiftType,
      achieved,
      rejected,
      photo
    } = (req as any).body;

    // Validation
    if (!checkinTime || !productId || !processId || !achieved || !photo) {
      const response: ApiResponse = {
        success: false,
        error: 'Missing required fields: checkinTime, productId, processId, achieved, photo',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    const numericAchieved = parseInt(achieved);
    const numericRejected = parseInt(rejected || '0');

    if (isNaN(numericAchieved) || numericAchieved < 0) {
      const response: ApiResponse = {
        success: false,
        error: 'Achieved quantity must be a non-negative number',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    if (isNaN(numericRejected) || numericRejected < 0) {
      const response: ApiResponse = {
        success: false,
        error: 'Rejected quantity must be a non-negative number',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Get user/employee
    const employee = await User.findById(req.user.id);
    if (!employee || !employee.factoryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Employee not found or factory not assigned',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Get product to find stage order
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

    // Check factory access
    if (req.user.role !== 'super_admin' && product.factoryId.toString() !== employee.factoryId.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      res.status(403).json(response);
      return;
    }

    // Find stage order
    if (!product.processes || product.processes.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: 'No process stages found for this product',
        status: 404
      };
      res.status(404).json(response);
      return;
    }
    
    const processStage = product.processes.find(
      (p: any) => p.processId.toString() === processId
    );

    if (!processStage) {
      const response: ApiResponse = {
        success: false,
        error: 'Process not found for this product',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const stageOrder = processStage.order;

    // Validate available quantity for non-first stages
    if (stageOrder > 1) {
      const previousStageOrder = stageOrder - 1;
      
      const previousStageAchieved = await WorkEntry.aggregate([
        {
          $match: {
            productId: new Types.ObjectId(productId),
            stageOrder: previousStageOrder,
            factoryId: product.factoryId
          }
        },
        {
          $group: {
            _id: null,
            totalAchieved: { $sum: '$achieved' }
          }
        }
      ]);

      const currentStageConsumed = await WorkEntry.aggregate([
        {
          $match: {
            productId: new Types.ObjectId(productId),
            stageOrder: stageOrder,
            factoryId: product.factoryId
          }
        },
        {
          $group: {
            _id: null,
            totalConsumed: {
              $sum: {
                $add: ['$achieved', '$rejected']
              }
            }
          }
        }
      ]);

      const previousTotalAchieved = previousStageAchieved.length > 0 
        ? previousStageAchieved[0].totalAchieved 
        : 0;
      const currentTotalConsumed = currentStageConsumed.length > 0 
        ? currentStageConsumed[0].totalConsumed 
        : 0;

      const availableQuantity = previousTotalAchieved - currentTotalConsumed;
      const totalToConsume = numericAchieved + numericRejected;

      if (totalToConsume > availableQuantity) {
        const response: ApiResponse = {
          success: false,
          error: `Insufficient quantity available. Available: ${availableQuantity}, Required: ${totalToConsume}`,
          status: 400
        };
        res.status(400).json(response);
        return;
      }
    }

    // Calculate checkout time and work hours
    const checkoutTime = new Date();
    const checkinTimeDate = new Date(checkinTime);
    const workHours = (checkoutTime.getTime() - checkinTimeDate.getTime()) / (1000 * 60 * 60);

    if (workHours <= 0) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid check-in time. Checkout time must be after check-in time',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Create work entry
    const workEntryData = {
      employeeId: employee._id,
      factoryId: employee.factoryId,
      processId: new Types.ObjectId(processId),
      productId: new Types.ObjectId(productId),
      machineId: machineId ? new Types.ObjectId(machineId) : undefined,
      shiftType: shiftType || 'General',
      achieved: numericAchieved,
      rejected: numericRejected,
      photo: photo,
      targetQuantity: numericAchieved + numericRejected,
      startTime: checkinTimeDate,
      endTime: checkoutTime,
      checkinTime: checkinTimeDate,
      checkoutTime: checkoutTime,
      workHours: workHours,
      stageOrder: stageOrder,
      validationStatus: 'approved' as const,
      validatedBy: employee._id,
      validatedAt: new Date()
    };

    const workEntry = new WorkEntry(workEntryData);
    const savedWorkEntry = await workEntry.save();

    // Populate for response
    const populatedWorkEntry = await WorkEntry.findById(savedWorkEntry._id)
      .populate('processId', 'name')
      .populate('productId', 'name code')
      .populate('machineId', 'name')
      .populate('employeeId', 'profile.firstName profile.lastName');

    // Broadcast production update via WebSocket
    if (employee.factoryId) {
      wsServer.broadcastProductionUpdate(employee.factoryId.toString());
    }

    logger.info('Production entry submitted', {
      workEntryId: savedWorkEntry._id.toString(),
      employeeId: employee._id.toString(),
      productId,
      processId,
      stageOrder,
      achieved: numericAchieved,
      rejected: numericRejected,
      workHours
    });

    const response: ApiResponse = {
      success: true,
      message: 'Production entry submitted successfully',
      status: 201,
      data: populatedWorkEntry
    };

    res.status(201).json(response);
  } catch (error: any) {
    logError('Submit production error', error, {
      userId: req.user?.id,
      body: req.body
    });

    if (error.name === 'ValidationError') {
      const response: ApiResponse = {
        success: false,
        error: 'Validation failed',
        status: 400,
        data: { errors: error.errors }
      };
      res.status(400).json(response);
      return;
    }

    const response: ApiResponse = {
      success: false,
      error: 'Failed to submit production entry',
      status: 500
    };
    res.status(500).json(response);
  }
};

