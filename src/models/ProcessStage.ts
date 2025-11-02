import mongoose, { Schema, Document } from 'mongoose';

export interface ProcessStageDocument extends Document {
  factoryId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  processId: mongoose.Types.ObjectId;
  stageOrder: number;
  date: Date;
  achievedQuantity: number;
  rejectedQuantity: number;
  availableQuantity: number; // Available for next stage
  isLocked: boolean;
  lockedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const processStageSchema = new Schema<ProcessStageDocument>({
  factoryId: {
    type: Schema.Types.ObjectId,
    ref: 'Factory',
    required: true
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  processId: {
    type: Schema.Types.ObjectId,
    ref: 'Process',
    required: true
  },
  stageOrder: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    }
  },
  achievedQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  rejectedQuantity: {
    type: Number,
    default: 0,
    min: 0
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
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
processStageSchema.index({ factoryId: 1, date: -1 });
processStageSchema.index({ productId: 1, processId: 1, date: -1 });
processStageSchema.index({ processId: 1, stageOrder: 1, date: -1 });
processStageSchema.index({ productId: 1, stageOrder: 1, date: -1 });

// Compound index for unique constraint
processStageSchema.index({ 
  factoryId: 1, 
  productId: 1, 
  processId: 1, 
  date: 1 
}, { unique: true });

// Index for batch queries
processStageSchema.index({ 
  factoryId: 1, 
  productId: 1, 
  date: 1 
});

// Index for sorting by stage order
processStageSchema.index({ stageOrder: 1, date: -1 });

export default mongoose.model<ProcessStageDocument>('ProcessStage', processStageSchema);
