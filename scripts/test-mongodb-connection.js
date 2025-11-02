#!/usr/bin/env node
/**
 * MongoDB Connection Test Script
 * 
 * This script helps diagnose MongoDB connection issues
 * 
 * Usage:
 *   node scripts/test-mongodb-connection.js
 */

require('dotenv').config();

const mongoose = require('mongoose');
const dns = require('dns').promises;

async function testDNS(hostname) {
  try {
    console.log(`\n🔍 Testing DNS resolution for: ${hostname}`);
    const addresses = await dns.resolve4(hostname);
    console.log(`✅ DNS resolution successful: ${addresses.join(', ')}`);
    return true;
  } catch (error) {
    console.error(`❌ DNS resolution failed: ${error.message}`);
    return false;
  }
}

async function testSRVDNS(srvRecord) {
  try {
    console.log(`\n🔍 Testing SRV record resolution for: ${srvRecord}`);
    const records = await dns.resolveSrv(srvRecord);
    console.log(`✅ SRV record resolution successful:`);
    records.forEach((record, index) => {
      console.log(`   ${index + 1}. ${record.name}:${record.port} (priority: ${record.priority}, weight: ${record.weight})`);
    });
    return true;
  } catch (error) {
    console.error(`❌ SRV record resolution failed: ${error.message}`);
    return false;
  }
}

async function testMongoConnection(uri) {
  try {
    console.log(`\n🔌 Attempting MongoDB connection...`);
    const maskedUri = uri.replace(/:([^:@]{1,20})@/, ':****@');
    console.log(`Connection string: ${maskedUri}`);
    
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    
    console.log(`✅ MongoDB connection successful!`);
    console.log(`   Host: ${mongoose.connection.host}`);
    console.log(`   Database: ${mongoose.connection.name}`);
    console.log(`   Ready State: ${mongoose.connection.readyState}`);
    
    await mongoose.connection.close();
    return true;
  } catch (error) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    if (error.message.includes('ENOTFOUND') || error.message.includes('querySrv')) {
      console.error(`\n💡 This is a DNS resolution error. Possible causes:`);
      console.error(`   1. The hostname in your connection string is incorrect`);
      console.error(`   2. The MongoDB Atlas cluster doesn't exist or was renamed`);
      console.error(`   3. Network/DNS issues on this server`);
      console.error(`\n📋 Solutions:`);
      console.error(`   1. Get a fresh connection string from MongoDB Atlas dashboard`);
      console.error(`   2. Verify the cluster name is correct (e.g., cluster0.xxxxx.mongodb.net)`);
      console.error(`   3. Check MongoDB Atlas Network Access settings`);
      console.error(`   4. Try using standard connection format (mongodb://) instead of SRV (mongodb+srv://)`);
    }
    return false;
  }
}

function extractHostname(uri) {
  try {
    // Extract hostname from mongodb:// or mongodb+srv:// URI
    const match = uri.match(/mongodb\+?srv?:\/\/(?:[^:@]+:[^@]+@)?([^/?:]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function extractSRVRecord(uri) {
  try {
    // Extract SRV record name for mongodb+srv://
    if (uri.startsWith('mongodb+srv://')) {
      const match = uri.match(/mongodb\+srv:\/\/(?:[^:@]+:[^@]+@)?([^/?:]+)/);
      if (match) {
        const hostname = match[1];
        return `_mongodb._tcp.${hostname}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('==========================================');
  console.log('MongoDB Connection Diagnostic Tool');
  console.log('==========================================\n');

  const nodeEnv = process.env.NODE_ENV || 'development';
  const mongoUri = nodeEnv === 'production' 
    ? process.env.MONGODB_URI_PROD 
    : process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error('❌ MongoDB URI not found in environment variables');
    console.error(`   Looking for: ${nodeEnv === 'production' ? 'MONGODB_URI_PROD' : 'MONGODB_URI'}`);
    console.error('\n💡 Set the MongoDB URI in your .env file');
    process.exit(1);
  }

  console.log(`Environment: ${nodeEnv}`);
  console.log(`Connection string detected: ${mongoUri.substring(0, 30)}...`);

  const hostname = extractHostname(mongoUri);
  if (!hostname) {
    console.error('❌ Could not extract hostname from connection string');
    process.exit(1);
  }

  console.log(`\nExtracted hostname: ${hostname}`);

  // Check if it's a placeholder
  if (hostname.includes('cluster.mongodb.net') && !hostname.includes('cluster0') && !hostname.includes('cluster1')) {
    console.error('\n⚠️  WARNING: Connection string appears to be a placeholder!');
    console.error('   The hostname "cluster.mongodb.net" is not a valid MongoDB Atlas cluster.');
    console.error('   MongoDB Atlas clusters have hostnames like: cluster0.xxxxx.mongodb.net');
    console.error('\n💡 Steps to fix:');
    console.error('   1. Go to MongoDB Atlas → Database → Connect');
    console.error('   2. Click "Connect your application"');
    console.error('   3. Copy the connection string (should include cluster name)');
    console.error('   4. Update your .env file with the correct connection string');
    process.exit(1);
  }

  // Test basic DNS
  if (hostname.includes('.mongodb.net')) {
    await testDNS(hostname);
  }

  // Test SRV record if using mongodb+srv://
  if (mongoUri.startsWith('mongodb+srv://')) {
    const srvRecord = extractSRVRecord(mongoUri);
    if (srvRecord) {
      await testSRVDNS(srvRecord);
    }
  }

  // Test MongoDB connection
  const connected = await testMongoConnection(mongoUri);

  if (connected) {
    console.log('\n✅ All tests passed! MongoDB connection is working.');
    process.exit(0);
  } else {
    console.log('\n❌ Connection test failed. Please check the errors above.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

