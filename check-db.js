const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function checkDatabase() {
  try {
    await mongoose.connect('mongodb://localhost:27017/operion');
    console.log('Connected to database');
    
    const User = mongoose.model('User', new mongoose.Schema({
      email: String,
      username: String,
      password: String,
      role: String,
      isActive: Boolean,
      factoryId: mongoose.Schema.Types.ObjectId
    }));
    
    const Factory = mongoose.model('Factory', new mongoose.Schema({
      name: String,
      status: String,
      adminEmail: String,
      adminCredentials: {
        username: String,
        password: String
      }
    }));
    
    console.log('🔍 Checking factories...');
    const factories = await Factory.find({});
    console.log('Factories found:', factories.length);
    factories.forEach(f => {
      console.log(`- ${f.name} (${f.status}) - Admin: ${f.adminEmail}`);
      if (f.adminCredentials) {
        console.log(`  Username: ${f.adminCredentials.username}`);
        console.log(`  Password hash: ${f.adminCredentials.password?.substring(0, 20)}...`);
      }
    });
    
    console.log('\n🔍 Checking factory admin users...');
    const factoryAdmins = await User.find({ role: 'factory_admin' });
    console.log('Factory Admins found:', factoryAdmins.length);
    factoryAdmins.forEach(u => {
      console.log(`- ${u.email || u.username} (${u.isActive ? 'active' : 'inactive'})`);
      console.log(`  Password hash: ${u.password?.substring(0, 20)}...`);
    });
    
    // Test password comparison
    if (factoryAdmins.length > 0) {
      const admin = factoryAdmins[0];
      console.log('\n🔍 Testing password comparison...');
      console.log('Admin username:', admin.username);
      console.log('Admin email:', admin.email);
      
      // Try common passwords
      const testPasswords = ['admin123', 'password', '123456'];
      for (const testPassword of testPasswords) {
        try {
          const isValid = await bcrypt.compare(testPassword, admin.password);
          console.log(`Password "${testPassword}": ${isValid ? 'VALID' : 'invalid'}`);
        } catch (error) {
          console.log(`Password "${testPassword}": ERROR - ${error.message}`);
        }
      }
    }
    
    await mongoose.disconnect();
    console.log('Disconnected from database');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkDatabase();
