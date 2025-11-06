import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import User from '@/models/User';
import Factory from '@/models/Factory';
import Process from '@/models/Process';
import { ApiResponse } from '@/types';
import bcrypt from 'bcryptjs';
import { authenticate, authorize } from '@/middleware/auth';
import { validateMongoId } from '@/middleware/commonValidation';
import { sanitizeUserInput } from '@/middleware/sanitization';
import { auditUserCreation, auditUserDeletion, auditPasswordChange } from '@/middleware/auditLogger';
import { handleValidationErrors } from '@/middleware/validation';
import mongoose from 'mongoose';
import { generateUserId, generatePassword, generateEmailFromId } from '@/utils/userUtils';
import { validatePasswordForNewUsers } from '@/utils/passwordPolicy';
import { wsServer } from '@/services/websocketServer';

const router = Router();

// Validation middleware for user creation
const validateUser = [
  body('role').isIn(['super_admin', 'factory_admin', 'supervisor', 'employee']).withMessage('Invalid role'),
  body('profile.firstName').isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('profile.lastName').isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('profile.phone')
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please provide a valid phone number')
    .custom((value) => {
      const cleanPhone = value.replace(/\D/g, '');
      if (cleanPhone.length < 5) {
        throw new Error('Phone number must have at least 5 digits for ID generation');
      }
      return true;
    }),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  handleValidationErrors
];

// Validation middleware for user updates (password optional)
const validateUserUpdate = [
  body('email').optional().isEmail().withMessage('Please provide a valid email'),
  body('role').optional().isIn(['super_admin', 'factory_admin', 'supervisor', 'employee']).withMessage('Invalid role'),
  body('profile.firstName').optional().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('profile.lastName').optional().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('profile.phone')
    .optional()
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please provide a valid phone number')
    .custom((value) => {
      if (value) {
        const cleanPhone = value.replace(/\D/g, '');
        if (cleanPhone.length < 5) {
          throw new Error('Phone number must have at least 5 digits for ID generation');
        }
      }
      return true;
    }),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  handleValidationErrors
];

const validatePassword = [
  body('password')
    .custom((value) => {
      if (!value) {
        throw new Error('Password is required');
      }
      const result = validatePasswordForNewUsers(value);
      if (!result.isValid) {
        throw new Error(result.error || 'Password does not meet requirements');
      }
      return true;
    }),
  handleValidationErrors
];

// Create superadmin endpoint (for initial setup)
router.post('/create-superadmin', sanitizeUserInput, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate required fields
    if (!email || !password) {
      const response: ApiResponse = {
        success: false,
        error: 'Email and password are required',
        status: 400
      };
      return res.status(400).json(response);
    }

    // Validate email format
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      const response: ApiResponse = {
        success: false,
        error: 'Please provide a valid email address',
        status: 400
      };
      return res.status(400).json(response);
    }

    // Validate password using new policy for new users
    const passwordValidation = validatePasswordForNewUsers(password);
    if (!passwordValidation.isValid) {
      const response: ApiResponse = {
        success: false,
        error: passwordValidation.error || 'Password does not meet requirements',
        status: 400
      };
      return res.status(400).json(response);
    }

    // Check if superadmin already exists
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      const response: ApiResponse = {
        success: false,
        error: 'Super admin already exists',
        status: 409
      };
      return res.status(409).json(response);
    }

    // Check if email already exists
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      const response: ApiResponse = {
        success: false,
        error: 'Email already exists',
        status: 409
      };
      return res.status(409).json(response);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create superadmin user
    const superAdminData = {
      email: email.toLowerCase(),
      username: email.toLowerCase(), // Use email as username for superadmin
      password: hashedPassword,
      role: 'super_admin',
      profile: {
        firstName: 'Super',
        lastName: 'Admin',
        phone: '+1234567890' // Default phone for superadmin
      },
      factoryId: null, // Super admin doesn't belong to any factory
      assignedProcesses: [],
      isActive: true,
      emailVerified: true
    };

    const superAdmin = new User(superAdminData);
    await superAdmin.save();

    const response: ApiResponse = {
      success: true,
      message: 'Super admin created successfully',
      status: 201,
      data: {
        id: superAdmin._id,
        email: superAdmin.email,
        role: superAdmin.role,
        isActive: superAdmin.isActive,
        createdAt: superAdmin.createdAt
      }
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('Create superadmin error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to create super admin',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get all users with pagination and filtering
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 10, role, factoryId, search } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // User fetch request

    let query: any = {};
    
    // Filter by factory if user is not super admin
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = new mongoose.Types.ObjectId(req.user.factoryId);
      // Filtering by factory
    }

    // Filter by role
    if (role) {
      query.role = role;
    }

    // Filter by factory
    if (factoryId) {
      query.factoryId = new mongoose.Types.ObjectId(factoryId as string);
    }

    // Search functionality
    if (search) {
      query.$or = [
        { 'profile.firstName': { $regex: search, $options: 'i' } },
        { 'profile.lastName': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Final query constructed

    const users = await User.find(query)
      .select('-password')
      .populate('factoryId', 'name')
      .skip(skip)
      .limit(parseInt(limit as string))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);
    
    // Query results processed

    // All users in factory processed

    // Fix factoryId format for all users
    const usersWithFixedFactoryId = users.map(user => {
      const userData = user.toJSON();
      const factoryId = user.factoryId?._id?.toString() || user.factoryId?.toString();
      return {
        ...userData,
        factoryId
      };
    });

    const response: ApiResponse = {
      success: true,
      message: 'Users retrieved successfully',
      status: 200,
      data: {
        users: usersWithFixedFactoryId,
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
    console.error('Get users error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve users',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get user by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('factoryId', 'name')
      .populate({
        path: 'assignedProcesses',
        select: 'name productId',
        populate: {
          path: 'productId',
          select: 'name'
        }
      });

    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check access permissions - allow users to access their own data
    if (req.user && req.user.role !== 'super_admin') {
      // Allow users to access their own data
      if (req.user.id === req.params.id || req.user._id?.toString() === req.params.id) {
        // User is accessing their own data - allow it
      } else if (user.factoryId?.toString() !== req.user.factoryId?.toString()) {
        // User is trying to access data from a different factory
        const response: ApiResponse = {
          success: false,
          error: 'Access denied',
          status: 403
        };
        return res.status(403).json(response);
      }
    }

    // Prepare user data with correct factoryId format
    const userData = user.toJSON();
    // Ensure factoryId is always a string, not a populated object
    const factoryId = user.factoryId?._id?.toString() || user.factoryId?.toString();

    const response: ApiResponse = {
      success: true,
      message: 'User retrieved successfully',
      status: 200,
      data: {
        ...userData,
        factoryId
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get user error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve user',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Create new user
router.post('/', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), sanitizeUserInput, auditUserCreation, validateUser, async (req, res) => {
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

    const { role, profile, password } = req.body;


    // Determine factoryId based on user role
    let factoryId = req.body.factoryId;
    if (req.user && (req.user.role === 'factory_admin' || req.user.role === 'supervisor')) {
      factoryId = req.user.factoryId;
    }


    // Supervisors can only create employees
    if (req.user && req.user.role === 'supervisor' && role !== 'employee') {
      const response: ApiResponse = {
        success: false,
        error: 'Supervisors can only create employees',
        status: 403
      };
      return res.status(403).json(response);
    }

    // Check for phone number uniqueness within the same factory
    const existingPhoneUser = await User.findOne({ 
      'profile.phone': profile.phone,
      factoryId: factoryId
    });
    
    if (existingPhoneUser) {
      const response: ApiResponse = {
        success: false,
        error: 'Phone number already exists in this factory',
        status: 409
      };
      return res.status(409).json(response);
    }



    // Get factory info for generating user ID
    const factory = await Factory.findById(factoryId);
    
    const factoryCode = factory?.name?.replace(/\s+/g, '').slice(0, 3) || 'FAC';


    // Generate user ID
    const userId = generateUserId(role, profile.phone, factoryCode);


    // Check if user ID already exists
    const existingUserId = await User.findOne({ username: userId });
    if (existingUserId) {
      const response: ApiResponse = {
        success: false,
        error: 'User ID already exists, please try again',
        status: 409
      };
      return res.status(409).json(response);
    }

    // Generate email only for factory_admin and super_admin
    // For supervisor and employee, email will be null
    // Use provided email if available, otherwise generate one
    let email = null;
    if (role === 'factory_admin' || role === 'super_admin') {
      email = req.body.email || generateEmailFromId(userId);
      
      // Check if generated email already exists
      if (email && !req.body.email) {
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
          // Generate a unique email by adding a suffix
          let counter = 1;
          let uniqueEmail: string = email as string;
          while (await User.findOne({ email: uniqueEmail })) {
            const emailStr = email as string;
            const [localPart, domain] = emailStr.split('@');
            uniqueEmail = `${localPart}${counter}@${domain}`;
            counter++;
          }
          email = uniqueEmail as any;
        }
      }
      
      // Check if provided email already exists
      if (email && req.body.email) {
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
          const response: ApiResponse = {
            success: false,
            error: 'Email already exists',
            status: 409
          };
          return res.status(409).json(response);
        }
      }
    }



    // Create user object - only include email for admin roles
    const userData: any = {
      username: userId,
      password: password, // Let the middleware hash it
      role,
      profile,
      factoryId,
      isActive: true,
      emailVerified: role === 'factory_admin' || role === 'super_admin'
    };

    // Only add email field for admin roles
    if (role === 'factory_admin' || role === 'super_admin') {
      userData.email = email;
    }

    const user = new User(userData);


    await user.save();


    const userResponse: any = user.toObject();
    delete userResponse.password;

    const response: ApiResponse = {
      success: true,
      message: 'User created successfully',
      status: 201,
      data: {
        ...userResponse,
        generatedCredentials: {
          userId,
          password: password, // Return the original password for display
          email: email || 'No email (login with User ID)'
        }
      }
    };

    // Broadcast WebSocket event for user creation
    if (factoryId) {
      wsServer.broadcastToFactory(factoryId.toString(), {
        type: 'user_created',
        data: { userId: user._id.toString(), user: userResponse }
      });
    }

    res.status(201).json(response);
  } catch (error: any) {
    console.error('Create user error:', error);
    
    // Check for specific database constraint errors
    if (error.code === 11000) {
      // MongoDB duplicate key error
      const field = Object.keys(error.keyPattern)[0];
      let errorMessage = 'Duplicate entry';
      
      if (field === 'email') {
        errorMessage = 'Email already exists';
      } else if (field === 'username') {
        errorMessage = 'Username already exists';
      }
      
      const response: ApiResponse = {
        success: false,
        error: errorMessage,
        status: 409
      };
      return res.status(409).json(response);
    }
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to create user',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Update user
router.put('/:id', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), validateMongoId, sanitizeUserInput, validateUserUpdate, async (req, res) => {
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

    const user = await User.findById(req.params.id);
    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to update this user
    if (req.user && (req.user.role === 'factory_admin' || req.user.role === 'supervisor') && user.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    const { email, username, role, profile } = req.body;

    // Supervisors can only update employees
    if (req.user.role === 'supervisor' && user.role !== 'employee') {
      const response: ApiResponse = {
        success: false,
        error: 'Supervisors can only update employee accounts',
        status: 403
      };
      return res.status(403).json(response);
    }

    // Supervisors cannot change user roles
    if (req.user.role === 'supervisor' && role && role !== user.role) {
      const response: ApiResponse = {
        success: false,
        error: 'Supervisors cannot change user roles',
        status: 403
      };
      return res.status(403).json(response);
    }

    // Supervisors cannot update email fields for employees
    if (req.user.role === 'supervisor' && email) {
      const response: ApiResponse = {
        success: false,
        error: 'Supervisors cannot update email fields for employees',
        status: 403
      };
      return res.status(403).json(response);
    }

    // Check if email already exists (excluding current user)
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ email, _id: { $ne: req.params.id } });
      if (existingEmail) {
        const response: ApiResponse = {
          success: false,
          error: 'Email already exists',
          status: 409
        };
        return res.status(409).json(response);
      }
    }

    // Check if username already exists (excluding current user)
    if (username && username !== user.username) {
      const existingUsername = await User.findOne({ username, _id: { $ne: req.params.id } });
      if (existingUsername) {
        const response: ApiResponse = {
          success: false,
          error: 'Username already exists',
          status: 409
        };
        return res.status(409).json(response);
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        email,
        username,
        role,
        profile,
        
        factoryId: req.user && req.user.role === 'super_admin' ? req.body.factoryId : req.user?.factoryId
      },
      { new: true, runValidators: true }
    ).select('-password');

    const response: ApiResponse = {
      success: true,
      message: 'User updated successfully',
      status: 200,
      data: updatedUser
    };

    // Broadcast WebSocket event for user update
    if (user.factoryId) {
      wsServer.broadcastToFactory(user.factoryId.toString(), {
        type: 'user_updated',
        data: { userId: updatedUser._id.toString(), user: updatedUser }
      });
    }

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Update user error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update user',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Delete user
router.delete('/:id', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), validateMongoId, auditUserDeletion, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to delete this user
    if (req.user && (req.user.role === 'factory_admin' || req.user.role === 'supervisor') && user.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    // Supervisors can only delete employees
    if (req.user.role === 'supervisor' && user.role !== 'employee') {
      const response: ApiResponse = {
        success: false,
        error: 'Supervisors can only delete employee accounts',
        status: 403
      };
      return res.status(403).json(response);
    }

    // Prevent deleting super admin
    if (user.role === 'super_admin') {
      const response: ApiResponse = {
        success: false,
        error: 'Cannot delete super admin',
        status: 403
      };
      return res.status(403).json(response);
    }

    const factoryId = user.factoryId?.toString();
    await User.findByIdAndDelete(req.params.id);

    const response: ApiResponse = {
      success: true,
      message: 'User deleted successfully',
      status: 200
    };

    // Broadcast WebSocket event for user deletion
    if (factoryId) {
      wsServer.broadcastToFactory(factoryId, {
        type: 'user_deleted',
        data: { userId: req.params.id }
      });
    }

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Delete user error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete user',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get employees (users with employee role)
router.get('/employees/list', authenticate, async (req, res) => {
  try {
    console.log('🔍 Employees endpoint - User:', {
      id: req.user?.id,
      role: req.user?.role,
      factoryId: req.user?.factoryId
    });
    
    let query: any = { role: 'employee' };
    
    if (req.user && req.user.role !== 'super_admin') {
      if (!req.user.factoryId) {
        console.error('❌ No factoryId found for user:', req.user);
        return res.status(400).json({
          success: false,
          error: 'User factory not found',
          status: 400
        });
      }
      query.factoryId = new mongoose.Types.ObjectId(req.user.factoryId);
    }



    console.log('🔍 Query for employees:', query);
    
    const employees = await User.find(query)
      .select('-password')
      .populate('factoryId', 'name')
      .sort({ 'profile.firstName': 1, 'profile.lastName': 1 });
    
    console.log('🔍 Found employees:', employees.length);



    // Fix factoryId format for all employees
    const employeesWithFixedFactoryId = employees.map(employee => {
      const employeeData = employee.toJSON();
      const factoryId = employee.factoryId?._id?.toString() || employee.factoryId?.toString();
      return {
        ...employeeData,
        factoryId
      };
    });

    const response: ApiResponse = {
      success: true,
      message: 'Employees retrieved successfully',
      status: 200,
      data: employeesWithFixedFactoryId
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('❌ Get employees error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    const response: ApiResponse = {
      success: false,
      error: `Failed to retrieve employees: ${error.message}`,
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get supervisors (users with supervisor role)
router.get('/supervisors/list', authenticate, async (req, res) => {
  try {
    let query: any = { role: 'supervisor' };
    
    if (req.user && req.user.role !== 'super_admin') {
      query.factoryId = new mongoose.Types.ObjectId(req.user.factoryId);
    }

    const supervisors = await User.find(query)
      .select('-password')
      .populate('factoryId', 'name')
      .sort({ 'profile.firstName': 1, 'profile.lastName': 1 });

    // Fix factoryId format for all supervisors
    const supervisorsWithFixedFactoryId = supervisors.map(supervisor => {
      const supervisorData = supervisor.toJSON();
      const factoryId = supervisor.factoryId?._id?.toString() || supervisor.factoryId?.toString();
      return {
        ...supervisorData,
        factoryId
      };
    });

    const response: ApiResponse = {
      success: true,
      message: 'Supervisors retrieved successfully',
      status: 200,
      data: supervisorsWithFixedFactoryId
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get supervisors error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve supervisors',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Reset user device
router.post('/:id/reset-device', authenticate, authorize('super_admin', 'factory_admin', 'supervisor'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Check if user has access to reset this user's device
    if (req.user && req.user.role === 'factory_admin' && user.factoryId?.toString() !== req.user.factoryId?.toString()) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    // For supervisors, check if they're in the same factory and the target user is an employee
    if (req.user && req.user.role === 'supervisor') {
      if (user.factoryId?.toString() !== req.user.factoryId?.toString()) {
        const response: ApiResponse = {
          success: false,
          error: 'Access denied - Can only reset devices for employees in your factory',
          status: 403
        };
        return res.status(403).json(response);
      }
      
      if (user.role !== 'employee') {
        const response: ApiResponse = {
          success: false,
          error: 'Access denied - Can only reset devices for employees',
          status: 403
        };
        return res.status(403).json(response);
      }
    }

    user.deviceId = undefined;
    await user.save();

    const response: ApiResponse = {
      success: true,
      message: 'User device reset successfully',
      status: 200
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Reset device error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to reset user device',
      status: 500
    };
    res.status(500).json(response);
  }
});


// Update user password
router.put('/:id/password', authenticate, validateMongoId, auditPasswordChange, validatePassword, async (req, res) => {
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

    const { password } = req.body;
    const userId = req.params.id;

    // Users can only change their own password unless they're admin
    if (req.user && req.user.role !== 'super_admin' && req.user.role !== 'factory_admin' && req.user.id !== userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied',
        status: 403
      };
      return res.status(403).json(response);
    }

    const user = await User.findById(userId);
    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found',
        status: 404
      };
      return res.status(404).json(response);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);
    user.password = hashedPassword;
    await user.save();

    const response: ApiResponse = {
      success: true,
      message: 'Password updated successfully',
      status: 200
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Update password error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update password',
      status: 500
    };
    res.status(500).json(response);
  }
});

export default router;
