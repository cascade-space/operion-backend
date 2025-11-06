import { Router } from 'express';
import { body, validationResult, param } from 'express-validator';
import Process from '@/models/Process';
import Product from '@/models/Product';
import User from '@/models/User';
import { ApiResponse } from '@/types';
import { authenticate, authorize } from '@/middleware/auth';
import { validateMongoId } from '@/middleware/commonValidation';
import { sanitizeProcessInput } from '@/middleware/sanitization';
import { handleValidationErrors } from '@/middleware/validation';
import quantityService from '@/services/quantityService';
import { logError } from '@/utils/logger';
import { wsServer } from '@/services/websocketServer';

const router = Router();

// Validation middleware
const validateProcess = [
  body('name').trim().notEmpty().withMessage('Process name is required'),
];

// Get all processes
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query: any = {};
    
    // Filter by factory if user is not super admin
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const processes = await Process.find(query)
      .populate('factoryId', 'name')
      .skip(skip)
      .limit(parseInt(limit as string))
      .sort({ order: 1, createdAt: 1 });

    const total = await Process.countDocuments(query);

    const response: ApiResponse = {
      success: true,
      message: 'Processes retrieved successfully',
      status: 200,
      data: {
        processes,
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
    logError('Get processes error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve processes',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get process by ID
router.get('/:id', authenticate, validateMongoId, async (req, res) => {
  try {
    const process = await Process.findById(req.params.id)
      .populate('factoryId', 'name');

    if (!process) {
      const response: ApiResponse = {
        success: false,
        error: 'Process not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to this process
    if (req.user.role !== 'super_admin') {
      // For employees, check factory access only
      if (req.user && req.user.role === 'employee') {
        // Employees can access any process in their factory
        if (process.factoryId?.toString() !== req.user.factoryId?.toString()) {
          const response: ApiResponse = {
            success: false,
            error: 'Access denied - Process not in your factory',
            status: 403
          };
          return res.status(403).json(response);
        }
      } else {
        // For factory_admin and supervisor, check factory access
        if (process.factoryId?.toString() !== req.user.factoryId?.toString()) {
          const response: ApiResponse = {
            success: false,
            error: 'Access denied',
            status: 403
          };
          return res.status(403).json(response);
        }
      }
    }

    const response: ApiResponse = {
      success: true,
      message: 'Process retrieved successfully',
      status: 200,
      data: process
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Get process error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve process',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Create new process
router.post('/', authenticate, authorize('super_admin', 'factory_admin'), sanitizeProcessInput, validateProcess, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: ApiResponse = {
        success: false,
        error: 'Validation failed',
        status: 400,
        data: { errors: errors.array() }
      };
      return res.status(400).json(response);
    }

    const { name } = req.body;
    const factoryId = req.user?.role === 'super_admin' ? req.body.factoryId : req.user?.factoryId;

    if (!factoryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory ID is required',
        status: 400
      };
      return res.status(400).json(response);
    }

    // Use the user's provided name
    const process = new Process({
      name: name.trim(),
      factoryId
    });

    await process.save();

    // Populate the response
    const populatedProcess = await Process.findById(process._id)
      .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: 'Process created successfully',
      status: 201,
      data: populatedProcess
    };

    // Broadcast WebSocket event for process creation
    if (factoryId) {
      wsServer.broadcastToFactory(factoryId.toString(), {
        type: 'process_created',
        data: { processId: process._id.toString(), process: populatedProcess }
      });
    }

    res.status(201).json(response);
  } catch (error: any) {
    logError('Create process error', error, {
      userId: req.user?.id,
      factoryId: req.user?.factoryId
    });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to create process',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Update process
router.put('/:id', authenticate, authorize('super_admin', 'factory_admin'), validateMongoId, sanitizeProcessInput, validateProcess, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: ApiResponse = {
        success: false,
        error: 'Validation failed',
        status: 400,
        data: { errors: errors.array() }
      };
      return res.status(400).json(response);
    }

    const process = await Process.findById(req.params.id);
    if (!process) {
      const response: ApiResponse = {
        success: false,
        error: 'Process not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to update this process
    if (req.user && req.user.role === 'factory_admin' && process.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    const { description, targetOutput, cycleTime, status, assignedEmployees } = req.body;

    // Verify assigned employees exist and belong to the factory
    if (assignedEmployees && assignedEmployees.length > 0) {
      const employees = await User.find({
        _id: { $in: assignedEmployees },
        role: 'employee'
      });

      if (employees.length !== assignedEmployees.length) {
        const response: ApiResponse = {
          success: false,
          error: 'One or more assigned employees not found',
          status: 404
        };
        return res.status(404).json(response);
      }

      // Check if all employees belong to the factory
      const factoryId = req.user.role === 'super_admin' ? req.body.factoryId : req.user.factoryId;
      const invalidEmployees = employees.filter(emp => emp.factoryId?.toString() !== factoryId?.toString());
      
      if (invalidEmployees.length > 0) {
        const response: ApiResponse = {
          success: false,
          error: 'One or more employees do not belong to your factory',
          status: 403
        };
        return res.status(403).json(response);
      }
    }

    // Update process
    const updatedProcess = await Process.findByIdAndUpdate(
      req.params.id,
      {
        description,
        targetOutput,
        cycleTime,
        status,
        assignedEmployees,
        factoryId: req.user.role === 'super_admin' ? req.body.factoryId : process.factoryId
      },
      { new: true, runValidators: true }
    )
    .populate('assignedEmployees', 'profile.firstName profile.lastName')
    .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: 'Process updated successfully',
      status: 200,
      data: updatedProcess
    };

    // Broadcast WebSocket event for process update
    if (process.factoryId) {
      wsServer.broadcastToFactory(process.factoryId.toString(), {
        type: 'process_updated',
        data: { processId: updatedProcess._id.toString(), process: updatedProcess }
      });
    }

    res.status(200).json(response);
  } catch (error: any) {
    logError('Update process error', error, {
      processId: req.params?.id,
      userId: req.user?.id
    });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update process',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Delete process
router.delete('/:id', authenticate, authorize('super_admin', 'factory_admin'), validateMongoId, async (req, res) => {
  try {
    const process = await Process.findById(req.params.id);
    if (!process) {
      const response: ApiResponse = {
        success: false,
        error: 'Process not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to delete this process
    if (req.user && req.user.role === 'factory_admin' && process.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    const factoryId = process.factoryId?.toString();
    await Process.findByIdAndDelete(req.params.id);

    const response: ApiResponse = {
      success: true,
      message: 'Process deleted successfully',
      status: 200
    };

    // Broadcast WebSocket event for process deletion
    if (factoryId) {
      wsServer.broadcastToFactory(factoryId, {
        type: 'process_deleted',
        data: { processId: req.params.id }
      });
    }

    res.status(200).json(response);
  } catch (error: any) {
    logError('Delete process error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete process',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Assign employee to process
router.post('/:id/assign-employee', authenticate, authorize('super_admin', 'factory_admin'), async (req, res) => {
  try {
    const { employeeId } = req.body;

    if (!employeeId) {
      const response: ApiResponse = {
        success: false,
        error: 'Employee ID is required',
        status: 400
      };
      return res.status(400).json(response);
    }

    const process = await Process.findById(req.params.id);
    if (!process) {
      const response: ApiResponse = {
        success: false,
        error: 'Process not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to this process
    if (req.user && req.user.role === 'factory_admin' && process.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    // Verify employee exists and belongs to the factory
    const employee = await User.findById(employeeId);
    if (!employee || employee.role !== 'employee') {
      const response: ApiResponse = {
        success: false,
        error: 'Employee not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    if (employee.factoryId?.toString() !== process.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Employee does not belong to this factory',
        status: 403
      };
      return res.status(403).json(response);
    }

    // Check if employee is already assigned
    if ((process as any).assignedEmployees?.includes(employeeId)) {
      const response: ApiResponse = {
        success: false,
        error: 'Employee is already assigned to this process',
        status: 409
      };
      return res.status(409).json(response);
    }

    // Assign employee - update the process directly
    if (!(process as any).assignedEmployees) {
      (process as any).assignedEmployees = [];
    }
    (process as any).assignedEmployees.push(employeeId);
    await process.save();

    const updatedProcess = await Process.findById(req.params.id)
      .populate('productId', 'name sku')
      .populate('assignedEmployees', 'profile.firstName profile.lastName')
      .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: 'Employee assigned successfully',
      status: 200,
      data: updatedProcess
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Assign employee error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to assign employee',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Remove employee from process
router.delete('/:id/remove-employee/:employeeId', authenticate, authorize('super_admin', 'factory_admin'), validateMongoId, [
  param('employeeId').isMongoId().withMessage('Invalid employee ID format'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { employeeId } = req.params;

    const process = await Process.findById(req.params.id);
    if (!process) {
      const response: ApiResponse = {
        success: false,
        error: 'Process not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to this process
    if (req.user && req.user.role === 'factory_admin' && process.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    // Check if employee is assigned to this process
    if (!(process as any).assignedEmployees?.includes(employeeId as any)) {
      const response: ApiResponse = {
        success: false,
        error: 'Employee is not assigned to this process',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Remove employee - update the process directly
    (process as any).assignedEmployees = (process as any).assignedEmployees.filter((id: any) => id.toString() !== employeeId.toString());
    await process.save();

    const updatedProcess = await Process.findById(req.params.id)
      .populate('productId', 'name sku')
      .populate('assignedEmployees', 'profile.firstName profile.lastName')
      .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: 'Employee removed successfully',
      status: 200,
      data: updatedProcess
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Remove employee error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to remove employee',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Update process metrics
router.patch('/:id/metrics', authenticate, authorize('super_admin', 'factory_admin'), validateMongoId, async (req, res) => {
  try {
    const { totalProduction, averageCycleTime, efficiency, uptime } = req.body;

    const process = await Process.findById(req.params.id);
    if (!process) {
      const response: ApiResponse = {
        success: false,
        error: 'Process not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to this process
    if (req.user && req.user.role === 'factory_admin' && process.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    // Update metrics - update the process directly
    (process as any).metrics = {
      totalProduction: totalProduction || 0,
      totalRejections: req.body.rejections || 0,
      averageCycleTime: averageCycleTime || 0
    };
    await process.save();

    const updatedProcess = await Process.findById(req.params.id)
      .populate('productId', 'name sku')
      .populate('assignedEmployees', 'profile.firstName profile.lastName')
      .populate('factoryId', 'name');

    const response: ApiResponse = {
      success: true,
      message: 'Process metrics updated successfully',
      status: 200,
      data: updatedProcess
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Update metrics error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update process metrics',
      status: 500
    };
    res.status(500).json(response);
  }
});


// Set daily target for a process (typically Process 1)
router.post('/:id/set-daily-target', authenticate, authorize('super_admin', 'factory_admin'), async (req, res) => {
  try {
    const { target } = req.body;
    
    if (!target || target <= 0) {
      const response: ApiResponse = {
        success: false,
        error: 'Valid target quantity is required',
        status: 400
      };
      return res.status(400).json(response);
    }

    const success = await quantityService.setDailyTarget(req.params.id, target);
    
    if (success) {
      const response: ApiResponse = {
        success: true,
        message: 'Daily target set successfully',
        status: 200
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to set daily target',
        status: 500
      };
      res.status(500).json(response);
    }
  } catch (error: any) {
    logError('Set daily target error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to set daily target',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get quantity status for a process
router.get('/:id/quantity-status', authenticate, async (req, res) => {
  try {
    const { productId } = req.query;
    const status = await quantityService.getProcessQuantityStatus(req.params.id, productId as string);
    
    if (status) {
      const response: ApiResponse = {
        success: true,
        data: status,
        status: 200
      };
      res.status(200).json(response);
    } else {
      // Process not found - return safe default
      const response: ApiResponse = {
        success: true,
        data: {
          processId: req.params.id,
          availableQuantity: 0,
          isLocked: false,
          lockedAt: null,
          dailyTarget: 0,
          totalAchieved: 0,
          totalRejected: 0
        },
        status: 200
      };
      res.status(200).json(response);
    }
  } catch (error: any) {
    logError('Get quantity status error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to get quantity status',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Unlock a process stage (supervisor override)
router.post('/:id/unlock', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), async (req, res) => {
  try {
    const success = await quantityService.unlockStage(req.params.id);
    
    if (success) {
      const response: ApiResponse = {
        success: true,
        message: 'Process stage unlocked successfully',
        status: 200
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to unlock process stage',
        status: 500
      };
      res.status(500).json(response);
    }
  } catch (error: any) {
    logError('Unlock stage error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to unlock process stage',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Unlock all stages for a factory (debugging utility)
router.post('/unlock-all', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), async (req, res) => {
  try {
    const factoryId = req.user?.factoryId;
    if (!factoryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory ID not found',
        status: 400
      };
      return res.status(400).json(response);
    }

    const success = await quantityService.unlockAllStages(factoryId.toString());
    
    if (success) {
      const response: ApiResponse = {
        success: true,
        message: 'All process stages unlocked successfully',
        status: 200
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to unlock all process stages',
        status: 500
      };
      res.status(500).json(response);
    }
  } catch (error: any) {
    logError('Unlock all stages error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to unlock all process stages',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get waterfall view for all processes in a factory
router.get('/waterfall/:productId', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const user = req.user;
    
    if (!user?.factoryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory ID required',
        status: 400
      };
      return res.status(400).json(response);
    }

    const waterfallData = await quantityService.getWaterfallView(user.factoryId.toString());
    
    const response: ApiResponse = {
      success: true,
      data: waterfallData,
      status: 200
    };
    res.status(200).json(response);
  } catch (error: any) {
    logError('Get waterfall view error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to get waterfall view',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Manual daily reset for a factory
router.post('/reset-daily/:factoryId', authenticate, authorize('super_admin', 'factory_admin'), async (req, res) => {
  try {
    const { factoryId } = req.params;
    const success = await quantityService.resetDailyQuantities(factoryId);
    
    if (success) {
      const response: ApiResponse = {
        success: true,
        message: 'Daily quantities reset successfully',
        status: 200
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to reset daily quantities',
        status: 500
      };
      res.status(500).json(response);
    }
  } catch (error: any) {
    logError('Reset daily quantities error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to reset daily quantities',
      status: 500
    };
    res.status(500).json(response);
  }
});

export default router;
