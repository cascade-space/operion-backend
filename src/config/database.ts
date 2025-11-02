import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env['NODE_ENV'] === 'production' 
  ? process.env['MONGODB_URI_PROD'] 
  : process.env['MONGODB_URI'];

// Helper to mask sensitive parts of connection string for logging
const maskConnectionString = (uri: string): string => {
  try {
    // Match mongodb:// or mongodb+srv://
    const protocol = uri.startsWith('mongodb+srv://') ? 'mongodb+srv://' : 'mongodb://';
    const afterProtocol = uri.substring(protocol.length);
    
    // Check if credentials are present
    const atIndex = afterProtocol.indexOf('@');
    if (atIndex > 0) {
      // Has credentials: mask password
      const credentials = afterProtocol.substring(0, atIndex);
      const colonIndex = credentials.indexOf(':');
      if (colonIndex > 0) {
        const username = credentials.substring(0, colonIndex);
        return `${protocol}${username}:****@${afterProtocol.substring(atIndex + 1)}`;
      }
    }
    
    // No credentials or couldn't parse - just show protocol and host
    const parts = afterProtocol.split('/');
    const hostPart = parts[0] || 'unknown';
    return `${protocol}${hostPart}/...`;
  } catch {
    return 'mongodb://****';
  }
};

export const connectDB = async (): Promise<void> => {
  try {
    if (!MONGODB_URI) {
      const envVar = process.env.NODE_ENV === 'production' ? 'MONGODB_URI_PROD' : 'MONGODB_URI';
      throw new Error(`MongoDB URI is not defined. Please set ${envVar} in your .env file`);
    }

    // Log connection attempt with masked URI
    const maskedUri = maskConnectionString(MONGODB_URI);
    const isSRV = MONGODB_URI.startsWith('mongodb+srv://');
    console.log(`Connecting to MongoDB: ${maskedUri}`);
    if (isSRV) {
      console.log('Using SRV connection format (requires DNS resolution)');
    }

    // Adjust pool size based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const maxPoolSize = isProduction ? 50 : 10; // Higher pool for production
    const minPoolSize = isProduction ? 5 : 2;
    
    // Increased timeouts for DNS resolution and network issues
    const conn = await mongoose.connect(MONGODB_URI, {
      maxPoolSize, // Maximum number of connections in the pool
      minPoolSize,  // Minimum number of connections in the pool
      serverSelectionTimeoutMS: 10000, // Increased timeout for server selection (10s)
      socketTimeoutMS: 45000, // Socket timeout
      connectTimeoutMS: 10000, // Connection timeout (10s)
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
    } as mongoose.ConnectOptions);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err: Error) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

    // Monitor connection pool
    setInterval(() => {
      console.log('MongoDB connection pool status:', {
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name
      });
    }, 60000); // Log every minute

    // Note: Graceful shutdown handlers are managed in server.ts to avoid duplicate handlers
    
  } catch (error) {
    // Throw error instead of exiting - let caller handle retry logic
    const errorMessage = error instanceof Error ? error.message : String(error);
    const maskedUri = MONGODB_URI ? maskConnectionString(MONGODB_URI) : 'not set';
    
    console.error('Error connecting to MongoDB:', errorMessage);
    console.error(`Connection string: ${maskedUri}`);
    
    // Provide helpful diagnostics for common errors
    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('querySrv')) {
      console.error('\n⚠️  DNS Resolution Error Detected');
      console.error('Possible causes:');
      console.error('  1. MongoDB Atlas cluster hostname is incorrect');
      console.error('  2. DNS resolution is failing (check network connectivity)');
      console.error('  3. MongoDB Atlas cluster may have been deleted or renamed');
      console.error('  4. Network access rules in MongoDB Atlas may be blocking');
      console.error('\nTroubleshooting steps:');
      console.error('  1. Verify your MongoDB Atlas connection string in MongoDB Atlas dashboard');
      console.error('  2. Test DNS resolution: nslookup cluster.mongodb.net (replace with your cluster name)');
      console.error('  3. Check MongoDB Atlas Network Access → Add your EC2 IP address');
      console.error('  4. Verify your MongoDB Atlas cluster is running');
      console.error('  5. Try using standard connection format instead of SRV if DNS issues persist');
    } else if (errorMessage.includes('authentication failed')) {
      console.error('\n⚠️  Authentication Error');
      console.error('Check your MongoDB username and password in the connection string');
    } else if (errorMessage.includes('timeout')) {
      console.error('\n⚠️  Connection Timeout');
      console.error('Possible causes:');
      console.error('  1. Network firewall blocking MongoDB port (27017 or 27017-27019)');
      console.error('  2. MongoDB Atlas network access rules blocking your IP');
      console.error('  3. EC2 security group not allowing outbound connections');
    }
    
    throw new Error(`MongoDB connection failed: ${errorMessage}`);
  }
};

export default connectDB;
