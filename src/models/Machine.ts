import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMachine {
  _id: mongoose.Types.ObjectId;
  factoryId: mongoose.Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MachineDocument extends IMachine {}

export interface MachineModel extends Model<MachineDocument> {
  findByFactory(factoryId: mongoose.Types.ObjectId): Promise<MachineDocument[]>;
}

const machineSchema = new Schema<MachineDocument>({
  factoryId: {
    type: Schema.Types.ObjectId,
    ref: 'Factory',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  }
}, {
  timestamps: true
});

// Indexes
machineSchema.index({ factoryId: 1 });
machineSchema.index({ factoryId: 1, createdAt: -1 }); // Date-based queries

// Static method to find machines by factory
machineSchema.statics.findByFactory = function(factoryId: mongoose.Types.ObjectId): Promise<MachineDocument[]> {
  return this.find({ factoryId }).sort({ name: 1 });
};

const Machine = mongoose.model<MachineDocument, MachineModel>('Machine', machineSchema);

export default Machine;
