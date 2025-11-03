import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Factory from '@/models/Factory';
import User from '@/models/User';
import { ApiResponse } from '@/types';
import { AuthRequest } from '@/middleware/auth';
import bcrypt from 'bcryptjs';
import logger, { logError } from '@/utils/logger';

// Register a new factory (public endpoint)
export const registerFactory = async (req: Request, res: Response): Promise<void> => {
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

    const {
      name,
      address,
      geofence,
      adminEmail,
      adminProfile,
      adminCredentials
    } = req.body;

    logger.debug('Factory registration request received', {
      factoryName: name,
      adminEmail: adminEmail,
      hasAdminProfile: !!adminProfile,
      hasAdminCredentials: !!adminCredentials
    });

    // Validate required fields
    if (!name || !address || !geofence || !adminEmail || !adminProfile || !adminCredentials) {
      const response: ApiResponse = {
        success: false,
        error: 'All required fields must be provided',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Validate admin credentials
    if (!adminCredentials.username || !adminCredentials.password) {
      const response: ApiResponse = {
        success: false,
        error: 'Admin username and password are required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Validate admin profile
    if (!adminProfile.firstName || !adminProfile.lastName || !adminProfile.phone) {
      const response: ApiResponse = {
        success: false,
        error: 'Admin first name, last name, and phone are required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Validate password strength
    if (adminCredentials.password.length < 6) {
      const response: ApiResponse = {
        success: false,
        error: 'Password must be at least 6 characters long',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Check if factory with this name already exists
    const existingFactory = await Factory.findOne({ name: name.trim() });
    if (existingFactory) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory with this name already exists',
        status: 409
      };
      res.status(409).json(response);
      return;
    }

    // Check if admin email already exists in users
    const existingUser = await User.findOne({ email: adminEmail.toLowerCase().trim() });
    if (existingUser) {
      const response: ApiResponse = {
        success: false,
        error: 'Admin email already registered',
        status: 409
      };
      res.status(409).json(response);
      return;
    }

    // Check if admin email already exists in pending factory requests
    const existingFactoryRequest = await Factory.findOne({ 
      adminEmail: adminEmail.toLowerCase().trim(),
      status: { $in: ['pending', 'approved'] }
    });
    if (existingFactoryRequest) {
      const response: ApiResponse = {
        success: false,
        error: 'Admin email already has a pending or approved factory request',
        status: 409
      };
      res.status(409).json(response);
      return;
    }

    // Validate geofence coordinates
    if (geofence.latitude < -90 || geofence.latitude > 90) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid latitude value',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    if (geofence.longitude < -180 || geofence.longitude > 180) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid longitude value',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Hash the admin password
    const hashedPassword = await bcrypt.hash(adminCredentials.password, 12);

    // Create factory registration request with cleaned data
    const factoryRequest = new Factory({
      name: name.trim(),
      address: {
        street: address.street?.trim(),
        city: address.city?.trim(),
        state: address.state?.trim(),
        country: address.country?.trim(),
        zipCode: address.zipCode?.trim()
      },
      geofence: {
        latitude: parseFloat(geofence.latitude),
        longitude: parseFloat(geofence.longitude),
        radius: parseInt(geofence.radius) || 100
      },
      status: 'pending',
      adminEmail: adminEmail.toLowerCase().trim(),
      adminProfile: {
        firstName: adminProfile.firstName?.trim(),
        lastName: adminProfile.lastName?.trim(),
        phone: adminProfile.phone?.trim()
      },
      adminCredentials: {
        username: adminCredentials.username.toLowerCase().trim(),
        password: hashedPassword
      },
      subscription: {
        plan: 'basic',
        maxUsers: 50,
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
      }
    });

    await factoryRequest.save();
    
    logger.info('Factory registration request created successfully', {
      requestId: factoryRequest._id,
      factoryName: factoryRequest.name,
      adminEmail: factoryRequest.adminEmail,
      status: factoryRequest.status
    });

    const response: ApiResponse = {
      success: true,
      message: 'Factory registration submitted successfully',
      status: 201,
      data: {
        requestId: factoryRequest._id,
        message: 'Your factory registration has been submitted and is pending approval. You will receive an email notification once approved.'
      }
    };

    res.status(201).json(response);
  } catch (error: any) {
    logError('Factory registration error', error);
    
    // Handle specific error types
    if (error.code === 11000) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory name or admin email already exists',
        status: 409
      };
      res.status(409).json(response);
      return;
    }

    if (error.name === 'ValidationError') {
      const response: ApiResponse = {
        success: false,
        error: 'Validation failed',
        status: 400,
        data: { errors: Object.values(error.errors).map((err: any) => err.message) }
      };
      res.status(400).json(response);
      return;
    }

    const response: ApiResponse = {
      success: false,
      error: 'Failed to register factory',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get factory registration requests (super admin only)
export const getFactoryRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requests = await Factory.find({ status: { $in: ['pending', 'approved', 'rejected'] } })
      .select('-adminCredentials.password')
      .sort({ createdAt: -1 });

    const response: ApiResponse = {
      success: true,
      message: 'Factory requests retrieved successfully',
      status: 200,
      data: {
        requests: requests.map(req => ({
          id: req._id,
          name: req.name,
          adminEmail: req.adminEmail,
          adminProfile: req.adminProfile,
          address: req.address,
          geofence: req.geofence,
          status: req.status,
          createdAt: req.createdAt
        })),
        total: requests.length
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Get factory requests error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve factory requests',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Approve factory request (super admin only)
export const approveFactoryRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  logger.debug('Factory approval request received', { requestId: req.params.requestId });
  
  try {
    const { requestId } = req.params;

    logger.debug('Starting factory approval process for request', { requestId });

    // Find factory request
    const factoryRequest = await Factory.findById(requestId);
    if (!factoryRequest) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory request not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    logger.debug('Factory request found', {
      id: factoryRequest._id,
      name: factoryRequest.name,
      status: factoryRequest.status,
      adminEmail: factoryRequest.adminEmail
    });

    // Validate factory request status
    if (factoryRequest.status !== 'pending') {
      const response: ApiResponse = {
        success: false,
        error: `Factory request is not pending. Current status: ${factoryRequest.status}`,
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Validate admin credentials
    if (!factoryRequest.adminCredentials?.password) {
      logError('No admin credentials found in factory request', new Error('Missing admin credentials'));
      const response: ApiResponse = {
        success: false,
        error: 'No admin credentials found in factory request',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Validate admin email
    if (!factoryRequest.adminEmail) {
      logError('No admin email found in factory request', new Error('Missing admin email'));
      const response: ApiResponse = {
        success: false,
        error: 'No admin email found in factory request',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Check if admin email already exists in users
    const existingUser = await User.findOne({ email: factoryRequest.adminEmail });
    if (existingUser) {
      logError('Admin email already exists in system', new Error('Duplicate admin email'), { email: factoryRequest.adminEmail });
      const response: ApiResponse = {
        success: false,
        error: 'Admin email already registered in the system',
        status: 409
      };
      res.status(409).json(response);
      return;
    }

    // Prepare admin profile with validation
    const adminProfile = {
      firstName: factoryRequest.adminProfile?.firstName?.trim() || 'Admin',
      lastName: factoryRequest.adminProfile?.lastName?.trim() || 'User',
      phone: factoryRequest.adminProfile?.phone?.trim() || '1234567890',
      avatar: null
    };

    // Validate required profile fields
    if (!adminProfile.firstName || adminProfile.firstName.length < 2) {
      const response: ApiResponse = {
        success: false,
        error: 'Admin first name must be at least 2 characters',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    if (!adminProfile.lastName || adminProfile.lastName.length < 2) {
      const response: ApiResponse = {
        success: false,
        error: 'Admin last name must be at least 2 characters',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Validate password format
    const hashedPassword = factoryRequest.adminCredentials.password;
    if (!hashedPassword || !hashedPassword.startsWith('$2')) {
      logError('Invalid password format in factory request', new Error('Invalid password format'));
      const response: ApiResponse = {
        success: false,
        error: 'Invalid admin credentials format in factory request',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    logger.debug('Creating factory admin user with validated data', {
      email: factoryRequest.adminEmail,
      username: factoryRequest.adminCredentials.username,
      passwordLength: hashedPassword.length,
      passwordStartsWithHash: hashedPassword.startsWith('$2'),
      profile: adminProfile
    });

    // Create admin user (without transaction for now to fix the immediate issue)
    const adminUser = new User({
      email: factoryRequest.adminEmail,
      username: factoryRequest.adminCredentials.username || factoryRequest.adminEmail,
      password: hashedPassword, // Use the already hashed password
      role: 'factory_admin',
      profile: adminProfile,
      factoryId: factoryRequest._id,
      isActive: true,
      emailVerified: true // Factory admins are pre-verified
    });

    logger.debug('About to save admin user...');
    await adminUser.save();
    logger.debug('Admin user saved successfully');

    logger.info('Factory admin user created successfully', {
      userId: adminUser._id,
      email: adminUser.email,
      username: adminUser.username,
      role: adminUser.role,
      factoryId: adminUser.factoryId
    });

    // Update factory status and set adminId
    factoryRequest.status = 'approved';
    factoryRequest.adminId = adminUser._id;
    
    // Clean up temporary admin data after successful user creation
    factoryRequest.adminEmail = undefined;
    factoryRequest.adminProfile = undefined;
    factoryRequest.adminCredentials = undefined;
    
    logger.debug('About to save factory request...');
    await factoryRequest.save();
    logger.debug('Factory request saved successfully');

    logger.info('Factory status updated to approved', {
      factoryId: factoryRequest._id,
      adminId: factoryRequest.adminId,
      status: factoryRequest.status
    });

    // Prepare response data after successful operation
    const response: ApiResponse = {
      success: true,
      message: 'Factory approved successfully. Admin can login with the credentials provided during registration.',
      status: 200,
      data: {
        factory: {
          id: factoryRequest._id,
          name: factoryRequest.name,
          status: factoryRequest.status,
          adminId: factoryRequest.adminId
        },
        admin: {
          id: adminUser._id,
          email: adminUser.email,
          username: adminUser.username,
          role: adminUser.role
        }
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Factory approval error', error, {
      name: error.name,
      code: error.code,
      keyPattern: error.keyPattern,
      keyValue: error.keyValue
    });
    
    // Handle specific error types
    if (error.code === 11000) {
      const response: ApiResponse = {
        success: false,
        error: 'Admin email or username already exists',
        status: 409
      };
      res.status(409).json(response);
      return;
    }

    if (error.name === 'ValidationError') {
      const response: ApiResponse = {
        success: false,
        error: 'Validation failed',
        status: 400,
        data: { errors: Object.values(error.errors).map((err: any) => err.message) }
      };
      res.status(400).json(response);
      return;
    }

    const response: ApiResponse = {
      success: false,
      error: 'Failed to approve factory',
      status: 500,
      data: { 
        errorMessage: error.message,
        errorName: error.name,
        errorCode: error.code
      }
    };
    res.status(500).json(response);
  }
};

// Reject factory request (super admin only)
export const rejectFactoryRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;

    const factoryRequest = await Factory.findById(requestId);
    if (!factoryRequest) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory request not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    factoryRequest.status = 'rejected';
    factoryRequest.rejectionReason = reason;
    await factoryRequest.save();

    const response: ApiResponse = {
      success: true,
      message: 'Factory request rejected',
      status: 200
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Reject factory error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to reject factory',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Create factory (super admin only)
export const createFactory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const factory = new Factory(req.body);
    await factory.save();
    
    const response: ApiResponse = {
      success: true,
      message: 'Factory created successfully',
      status: 201,
      data: factory
    };
    
    res.status(201).json(response);
  } catch (error: any) {
    logError('Create factory error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to create factory',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get all factories
export const getAllFactories = async (req: Request, res: Response): Promise<void> => {
  try {
    const { getPaginationParams, getPaginationMeta } = await import('@/utils/pagination');
    const { skip, limit, page } = getPaginationParams(req.query, 20, 100);
    
    const { status, isActive, search } = req.query;
    
    let query: any = {};
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by isActive
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } },
        { 'address.state': { $regex: search, $options: 'i' } }
      ];
    }
    
    const factories = await Factory.find(query)
      .populate('adminId', 'email profile')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await Factory.countDocuments(query);
    const pagination = getPaginationMeta(page, limit, total);
    
    const response: ApiResponse = {
      success: true,
      message: 'Factories retrieved successfully',
      status: 200,
      data: {
        factories,
        pagination
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Get factories error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve factories',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get shifts for a factory
export const getShifts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    logger.debug('Get shifts request', {
      userId: req.user?.id,
      query: req.query,
      userRole: req.user?.role,
      userFactoryId: req.user?.factoryId
    });
    
    const factoryId = req.user?.role === 'super_admin' ? req.query.factoryId : req.user?.factoryId;
    
    if (!factoryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory ID is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    logger.debug('Looking for factory with ID', { factoryId });
    const factory = await Factory.findById(factoryId);
    logger.debug('Factory found', { found: factory ? 'Yes' : 'No' });
    
    if (!factory) {
      logger.warn('Factory not found for ID', { factoryId });
      const response: ApiResponse = {
        success: false,
        error: 'Factory not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    logger.debug('Factory settings', { hasSettings: !!factory.settings });
    const shifts = factory.settings?.shifts || [];
    logger.debug('Shifts found', { count: shifts.length });
    
    const response: ApiResponse = {
      success: true,
      message: 'Shifts retrieved successfully',
      status: 200,
      data: { shifts }
    };
    
    res.status(200).json(response);
  } catch (error: any) {
    logError('Get shifts error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve factory',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get factory by ID
export const getFactoryById = async (req: Request, res: Response): Promise<void> => {
  try {
    logger.debug('Get factory request', { id: req.params.id });
    
    const factory = await Factory.findById(req.params.id).populate('adminId', 'email profile');
    
    logger.debug('Factory found', { found: factory ? 'Yes' : 'No' });
    if (factory) {
      logger.debug('Factory details', { name: factory.name, status: factory.status });
    }
    
    if (!factory) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: 'Factory retrieved successfully',
      status: 200,
      data: factory
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Get factory error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve factory',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Update factory
export const updateFactory = async (req: Request, res: Response): Promise<void> => {
  try {
    const factory = await Factory.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!factory) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: 'Factory updated successfully',
      status: 200,
      data: factory
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Update factory error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update factory',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Delete factory
export const deleteFactory = async (req: Request, res: Response): Promise<void> => {
  try {
    const factory = await Factory.findByIdAndDelete(req.params.id);

    if (!factory) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: 'Factory deleted successfully',
      status: 200
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Delete factory error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete factory',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Approve factory
export const approveFactory = async (req: Request, res: Response): Promise<void> => {
  try {
    const factory = await Factory.findByIdAndUpdate(
      req.params.id,
      { status: 'approved' },
      { new: true }
    );

    if (!factory) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: 'Factory approved successfully',
      status: 200,
      data: factory
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Approve factory error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to approve factory',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Suspend factory
export const suspendFactory = async (req: Request, res: Response): Promise<void> => {
  try {
    const factory = await Factory.findByIdAndUpdate(
      req.params.id,
      { status: 'suspended' },
      { new: true }
    );

    if (!factory) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: 'Factory suspended successfully',
      status: 200,
      data: factory
    };

    res.status(200).json(response);
  } catch (error: any) {
    logError('Suspend factory error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to suspend factory',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Add a new shift
export const addShift = async (req: AuthRequest, res: Response): Promise<void> => {
  logger.debug('Shift creation request', {
    body: req.body,
    userId: req.user?.id,
    headers: req.headers
  });
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.debug('Validation errors', { errors: errors.array() });
      const response: ApiResponse = {
        success: false,
        error: 'Validation failed',
        status: 400,
        data: { errors: errors.array() }
      };
      res.status(400).json(response);
      return;
    }

    const factoryId = req.user?.role === 'super_admin' ? req.body.factoryId : req.user?.factoryId;
    
    if (!factoryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory ID is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    const factory = await Factory.findById(factoryId);
    if (!factory) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const { name, startTime, endTime, isActive = true } = req.body;

    // Check if shift name already exists
    const existingShift = factory.settings?.shifts?.find(shift => shift.name === name);
    if (existingShift) {
      const response: ApiResponse = {
        success: false,
        error: 'Shift name already exists',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Initialize settings if not exists
    if (!factory.settings) {
      factory.settings = {
        timezone: 'UTC',
        workingHours: { start: '08:00', end: '17:00' },
        shifts: [],
        geofencingEnabled: true,
        photoRequired: true,
        locationRequired: true
      };
    }

    // Initialize shifts array if not exists
    if (!factory.settings.shifts) {
      factory.settings.shifts = [];
    }

    // Add new shift
    const newShift = { name, startTime, endTime, isActive };
    factory.settings.shifts.push(newShift);

    await factory.save();

    const response: ApiResponse = {
      success: true,
      message: 'Shift added successfully',
      status: 201,
      data: { shift: newShift }
    };
    
    res.status(201).json(response);
  } catch (error: any) {
    logError('Add shift error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to add shift',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Update a shift
export const updateShift = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const factoryId = req.user?.role === 'super_admin' ? req.body.factoryId : req.user?.factoryId;
    const shiftName = req.params.shiftName;
    
    if (!factoryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory ID is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    const factory = await Factory.findById(factoryId);
    if (!factory) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const shiftIndex = factory.settings?.shifts?.findIndex(shift => shift.name === shiftName);
    if (shiftIndex === -1 || shiftIndex === undefined) {
      const response: ApiResponse = {
        success: false,
        error: 'Shift not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const { name, startTime, endTime, isActive } = req.body;

    // Check if new name conflicts with existing shifts (if name is being changed)
    if (name && name !== shiftName) {
      const existingShift = factory.settings?.shifts?.find(shift => shift.name === name);
      if (existingShift) {
        const response: ApiResponse = {
          success: false,
          error: 'Shift name already exists',
          status: 400
        };
        res.status(400).json(response);
        return;
      }
    }

    // Update shift
    const shift = factory.settings!.shifts![shiftIndex];
    if (name) shift.name = name;
    if (startTime) shift.startTime = startTime;
    if (endTime) shift.endTime = endTime;
    if (isActive !== undefined) shift.isActive = isActive;

    await factory.save();

    const response: ApiResponse = {
      success: true,
      message: 'Shift updated successfully',
      status: 200,
      data: { shift }
    };
    
    res.status(200).json(response);
  } catch (error: any) {
    logError('Update shift error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update shift',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Delete a shift
export const deleteShift = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const factoryId = req.user?.role === 'super_admin' ? req.query.factoryId : req.user?.factoryId;
    const shiftName = req.params.shiftName;
    
    if (!factoryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory ID is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    const factory = await Factory.findById(factoryId);
    if (!factory) {
      const response: ApiResponse = {
        success: false,
        error: 'Factory not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const shiftIndex = factory.settings?.shifts?.findIndex(shift => shift.name === shiftName);
    if (shiftIndex === -1 || shiftIndex === undefined) {
      const response: ApiResponse = {
        success: false,
        error: 'Shift not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Remove shift
    factory.settings!.shifts!.splice(shiftIndex, 1);
    await factory.save();

    const response: ApiResponse = {
      success: true,
      message: 'Shift deleted successfully',
      status: 200
    };
    
    res.status(200).json(response);
  } catch (error: any) {
    logError('Delete shift error', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete shift',
      status: 500
    };
    res.status(500).json(response);
  }
};

