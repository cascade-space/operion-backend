import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest, generateAccessToken, generateRefreshToken, verifyRefreshToken, verifyToken } from '@/middleware/auth';
import { ApiResponse, LoginRequest, LoginResponse, RefreshTokenRequest, RefreshTokenResponse } from '@/types';
import User from '@/models/User';
import Factory from '@/models/Factory';
import tokenBlacklistService from '@/services/tokenBlacklistService';
import env from '@/config/env';

/**
 * Convert JWT expiration string (e.g., "365d", "7d", "30d") to milliseconds
 * Supports: s (seconds), m (minutes), h (hours), d (days)
 */
const parseExpirationToMs = (expirationString: string): number => {
  const match = expirationString.match(/^(\d+)([smhd])$/);
  if (!match) {
    // Default to 365 days if parsing fails
    return 365 * 24 * 60 * 60 * 1000;
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  const multipliers: Record<string, number> = {
    s: 1000,              // seconds
    m: 60 * 1000,         // minutes
    h: 60 * 60 * 1000,    // hours
    d: 24 * 60 * 60 * 1000 // days
  };
  
  return value * (multipliers[unit] || multipliers.d);
};

/**
 * Get cookie options based on environment and request
 * With Vite proxy, frontend requests are same-origin, so we can use 'lax'
 */
const getCookieOptions = (req: Request): { httpOnly: boolean; secure: boolean; sameSite: 'strict' | 'lax' | 'none'; maxAge: number; path: string } => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  
  // For production, use strict with secure: true
  if (isProduction) {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: parseExpirationToMs(env.JWT_REFRESH_EXPIRES_IN),
      path: '/'
    };
  }
  
  // For localhost development (with Vite proxy, requests are same-origin)
  // Use sameSite: 'lax' which works for same-origin and top-level navigations
  if (isLocalhost) {
    return {
      httpOnly: true,
      secure: false, // HTTP is fine for localhost
      sameSite: 'lax', // Works for same-origin requests via proxy
      maxAge: parseExpirationToMs(env.JWT_REFRESH_EXPIRES_IN),
      path: '/'
    };
  }
  
  // Development but not localhost: use none with secure: true
  return {
    httpOnly: true,
    secure: true, // Required for sameSite: 'none'
    sameSite: 'none',
    maxAge: parseExpirationToMs(env.JWT_REFRESH_EXPIRES_IN),
    path: '/'
  };
};

// Login controller
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, userId, password, deviceId } = req.body;
    
    // Validate required fields
    if (!password) {
      const response: ApiResponse = {
        success: false,
        error: 'Password is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Find user by email or userId
    let user;
    if (email) {
      // First try to find by email field
      user = await User.findOne({ email }).select('+password');
      
      // If not found and the email looks like an email address, also try username field
      if (!user && email.includes('@')) {
        user = await User.findOne({ username: email }).select('+password');
      }
    } else if (userId) {
      user = await User.findOne({ username: userId }).select('+password');
    } else {
      const response: ApiResponse = {
        success: false,
        error: 'Email or User ID is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    if (!user || !user.isActive) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid credentials',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid credentials',
        status: 401
      };
      res.status(401).json(response);
      return;
    }


    // Device restriction for employees
    if (user.role === 'employee') {
      if (user.deviceId && user.deviceId !== deviceId) {
        const response: ApiResponse = {
          success: false,
          error: 'This employee account is already logged in on another device. Please logout from the other device first.',
          status: 403
        };
        res.status(403).json(response);
        return;
      }
      
      // Set device ID for employees (required)
      if (!deviceId) {
        const response: ApiResponse = {
          success: false,
          error: 'Device ID is required for employee login',
          status: 400
        };
        res.status(400).json(response);
        return;
      }
      
      user.deviceId = deviceId;
    } else {
      // For non-employees, update device ID if provided (optional)
      if (deviceId) {
        user.deviceId = deviceId;
      }
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Fetch user with factory information
    const populatedUser = await User.findById(user._id)
      .populate('factoryId', 'name');

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      factoryId: user.factoryId?.toString() || undefined
    });

    const refreshToken = generateRefreshToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      factoryId: user.factoryId?.toString() || undefined
    });

    // Populate factory info if user has factory
    let factory: any = null;
    if (user.factoryId) {
      const factoryDoc = await Factory.findById(user.factoryId).select('name status');
      factory = factoryDoc;
    }

    // Prepare user data with correct factoryId format
    const userData = populatedUser?.toJSON() || user.toJSON();
    // Ensure factoryId is always a string/ObjectId, not a populated object
    const factoryId = user.factoryId ? user.factoryId : undefined;
    // Add factory info to user object
    (userData as any).factory = factory;

    // Set refresh token as httpOnly cookie with proper settings for cross-origin
    res.cookie('refreshToken', refreshToken, getCookieOptions(req));

    // Return access token in response body, but NOT refresh token
    const response: ApiResponse<LoginResponse> = {
      success: true,
      data: {
        user: {
          ...userData,
          factoryId: factoryId as any
        } as any,
        accessToken
        // refreshToken removed from response for security
      },
      message: 'Login successful',
      status: 200
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Login error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Login failed',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Register controller (for super admin to create factory admins)
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, role, profile, factoryId, supervisorId } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const response: ApiResponse = {
        success: false,
        error: 'User with this email already exists',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Create new user
    const user = new User({
      email,
      password,
      role,
      profile,
      factoryId,
      supervisorId
    });

    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      factoryId: user.factoryId?.toString() || undefined
    });

    const refreshToken = generateRefreshToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      factoryId: user.factoryId?.toString() || undefined
    });

    // Set refresh token as httpOnly cookie with proper settings for cross-origin
    res.cookie('refreshToken', refreshToken, getCookieOptions(req));

    // Return access token in response body, but NOT refresh token
    const response: ApiResponse<LoginResponse> = {
      success: true,
      data: {
        user: user.toJSON(),
        accessToken
        // refreshToken removed from response for security
      },
      message: 'User registered successfully',
      status: 201
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Registration error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Registration failed',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Refresh token controller
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    // Read refresh token from cookies first, fallback to body for backward compatibility
    const oldRefreshToken = req.cookies.refreshToken || (req.body as RefreshTokenRequest).refreshToken;


    if (!oldRefreshToken) {
      const response: ApiResponse = {
        success: false,
        error: 'Refresh token is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Verify refresh token (this also checks blacklist)
    let decoded;
    try {
      decoded = await verifyRefreshToken(oldRefreshToken);
    } catch (error: any) {
      const response: ApiResponse = {
        success: false,
        error: error.message || 'Invalid or expired refresh token',
        status: 401
      };
      res.status(401).json(response);
      return;
    }
    
    if (decoded.type !== 'refresh') {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid token type',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    // Check if user exists and is active
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found or inactive',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      factoryId: user.factoryId?.toString() || undefined
    });

    const newRefreshToken = generateRefreshToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      factoryId: user.factoryId?.toString() || undefined
    });

    // Blacklist the old refresh token
    try {
      await tokenBlacklistService.blacklistToken(oldRefreshToken, decoded);
    } catch (error) {
      console.error('Failed to blacklist old refresh token:', error);
      // Continue even if blacklisting fails
    }

    // Set new refresh token as httpOnly cookie with proper settings for cross-origin
    res.cookie('refreshToken', newRefreshToken, getCookieOptions(req));

    // Return only access token in response body
    const response: ApiResponse<RefreshTokenResponse> = {
      success: true,
      data: {
        accessToken: newAccessToken
        // refreshToken removed from response for security
      },
      message: 'Token refreshed successfully',
      status: 200
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Token refresh error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Token refresh failed',
      status: 401
    };
    res.status(401).json(response);
  }
};

// Logout controller
export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get token from request header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        // Verify and decode token to get payload for blacklisting
        const decoded = verifyToken(token);
        
        // Blacklist the access token
        await tokenBlacklistService.blacklistToken(token, decoded);
        
        // Blacklist refresh token from cookie or body
        const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
        if (refreshToken) {
          try {
            const refreshDecoded = await verifyRefreshToken(refreshToken);
            await tokenBlacklistService.blacklistToken(refreshToken, refreshDecoded);
          } catch (error) {
            // Refresh token might be invalid, but that's ok
            console.warn('Could not blacklist refresh token during logout:', error);
          }
        }
      } catch (error) {
        // Token might be invalid, but continue with logout
        console.warn('Token verification failed during logout:', error);
      }
    }

    // Clear refresh token cookie (must match the settings used to set it)
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'none',
      path: '/'
    });

    // Clear device ID for employees when they logout
    if (req.user && req.user.role === 'employee') {
      await User.findByIdAndUpdate(req.user.id, {
        deviceId: null,
        lastLogin: null
      });
    }

    const response: ApiResponse = {
      success: true,
      message: 'Logout successful',
      status: 200
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Logout error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Logout failed',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Validate token controller
export const validateToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid token',
        status: 401
      };
      res.status(401).json(response);
      return;
    }

    const response: ApiResponse = {
      success: true,
      data: {
        valid: true,
        user: req.user.toJSON()
      },
      status: 200
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Token validation error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Token validation failed',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Reset password request controller
export const resetPasswordRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists or not for security
      const response: ApiResponse = {
        success: true,
        message: 'If the email exists, a password reset link has been sent',
        status: 200
      };
      res.status(200).json(response);
      return;
    }

    // Generate reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();

    // In a real application, send email with reset link
    // NOTE: In production, the resetToken should be sent via email only, never in the API response
    // TODO: Implement email sending service to send resetToken to user's email
    
    const response: ApiResponse = {
      success: true,
      message: 'If the email exists, a password reset link has been sent',
      status: 200
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Password reset request error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Password reset request failed',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Reset password controller
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword } = req.body;

    // Find user with valid reset token
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid or expired reset token',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Update password
    user.password = newPassword;
    user.passwordResetToken = null as any;
    user.passwordResetExpires = null as any;
    await user.save();

    const response: ApiResponse = {
      success: true,
      message: 'Password reset successful',
      status: 200
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Password reset error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Password reset failed',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Get current user profile
export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Fetch user with factory information
    const user = await User.findById(req.user.id)
      .populate('factoryId', 'name');

    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Prepare user data with correct factoryId format
    const userData = user.toJSON();
    // Ensure factoryId is always a string, not a populated object
    const factoryId = user.factoryId?._id?.toString() || user.factoryId?.toString();

    const response: ApiResponse = {
      success: true,
      data: {
        ...userData,
        factoryId
      },
      status: 200
    };

    res.status(200).json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: 'Failed to get profile',
      status: 500
    };
    res.status(500).json(response);
  }
};

// Update user profile
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    const { profile } = req.body;

    if (!profile) {
      const response: ApiResponse = {
        success: false,
        error: 'Profile data is required',
        status: 400
      };
      res.status(400).json(response);
      return;
    }

    // Fetch user fresh from database to ensure we have a full Mongoose document
    const user = await User.findById(req.user.id);
    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found',
        status: 404
      };
      res.status(404).json(response);
      return;
    }

    // Update profile fields
    if (profile.firstName) user.profile.firstName = profile.firstName;
    if (profile.lastName) user.profile.lastName = profile.lastName;
    if (profile.phone) user.profile.phone = profile.phone;
    if (profile.avatar !== undefined) user.profile.avatar = profile.avatar;
    if (profile.address) {
      user.profile.address = { ...user.profile.address, ...profile.address };
    }

    // Mark the profile field as modified to ensure Mongoose saves it
    user.markModified('profile');
    await user.save();

    const response: ApiResponse = {
      success: true,
      data: user.toJSON(),
      message: 'Profile updated successfully',
      status: 200
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Update profile error:', error);
    const response: ApiResponse = {
      success: false,
      error: error.message || 'Failed to update profile',
      status: 500
    };
    res.status(500).json(response);
  }
};
