import express from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { ApiResponse } from '@/types';
import cronService from '@/services/cronService';
import { manualPhotoCleanup, getCleanupStats } from '@/utils/photoCleanup';
import { manualValidationCleanup, getValidationCleanupStats } from '@/utils/validationCleanup';

const router: express.Router = express.Router();

// Get cron service status
router.get('/cron/status', authenticate, authorize('super_admin', 'factory_admin'), async (req, res) => {
  try {
    const status = cronService.getServiceStatus();
    
    const response: ApiResponse = {
      success: true,
      message: 'Cron service status retrieved successfully',
      status: 200,
      data: status
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get cron status error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to get cron service status',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get photo cleanup statistics
router.get('/photos/stats', authenticate, authorize('super_admin', 'factory_admin'), async (req, res) => {
  try {
    const stats = await getCleanupStats();
    
    const response: ApiResponse = {
      success: true,
      message: 'Photo cleanup statistics retrieved successfully',
      status: 200,
      data: stats
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get photo stats error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to get photo cleanup statistics',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Run photo cleanup manually
router.post('/photos/cleanup', authenticate, authorize('super_admin', 'factory_admin'), async (req, res) => {
  try {
    console.log('🔧 Manual photo cleanup requested by:', req.user?.email || 'unknown');
    
    const result = await manualPhotoCleanup();
    
    const response: ApiResponse = {
      success: true,
      message: 'Photo cleanup completed successfully',
      status: 200,
      data: {
        ...result,
        requestedBy: req.user?.email || 'unknown',
        requestedAt: new Date().toISOString()
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Manual photo cleanup error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to run photo cleanup',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get validation cleanup statistics
router.get('/validations/stats', authenticate, authorize('super_admin', 'factory_admin'), async (req, res) => {
  try {
    const stats = await getValidationCleanupStats();
    
    const response: ApiResponse = {
      success: true,
      message: 'Validation cleanup statistics retrieved successfully',
      status: 200,
      data: stats
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get validation stats error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to get validation cleanup statistics',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Run validation cleanup manually
router.post('/validations/cleanup', authenticate, authorize('super_admin', 'factory_admin'), async (req, res) => {
  try {
    console.log('🔧 Manual validation cleanup requested by:', req.user?.email || 'unknown');
    
    const result = await manualValidationCleanup();
    
    const response: ApiResponse = {
      success: true,
      message: 'Validation cleanup completed successfully',
      status: 200,
      data: {
        ...result,
        requestedBy: req.user?.email || 'unknown',
        requestedAt: new Date().toISOString()
      }
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Manual validation cleanup error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to run validation cleanup',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Run specific cron job manually
router.post('/cron/:jobName/run', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { jobName } = req.params;
    
    console.log(`🔧 Manual cron job execution requested: ${jobName} by ${req.user?.email || 'unknown'}`);
    
    const success = await cronService.runJobNow(jobName);
    
    if (success) {
      const response: ApiResponse = {
        success: true,
        message: `Cron job '${jobName}' executed successfully`,
        status: 200,
        data: {
          jobName,
          executedBy: req.user?.email || 'unknown',
          executedAt: new Date().toISOString()
        }
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: `Failed to execute cron job '${jobName}'`,
        status: 500
      };
      res.status(500).json(response);
    }
  } catch (error: any) {
    console.error('Manual cron job execution error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to execute cron job',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Stop specific cron job
router.post('/cron/:jobName/stop', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { jobName } = req.params;
    
    console.log(`⏹️ Stopping cron job: ${jobName} by ${req.user?.email || 'unknown'}`);
    
    const stopped = cronService.stopJob(jobName);
    
    if (stopped) {
      const response: ApiResponse = {
        success: true,
        message: `Cron job '${jobName}' stopped successfully`,
        status: 200,
        data: {
          jobName,
          stoppedBy: req.user?.email || 'unknown',
          stoppedAt: new Date().toISOString()
        }
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: `Cron job '${jobName}' not found or already stopped`,
        status: 404
      };
      res.status(404).json(response);
    }
  } catch (error: any) {
    console.error('Stop cron job error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to stop cron job',
      status: 500
    };
    res.status(500).json(response);
  }
});

// Get system maintenance information
router.get('/system/info', authenticate, authorize('super_admin', 'factory_admin'), async (req, res) => {
  try {
    const cronStatus = cronService.getServiceStatus();
    const photoStats = await getCleanupStats();
    const validationStats = await getValidationCleanupStats();
    
    const systemInfo = {
      cron: cronStatus,
      photos: photoStats,
      validations: validationStats,
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
        timestamp: new Date().toISOString()
      }
    };
    
    const response: ApiResponse = {
      success: true,
      message: 'System maintenance information retrieved successfully',
      status: 200,
      data: systemInfo
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Get system info error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to get system maintenance information',
      status: 500
    };
    res.status(500).json(response);
  }
});

export default router;
