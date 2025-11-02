import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/database';
import Factory from '../models/Factory';
import User from '../models/User';
import Product from '../models/Product';
import Process from '../models/Process';
import Machine from '../models/Machine';
import WorkEntry from '../models/WorkEntry';
import Attendance from '../models/Attendance';

const seedData = async () => {
  try {
    console.log('🌱 Starting database seeding...');
    
    // Connect to database
    await connectDB();
    
    // Clear existing data (optional - be careful in production)
    console.log('🧹 Clearing existing data...');
    await Factory.deleteMany({});
    await User.deleteMany({});
    await Product.deleteMany({});
    await Process.deleteMany({});
    await Machine.deleteMany({});
    await WorkEntry.deleteMany({});
    await Attendance.deleteMany({});
    
    
    // Create a factory
    console.log('🏭 Creating factory...');
    const factory = new Factory({
      name: 'Sanagam Manufacturing',
      address: {
        street: '123 Industrial Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        zipCode: '400001'
      },
      geofence: {
        latitude: 19.0760,
        longitude: 72.8777,
        radius: 100
      },
      status: 'approved',
      adminEmail: 'admin@sanagam.com',
      adminProfile: {
        firstName: 'Factory',
        lastName: 'Admin',
        phone: '+91-9876543210'
      },
      subscription: {
        plan: 'enterprise',
        maxUsers: 100,
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });
    await factory.save();
    
    // Create super admin
    console.log('👑 Creating super admin...');
    const superAdmin = new User({
      email: 'vaibhavbg8080@gmail.com',
      username: 'superadmin',
      password: await bcrypt.hash('9902850039', 12),
      role: 'super_admin',
      profile: {
        firstName: 'Super',
        lastName: 'Admin',
        phone: '+91-9902850039'
      },
      isActive: true,
      emailVerified: true
    });
    await superAdmin.save();
    
    // Create factory admin
    console.log('👨‍💼 Creating factory admin...');
    const factoryAdmin = new User({
      email: 'admin@sanagam.com',
      username: 'admin',
      password: await bcrypt.hash('admin123', 12),
      role: 'factory_admin',
      factoryId: factory._id,
      profile: {
        firstName: 'Factory',
        lastName: 'Admin',
        phone: '+91-9876543210'
      },
      isActive: true,
      emailVerified: true
    });
    await factoryAdmin.save();
    
    // Create additional factory admin with common misspelling
    console.log('👨‍💼 Creating additional factory admin...');
    const factoryAdmin2 = new User({
      email: 'admin@sangam.com',
      username: 'admin2',
      password: await bcrypt.hash('admin123', 12),
      role: 'factory_admin',
      factoryId: factory._id,
      profile: {
        firstName: 'Factory',
        lastName: 'Admin',
        phone: '+91-9876543211'
      },
      isActive: true,
      emailVerified: true
    });
    await factoryAdmin2.save();
    
    // Create supervisor
    console.log('👨‍🔧 Creating supervisor...');
    const supervisor = new User({
      username: 'supervisor001',
      password: await bcrypt.hash('supervisor123', 12),
      role: 'supervisor',
      factoryId: factory._id,
      profile: {
        firstName: 'John',
        lastName: 'Supervisor',
        phone: '+91-9876543212'
      },
      isActive: true
    });
    await supervisor.save();
    
    // Create employees
    console.log('👷 Creating employees...');
    const employees = await User.insertMany([
      {
        username: 'emp001',
        password: await bcrypt.hash('emp123', 12),
        role: 'employee',
        factoryId: factory._id,
        supervisorId: supervisor._id,
        profile: {
          firstName: 'Raj',
          lastName: 'Kumar',
          phone: '+91-9876543213'
        },
        isActive: true
      },
      {
        username: 'emp002',
        password: await bcrypt.hash('emp123', 12),
        role: 'employee',
        factoryId: factory._id,
        supervisorId: supervisor._id,
        profile: {
          firstName: 'Priya',
          lastName: 'Sharma',
          phone: '+91-9876543214'
        },
        isActive: true
      },
      {
        username: 'emp003',
        password: await bcrypt.hash('emp123', 12),
        role: 'employee',
        factoryId: factory._id,
        supervisorId: supervisor._id,
        profile: {
          firstName: 'Amit',
          lastName: 'Patel',
          phone: '+91-9876543215'
        },
        isActive: true
      }
    ]);
    
    // Create machines
    console.log('⚙️ Creating machines...');
    const machines = await Machine.insertMany([
      {
        name: 'Machine 1',
        type: 'Cutting',
        status: 'active',
        factoryId: factory._id,
        specifications: {
          capacity: 100,
          speed: 50
        }
      },
      {
        name: 'Machine 2',
        type: 'Assembly',
        status: 'active',
        factoryId: factory._id,
        specifications: {
          capacity: 80,
          speed: 40
        }
      },
      {
        name: 'Machine 3',
        type: 'Packaging',
        status: 'maintenance',
        factoryId: factory._id,
        specifications: {
          capacity: 120,
          speed: 60
        }
      }
    ]);
    
    // Create products
    console.log('📦 Creating products...');
    const products = await Product.insertMany([
      {
        name: 'Widget A',
        code: 'WID-A-001',
        factoryId: factory._id
      },
      {
        name: 'Widget B',
        code: 'WID-B-002',
        factoryId: factory._id
      },
      {
        name: 'Widget C',
        code: 'WID-C-003',
        factoryId: factory._id
      }
    ]);
    
    // Create processes
    console.log('🔄 Creating processes...');
    const processes = await Process.insertMany([
      {
        name: '1st Process',
        factoryId: factory._id,
        productId: products[0]._id
      },
      {
        name: '2nd Process',
        factoryId: factory._id,
        productId: products[1]._id
      },
      {
        name: '3rd Process',
        factoryId: factory._id,
        productId: products[2]._id
      }
    ]);
    
    // Employees can work on any process - no assignment needed
    
    // Create work entries for the last 7 days
    console.log('📊 Creating work entries...');
    const workEntries = [];
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // Create work entries for each employee and process
      for (const employee of employees) {
        for (const process of processes) {
          // Employees can work on any process
          if (true) {
            const target = Math.floor(Math.random() * 50) + 50; // 50-100
            const achieved = Math.floor(target * (0.7 + Math.random() * 0.3)); // 70-100% of target
            const rejected = Math.floor(achieved * (0.05 + Math.random() * 0.1)); // 5-15% rejection
            
            workEntries.push({
              employeeId: employee._id,
              processId: process._id,
              productId: process.productId || products[Math.floor(Math.random() * products.length)]._id,
              startTime: new Date(date.getTime() + Math.random() * 8 * 60 * 60 * 1000), // Random time within 8 hours
              endTime: new Date(date.getTime() + Math.random() * 8 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000), // 4 hours later
              targetQuantity: target,
              achieved: achieved - rejected,
              rejected: rejected,
              factoryId: factory._id,
              validationStatus: Math.random() > 0.3 ? 'approved' : 'pending',
              createdAt: date,
              updatedAt: date
            });
          }
        }
      }
    }
    
    await WorkEntry.insertMany(workEntries);
    
    // Create attendance records for the last 7 days
    console.log('⏰ Creating attendance records...');
    const attendanceRecords = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      for (const employee of employees) {
        const statuses = ['present', 'absent', 'half-day'];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const shiftTypes = ['morning', 'evening', 'night'];
        const shiftType = shiftTypes[Math.floor(Math.random() * shiftTypes.length)];
        const target = Math.floor(Math.random() * 50) + 50; // 50-100
        
        if (status === 'present') {
          const checkInTime = new Date(date);
          checkInTime.setHours(8 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0);
          
          attendanceRecords.push({
            employeeId: employee._id,
            factoryId: factory._id,
            date: date,
            checkIn: {
              time: checkInTime,
              location: {
                latitude: 19.0760 + (Math.random() - 0.5) * 0.01,
                longitude: 72.8777 + (Math.random() - 0.5) * 0.01
              },
              isWithinGeofence: true
            },
            shiftType: shiftType,
            processId: processes[Math.floor(Math.random() * processes.length)]._id,
            target: target,
            status: status
          });
        } else {
          attendanceRecords.push({
            employeeId: employee._id,
            factoryId: factory._id,
            date: date,
            checkIn: {
              time: new Date(date),
              location: {
                latitude: 19.0760,
                longitude: 72.8777
              },
              isWithinGeofence: true
            },
            shiftType: shiftType,
            processId: processes[Math.floor(Math.random() * processes.length)]._id,
            target: target,
            status: status
          });
        }
      }
    }
    
    await Attendance.insertMany(attendanceRecords);
    
    console.log('✅ Database seeding completed successfully!');
    console.log('\n📋 Created data:');
    console.log(`- 1 Factory: ${factory.name}`);
    console.log(`- 1 Super Admin: vaibhavbg8080@gmail.com`);
    console.log(`- 2 Factory Admins: admin@sanagam.com, admin@sangam.com`);
    console.log(`- 1 Supervisor: supervisor001`);
    console.log(`- 3 Employees: emp001, emp002, emp003`);
    console.log(`- 3 Machines: Machine 1, 2, 3`);
    console.log(`- 3 Products: Widget A, B, C`);
    console.log(`- 3 Processes: 1st Process, 2nd Process, 3rd Process`);
    console.log(`- ${workEntries.length} Work Entries`);
    console.log(`- ${attendanceRecords.length} Attendance Records`);
    
    console.log('\n🔑 Login credentials:');
    console.log('Super Admin: vaibhavbg8080@gmail.com / 9902850039');
    console.log('Factory Admin: admin@sanagam.com / admin123');
    console.log('Factory Admin: admin@sangam.com / admin123');
    console.log('Supervisor: supervisor001 / supervisor123');
    console.log('Employees: emp001, emp002, emp003 / emp123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

// Run seeding if this file is executed directly
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedData();
}

export default seedData;
