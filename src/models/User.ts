import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { IUser, UserRole, IUserProfile } from '@/types';

export interface UserDocument extends IUser {}

export interface UserModel extends Model<UserDocument> {
  findByFactory(factoryId: mongoose.Types.ObjectId): Promise<UserDocument[]>;
  findBySupervisor(supervisorId: mongoose.Types.ObjectId): Promise<UserDocument[]>;
}

const userSchema = new Schema<UserDocument>({
  email: {
    type: String,
    required: function(this: UserDocument) {
      return this.role === 'super_admin' || this.role === 'factory_admin';
    },
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['super_admin', 'factory_admin', 'supervisor', 'employee'] as UserRole[],
    required: true
  },
  factoryId: {
    type: Schema.Types.ObjectId,
    ref: 'Factory',
    required: function(this: UserDocument) {
      return this.role !== 'super_admin';
    },
    validate: {
      validator: function(this: UserDocument, value: any) {
        if (this.role === 'super_admin') return true;
        return value != null;
      },
      message: 'Factory ID is required for non-super admin users'
    }
  },
  supervisorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false // Made optional since employees will select their process on first login
  },
  profile: {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    phone: {
      type: String,
      required: true,
      match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
    },
    avatar: {
      type: String,
      default: null
    },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    }
  },
  deviceId: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  passwordResetToken: String,
  passwordResetExpires: Date,
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret: any) {
      delete ret.password;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationExpires;
      return ret;
    }
  }
});

// Indexes for performance
userSchema.index({ factoryId: 1, role: 1 });
userSchema.index({ supervisorId: 1 });
userSchema.index({ isActive: 1 });
// Compound index to ensure phone numbers are unique per factory
userSchema.index({ factoryId: 1, 'profile.phone': 1 }, { unique: true });

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Skip if password is not modified or if it's already hashed
  if (!this.isModified('password')) return next();
  
  // Check if password is already hashed (starts with $2a$ or $2b$)
  if (this.password && (this.password.startsWith('$2a$') || this.password.startsWith('$2b$'))) {
    return next();
  }
  
  // Only hash if password is a plain text string
  if (this.password && typeof this.password === 'string' && this.password.length > 0) {
    try {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
      next();
    } catch (error) {
      next(error as Error);
    }
  } else {
    next();
  }
});

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Instance method to generate password reset token
userSchema.methods.generatePasswordResetToken = function(): string {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return resetToken;
};

// Instance method to generate email verification token
userSchema.methods.generateEmailVerificationToken = function(): string {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  return verificationToken;
};

// Static method to find users by factory
userSchema.statics.findByFactory = function(factoryId: mongoose.Types.ObjectId): Promise<UserDocument[]> {
  return this.find({ factoryId, isActive: true });
};

// Static method to find employees by supervisor
userSchema.statics.findBySupervisor = function(supervisorId: mongoose.Types.ObjectId): Promise<UserDocument[]> {
  return this.find({ supervisorId, role: 'employee', isActive: true });
};

const User = mongoose.model<UserDocument, UserModel>('User', userSchema);

export default User;
