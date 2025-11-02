import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { validateMachine } from '@/middleware/validation';
import { validateMongoId } from '@/middleware/commonValidation';
import Machine from '@/models/Machine';
import { ApiResponse } from '@/types';
import mongoose from 'mongoose';

const router = Router();

// Get all machines for factory
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { getPaginationParams, getPaginationMeta } = await import('@/utils/pagination');
    const { skip, limit, page } = getPaginationParams(req.query, 20, 100);
    
    const factoryId = req.user?.role === 'super_admin' ? req.query.factoryId : req.user?.factoryId;
    
    if (!factoryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory ID is required',
        status: 400
      };
      return res.status(400).json(response);
    }

    const machines = await Machine.find({ factoryId })
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Machine.countDocuments({ factoryId });
    const pagination = getPaginationMeta(page, limit, total);
    
    const response: ApiResponse = {
      success: true,
      message: 'Machines retrieved successfully',
      status: 200,
      data: {
        machines,
        pagination
      }
    };
    
    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get machines error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve machines',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get machines by process
router.get('/process/:processId', authenticate, async (req: Request, res: Response) => {
  try {
    const factoryId = req.user?.role === 'super_admin' ? req.query.factoryId : req.user?.factoryId;
    
    if (!factoryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory ID is required',
        status: 400
      };
      return res.status(400).json(response);
    }

    // Get all machines for the factory
    const machines = await Machine.find({ factoryId }).sort({ name: 1 });
    
    const response: ApiResponse = {
      success: true,
      message: 'Machines retrieved successfully',
      status: 200,
      data: machines
    };
    
    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get machines by process error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve machines',
      status: 500
    };
    res.status(500).json(response);
  }
});


// Create machine
router.post('/', authenticate, authorize('super_admin', 'factory_admin'), async (req: Request, res: Response) => {
  try {
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

    const machine = new Machine({
      name,
      factoryId
    });

    await machine.save();

    const response: ApiResponse = {
      success: true,
      message: 'Machine created successfully',
      status: 201,
      data: machine
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('Create machine error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to create machine',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Update machine
router.put('/:id', authenticate, authorize('super_admin', 'factory_admin'), validateMongoId, validateMachine, async (req: Request, res: Response) => {
  try {
    const machine = await Machine.findById(req.params.id);
    if (!machine) {
      const response: ApiResponse = {
        success: false,
        error: 'Machine not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to update this machine
    if (req.user?.role === 'factory_admin' && machine.factoryId?.toString() !== req.user?.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    const { name } = req.body;
    machine.name = name;
    await machine.save();

    const response: ApiResponse = {
      success: true,
      message: 'Machine updated successfully',
      status: 200,
      data: machine
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Update machine error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update machine',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Delete machine
router.delete('/:id', authenticate, authorize('super_admin', 'factory_admin'), validateMongoId, async (req: Request, res: Response) => {
  try {
    const machine = await Machine.findById(req.params.id);
    if (!machine) {
      const response: ApiResponse = {
        success: false,
        error: 'Machine not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to delete this machine
    if (req.user?.role === 'factory_admin' && machine.factoryId?.toString() !== req.user?.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    await Machine.findByIdAndDelete(req.params.id);

    const response: ApiResponse = {
      success: true,
      message: 'Machine deleted successfully',
      status: 200
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Delete machine error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete machine',
      status: 500
    };
    res.status(500).json(response);
  }
});

export default router;
