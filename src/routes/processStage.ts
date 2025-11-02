import { Router } from 'express';
import { Types } from 'mongoose';
import ProcessStage from '@/models/ProcessStage';
import { ApiResponse } from '@/types';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();

// Get all process stages with filters
router.get('/', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      page = 1, 
      limit = 50,
      productId,
      processId,
      factoryId
    } = req.query;

    let query: any = {};
    
    // Factory filter for non-super_admin
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    } else if (factoryId) {
      query.factoryId = factoryId;
    }

    // Product filter
    if (productId) {
      query.productId = new Types.ObjectId(productId as string);
    }

    // Process filter
    if (processId) {
      query.processId = new Types.ObjectId(processId as string);
    }

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        query.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const processStages = await ProcessStage.find(query)
      .populate('factoryId', 'name')
      .populate('productId', 'name sku')
      .populate('processId', 'name')
      .sort({ date: -1, stageOrder: 1 })
      .skip(skip)
      .limit(parseInt(limit as string));

    const total = await ProcessStage.countDocuments(query);

    const response: ApiResponse = {
      success: true,
      message: 'Process stages retrieved successfully',
      status: 200,
      data: {
        processStages,
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
    console.error('Get process stages error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve process stages',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get process stages for a specific product
router.get('/product/:productId', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), async (req, res) => {
  try {
    const { productId } = req.params;
    const { startDate, endDate, page = 1, limit = 50 } = req.query;

    if (!productId) {
      const response: ApiResponse = {
        success: false,
        error: 'Product ID is required',
        status: 400
      };
      return res.status(400).json(response);
    }

    let query: any = {
      productId: new Types.ObjectId(productId)
    };

    // Factory filter for non-super_admin
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        query.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const processStages = await ProcessStage.find(query)
      .populate('factoryId', 'name')
      .populate('productId', 'name sku')
      .populate('processId', 'name')
      .sort({ date: -1, stageOrder: 1 })
      .skip(skip)
      .limit(parseInt(limit as string));

    const total = await ProcessStage.countDocuments(query);

    const response: ApiResponse = {
      success: true,
      message: 'Process stages for product retrieved successfully',
      status: 200,
      data: {
        processStages,
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
    console.error('Get process stages by product error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve process stages for product',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get process stages for a specific process
router.get('/process/:processId', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), async (req, res) => {
  try {
    const { processId } = req.params;
    const { startDate, endDate, page = 1, limit = 50 } = req.query;

    if (!processId) {
      const response: ApiResponse = {
        success: false,
        error: 'Process ID is required',
        status: 400
      };
      return res.status(400).json(response);
    }

    let query: any = {
      processId: new Types.ObjectId(processId)
    };

    // Factory filter for non-super_admin
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        query.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const processStages = await ProcessStage.find(query)
      .populate('factoryId', 'name')
      .populate('productId', 'name sku')
      .populate('processId', 'name')
      .sort({ date: -1, stageOrder: 1 })
      .skip(skip)
      .limit(parseInt(limit as string));

    const total = await ProcessStage.countDocuments(query);

    const response: ApiResponse = {
      success: true,
      message: 'Process stages for process retrieved successfully',
      status: 200,
      data: {
        processStages,
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
    console.error('Get process stages by process error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve process stages for process',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get single process stage by ID
router.get('/:id', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      const response: ApiResponse = {
        success: false,
        error: 'Process stage ID is required',
        status: 400
      };
      return res.status(400).json(response);
    }

    let query: any = { _id: new Types.ObjectId(id) };

    // Factory filter for non-super_admin
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = req.user.factoryId;
    }

    const processStage = await ProcessStage.findOne(query)
      .populate('factoryId', 'name')
      .populate('productId', 'name sku')
      .populate('processId', 'name');

    if (!processStage) {
      const response: ApiResponse = {
        success: false,
        error: 'Process stage not found or access denied',
        status: 404
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Process stage retrieved successfully',
      status: 200,
      data: processStage
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get process stage by ID error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve process stage',
      status: 500
    };
    res.status(500).json(response);
  }
});

export default router;
