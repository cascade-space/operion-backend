// Simple test script to verify authentication
import fetch from 'node-fetch';

async function testAuth() {
  try {
    console.log('Testing authentication endpoints...');
    
    // Test health endpoint
    console.log('\n1. Testing health endpoint...');
    const healthResponse = await fetch('http://localhost:3000/health');
    const healthData = await healthResponse.json();
    console.log('Health status:', healthResponse.status);
    console.log('Health response:', healthData);
    
    // Test login endpoint
    console.log('\n2. Testing login endpoint...');
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 'SUP001', // Test supervisor
        password: 'password123',
        deviceId: 'TEST_DEVICE'
      })
    });
    
    console.log('Login status:', loginResponse.status);
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      console.log('Login successful:', {
        user: loginData.data?.user?.role,
        hasToken: !!loginData.data?.accessToken
      });
      
      // Test employees endpoint with token
      console.log('\n3. Testing employees endpoint...');
      const employeesResponse = await fetch('http://localhost:3000/api/users/employees/list', {
        headers: {
          'Authorization': `Bearer ${loginData.data.accessToken}`
        }
      });
      
      console.log('Employees status:', employeesResponse.status);
      const employeesData = await employeesResponse.json();
      console.log('Employees response:', employeesData);
      
    } else {
      const errorData = await loginResponse.json();
      console.log('Login failed:', errorData);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testAuth();
