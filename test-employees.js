// Test the employees endpoint logic
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/operion', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const User = require('./dist/models/User.js').default;

async function testEmployeesQuery() {
  try {
    console.log('🔍 Testing employees query...');
    
    // Test the query that was failing
    const query = { role: 'employee' };
    console.log('Query:', query);
    
    const employees = await User.find(query)
      .select('-password')
      .populate('factoryId', 'name')
      .sort({ 'profile.firstName': 1, 'profile.lastName': 1 });
    
    console.log('✅ Found employees:', employees.length);
    console.log('First employee:', employees[0] ? {
      id: employees[0]._id,
      name: `${employees[0].profile.firstName} ${employees[0].profile.lastName}`,
      role: employees[0].role,
      factoryId: employees[0].factoryId
    } : 'No employees found');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testEmployeesQuery();
