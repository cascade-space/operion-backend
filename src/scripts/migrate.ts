import mongoose from 'mongoose';
import { connectDB } from '../config/database';
import WorkEntry from '../models/WorkEntry';
import Machine from '../models/Machine';
import Process from '../models/Process';

const migrateDatabase = async () => {
  try {
    console.log('🔄 Starting database migration...');
    
    // Connect to database
    await connectDB();
    
    // 1. Remove sizeCode field from WorkEntry collection
    console.log('📝 Removing sizeCode field from WorkEntry collection...');
    await WorkEntry.updateMany(
      {},
      { $unset: { sizeCode: 1 } }
    );
    console.log('✅ Removed sizeCode field from WorkEntry collection');
    
    // 2. Remove sizeId field from Machine collection
    console.log('📝 Removing sizeId field from Machine collection...');
    await Machine.updateMany(
      {},
      { $unset: { sizeId: 1 } }
    );
    console.log('✅ Removed sizeId field from Machine collection');
    
    // 3. Update process names to ordered format
    console.log('📝 Updating process names to ordered format...');
    
    // Get all processes grouped by product
    const processes = await Process.find({}).populate('productId');
    
    // Group processes by product
    const processesByProduct: { [key: string]: any[] } = {};
    processes.forEach(process => {
      const productId = (process as any).productId?._id?.toString() || process._id.toString();
      if (!processesByProduct[productId]) {
        processesByProduct[productId] = [];
      }
      processesByProduct[productId].push(process);
    });
    
    // Update process names for each product
    for (const productId in processesByProduct) {
      const productProcesses = processesByProduct[productId];
      
      // Sort by creation date to maintain order
      productProcesses.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      // Update names to ordered format
      for (let i = 0; i < productProcesses.length; i++) {
        const process = productProcesses[i];
        let newName;
        
        if (i === 0) {
          newName = '1st Process';
        } else if (i === 1) {
          newName = '2nd Process';
        } else if (i === 2) {
          newName = '3rd Process';
        } else {
          newName = `${i + 1}th Process`;
        }
        
        await Process.findByIdAndUpdate(process._id, { name: newName });
        console.log(`✅ Updated process ${process._id} to "${newName}"`);
      }
    }
    
    // 4. Drop the sizes collection
    console.log('📝 Dropping sizes collection...');
    try {
      await mongoose.connection.db.collection('sizes').drop();
      console.log('✅ Dropped sizes collection');
    } catch (error) {
      console.log('ℹ️ Sizes collection may not exist or already dropped');
    }
    
    console.log('🎉 Database migration completed successfully!');
    console.log('\n📋 Migration Summary:');
    console.log('- Removed sizeCode field from WorkEntry collection');
    console.log('- Removed sizeId field from Machine collection');
    console.log('- Updated process names to ordered format (1st Process, 2nd Process, etc.)');
    console.log('- Dropped sizes collection');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  migrateDatabase()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

export default migrateDatabase;
