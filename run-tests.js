/**
 * Test Runner for Waterfall Process Flow
 * 
 * This script runs the integration tests for the waterfall process flow implementation.
 * Make sure the backend server is running before executing this script.
 */

const { runAllTests } = require('./test-waterfall-flow');

console.log('🧪 Waterfall Process Flow Test Runner');
console.log('=====================================\n');

console.log('Prerequisites:');
console.log('1. Backend server must be running on http://localhost:3001');
console.log('2. Database must be accessible');
console.log('3. All dependencies must be installed\n');

// Check if server is running
const axios = require('axios');

async function checkServer() {
  try {
    await axios.get('http://localhost:3001/api/health');
    console.log('✅ Backend server is running');
    return true;
  } catch (error) {
    console.log('❌ Backend server is not running or not accessible');
    console.log('Please start the server with: npm run dev');
    return false;
  }
}

async function main() {
  console.log('Checking server status...');
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.log('\n❌ Cannot run tests - server is not running');
    process.exit(1);
  }

  console.log('\n🚀 Starting integration tests...\n');
  
  try {
    await runAllTests();
  } catch (error) {
    console.error('\n❌ Test runner failed:', error.message);
    process.exit(1);
  }
}

main();
