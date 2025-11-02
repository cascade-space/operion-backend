import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env['NODE_ENV'] === 'production' 
  ? process.env['MONGODB_URI_PROD'] 
  : process.env['MONGODB_URI'];

export const connectDB = async (): Promise<void> => {
  try {
    if (!MONGODB_URI) {
      throw new Error('MongoDB URI is not defined in environment variables');
    }

    // Adjust pool size based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const maxPoolSize = isProduction ? 50 : 10; // Higher pool for production
    const minPoolSize = isProduction ? 5 : 2;
    
    const conn = await mongoose.connect(MONGODB_URI, {
      maxPoolSize, // Maximum number of connections in the pool
      minPoolSize,  // Minimum number of connections in the pool
      serverSelectionTimeoutMS: 5000, // Timeout for server selection
      socketTimeoutMS: 45000, // Socket timeout
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
    console.error('Error connecting to MongoDB:', errorMessage);
    throw new Error(`MongoDB connection failed: ${errorMessage}`);
  }
};

export default connectDB;
