import mongoose, { Schema, Document, Model } from 'mongoose';
import { IWorkEntry } from '@/types';

export interface WorkEntryDocument extends IWorkEntry {}

export interface WorkEntryModel extends Model<WorkEntryDocument> {
  findByEmployee(employeeId: mongoose.Types.ObjectId, date?: Date): Promise<WorkEntryDocument[]>;
  findByFactory(factoryId: mongoose.Types.ObjectId, date?: Date): Promise<WorkEntryDocument[]>;
  findPendingValidations(factoryId: mongoose.Types.ObjectId): Promise<WorkEntryDocument[]>;
  findByProcess(processId: mongoose.Types.ObjectId, date?: Date): Promise<WorkEntryDocument[]>;
}

const workEntrySchema = new Schema<WorkEntryDocument>({
  employeeId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  supervisorId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  factoryId: {
    type: Schema.Types.ObjectId,
    ref: 'Factory',
    required: true
  },
  attendanceId: {
    type: Schema.Types.ObjectId,
    ref: 'Attendance',
    required: false
  },
  processId: {
    type: Schema.Types.ObjectId,
    ref: 'Process',
    required: true
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  machineId: {
    type: Schema.Types.ObjectId,
    ref: 'Machine'
  },
  machineCode: {
    type: String,
    required: false
  },
  shiftType: {
    type: String,
    required: false,
    trim: true
  },
  achieved: {
    type: Number,
    required: true,
    min: 0
  },
  rejected: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  photo: {
    type: String,
    required: false
  },
  validationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'] as const,
    default: 'pending'
  },
  validatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  validatedAt: {
    type: Date
  },
  validationNotes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  reasonForLessProduction: {
    type: String,
    trim: true,
    maxlength: 500
  },
  targetQuantity: {
    type: Number,
    required: true,
    min: 0
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: false
  },
  checkinTime: {
    type: Date,
    required: false
  },
  checkoutTime: {
    type: Date,
    required: false
  },
  workHours: {
    type: Number,
    required: false,
    min: 0
  },
  stageOrder: {
    type: Number,
    required: false,
    min: 1
  },
  location: {
    latitude: {
      type: Number,
      required: false
    },
    longitude: {
      type: Number,
      required: false
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
workEntrySchema.index({ employeeId: 1, createdAt: -1 });
workEntrySchema.index({ factoryId: 1, createdAt: -1 });
workEntrySchema.index({ processId: 1, createdAt: -1 });
workEntrySchema.index({ processId: 1, productId: 1, createdAt: -1 });
// Compound indexes for aggregations
workEntrySchema.index({ factoryId: 1, productId: 1, processId: 1, createdAt: -1 });
workEntrySchema.index({ factoryId: 1, validationStatus: 1, createdAt: -1 });
workEntrySchema.index({ validationStatus: 1 });
workEntrySchema.index({ attendanceId: 1 });
// Indexes for process status calculation
workEntrySchema.index({ productId: 1, stageOrder: 1 });
workEntrySchema.index({ productId: 1, stageOrder: 1, createdAt: -1 });

// Virtual for total production
workEntrySchema.virtual('totalProduction').get(function(this: WorkEntryDocument): number {
  return this.achieved + this.rejected;
});

// Virtual for efficiency rate
workEntrySchema.virtual('efficiencyRate').get(function(this: WorkEntryDocument): number {
  const total = this.achieved + this.rejected;
  if (total === 0) return 0;
  return ((this.achieved / total) * 100);
});

// Virtual for rejection rate
workEntrySchema.virtual('rejectionRate').get(function(this: WorkEntryDocument): number {
  const total = this.achieved + this.rejected;
  if (total === 0) return 0;
  return ((this.rejected / total) * 100);
});

// Virtual for total work hours (calculated from start to end time)
workEntrySchema.virtual('totalWorkHours').get(function(this: WorkEntryDocument): number {
  if (!this.startTime || !this.endTime) return 0;
  const duration = this.endTime.getTime() - this.startTime.getTime();
  return duration / (1000 * 60 * 60); // Convert to hours
});

// Instance method to validate work entry
workEntrySchema.methods.validateEntry = function(
  this: WorkEntryDocument, 
  validatedBy: mongoose.Types.ObjectId, 
  status: 'approved' | 'rejected', 
  notes?: string
): Promise<WorkEntryDocument> {
  this.validationStatus = status;
  this.validatedBy = validatedBy;
  this.validatedAt = new Date();
  if (notes) this.validationNotes = notes;
  return this.save();
};

// Instance method to update production data
workEntrySchema.methods.updateProduction = function(
  this: WorkEntryDocument, 
  achieved: number, 
  rejected: number
): Promise<WorkEntryDocument> {
  this.achieved = achieved;
  this.rejected = rejected;
  return this.save();
};

// Static method to find work entries by employee
workEntrySchema.statics.findByEmployee = function(employeeId: mongoose.Types.ObjectId, date?: Date): Promise<WorkEntryDocument[]> {
  const query: any = { employeeId };
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    query.createdAt = { $gte: startOfDay, $lte: endOfDay };
  }
  return this.find(query)
    .populate(['processId', 'productId', 'attendanceId'])
    .sort({ createdAt: -1 });
};

// Static method to find work entries by factory
workEntrySchema.statics.findByFactory = function(factoryId: mongoose.Types.ObjectId, date?: Date): Promise<WorkEntryDocument[]> {
  const query: any = { factoryId };
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    query.createdAt = { $gte: startOfDay, $lte: endOfDay };
  }
  return this.find(query)
    .populate(['employeeId', 'processId', 'productId', 'attendanceId'])
    .sort({ createdAt: -1 });
};

// Static method to find pending validations
workEntrySchema.statics.findPendingValidations = function(factoryId: mongoose.Types.ObjectId): Promise<WorkEntryDocument[]> {
  return this.find({
    factoryId,
    validationStatus: 'pending'
  })
    .populate(['employeeId', 'processId', 'productId'])
    .sort({ createdAt: 1 });
};

// Static method to find work entries by process
workEntrySchema.statics.findByProcess = function(processId: mongoose.Types.ObjectId, date?: Date): Promise<WorkEntryDocument[]> {
  const query: any = { processId };
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    query.createdAt = { $gte: startOfDay, $lte: endOfDay };
  }
  return this.find(query)
    .populate(['employeeId', 'productId'])
    .sort({ createdAt: -1 });
};

const WorkEntry = mongoose.model<WorkEntryDocument, WorkEntryModel>('WorkEntry', workEntrySchema);

export default WorkEntry;
