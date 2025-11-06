import { cleanupOldPhotos, getCleanupStats } from '@/utils/photoCleanup';
import { cleanupOldValidations, getValidationCleanupStats } from '@/utils/validationCleanup';
import quantityService from '@/services/quantityService';
import Factory from '@/models/Factory';
import { markAbsentEmployees } from '@/utils/attendanceUtils';

export interface CronJob {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
  isRunning: boolean;
  lastRun?: Date;
  nextRun?: Date;
  errorCount: number;
  lastError?: string;
}

class CronService {
  private jobs: Map<string, CronJob> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.initializeJobs();
  }

  private initializeJobs() {
    // Photo cleanup job - runs daily at 2:00 AM
    this.addJob({
      name: 'photo-cleanup',
      schedule: '0 2 * * *', // Daily at 2:00 AM
      handler: this.photoCleanupHandler.bind(this),
      isRunning: false,
      errorCount: 0
    });

    // Validation cleanup job - runs daily at 3:00 AM
    this.addJob({
      name: 'validation-cleanup',
      schedule: '0 3 * * *', // Daily at 3:00 AM
      handler: this.validationCleanupHandler.bind(this),
      isRunning: false,
      errorCount: 0
    });

    // Daily production reset job - runs daily at 12:00 AM (midnight)
    this.addJob({
      name: 'daily-production-reset',
      schedule: '0 0 * * *', // Daily at 12:00 AM
      handler: this.dailyProductionResetHandler.bind(this),
      isRunning: false,
      errorCount: 0
    });

    // Mark absent employees job - runs daily at 11:45 PM (end of day)
    this.addJob({
      name: 'mark-absent-employees',
      schedule: '45 23 * * *', // Daily at 11:45 PM
      handler: this.markAbsentEmployeesHandler.bind(this),
      isRunning: false,
      errorCount: 0
    });

    console.log('🕐 Cron service initialized with jobs:', Array.from(this.jobs.keys()));
  }

  private addJob(job: CronJob) {
    this.jobs.set(job.name, job);
    this.scheduleJob(job);
  }

  private scheduleJob(job: CronJob) {
    // Parse cron schedule (simplified version)
    const schedule = this.parseCronSchedule(job.schedule);
    if (!schedule) {
      console.error(`❌ Invalid cron schedule for job: ${job.name}`);
      return;
    }

    // Calculate next run time
    const now = new Date();
    const nextRun = this.getNextRunTime(schedule, now);
    job.nextRun = nextRun;

    // Schedule the job
    const delay = nextRun.getTime() - now.getTime();
    
    const timeout = setTimeout(async () => {
      await this.executeJob(job);
      // Reschedule for next run
      this.scheduleJob(job);
    }, delay);

    this.intervals.set(job.name, timeout);

    console.log(`📅 Scheduled job '${job.name}' to run at ${nextRun.toISOString()}`);
  }

  private async executeJob(job: CronJob) {
    if (job.isRunning) {
      console.log(`⚠️ Job '${job.name}' is already running, skipping...`);
      return;
    }

    job.isRunning = true;
    job.lastRun = new Date();

    try {
      console.log(`🚀 Starting job: ${job.name}`);
      await job.handler();
      job.errorCount = 0; // Reset error count on success
      console.log(`✅ Job '${job.name}' completed successfully`);
    } catch (error: any) {
      job.errorCount++;
      job.lastError = error.message;
      console.error(`❌ Job '${job.name}' failed:`, error.message);
    } finally {
      job.isRunning = false;
    }
  }

  private async photoCleanupHandler(): Promise<void> {
    try {
      console.log('🧹 Starting scheduled photo cleanup...');
      
      // Get cleanup stats before running
      const stats = await getCleanupStats();
      console.log(`📊 Photo cleanup stats: ${stats.oldPhotos} old photos out of ${stats.totalPhotos} total`);

      // Run the cleanup
      const result = await cleanupOldPhotos();
      
      console.log(`✅ Scheduled photo cleanup completed: ${result.photosDeleted} photos deleted`);
      
      // Log detailed results
      if (result.errors.length > 0) {
        console.log(`⚠️ Cleanup errors:`, result.errors);
      }
      
    } catch (error: any) {
      console.error('❌ Scheduled photo cleanup failed:', error.message);
      throw error;
    }
  }

  private async validationCleanupHandler(): Promise<void> {
    try {
      console.log('🧹 Starting scheduled validation cleanup...');
      
      // Get cleanup stats before running
      const stats = await getValidationCleanupStats();
      console.log(`📊 Validation cleanup stats: ${stats.oldValidations} old validations out of ${stats.totalValidations} total`);

      // Run the cleanup
      const result = await cleanupOldValidations();
      
      console.log(`✅ Scheduled validation cleanup completed: ${result.validationsCleaned} validations cleaned`);
      
      // Log detailed results
      if (result.errors.length > 0) {
        console.log(`⚠️ Cleanup errors:`, result.errors);
      }
      
    } catch (error: any) {
      console.error('❌ Scheduled validation cleanup failed:', error.message);
      throw error;
    }
  }

  private async dailyProductionResetHandler(): Promise<void> {
    try {
      console.log('🔄 Starting daily production reset...');
      
      // Get all factories
      const factories = await Factory.find({});
      console.log(`📊 Found ${factories.length} factories to reset`);

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Reset quantities for each factory
      for (const factory of factories) {
        try {
          const success = await quantityService.resetDailyQuantities(factory._id.toString());
          if (success) {
            successCount++;
            console.log(`✅ Reset quantities for factory: ${factory.name}`);
          } else {
            errorCount++;
            errors.push(`Failed to reset factory: ${factory.name}`);
          }
        } catch (error: any) {
          errorCount++;
          const errorMsg = `Error resetting factory ${factory.name}: ${error.message}`;
          errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      }
      
      console.log(`✅ Daily production reset completed: ${successCount} factories reset successfully, ${errorCount} failed`);
      
      // Log detailed results
      if (errors.length > 0) {
        console.log(`⚠️ Reset errors:`, errors);
      }
      
    } catch (error: any) {
      console.error('❌ Daily production reset failed:', error.message);
      throw error;
    }
  }

  private async markAbsentEmployeesHandler(): Promise<void> {
    try {
      console.log('📋 Starting automatic absent marking for employees...');
      
      // Mark employees as absent if they haven't checked in by end of day
      const result = await markAbsentEmployees();
      
      console.log(`✅ Automatic absent marking completed:`);
      console.log(`   - Marked ${result.markedAbsent} employees as absent`);
      console.log(`   - ${result.alreadyMarked} employees already had attendance records`);
      console.log(`   - Total employees checked: ${result.totalEmployees}`);
      
    } catch (error: any) {
      console.error('❌ Automatic absent marking failed:', error.message);
      throw error;
    }
  }

  private parseCronSchedule(schedule: string): { minute: number; hour: number; day: number; month: number; dayOfWeek: number } | null {
    const parts = schedule.split(' ');
    if (parts.length !== 5) {
      return null;
    }

    try {
      return {
        minute: parseInt(parts[0]),
        hour: parseInt(parts[1]),
        day: parseInt(parts[2]),
        month: parseInt(parts[3]),
        dayOfWeek: parseInt(parts[4])
      };
    } catch {
      return null;
    }
  }

  private getNextRunTime(schedule: { minute: number; hour: number; day: number; month: number; dayOfWeek: number }, from: Date): Date {
    const next = new Date(from);
    
    // Set to the specified hour and minute
    next.setMinutes(schedule.minute);
    next.setHours(schedule.hour);
    next.setSeconds(0);
    next.setMilliseconds(0);

    // If the time has already passed today, schedule for tomorrow
    if (next <= from) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  // Public methods for job management
  public getJobStatus(jobName: string): CronJob | null {
    return this.jobs.get(jobName) || null;
  }

  public getAllJobs(): CronJob[] {
    return Array.from(this.jobs.values());
  }

  public async runJobNow(jobName: string): Promise<boolean> {
    const job = this.jobs.get(jobName);
    if (!job) {
      console.error(`❌ Job '${jobName}' not found`);
      return false;
    }

    try {
      await this.executeJob(job);
      return true;
    } catch (error) {
      console.error(`❌ Failed to run job '${jobName}' manually:`, error);
      return false;
    }
  }

  public stopJob(jobName: string): boolean {
    const timeout = this.intervals.get(jobName);
    if (timeout) {
      clearTimeout(timeout);
      this.intervals.delete(jobName);
      console.log(`⏹️ Stopped job: ${jobName}`);
      return true;
    }
    return false;
  }

  public stopAllJobs(): void {
    this.intervals.forEach((timeout, jobName) => {
      clearTimeout(timeout);
      console.log(`⏹️ Stopped job: ${jobName}`);
    });
    this.intervals.clear();
  }

  public getServiceStatus(): {
    totalJobs: number;
    runningJobs: number;
    jobs: CronJob[];
  } {
    const jobs = this.getAllJobs();
    const runningJobs = jobs.filter(job => job.isRunning).length;

    return {
      totalJobs: jobs.length,
      runningJobs,
      jobs
    };
  }
}

// Create singleton instance
const cronService = new CronService();

export default cronService;
