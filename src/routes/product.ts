import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import Product from '@/models/Product';
import { ApiResponse } from '@/types';
import { authenticate, authorize } from '@/middleware/auth';
import { validateMongoId } from '@/middleware/commonValidation';
import { sanitizeProductInput } from '@/middleware/sanitization';
import { wsServer } from '@/services/websocketServer';

const router = Router();

// Validation middleware
const validateProduct = [
  body('name').isLength({ min: 2 }).withMessage('Product name must be at least 2 characters'),
  body('code').isLength({ min: 1 }).withMessage('Product code is required'),
  body('dailyTarget').optional().isNumeric().withMessage('Daily target must be a number'),
  body('processes').optional().isArray().withMessage('Processes must be an array'),
  body('processes.*.processId').optional().isMongoId().withMessage('Process ID must be valid'),
  body('processes.*.order').optional().isNumeric().withMessage('Process order must be a number'),
];

// Get all products
router.get('/', authenticate, async (req, res) => {
  try {
    const { category, status, page = 1, limit = 10, search } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query: any = {};
    
    // Filter by factory if user is not super admin
    if (req.user?.role !== 'super_admin') {
      query.factoryId = req.user?.factoryId;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    const products = await Product.find(query)
      .populate('factoryId', 'name')
      .skip(skip)
      .limit(parseInt(limit as string))
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(query);

    const response: ApiResponse = {
      success: true,
      message: 'Products retrieved successfully',
      status: 200,
      data: {
        products,
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
    console.error('Get products error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve products',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get product by ID
router.get('/:id', authenticate, validateMongoId, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('factoryId', 'name');

    if (!product) {
      const response: ApiResponse = {
        success: false,
        error: 'Product not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to this product
    if (req.user.role !== 'super_admin' && product.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Product retrieved successfully',
      status: 200,
      data: product
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get product error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve product',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Create new product
router.post('/', authenticate, authorize('super_admin', 'factory_admin'), sanitizeProductInput, validateProduct, async (req, res) => {
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

    const { name, code, dailyTarget, processes } = req.body;

    // Check if code already exists in the same factory
    const factoryId = req.user?.role === 'super_admin' ? req.body.factoryId : req.user?.factoryId;
    
    if (!factoryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory ID is required',
        status: 400
      };
      return res.status(400).json(response);
    }

    const existingCode = await Product.findOne({ 
      code, 
      factoryId: factoryId
    });
    
    if (existingCode) {
      const response: ApiResponse = {
        success: false,
        error: 'Product code already exists in this factory',
        status: 409
      };
      return res.status(409).json(response);
    }

    const product = new Product({
      name,
      code,
      factoryId: factoryId,
      dailyTarget: dailyTarget || 0,
      processes: processes || []
    });

    await product.save();

    const response: ApiResponse = {
      success: true,
      message: 'Product created successfully',
      status: 201,
      data: product
    };

    // Broadcast WebSocket event for product creation
    if (factoryId) {
      wsServer.broadcastToFactory(factoryId.toString(), {
        type: 'product_created',
        data: { productId: product._id.toString(), product }
      });
    }

    res.status(201).json(response);
  } catch (error: any) {
    console.error('Create product error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to create product',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Update product
router.put('/:id', authenticate, authorize('super_admin', 'factory_admin'), validateMongoId, sanitizeProductInput, validateProduct, async (req, res) => {
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

    const product = await Product.findById(req.params.id);
    if (!product) {
      const response: ApiResponse = {
        success: false,
        error: 'Product not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to update this product
    if (req.user.role === 'factory_admin' && product.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    const { name, description, category, sku, price, inventory, specifications, dailyTarget, processes } = req.body;

    // Check if SKU already exists (excluding current product)
    if (sku && sku !== (product as any).sku) {
      const existingSku = await Product.findOne({ 
        sku, 
        factoryId: product.factoryId,
        _id: { $ne: req.params.id }
      });
      
      if (existingSku) {
        const response: ApiResponse = {
          success: false,
          error: 'SKU already exists in this factory',
          status: 409
        };
        return res.status(409).json(response);
      }
    }

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        category,
        sku,
        price,
        inventory: {
          currentStock: inventory.currentStock,
          maxStock: inventory.maxStock || inventory.currentStock * 2,
          minStock: inventory.minStock || Math.floor(inventory.currentStock * 0.2)
        },
        specifications: specifications || {},
        dailyTarget: dailyTarget !== undefined ? dailyTarget : product.dailyTarget,
        processes: processes !== undefined ? processes : product.processes,
        factoryId: req.user.role === 'super_admin' ? req.body.factoryId : product.factoryId
      },
      { new: true, runValidators: true }
    );

    const response: ApiResponse = {
      success: true,
      message: 'Product updated successfully',
      status: 200,
      data: updatedProduct
    };

    // Broadcast WebSocket event for product update
    if (product.factoryId) {
      wsServer.broadcastToFactory(product.factoryId.toString(), {
        type: 'product_updated',
        data: { productId: updatedProduct._id.toString(), product: updatedProduct }
      });
    }

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Update product error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update product',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Delete product
router.delete('/:id', authenticate, authorize('super_admin', 'factory_admin'), validateMongoId, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      const response: ApiResponse = {
        success: false,
        error: 'Product not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to delete this product
    if (req.user.role === 'factory_admin' && product.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    const factoryId = product.factoryId?.toString();
    await Product.findByIdAndDelete(req.params.id);

    const response: ApiResponse = {
      success: true,
      message: 'Product deleted successfully',
      status: 200
    };

    // Broadcast WebSocket event for product deletion
    if (factoryId) {
      wsServer.broadcastToFactory(factoryId, {
        type: 'product_deleted',
        data: { productId: req.params.id }
      });
    }

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Delete product error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete product',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Update product stock
router.patch('/:id/stock', authenticate, authorize('super_admin', 'factory_admin'), validateMongoId, async (req, res) => {
  try {
    const { currentStock, maxStock, minStock } = req.body;

    const product = await Product.findById(req.params.id);
    if (!product) {
      const response: ApiResponse = {
        success: false,
        error: 'Product not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to update this product
    if (req.user.role === 'factory_admin' && product.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    // Update stock
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        'inventory.currentStock': currentStock,
        'inventory.maxStock': maxStock,
        'inventory.minStock': minStock
      },
      { new: true, runValidators: true }
    );

    const response: ApiResponse = {
      success: true,
      message: 'Product stock updated successfully',
      status: 200,
      data: updatedProduct
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Update stock error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update product stock',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get low stock products
router.get('/low-stock/list', authenticate, async (req, res) => {
  try {
    let query: any = {};
    
    // Filter by factory if user is not super admin
    if (req.user?.role !== 'super_admin') {
      query.factoryId = req.user?.factoryId;
    }

    // Find products where current stock is below minimum stock
    query['inventory.currentStock'] = { $lte: '$inventory.minStock' };

    const lowStockProducts = await Product.find(query)
      .populate('factoryId', 'name')
      .sort({ 'inventory.currentStock': 1 });

    const response: ApiResponse = {
      success: true,
      message: 'Low stock products retrieved successfully',
      status: 200,
      data: lowStockProducts
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get low stock products error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve low stock products',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get product categories
router.get('/categories/list', authenticate, async (req, res) => {
  try {
    let query: any = {};
    
    // Filter by factory if user is not super admin
    if (req.user?.role !== 'super_admin') {
      query.factoryId = req.user?.factoryId;
    }

    const categories = await Product.distinct('category', query);

    const response: ApiResponse = {
      success: true,
      message: 'Product categories retrieved successfully',
      status: 200,
      data: categories
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get categories error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve product categories',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Update product daily target only
router.patch('/:id/daily-target', authenticate, authorize('super_admin', 'factory_admin'), validateMongoId, async (req, res) => {
  try {
    const { dailyTarget } = req.body;
    
    if (dailyTarget === undefined) {
      const response: ApiResponse = {
        success: false,
        error: 'Daily target is required',
        status: 400
      };
      return res.status(400).json(response);
    }

    const target = parseInt(dailyTarget);
    if (isNaN(target) || target < 0) {
      const response: ApiResponse = {
        success: false,
        error: 'Daily target must be a valid non-negative number',
        status: 400
      };
      return res.status(400).json(response);
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      const response: ApiResponse = {
        success: false,
        error: 'Product not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to update this product
    if (req.user.role === 'factory_admin' && product.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    // Update only the daily target
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { dailyTarget: target },
      { new: true, runValidators: true }
    );

    const response: ApiResponse = {
      success: true,
      message: 'Daily target updated successfully',
      status: 200,
      data: updatedProduct
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Update daily target error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update daily target',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get products by process
router.get('/by-process/:processId', authenticate, async (req, res) => {
  try {
    const { processId } = req.params;
    
    if (!processId) {
      const response: ApiResponse = {
        success: false,
        error: 'Process ID is required',
        status: 400
      };
      return res.status(400).json(response);
    }

    let query: any = { 'processes.processId': processId };
    
    // Filter by factory if user is not super admin
    if (req.user?.role !== 'super_admin') {
      query.factoryId = req.user?.factoryId;
    }

    const products = await Product.find(query)
      .populate('factoryId', 'name')
      .populate('processes.processId', 'name order')
      .sort({ createdAt: -1 });

    const response: ApiResponse = {
      success: true,
      message: 'Products retrieved successfully',
      status: 200,
      data: products
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get products by process error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve products',
      status: 500
    };
    res.status(500).json(response);
  }
});

export default router;
