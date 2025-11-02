import * as Sentry from '@sentry/node';
import env from '@/config/env';

/**
 * Initialize Sentry for error tracking
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    console.warn('Sentry DSN not configured. Error tracking disabled.');
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ app: undefined }), // Will be initialized later
      ],
      beforeSend(event, hint) {
        // Filter out sensitive information
        if (event.request) {
          // Remove potentially sensitive headers
          if (event.request.headers) {
            delete event.request.headers['authorization'];
            delete event.request.headers['cookie'];
          }
        }
        return event;
      },
    });
    
    console.log('Sentry initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
  }
}

/**
 * Capture exception with context
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  if (context) {
    Sentry.withScope((scope) => {
      Object.keys(context).forEach((key) => {
        scope.setContext(key, context[key]);
      });
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Capture message with level
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  Sentry.captureMessage(message, level);
}

/**
 * Add user context to Sentry
 */
export function setUserContext(userId: string, email?: string, role?: string): void {
  Sentry.setUser({
    id: userId,
    email,
    username: email,
    role,
  });
}

/**
 * Clear user context (e.g., on logout)
 */
export function clearUserContext(): void {
  Sentry.setUser(null);
}

export default Sentry;

