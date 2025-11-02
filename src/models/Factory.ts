import mongoose, { Schema, Document, Model } from 'mongoose';
import { IFactory, IAddress, IGeofence, ISubscription, IShift, IFactorySettings, IFactoryMetadata } from '@/types';

export interface FactoryDocument extends IFactory {}

export interface FactoryModel extends Model<FactoryDocument> {
  findActive(): Promise<FactoryDocument[]>;
  findByPlan(plan: string): Promise<FactoryDocument[]>;
}

const factorySchema = new Schema<FactoryDocument>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  address: {
    street: {
      type: String,
      required: true,
      trim: true
    },
    city: {
      type: String,
      required: true,
      trim: true
    },
    state: {
      type: String,
      required: true,
      trim: true
    },
    country: {
      type: String,
      required: true,
      trim: true
    },
    zipCode: {
      type: String,
      required: true,
      trim: true
    }
  },
  geofence: {
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180
    },
    radius: {
      type: Number,
      required: true,
      min: 10,
      max: 1000,
      default: 100
    }
  },
  adminId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false // Not required during registration
  },
  adminEmail: {
    type: String,
    required: false, // Required during registration, removed after approval
    trim: true,
    lowercase: true
  },
  adminProfile: {
    firstName: {
      type: String,
      required: false,
      trim: true
    },
    lastName: {
      type: String,
      required: false,
      trim: true
    },
    phone: {
      type: String,
      required: false,
      trim: true
    },
    address: {
      type: String,
      required: false,
      trim: true
    }
  },
  adminCredentials: {
    username: {
      type: String,
      required: false,
      trim: true
    },
    password: {
      type: String,
      required: false
    }
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  subscription: {
    plan: {
      type: String,
      enum: ['basic', 'pro', 'enterprise'] as const,
      default: 'basic'
    },
    validUntil: {
      type: Date,
      required: true
    },
    maxUsers: {
      type: Number,
      required: true,
      min: 1
    },
    features: [{
      type: String,
      enum: ['basic_reporting', 'advanced_analytics', 'real_time_monitoring', 'api_access', 'custom_integrations']
    }]
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'suspended', 'rejected'] as const,
    default: 'pending'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    timezone: {
      type: String,
      default: 'UTC'
    },
    workingHours: {
      start: {
        type: String,
        default: '08:00'
      },
      end: {
        type: String,
        default: '17:00'
      }
    },
    shifts: [{
      name: {
        type: String,
        required: true
      },
      startTime: {
        type: String,
        required: true
      },
      endTime: {
        type: String,
        required: true
      },
      isActive: {
        type: Boolean,
        default: true
      }
    }],
    geofencingEnabled: {
      type: Boolean,
      default: true
    },
    photoRequired: {
      type: Boolean,
      default: true
    },
    locationRequired: {
      type: Boolean,
      default: true
    }
  },
  metadata: {
    industry: String,
    size: String,
    established: Date,
    description: String,
    website: String,
    contactEmail: String,
    contactPhone: String
  }
}, {
  timestamps: true
});

// Indexes for performance
factorySchema.index({ status: 1, isActive: 1 });
factorySchema.index({ isActive: 1, createdAt: -1 }); // Active factory queries
factorySchema.index({ adminId: 1 }); // Admin lookup
factorySchema.index({ 'subscription.validUntil': 1 });

// Virtual for full address
factorySchema.virtual('fullAddress').get(function(this: FactoryDocument): string {
  const addr = this.address;
  return `${addr.street}, ${addr.city}, ${addr.state} ${addr.zipCode}, ${addr.country}`;
});

// Instance method to check if subscription is active
factorySchema.methods.isSubscriptionActive = function(this: FactoryDocument): boolean {
  return this.subscription && this.subscription.validUntil > new Date();
};

// Instance method to check if user limit is reached
factorySchema.methods.canAddUser = function(this: FactoryDocument, currentUserCount: number): boolean {
  return this.isSubscriptionActive() && currentUserCount < this.subscription.maxUsers;
};

// Instance method to check if location is within geofence
factorySchema.methods.isWithinGeofence = function(this: FactoryDocument, latitude: number, longitude: number): boolean {
  if (!this.settings.geofencingEnabled) return true;
  
  const R = 6371; // Earth's radius in kilometers
  const lat1 = this.geofence.latitude * Math.PI / 180;
  const lat2 = latitude * Math.PI / 180;
  const deltaLat = (latitude - this.geofence.latitude) * Math.PI / 180;
  const deltaLon = (longitude - this.geofence.longitude) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c * 1000; // Convert to meters

  return distance <= this.geofence.radius;
};

// Static method to find active factories
factorySchema.statics.findActive = function(): Promise<FactoryDocument[]> {
  return this.find({ isActive: true, status: 'approved' });
};

// Static method to find factories by subscription plan
factorySchema.statics.findByPlan = function(plan: string): Promise<FactoryDocument[]> {
  return this.find({ 'subscription.plan': plan, isActive: true });
};

const Factory = mongoose.model<FactoryDocument, FactoryModel>('Factory', factorySchema);

export default Factory;
