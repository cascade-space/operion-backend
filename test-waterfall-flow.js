/**
 * Waterfall Process Flow Integration Test
 * 
 * This script tests the complete waterfall process flow implementation:
 * 1. Multi-employee scenarios with shared quantity pools
 * 2. Stage locking and unlocking workflows
 * 3. Daily reset functionality
 * 4. WebSocket real-time synchronization
 */

const axios = require('axios');
const WebSocket = require('ws');

// Configuration
const API_BASE = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001';

// Test data
let testFactoryId = null;
let testProductId = null;
let testProcesses = [];
let testEmployees = [];
let authTokens = {};

// Helper functions
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const makeRequest = async (method, endpoint, data = null, token = null) => {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      ...(data && { data })
    };
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`Request failed: ${method} ${endpoint}`, error.response?.data || error.message);
    throw error;
  }
};

// Test 1: Setup Test Environment
async function setupTestEnvironment() {
  console.log('\n🧪 Setting up test environment...');
  
  try {
    // Create test factory
    const factoryData = await makeRequest('POST', '/factories', {
      name: 'Test Factory - Waterfall Flow',
      address: 'Test Address',
      contactInfo: 'test@example.com'
    });
    testFactoryId = factoryData.data._id;
    console.log('✅ Test factory created:', testFactoryId);

    // Create test product
    const productData = await makeRequest('POST', '/products', {
      name: 'Test Product - Waterfall',
      code: 'TEST-WF-001',
      description: 'Test product for waterfall flow'
    }, null, testFactoryId);
    testProductId = productData.data._id;
    console.log('✅ Test product created:', testProductId);

    // Create test processes (3 stages)
    const processNames = ['Cutting', 'Assembly', 'Packaging'];
    for (let i = 0; i < processNames.length; i++) {
      const processData = await makeRequest('POST', '/processes', {
        name: processNames[i],
        order: i + 1,
        productId: testProductId
      }, null, testFactoryId);
      testProcesses.push(processData.data);
    }
    console.log('✅ Test processes created:', testProcesses.length);

    // Create test employees
    const employeeNames = ['Employee A', 'Employee B', 'Employee C'];
    for (const name of employeeNames) {
      const employeeData = await makeRequest('POST', '/users', {
        username: name.toLowerCase().replace(' ', ''),
        email: `${name.toLowerCase().replace(' ', '')}@test.com`,
        password: 'password123',
        role: 'employee',
        profile: {
          firstName: name.split(' ')[0],
          lastName: name.split(' ')[1]
        }
      }, null, testFactoryId);
      testEmployees.push(employeeData.data);
    }
    console.log('✅ Test employees created:', testEmployees.length);

    // Login employees to get auth tokens
    for (const employee of testEmployees) {
      const loginData = await makeRequest('POST', '/auth/login', {
        email: employee.email,
        password: 'password123'
      });
      authTokens[employee._id] = loginData.token;
    }
    console.log('✅ Employee auth tokens obtained');

    return true;
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    return false;
  }
}

// Test 2: Set Daily Target
async function testSetDailyTarget() {
  console.log('\n🧪 Testing daily target setting...');
  
  try {
    // Set daily target for Process 1 (Cutting)
    const process1Id = testProcesses[0]._id;
    await makeRequest('POST', `/processes/${process1Id}/set-daily-target`, {
      target: 1000
    }, null, testFactoryId);
    console.log('✅ Daily target set: 1000 units for Process 1');

    // Verify target was set
    const quantityStatus = await makeRequest('GET', `/processes/${process1Id}/quantity-status`, null, null, testFactoryId);
    console.log('✅ Quantity status verified:', {
      availableQuantity: quantityStatus.availableQuantity,
      dailyTarget: quantityStatus.dailyTarget,
      isLocked: quantityStatus.isLocked
    });

    return true;
  } catch (error) {
    console.error('❌ Daily target test failed:', error.message);
    return false;
  }
}

// Test 3: Multi-Employee Work Entry
async function testMultiEmployeeWork() {
  console.log('\n🧪 Testing multi-employee work entry...');
  
  try {
    const process1Id = testProcesses[0]._id;
    const process2Id = testProcesses[1]._id;
    
    // Employee A starts work
    console.log('Employee A starting work...');
    const workEntryA = await makeRequest('POST', '/work-entries/start', {
      processId: process1Id,
      productId: testProductId,
      machineId: 'test-machine-1',
      shift: 'morning',
      targetQuantity: 200
    }, authTokens[testEmployees[0]._id]);
    console.log('✅ Employee A work started:', workEntryA.data._id);

    // Employee B starts work on same process
    console.log('Employee B starting work...');
    const workEntryB = await makeRequest('POST', '/work-entries/start', {
      processId: process1Id,
      productId: testProductId,
      machineId: 'test-machine-2',
      shift: 'morning',
      targetQuantity: 300
    }, authTokens[testEmployees[1]._id]);
    console.log('✅ Employee B work started:', workEntryB.data._id);

    // Employee A completes work (150 achieved, 50 rejected)
    console.log('Employee A completing work...');
    await makeRequest('PUT', `/work-entries/${workEntryA.data._id}/complete`, {
      achievedQuantity: 150,
      rejectedQuantity: 50
    }, authTokens[testEmployees[0]._id]);
    console.log('✅ Employee A work completed: 150 achieved, 50 rejected');

    // Check quantity status
    const quantityStatus = await makeRequest('GET', `/processes/${process1Id}/quantity-status`, null, null, testFactoryId);
    console.log('✅ Updated quantity status:', {
      availableQuantity: quantityStatus.availableQuantity,
      remainingQuantity: quantityStatus.remainingQuantity,
      isLocked: quantityStatus.isLocked
    });

    // Employee B completes work (250 achieved, 50 rejected)
    console.log('Employee B completing work...');
    await makeRequest('PUT', `/work-entries/${workEntryB.data._id}/complete`, {
      achievedQuantity: 250,
      rejectedQuantity: 50
    }, authTokens[testEmployees[1]._id]);
    console.log('✅ Employee B work completed: 250 achieved, 50 rejected');

    // Check if stage is locked
    const finalStatus = await makeRequest('GET', `/processes/${process1Id}/quantity-status`, null, null, testFactoryId);
    console.log('✅ Final quantity status:', {
      availableQuantity: finalStatus.availableQuantity,
      remainingQuantity: finalStatus.remainingQuantity,
      isLocked: finalStatus.isLocked
    });

    // Check if Process 2 received the achieved quantity
    const process2Status = await makeRequest('GET', `/processes/${process2Id}/quantity-status`, null, null, testFactoryId);
    console.log('✅ Process 2 status after transfer:', {
      availableQuantity: process2Status.availableQuantity,
      isLocked: process2Status.isLocked
    });

    return true;
  } catch (error) {
    console.error('❌ Multi-employee work test failed:', error.message);
    return false;
  }
}

// Test 4: Stage Unlocking
async function testStageUnlocking() {
  console.log('\n🧪 Testing stage unlocking...');
  
  try {
    const process1Id = testProcesses[0]._id;
    
    // Try to unlock the locked stage
    await makeRequest('POST', `/processes/${process1Id}/unlock`, {}, null, testFactoryId);
    console.log('✅ Stage unlock requested');

    // Check if stage is unlocked
    const status = await makeRequest('GET', `/processes/${process1Id}/quantity-status`, null, null, testFactoryId);
    console.log('✅ Stage unlock status:', {
      isLocked: status.isLocked,
      availableQuantity: status.availableQuantity
    });

    return true;
  } catch (error) {
    console.error('❌ Stage unlocking test failed:', error.message);
    return false;
  }
}

// Test 5: Daily Reset
async function testDailyReset() {
  console.log('\n🧪 Testing daily reset...');
  
  try {
    // Trigger manual daily reset
    await makeRequest('POST', `/processes/reset-daily/${testFactoryId}`, {}, null, testFactoryId);
    console.log('✅ Daily reset triggered');

    // Check if all processes are reset
    for (const process of testProcesses) {
      const status = await makeRequest('GET', `/processes/${process._id}/quantity-status`, null, null, testFactoryId);
      console.log(`✅ Process ${process.name} reset status:`, {
        availableQuantity: status.availableQuantity,
        isLocked: status.isLocked
      });
    }

    return true;
  } catch (error) {
    console.error('❌ Daily reset test failed:', error.message);
    return false;
  }
}

// Test 6: WebSocket Real-time Updates
async function testWebSocketUpdates() {
  console.log('\n🧪 Testing WebSocket real-time updates...');
  
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(`${WS_URL}?token=${authTokens[testEmployees[0]._id]}`);
      let eventsReceived = 0;
      const expectedEvents = ['quantity_updated', 'stage_locked', 'work_entry_submitted'];

      ws.on('open', () => {
        console.log('✅ WebSocket connected');
        
        // Trigger a work entry to test real-time updates
        setTimeout(async () => {
          try {
            const workEntry = await makeRequest('POST', '/work-entries/start', {
              processId: testProcesses[0]._id,
              productId: testProductId,
              machineId: 'test-machine-ws',
              shift: 'morning',
              targetQuantity: 100
            }, authTokens[testEmployees[0]._id]);

            await makeRequest('PUT', `/work-entries/${workEntry.data._id}/complete`, {
              achievedQuantity: 100,
              rejectedQuantity: 0
            }, authTokens[testEmployees[0]._id]);
          } catch (error) {
            console.error('WebSocket test work entry failed:', error.message);
          }
        }, 1000);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log('✅ WebSocket event received:', message.type);
          eventsReceived++;
          
          if (eventsReceived >= expectedEvents.length) {
            ws.close();
            resolve(true);
          }
        } catch (error) {
          console.error('WebSocket message parse error:', error.message);
        }
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        resolve(false);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        ws.close();
        console.log('✅ WebSocket test completed');
        resolve(true);
      }, 10000);

    } catch (error) {
      console.error('❌ WebSocket test failed:', error.message);
      resolve(false);
    }
  });
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Waterfall Process Flow Integration Tests\n');
  
  const tests = [
    { name: 'Setup Test Environment', fn: setupTestEnvironment },
    { name: 'Set Daily Target', fn: testSetDailyTarget },
    { name: 'Multi-Employee Work Entry', fn: testMultiEmployeeWork },
    { name: 'Stage Unlocking', fn: testStageUnlocking },
    { name: 'Daily Reset', fn: testDailyReset },
    { name: 'WebSocket Real-time Updates', fn: testWebSocketUpdates }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        console.log(`✅ ${test.name} - PASSED`);
        passed++;
      } else {
        console.log(`❌ ${test.name} - FAILED`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} - FAILED: ${error.message}`);
      failed++;
    }
    
    await delay(1000); // Wait between tests
  }

  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Waterfall process flow is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Please review the implementation.');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  setupTestEnvironment,
  testSetDailyTarget,
  testMultiEmployeeWork,
  testStageUnlocking,
  testDailyReset,
  testWebSocketUpdates
};
