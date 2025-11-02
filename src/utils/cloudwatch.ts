import { CloudWatchLogsClient, CreateLogGroupCommand, CreateLogStreamCommand, PutLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import logger from '@/utils/logger';
import env from '@/config/env';

/**
 * CloudWatch logging utility
 * Sends logs to AWS CloudWatch Logs
 */
class CloudWatchLogger {
  private client: CloudWatchLogsClient | null = null;
  private logGroupName: string;
  private logStreamName: string;
  private sequenceToken: string | undefined;
  private initialized = false;
  private logBuffer: any[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.logGroupName = process.env.CLOUDWATCH_LOG_GROUP || 'operion-backend';
    this.logStreamName = `${process.env.NODE_ENV || 'development'}-${Date.now()}`;
  }

  /**
   * Initialize CloudWatch client
   */
  async initialize(): Promise<void> {
    // Only initialize in production if CLOUDWATCH_LOG_GROUP is set
    if (env.NODE_ENV !== 'production' || !process.env.CLOUDWATCH_LOG_GROUP) {
      logger.debug('CloudWatch logging disabled (not in production or CLOUDWATCH_LOG_GROUP not set)');
      return;
    }

    try {
      this.client = new CloudWatchLogsClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        } : undefined, // Use IAM role if credentials not provided
      });

      // Create log group if it doesn't exist
      try {
        await this.client.send(new CreateLogGroupCommand({
          logGroupName: this.logGroupName,
        }));
        logger.info('CloudWatch log group created', { logGroupName: this.logGroupName });
      } catch (error: any) {
        // Log group might already exist, which is fine
        if (error.name !== 'ResourceAlreadyExistsException') {
          logger.warn('Failed to create CloudWatch log group', { error: error.message });
        }
      }

      // Create log stream
      try {
        await this.client.send(new CreateLogStreamCommand({
          logGroupName: this.logGroupName,
          logStreamName: this.logStreamName,
        }));
      } catch (error: any) {
        // Log stream might already exist
        if (error.name !== 'ResourceAlreadyExistsException') {
          logger.warn('Failed to create CloudWatch log stream', { error: error.message });
        }
      }

      this.initialized = true;

      // Set up periodic flush (every 5 seconds)
      this.flushInterval = setInterval(() => {
        this.flush();
      }, 5000);

      logger.info('CloudWatch logging initialized', {
        logGroupName: this.logGroupName,
        logStreamName: this.logStreamName,
      });
    } catch (error) {
      logger.warn('Failed to initialize CloudWatch logging', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - application should continue without CloudWatch
    }
  }

  /**
   * Send log to CloudWatch
   */
  async log(level: string, message: string, metadata?: Record<string, any>): Promise<void> {
    if (!this.initialized || !this.client) {
      return;
    }

    const logEvent = {
      timestamp: Date.now(),
      message: JSON.stringify({
        level,
        message,
        timestamp: new Date().toISOString(),
        ...metadata,
      }),
    };

    this.logBuffer.push(logEvent);

    // Flush immediately for error logs
    if (level === 'error' || level === 'warn') {
      await this.flush();
    }
  }

  /**
   * Flush log buffer to CloudWatch
   */
  async flush(): Promise<void> {
    if (!this.initialized || !this.client || this.logBuffer.length === 0) {
      return;
    }

    let events: any[] = [];
    try {
      events = this.logBuffer.splice(0, 10000); // AWS limit is 10,000 events

      const command = new PutLogEventsCommand({
        logGroupName: this.logGroupName,
        logStreamName: this.logStreamName,
        logEvents: events,
        sequenceToken: this.sequenceToken,
      });

      const response = await this.client.send(command);
      this.sequenceToken = response.nextSequenceToken;
    } catch (error: any) {
      // Handle invalid sequence token (stream might have been recreated)
      if (error.name === 'InvalidSequenceTokenException') {
        this.sequenceToken = error.expectedSequenceToken;
        // Retry with correct sequence token
        await this.flush();
      } else {
        logger.warn('Failed to send logs to CloudWatch', {
          error: error.message,
        });
        // Put events back in buffer for retry
        if (events.length > 0) {
          this.logBuffer.unshift(...events);
        }
      }
    }
  }

  /**
   * Cleanup
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
  }
}

// Export singleton instance
export const cloudWatchLogger = new CloudWatchLogger();

// Initialize on module load (non-blocking)
if (process.env.CLOUDWATCH_LOG_GROUP) {
  cloudWatchLogger.initialize().catch((error) => {
    logger.warn('CloudWatch initialization failed', { error });
  });
}

export default cloudWatchLogger;

