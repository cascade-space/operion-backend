import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '@/middleware/auth';
import logger from '@/utils/logger';

/**
 * Audit logging middleware
 * Logs critical actions for security and compliance
 */
export interface AuditLogEntry {
  action: string;
  userId?: string;
  userRole?: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  success: boolean;
  details?: Record<string, any>;
}

class AuditLogger {
  /**
   * Log audit event
   */
  log(entry: AuditLogEntry): void {
    logger.info('AUDIT', {
      action: entry.action,
      userId: entry.userId,
      userRole: entry.userRole,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      timestamp: entry.timestamp.toISOString(),
      success: entry.success,
      details: entry.details
    });
  }

  /**
   * Middleware factory for audit logging
   */
  middleware(action: string, resourceType: string) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
      // Store original json method to capture response
      const originalJson = res.json.bind(res);

      // Override json method to log after response
      res.json = function(body: any) {
        const success = res.statusCode >= 200 && res.statusCode < 300;
        
        // Extract resource ID from params or body
        const resourceId = req.params.id || req.params.userId || req.params.factoryId || 
                          req.body?.id || req.body?.userId || req.body?.factoryId;

        // Log audit event
        auditLogger.log({
          action,
          userId: req.user?.id || req.user?._id?.toString(),
          userRole: req.user?.role,
          resourceType,
          resourceId: resourceId?.toString(),
          ipAddress: req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0],
          userAgent: req.headers['user-agent'],
          timestamp: new Date(),
          success,
          details: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode
          }
        });

        return originalJson(body);
      };

      next();
    };
  }
}

export const auditLogger = new AuditLogger();

/**
 * Predefined audit middleware for common actions
 */
export const auditUserCreation = auditLogger.middleware('user.create', 'User');
export const auditUserDeletion = auditLogger.middleware('user.delete', 'User');
export const auditUserUpdate = auditLogger.middleware('user.update', 'User');
export const auditPasswordChange = auditLogger.middleware('password.change', 'User');
export const auditWorkEntryValidation = auditLogger.middleware('work_entry.validate', 'WorkEntry');
export const auditFactoryConfigChange = auditLogger.middleware('factory.config.update', 'Factory');
export const auditRoleChange = auditLogger.middleware('role.change', 'User');

