import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import User from '@/models/User';
import Factory from '@/models/Factory';
import redisService from './redisService';
import env from '@/config/env';
import logger from '@/utils/logger';

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  factoryId?: string;
  isAlive?: boolean;
}

export interface WSMessage {
  type: string;
  data: any;
  factoryId?: string;
  userId?: string;
  timestamp: string;
}

class WebSocketServerService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, AuthenticatedWebSocket> = new Map();
  private factoryRooms: Map<string, Set<string>> = new Map();
  private instanceId: string;
  private redisEnabled: boolean = false;
  // Message rate limiting per connection
  private messageCounts: Map<string, { count: number; resetAt: number }> = new Map();
  // Connection throttling per IP
  private connectionAttempts: Map<string, { count: number; resetAt: number }> = new Map();

  constructor() {
    // Generate unique instance ID for this server instance
    this.instanceId = `${process.pid}-${Date.now()}`;
  }

  private async setupRedisSubscriptions(): Promise<void> {
    try {
      // Subscribe to factory-specific channels for cross-instance communication
      const subscriber = redisService.getSubscriber();
      if (subscriber) {
        // Subscribe to a pattern channel that will receive all factory broadcasts
        // We'll use a wildcard pattern: factory:* for all factories
        await redisService.subscribe('ws:broadcast', (message: string) => {
          try {
            const data = JSON.parse(message);
            if (data.instanceId !== this.instanceId && data.factoryId) {
              // This message came from another instance - broadcast locally
              this.broadcastToFactoryLocal(data.factoryId, data.message);
            }
          } catch (error) {
            logger.error('WebSocket: Error parsing Redis message', { 
              error: error instanceof Error ? error.message : String(error) 
            });
          }
        });
        logger.info('WebSocket: Redis pub/sub enabled for clustering');
      }
    } catch (error) {
      logger.error('WebSocket: Failed to setup Redis subscriptions', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      this.redisEnabled = false;
    }
  }

  initialize(server: any) {
    try {
      this.wss = new WebSocketServer({ 
        server,
        path: '/ws'
      });

      this.wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
        this.handleConnection(ws, req);
      });

      this.wss.on('error', (error) => {
        logger.error('WebSocket server error', { error: error instanceof Error ? error.message : String(error) });
      });

      // Check Redis availability and setup subscriptions
      this.redisEnabled = redisService.getConnectionStatus();
      if (this.redisEnabled) {
        this.setupRedisSubscriptions().catch((error) => {
          logger.error('WebSocket: Failed to setup Redis subscriptions', { 
            error: error instanceof Error ? error.message : String(error) 
          });
          this.redisEnabled = false;
        });
      }

      // Start heartbeat
      this.startHeartbeat();
      
      logger.info('WebSocket server initialized', { 
        clusteringEnabled: this.redisEnabled,
        instanceId: this.instanceId 
      });
    } catch (error) {
      logger.error('Failed to initialize WebSocket server', { 
        error: error instanceof Error ? error.stack : String(error) 
      });
    }
  }

  private async handleConnection(ws: AuthenticatedWebSocket, req: IncomingMessage) {
    try {
      // Check connection limit before authentication
      if (this.clients.size >= env.WS_MAX_CONNECTIONS) {
        logger.warn('WebSocket connection limit reached', {
          currentConnections: this.clients.size,
          maxConnections: env.WS_MAX_CONNECTIONS
        });
        ws.close(1008, 'Server at capacity. Please try again later.');
        return;
      }

      // Connection throttling per IP (prevent connection storms)
      const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0] || 
                       req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const throttleWindow = 60 * 1000; // 1 minute
      const maxConnectionsPerMinute = 5;

      const attemptKey = `ip:${clientIp}`;
      const attempts = this.connectionAttempts.get(attemptKey);

      if (attempts) {
        if (now < attempts.resetAt) {
          // Still in throttle window
          if (attempts.count >= maxConnectionsPerMinute) {
            logger.warn('WebSocket connection throttled', {
              ip: clientIp,
              attempts: attempts.count,
              resetAt: new Date(attempts.resetAt).toISOString()
            });
            ws.close(1008, 'Too many connection attempts. Please wait before trying again.');
            return;
          }
          attempts.count++;
        } else {
          // Reset window
          this.connectionAttempts.set(attemptKey, { count: 1, resetAt: now + throttleWindow });
        }
      } else {
        // First attempt from this IP
        this.connectionAttempts.set(attemptKey, { count: 1, resetAt: now + throttleWindow });
      }

      // Extract token from query parameters or Authorization header
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      let token = url.searchParams.get('token');
      
      // Prefer Authorization header over query string (more secure)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else if (token && process.env.NODE_ENV === 'production') {
        // Log warning in production if token is in query string
        logger.warn('WebSocket: Token passed in query string - prefer Authorization header');
      }
      
      if (!token) {
        ws.close(1008, 'Authentication required');
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      
      // Get user and factory info
      const user = await User.findById(decoded.userId).populate('factoryId');
      if (!user || !user.factoryId) {
        ws.close(1008, 'Invalid user or factory');
        return;
      }

      // Set user info on WebSocket
      ws.userId = user.id;
      ws.factoryId = user.factoryId._id.toString();
      ws.isAlive = true;

      // Store client
      const clientId = `${ws.factoryId}-${ws.userId}`;
      this.clients.set(clientId, ws);

      // Add to factory room
      if (!this.factoryRooms.has(ws.factoryId)) {
        this.factoryRooms.set(ws.factoryId, new Set());
      }
      this.factoryRooms.get(ws.factoryId)!.add(clientId);

      logger.info('WebSocket client connected', {
        userId: user.id,
        userName: `${user.profile.firstName} ${user.profile.lastName}`,
        factoryId: (user.factoryId as any)._id?.toString(),
        factoryName: (user.factoryId as any).name
      });

      // Send welcome message
      this.sendToClient(ws, {
        type: 'connected',
        data: { message: 'Connected to real-time updates' },
        factoryId: ws.factoryId,
        userId: ws.userId,
        timestamp: new Date().toISOString()
      });

      // Handle messages with rate limiting
      ws.on('message', (data) => {
        try {
          // Check message rate limit
          const messageKey = `${ws.factoryId}-${ws.userId}`;
          const now = Date.now();
          const rateLimitWindow = 60 * 1000; // 1 minute
          const maxMessages = env.WS_MESSAGE_RATE_LIMIT;

          const messageData = this.messageCounts.get(messageKey);
          if (messageData) {
            if (now < messageData.resetAt) {
              // Still in rate limit window
              if (messageData.count >= maxMessages) {
                logger.warn('WebSocket message rate limit exceeded', {
                  userId: ws.userId,
                  factoryId: ws.factoryId,
                  count: messageData.count,
                  limit: maxMessages
                });
                ws.close(1008, 'Message rate limit exceeded');
                return;
              }
              messageData.count++;
            } else {
              // Reset window
              this.messageCounts.set(messageKey, { count: 1, resetAt: now + rateLimitWindow });
            }
          } else {
            // First message from this connection
            this.messageCounts.set(messageKey, { count: 1, resetAt: now + rateLimitWindow });
          }

          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          logger.error('Invalid WebSocket message', { 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      });

      // Handle pong (heartbeat response)
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle disconnect
      ws.on('close', () => {
        this.handleDisconnect(clientId, ws.factoryId!);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket connection error', { 
          clientId,
          factoryId: ws.factoryId,
          error: error instanceof Error ? error.message : String(error) 
        });
        if (ws.factoryId) {
          this.handleDisconnect(clientId, ws.factoryId);
        }
      });

    } catch (error) {
      logger.error('WebSocket authentication error', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      ws.close(1008, 'Authentication failed');
    }
  }

  private handleMessage(ws: AuthenticatedWebSocket, message: any) {
    switch (message.type) {
      case 'ping':
        this.sendToClient(ws, {
          type: 'pong',
          data: null,
          factoryId: ws.factoryId,
          userId: ws.userId,
          timestamp: new Date().toISOString()
        });
        break;
      default:
        logger.debug('Unknown WebSocket message type', { type: message.type });
    }
  }

  private handleDisconnect(clientId: string, factoryId: string) {
    this.clients.delete(clientId);
    
    // Clean up message rate limit tracking
    const messageKey = `${factoryId}-${clientId.split('-')[1]}`;
    this.messageCounts.delete(messageKey);
    
    const factoryRoom = this.factoryRooms.get(factoryId);
    if (factoryRoom) {
      factoryRoom.delete(clientId);
      if (factoryRoom.size === 0) {
        this.factoryRooms.delete(factoryId);
      }
    }

    logger.info('WebSocket client disconnected', { clientId, factoryId });
  }

  private sendToClient(ws: AuthenticatedWebSocket, message: WSMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // Broadcast to all clients in a factory (local clients only)
  private broadcastToFactoryLocal(factoryId: string, message: Omit<WSMessage, 'factoryId' | 'timestamp'>) {
    const factoryRoom = this.factoryRooms.get(factoryId);
    if (!factoryRoom) return;

    const wsMessage: WSMessage = {
      ...message,
      factoryId,
      timestamp: new Date().toISOString()
    };

    factoryRoom.forEach(clientId => {
      const ws = this.clients.get(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendToClient(ws, wsMessage);
      }
    });
  }

  // Broadcast to all clients in a factory (across all instances via Redis)
  broadcastToFactory(factoryId: string, message: Omit<WSMessage, 'factoryId' | 'timestamp'>) {
    // Broadcast to local clients
    const factoryRoom = this.factoryRooms.get(factoryId);
    const localClientCount = factoryRoom?.size || 0;

    // If Redis is enabled, publish to Redis for other instances
    if (this.redisEnabled && redisService.getConnectionStatus()) {
      try {
        const redisMessage = JSON.stringify({
          instanceId: this.instanceId,
          factoryId,
          message
        });
        redisService.publish('ws:broadcast', redisMessage);
    } catch (error) {
      logger.error('WebSocket: Error publishing to Redis', { 
        error: error instanceof Error ? error.message : String(error),
        factoryId 
      });
      // Fall back to local-only broadcast
    }
    }

    // Always broadcast to local clients
    this.broadcastToFactoryLocal(factoryId, message);

    logger.debug('WebSocket broadcast completed', {
      factoryId,
      localClients: localClientCount,
      messageType: message.type,
      redisEnabled: this.redisEnabled
    });
  }

  // Broadcast production data update
  broadcastProductionUpdate(factoryId: string) {
    this.broadcastToFactory(factoryId, {
      type: 'production_data_updated',
      data: { message: 'Production data has been updated' }
    });
  }

  // Start heartbeat to check connection health
  private startHeartbeat() {
    setInterval(() => {
      this.clients.forEach((ws, clientId) => {
        if (!ws.isAlive) {
          logger.warn('WebSocket: Terminating dead connection', { clientId, factoryId: ws.factoryId });
          ws.terminate();
          if (ws.factoryId) {
            this.handleDisconnect(clientId, ws.factoryId);
          }
          return;
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds
  }

  // Get connection stats
  getStats() {
    return {
      totalClients: this.clients.size,
      maxConnections: env.WS_MAX_CONNECTIONS,
      connectionUtilization: `${this.clients.size}/${env.WS_MAX_CONNECTIONS}`,
      factoryRooms: Array.from(this.factoryRooms.entries()).map(([factoryId, clients]) => ({
        factoryId,
        clientCount: clients.size
      }))
    };
  }

  // Cleanup
  close() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
    this.factoryRooms.clear();
    this.messageCounts.clear();
    this.connectionAttempts.clear();
  }
}

export const wsServer = new WebSocketServerService();
