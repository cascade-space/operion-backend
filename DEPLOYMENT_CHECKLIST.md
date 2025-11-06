# Deployment Checklist

This checklist ensures all security and optimization measures are properly configured before deploying to production.

## Pre-Deployment Security Checks

### 1. Environment Variables
- [ ] `JWT_SECRET` is set and at least 32 characters long
- [ ] `JWT_REFRESH_SECRET` is set and different from `JWT_SECRET`
- [ ] `MONGODB_URI_PROD` is configured with production MongoDB connection string
- [ ] `CORS_ORIGINS` includes all production frontend domains
- [ ] `RATE_LIMIT_MAX_REQUESTS` is set to 500 (or appropriate value)
- [ ] `WS_MAX_CONNECTIONS` is set to 50 (or appropriate value)
- [ ] `WS_MESSAGE_RATE_LIMIT` is set to 60 (or appropriate value)
- [ ] All secrets are stored securely (AWS Secrets Manager, Parameter Store, etc.)
- [ ] No default/weak secrets are used

### 2. Database Configuration
- [ ] MongoDB connection pool is optimized (max 30, min 3 for t2.micro)
- [ ] Database indexes are created (WorkEntry, Attendance, User models)
- [ ] MongoDB Atlas network access is configured (if using Atlas)
- [ ] Database backups are configured

### 3. Security Headers
- [ ] Helmet.js is configured with all security headers
- [ ] CSP (Content Security Policy) is configured
- [ ] HSTS (HTTP Strict Transport Security) is enabled
- [ ] Referrer-Policy is set to strict-origin-when-cross-origin
- [ ] Permissions-Policy is configured

### 4. CSRF Protection
- [ ] CSRF middleware is enabled
- [ ] CSRF tokens are being set in cookies
- [ ] Frontend is including CSRF tokens in requests
- [ ] CSRF token endpoint (`/api/csrf-token`) is accessible

### 5. XSS Protection
- [ ] Backend input sanitization is enabled (DOMPurify)
- [ ] Frontend content sanitization is enabled (DOMPurify)
- [ ] All user-generated content is sanitized before display
- [ ] Input length limits are enforced

### 6. Password Policy
- [ ] Password validation requires 8+ characters
- [ ] Password complexity requirements are enforced (uppercase, lowercase, number)
- [ ] Frontend password validation matches backend requirements
- [ ] Password policy applies to new users and password changes

### 7. Rate Limiting
- [ ] HTTP rate limiting is configured (500 requests/15 minutes)
- [ ] WebSocket connection limiting is enabled (max 50)
- [ ] WebSocket message rate limiting is enabled (60/minute)
- [ ] Connection throttling is enabled (5 connections/IP/minute)
- [ ] Rate limit responses include proper headers (Retry-After, X-RateLimit-*)

### 8. File Upload Security
- [ ] File size limits are enforced (10MB)
- [ ] File type validation is enabled
- [ ] Retry logic is implemented (3 attempts with exponential backoff)
- [ ] Storage quota checks are implemented
- [ ] Partial upload cleanup is enabled

### 9. WebSocket Security
- [ ] WebSocket authentication is required (JWT tokens)
- [ ] Connection limits are enforced (max 50 concurrent)
- [ ] Message rate limiting is enabled (60/minute)
- [ ] Connection throttling is enabled (5/IP/minute)
- [ ] Heartbeat mechanism is active (30-second intervals)

### 10. Geofence Security
- [ ] GPS accuracy validation is enabled (rejects > 50 meters)
- [ ] Geofence distance calculation is accurate (Haversine formula)
- [ ] Geofence violations are logged
- [ ] Timezone handling utilities are available

### 11. Memory Management
- [ ] Memory monitoring is enabled (checks every 5 minutes)
- [ ] Warning threshold is set (80%)
- [ ] Critical threshold is set (90%)
- [ ] Graceful degradation is implemented

### 12. Request Deduplication
- [ ] Request deduplication middleware is enabled
- [ ] Cache duration is set (5 seconds)
- [ ] Only applies to state-changing methods (POST, PUT, PATCH, DELETE)

### 13. Response Caching
- [ ] Response caching is enabled for readonly endpoints
- [ ] Cache TTL is set (30 seconds)
- [ ] Redis is used if available, falls back to memory
- [ ] Cache invalidation is implemented for data changes

### 14. Audit Logging
- [ ] Audit logging middleware is enabled
- [ ] Critical actions are logged:
  - User creation/deletion
  - Password changes
  - Work entry validation
  - Factory configuration changes
  - Role changes
- [ ] Audit logs include: user ID, IP address, timestamp, success status

### 15. Optimistic Locking
- [ ] Optimistic locking is implemented for work entries
- [ ] Version conflicts return 409 status code
- [ ] Frontend handles conflict responses appropriately

## Performance Optimization Checks

### 1. Database Indexes
- [ ] WorkEntry indexes: `{ employeeId: 1, createdAt: -1 }`
- [ ] WorkEntry indexes: `{ factoryId: 1, createdAt: -1 }`
- [ ] WorkEntry indexes: `{ validationStatus: 1, createdAt: -1 }`
- [ ] Attendance indexes: `{ employeeId: 1, date: -1 }`
- [ ] Attendance indexes: `{ factoryId: 1, date: -1 }`
- [ ] User indexes: `{ factoryId: 1, role: 1 }`

### 2. Connection Pool Optimization
- [ ] MongoDB pool size is optimized (max 30, min 3 for t2.micro)
- [ ] Connection timeouts are configured appropriately
- [ ] Idle connection cleanup is enabled

### 3. Memory Optimization
- [ ] Memory monitoring is active
- [ ] Connection pool sizes are optimized for available memory
- [ ] WebSocket connection limits are set appropriately

## Testing Requirements

Before deployment, test the following:

1. **CSRF Protection**
   - [ ] CSRF token flow works with frontend/backend
   - [ ] Requests without CSRF tokens are rejected
   - [ ] CSRF tokens are refreshed properly

2. **Rate Limiting**
   - [ ] HTTP rate limiting works (test with 500+ requests)
   - [ ] WebSocket connection limits work (test with 60+ connections)
   - [ ] WebSocket message rate limiting works
   - [ ] Rate limit responses include proper headers

3. **XSS Protection**
   - [ ] Malicious HTML/JavaScript in inputs is sanitized
   - [ ] User-generated content is sanitized before display
   - [ ] Script tags are stripped from all inputs

4. **Password Policy**
   - [ ] Weak passwords are rejected
   - [ ] Strong passwords are accepted
   - [ ] Password validation works on frontend and backend

5. **Concurrent Updates**
   - [ ] Concurrent work entry updates are handled correctly
   - [ ] 409 Conflict responses are returned on version conflicts
   - [ ] Frontend handles conflicts appropriately

6. **GPS Accuracy**
   - [ ] Low accuracy GPS coordinates are rejected (> 50 meters)
   - [ ] High accuracy coordinates are accepted
   - [ ] Geofence validation works correctly

7. **Photo Upload**
   - [ ] Upload retry logic works (simulate failures)
   - [ ] Storage quota checks work
   - [ ] Partial uploads are cleaned up on failure

8. **Memory Usage**
   - [ ] Memory monitoring logs warnings at 80%
   - [ ] Memory monitoring logs errors at 90%
   - [ ] Graceful degradation triggers appropriately

9. **Request Deduplication**
   - [ ] Duplicate requests within 5 seconds return cached response
   - [ ] Different requests are processed normally

10. **Response Caching**
    - [ ] Cached responses are returned for GET requests
    - [ ] Cache is invalidated on data changes
    - [ ] Cache TTL is respected (30 seconds)

## Post-Deployment Verification

After deployment, verify:

1. [ ] Health check endpoint (`/health`) returns 200
2. [ ] All services are connected (MongoDB, Redis if used)
3. [ ] Memory usage is within acceptable limits
4. [ ] Rate limiting is working (check logs)
5. [ ] CSRF protection is active (check cookies)
6. [ ] Audit logs are being generated
7. [ ] Error monitoring (Sentry) is configured and working
8. [ ] Database indexes are created (check MongoDB)
9. [ ] WebSocket connections are limited properly
10. [ ] All environment variables are set correctly

## Monitoring

Set up monitoring for:

- [ ] Memory usage trends
- [ ] Rate limit violations
- [ ] CSRF token failures
- [ ] Audit log events
- [ ] WebSocket connection counts
- [ ] Database connection pool usage
- [ ] Error rates
- [ ] Response times

## Rollback Plan

If issues are discovered after deployment:

1. [ ] Document the issue
2. [ ] Revert to previous version
3. [ ] Review logs to identify root cause
4. [ ] Fix the issue
5. [ ] Test thoroughly
6. [ ] Re-deploy with fix

## Contact

For deployment issues, contact the development team immediately.

