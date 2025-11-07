import Redis, { RedisOptions } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  clusterMode?: boolean;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
  retryStrategy?: (times: number) => number | null;
}

class RedisService {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      const config: RedisConfig = {
        url: process.env.REDIS_URL,
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        clusterMode: process.env.REDIS_CLUSTER_MODE === 'true',
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        retryStrategy: (times: number) => {
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Redis: Max reconnection attempts reached');
            return null; // Stop retrying
          }
          this.reconnectAttempts++;
          const delay = Math.min(times * 50, 2000);
          console.log(`Redis: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
          return delay;
        }
      };

      const redisOptions: RedisOptions = {
        host: config.host,
        port: config.port,
        password: config.password,
        maxRetriesPerRequest: config.maxRetriesPerRequest,
        lazyConnect: true, // Connect lazily - we'll trigger on connect()
        retryStrategy: config.retryStrategy,
        connectTimeout: 10000,
        enableReadyCheck: true,
        enableOfflineQueue: false
      };

      // Use URL if provided, otherwise use host/port
      if (config.url) {
        this.client = new Redis(config.url, redisOptions);
        // Create separate connections for pub/sub
        this.subscriber = new Redis(config.url, redisOptions);
        this.publisher = new Redis(config.url, redisOptions);
      } else {
        this.client = new Redis(redisOptions);
        this.subscriber = new Redis(redisOptions);
        this.publisher = new Redis(redisOptions);
      }

      this.setupEventHandlers();
    } catch (error) {
      console.error('Redis: Initialization error:', error);
      this.client = null;
    }
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      console.log('Redis: Client connecting...');
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('Redis: Client ready');
    });

    this.client.on('error', (error) => {
      console.error('Redis: Client error:', error.message);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('Redis: Client connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('Redis: Client reconnecting...');
    });

    // Setup pub/sub handlers
    if (this.subscriber) {
      this.subscriber.on('ready', () => {
        console.log('Redis: Subscriber ready');
      });

      this.subscriber.on('error', (error) => {
        console.error('Redis: Subscriber error:', error.message);
      });
    }

    if (this.publisher) {
      this.publisher.on('ready', () => {
        console.log('Redis: Publisher ready');
      });

      this.publisher.on('error', (error) => {
        console.error('Redis: Publisher error:', error.message);
      });
    }
  }

  async connect(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    if (this.isConnected) {
      return;
    }

    try {
      // With lazyConnect: true and enableOfflineQueue: false, we need to wait
      // for the connection to be ready before sending commands
      await new Promise<void>((resolve, reject) => {
        // Check if already ready
        if (this.client?.status === 'ready') {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          this.client?.off('ready', readyHandler);
          this.client?.off('error', errorHandler);
          reject(new Error('Redis connection timeout'));
        }, 5000);

        const readyHandler = () => {
          clearTimeout(timeout);
          this.client?.off('ready', readyHandler);
          this.client?.off('error', errorHandler);
          resolve();
        };

        const errorHandler = (error: Error) => {
          clearTimeout(timeout);
          this.client?.off('ready', readyHandler);
          this.client?.off('error', errorHandler);
          reject(error);
        };

        this.client?.once('ready', readyHandler);
        this.client?.once('error', errorHandler);

        // Trigger connection if not already connecting/connected
        if (this.client?.status === 'wait' || this.client?.status === 'end') {
          this.client.connect().catch(() => {
            // Error will be handled by errorHandler
          });
        } else if (this.client?.status === 'connecting') {
          // Already connecting, just wait
        }
      });

      // Now verify with ping
      await this.client.ping();
      console.log('Redis: Warmup ping successful');
      
      // Connect subscriber and publisher
      if (this.subscriber) {
        await new Promise<void>((resolve, reject) => {
          if (this.subscriber?.status === 'ready') {
            resolve();
            return;
          }
          const timeout = setTimeout(() => reject(new Error('Subscriber timeout')), 5000);
          this.subscriber?.once('ready', () => {
            clearTimeout(timeout);
            resolve();
          });
          this.subscriber?.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
          if (this.subscriber?.status === 'wait' || this.subscriber?.status === 'end') {
            this.subscriber.connect().catch(() => {});
          }
        });
        await this.subscriber.ping();
      }
      
      if (this.publisher) {
        await new Promise<void>((resolve, reject) => {
          if (this.publisher?.status === 'ready') {
            resolve();
            return;
          }
          const timeout = setTimeout(() => reject(new Error('Publisher timeout')), 5000);
          this.publisher?.once('ready', () => {
            clearTimeout(timeout);
            resolve();
          });
          this.publisher?.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
          if (this.publisher?.status === 'wait' || this.publisher?.status === 'end') {
            this.publisher.connect().catch(() => {});
          }
        });
        await this.publisher.ping();
      }
      
      this.isConnected = true;
      console.log('Redis: Successfully connected');
    } catch (error) {
      console.error('Redis: Connection error:', error);
      this.isConnected = false;
      // Don't throw - Redis is optional
      // throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        this.client = null;
      }
      if (this.subscriber) {
        await this.subscriber.quit();
        this.subscriber = null;
      }
      if (this.publisher) {
        await this.publisher.quit();
        this.publisher = null;
      }
      this.isConnected = false;
      console.log('Redis: Disconnected');
    } catch (error) {
      console.error('Redis: Disconnect error:', error);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis not connected');
    }
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error(`Redis: GET error for key ${key}:`, error);
      throw error;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis not connected');
    }
    try {
      await this.client.set(key, value);
    } catch (error) {
      console.error(`Redis: SET error for key ${key}:`, error);
      throw error;
    }
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis not connected');
    }
    try {
      await this.client.setex(key, seconds, value);
    } catch (error) {
      console.error(`Redis: SETEX error for key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string): Promise<number> {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis not connected');
    }
    try {
      return await this.client.del(key);
    } catch (error) {
      console.error(`Redis: DEL error for key ${key}:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis not connected');
    }
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Redis: EXISTS error for key ${key}:`, error);
      throw error;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis not connected');
    }
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      console.error(`Redis: KEYS error for pattern ${pattern}:`, error);
      throw error;
    }
  }

  // Pub/Sub methods for WebSocket clustering
  async publish(channel: string, message: string): Promise<number> {
    if (!this.publisher || !this.isConnected) {
      throw new Error('Redis publisher not connected');
    }
    try {
      return await this.publisher.publish(channel, message);
    } catch (error) {
      console.error(`Redis: PUBLISH error for channel ${channel}:`, error);
      throw error;
    }
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (!this.subscriber || !this.isConnected) {
      throw new Error('Redis subscriber not connected');
    }
    try {
      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', (ch, msg) => {
        if (ch === channel) {
          callback(msg);
        }
      });
    } catch (error) {
      console.error(`Redis: SUBSCRIBE error for channel ${channel}:`, error);
      throw error;
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.subscriber || !this.isConnected) {
      return;
    }
    try {
      await this.subscriber.unsubscribe(channel);
    } catch (error) {
      console.error(`Redis: UNSUBSCRIBE error for channel ${channel}:`, error);
    }
  }

  async ping(): Promise<string> {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis not connected');
    }
    try {
      return await this.client.ping();
    } catch (error) {
      console.error('Redis: PING error:', error);
      throw error;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  getClient(): Redis | null {
    return this.client;
  }

  getSubscriber(): Redis | null {
    return this.subscriber;
  }

  getPublisher(): Redis | null {
    return this.publisher;
  }
}

// Export singleton instance
export const redisService = new RedisService();
export default redisService;

