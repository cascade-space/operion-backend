import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from '@/utils/logger';

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

// Store interval reference for cleanup (prevents memory leak)
let poolMonitorInterval: NodeJS.Timeout | null = null;

// Cleanup function to clear interval
export const disconnectDB = async (): Promise<void> => {
  if (poolMonitorInterval) {
    clearInterval(poolMonitorInterval);
    poolMonitorInterval = null;
    logger.info('MongoDB pool monitor interval cleared');
  }
  await mongoose.connection.close();
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
    logger.info(`Connecting to MongoDB: ${maskedUri}`);
    if (isSRV) {
      logger.info('Using SRV connection format (requires DNS resolution)');
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

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err: Error) => {
      logger.error('MongoDB connection error', { error: err.message, stack: err.stack });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    // Monitor connection pool - store interval reference for cleanup
    // Only enable in development or when explicitly requested
    if (process.env.NODE_ENV === 'development' || process.env.ENABLE_DB_MONITORING === 'true') {
      poolMonitorInterval = setInterval(() => {
        logger.debug('MongoDB connection pool status', {
          readyState: mongoose.connection.readyState,
          host: mongoose.connection.host,
          name: mongoose.connection.name
        });
      }, 60000); // Log every minute
      logger.debug('MongoDB pool monitoring enabled');
    }

    // Note: Graceful shutdown handlers are managed in server.ts to avoid duplicate handlers
    
  } catch (error) {
    // Throw error instead of exiting - let caller handle retry logic
    const errorMessage = error instanceof Error ? error.message : String(error);
    const maskedUri = MONGODB_URI ? maskConnectionString(MONGODB_URI) : 'not set';
    
    logger.error('Error connecting to MongoDB', { 
      error: errorMessage,
      connectionString: maskedUri 
    });
    
    // Provide helpful diagnostics for common errors
    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('querySrv')) {
      logger.error('DNS Resolution Error Detected', {
        hint: 'MongoDB Atlas cluster hostname may be incorrect or DNS resolution failing',
        troubleshooting: [
          'Verify MongoDB Atlas connection string',
          'Test DNS resolution: nslookup cluster.mongodb.net',
          'Check MongoDB Atlas Network Access → Add your IP address',
          'Verify MongoDB Atlas cluster is running',
          'Try standard connection format instead of SRV'
        ]
      });
    } else if (errorMessage.includes('authentication failed')) {
      logger.error('Authentication Error', {
        hint: 'Check your MongoDB username and password in the connection string'
      });
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connection refused')) {
      const isLocalhost = MONGODB_URI && (MONGODB_URI.includes('localhost') || MONGODB_URI.includes('127.0.0.1'));
      logger.error('Connection Refused - MongoDB Not Running', {
        isLocalhost,
        hint: isLocalhost 
          ? 'Run: cd ~/operion-backend && bash deploy/mongodb-setup.sh'
          : 'MongoDB service may not be running or firewall blocking connection'
      });
    } else if (errorMessage.includes('timeout')) {
      logger.error('Connection Timeout', {
        hint: 'Check network firewall, MongoDB Atlas network access rules, or EC2 security group'
      });
    }
    
    throw new Error(`MongoDB connection failed: ${errorMessage}`);
  }
};

export default connectDB;
