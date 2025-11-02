import mongoose, { Schema, Document, Model } from 'mongoose';
import { IProcess, IProcessSpecifications, IProcessQuality, IProcessDependency, IProcessMetrics, IProcessSettings, IInspectionPoint } from '@/types';

export interface ProcessDocument extends IProcess {}

export interface ProcessModel extends Model<ProcessDocument> {
  findByFactory(factoryId: mongoose.Types.ObjectId): Promise<ProcessDocument[]>;
}

const processSchema = new Schema<ProcessDocument>({
  factoryId: {
    type: Schema.Types.ObjectId,
    ref: 'Factory',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  availableQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  lockedAt: {
    type: Date,
    default: null
  },
  dailyTarget: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Indexes
processSchema.index({ factoryId: 1 });
processSchema.index({ factoryId: 1, createdAt: -1 }); // Date-based queries
processSchema.index({ factoryId: 1, order: 1 }); // Ordered process queries

// Static method to find processes by factory
processSchema.statics.findByFactory = function(factoryId: mongoose.Types.ObjectId): Promise<ProcessDocument[]> {
  return this.find({ factoryId }).sort({ order: 1, createdAt: 1 });
};

const Process = mongoose.model<ProcessDocument, ProcessModel>('Process', processSchema);

export default Process;
