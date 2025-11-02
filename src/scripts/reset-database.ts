import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '@/models/User';
import Factory from '@/models/Factory';
import Product from '@/models/Product';
import Process from '@/models/Process';
import Machine from '@/models/Machine';
import Attendance from '@/models/Attendance';
import WorkEntry from '@/models/WorkEntry';

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/operion';
    await mongoose.connect(mongoUri);
    console.log('MongoDB Connected:', mongoUri.replace(/\/\/.*@/, '//***:***@'));
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const resetDatabase = async () => {
  try {
    console.log('🗑️  Starting database reset...');
    
    // Connect to database
    await connectDB();
    
    // Get all super admin users before deletion
    const superAdmins = await User.find({ role: 'super_admin' }).select('_id email username profile');
    console.log(`👑 Found ${superAdmins.length} super admin(s) to preserve:`);
    superAdmins.forEach(admin => {
      console.log(`   - ${admin.email || admin.username} (${admin.profile.firstName} ${admin.profile.lastName})`);
    });
    
    // Delete all data except super admins
    console.log('\n🧹 Clearing all data...');
    
    // Delete all collections except users (we'll handle users separately)
    const collections = [
      { model: Factory, name: 'Factories' },
      { model: Product, name: 'Products' },
      { model: Process, name: 'Processes' },
      { model: Machine, name: 'Machines' },
      { model: Attendance, name: 'Attendance Records' },
      { model: WorkEntry, name: 'Work Entries' }
    ];
    
    for (const { model, name } of collections) {
      const count = await model.countDocuments();
      if (count > 0) {
        await (model as any).deleteMany({});
        console.log(`   ✅ Deleted ${count} ${name}`);
      } else {
        console.log(`   ⚪ No ${name} to delete`);
      }
    }
    
    // Delete all users except super admins
    const userCount = await User.countDocuments();
    const nonSuperAdminCount = await User.countDocuments({ role: { $ne: 'super_admin' } });
    
    if (nonSuperAdminCount > 0) {
      await User.deleteMany({ role: { $ne: 'super_admin' } });
      console.log(`   ✅ Deleted ${nonSuperAdminCount} non-super admin users`);
    } else {
      console.log(`   ⚪ No non-super admin users to delete`);
    }
    
    // Verify super admins are still there
    const remainingSuperAdmins = await User.find({ role: 'super_admin' });
    console.log(`\n👑 Preserved ${remainingSuperAdmins.length} super admin(s):`);
    remainingSuperAdmins.forEach(admin => {
      console.log(`   - ${admin.email || admin.username} (${admin.profile.firstName} ${admin.profile.lastName})`);
    });
    
    // Get final counts
    const finalCounts = {
      users: await User.countDocuments(),
      factories: await Factory.countDocuments(),
      products: await Product.countDocuments(),
      processes: await Process.countDocuments(),
      machines: await Machine.countDocuments(),
      attendance: await Attendance.countDocuments(),
      workEntries: await WorkEntry.countDocuments()
    };
    
    console.log('\n📊 Final database state:');
    Object.entries(finalCounts).forEach(([collection, count]) => {
      console.log(`   ${collection}: ${count}`);
    });
    
    console.log('\n✅ Database reset completed successfully!');
    console.log('🔑 Super admin credentials preserved:');
    superAdmins.forEach(admin => {
      console.log(`   Email: ${admin.email || 'N/A'}`);
      console.log(`   Username: ${admin.username || 'N/A'}`);
      console.log('   ---');
    });
    
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
};

// Run the reset if this file is executed directly
if (process.argv[1] && process.argv[1].endsWith('reset-database.ts')) {
  resetDatabase();
}

export default resetDatabase;
