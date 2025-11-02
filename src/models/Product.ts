import mongoose, { Schema, Document, Model } from 'mongoose';
import { IProduct, IProductSpecifications, IPricing, IInventory, IQuality, IProductImage, IProductMetadata } from '@/types';

export interface ProductDocument extends IProduct {}

export interface ProductModel extends Model<ProductDocument> {
  findByFactory(factoryId: mongoose.Types.ObjectId, options?: { search?: string }): Promise<ProductDocument[]>;
  findByProcess(processId: mongoose.Types.ObjectId): Promise<ProductDocument[]>;
}

const productSchema = new Schema<ProductDocument>({
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
  code: {
    type: String,
    required: true,
    trim: true,
    maxlength: 20,
    uppercase: true
  },
  dailyTarget: {
    type: Number,
    default: 0,
    min: 0
  },
  processes: [{
    processId: {
      type: Schema.Types.ObjectId,
      ref: 'Process',
      required: true
    },
    order: {
      type: Number,
      required: true
    }
  }]
}, {
  timestamps: true
});

// Compound index for factory-specific product codes
productSchema.index({ factoryId: 1, code: 1 }, { unique: true });
productSchema.index({ factoryId: 1 });
productSchema.index({ factoryId: 1, createdAt: -1 }); // Date-based queries
productSchema.index({ 'processes.processId': 1 });

// Virtual for full product name
productSchema.virtual('fullName').get(function(this: ProductDocument): string {
  return `${this.code} - ${this.name}`;
});

// Virtual to get process IDs
productSchema.virtual('getProcessIds').get(function(this: ProductDocument): string[] {
  return this.processes?.map(p => p.processId.toString()) || [];
});



// Static method to find products by factory
productSchema.statics.findByFactory = function(factoryId: mongoose.Types.ObjectId, options: { search?: string } = {}): Promise<ProductDocument[]> {
  const query: any = { factoryId };
  if (options.search) {
    query.$or = [
      { name: { $regex: options.search, $options: 'i' } },
      { code: { $regex: options.search, $options: 'i' } }
    ];
  }
  return this.find(query).sort({ createdAt: -1 });
};

// Static method to find products by process
productSchema.statics.findByProcess = function(processId: mongoose.Types.ObjectId): Promise<ProductDocument[]> {
  return this.find({ 'processes.processId': processId }).sort({ createdAt: -1 });
};

const Product = mongoose.model<ProductDocument, ProductModel>('Product', productSchema);

export default Product;
