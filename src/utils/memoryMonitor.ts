import logger from '@/utils/logger';

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  utilizationPercent: number;
}

class MemoryMonitor {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly WARNING_THRESHOLD = 80; // 80% memory usage
  private readonly CRITICAL_THRESHOLD = 90; // 90% memory usage
  private readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  start(): void {
    if (this.monitoringInterval) {
      logger.warn('Memory monitoring already started');
      return;
    }

    logger.info('Memory monitoring started', {
      checkInterval: `${this.CHECK_INTERVAL / 1000}s`,
      warningThreshold: `${this.WARNING_THRESHOLD}%`,
      criticalThreshold: `${this.CRITICAL_THRESHOLD}%`
    });

    this.monitoringInterval = setInterval(() => {
      this.checkMemory();
    }, this.CHECK_INTERVAL);

    // Initial check
    this.checkMemory();
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Memory monitoring stopped');
    }
  }

  private checkMemory(): void {
    const stats = this.getMemoryStats();
    const utilization = stats.utilizationPercent;

    if (utilization >= this.CRITICAL_THRESHOLD) {
      logger.error('CRITICAL: Memory usage is very high', {
        ...stats,
        utilization: `${utilization.toFixed(1)}%`,
        action: 'Consider restarting the server or scaling up'
      });
      
      // Trigger graceful degradation
      this.handleHighMemory();
    } else if (utilization >= this.WARNING_THRESHOLD) {
      logger.warn('WARNING: Memory usage is high', {
        ...stats,
        utilization: `${utilization.toFixed(1)}%`,
        action: 'Monitor closely'
      });
    } else {
      logger.debug('Memory usage normal', {
        ...stats,
        utilization: `${utilization.toFixed(1)}%`
      });
    }
  }

  private getMemoryStats(): MemoryStats {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    
    // Estimate total available memory (t2.micro has 1GB = 1024MB)
    // In production, this should be read from system or environment
    const totalMemoryMB = process.env.TOTAL_MEMORY_MB 
      ? parseInt(process.env.TOTAL_MEMORY_MB, 10) 
      : 1024; // Default to 1GB for t2.micro
    
    const utilizationPercent = (rssMB / totalMemoryMB) * 100;

    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      external: usage.external,
      heapUsedMB,
      heapTotalMB,
      rssMB,
      utilizationPercent
    };
  }

  private handleHighMemory(): void {
    // Graceful degradation strategies:
    // 1. Force garbage collection if available (requires --expose-gc flag)
    if (global.gc) {
      logger.info('Triggering garbage collection due to high memory usage');
      global.gc();
    }

    // 2. Log recommendations
    logger.warn('High memory usage detected - recommendations:', {
      recommendations: [
        'Consider reducing MongoDB connection pool size',
        'Check for memory leaks in application code',
        'Reduce WebSocket connection limits',
        'Restart the application if memory continues to grow',
        'Consider upgrading to a larger instance'
      ]
    });
  }

  getStats(): MemoryStats {
    return this.getMemoryStats();
  }
}

export const memoryMonitor = new MemoryMonitor();

