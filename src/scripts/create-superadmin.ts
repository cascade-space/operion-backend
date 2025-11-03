#!/usr/bin/env node
/**
 * Script to create or update superadmin user
 * Usage: npm run ts-node src/scripts/create-superadmin.ts
 * Or: ts-node src/scripts/create-superadmin.ts
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/database';
import User from '../models/User';

const email = 'cascadetechnologiessolutions@gmail.com';
const password = '9902850039';

async function createSuperAdmin() {
  try {
    console.log('🔌 Connecting to database...');
    await connectDB();
    console.log('✅ Connected to database');

    // Check if superadmin already exists
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    
    if (existingSuperAdmin) {
      console.log('⚠️  Superadmin already exists. Updating...');
      
      // Update existing superadmin
      existingSuperAdmin.email = email.toLowerCase();
      existingSuperAdmin.username = 'superadmin'; // Use short username
      existingSuperAdmin.password = await bcrypt.hash(password, 12);
      existingSuperAdmin.profile = {
        firstName: 'Super',
        lastName: 'Admin',
        phone: '+91-9902850039'
      };
      existingSuperAdmin.isActive = true;
      existingSuperAdmin.emailVerified = true;
      
      await existingSuperAdmin.save();
      console.log('✅ Superadmin updated successfully!');
      console.log(`   Email: ${email}`);
      console.log(`   Username: superadmin`);
      console.log(`   Password: ${password}`);
    } else {
      // Check if email already exists with different role
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        console.log('⚠️  Email already exists with different role. Updating to superadmin...');
        existingEmail.email = email.toLowerCase();
        existingEmail.username = 'superadmin'; // Use short username
        existingEmail.password = await bcrypt.hash(password, 12);
        existingEmail.role = 'super_admin';
        existingEmail.profile = {
          firstName: 'Super',
          lastName: 'Admin',
          phone: '+91-9902850039'
        };
        existingEmail.factoryId = null;
        existingEmail.assignedProcesses = [];
        existingEmail.isActive = true;
        existingEmail.emailVerified = true;
        
        await existingEmail.save();
        console.log('✅ User updated to superadmin successfully!');
        console.log(`   Email: ${email}`);
        console.log(`   Username: superadmin`);
        console.log(`   Password: ${password}`);
      } else {
        // Create new superadmin
        console.log('👑 Creating new superadmin...');
        const superAdmin = new User({
          email: email.toLowerCase(),
          username: 'superadmin', // Use short username instead of full email
          password: await bcrypt.hash(password, 12),
          role: 'super_admin',
          profile: {
            firstName: 'Super',
            lastName: 'Admin',
            phone: '+91-9902850039'
          },
          factoryId: null,
          assignedProcesses: [],
          isActive: true,
          emailVerified: true
        });

        await superAdmin.save();
        console.log('✅ Superadmin created successfully!');
        console.log(`   Email: ${email}`);
        console.log(`   Username: superadmin`);
        console.log(`   Password: ${password}`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating superadmin:', error);
    process.exit(1);
  }
}

// Run the script
createSuperAdmin();

