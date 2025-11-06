# Security Configuration

## Overview
This document outlines the security measures implemented in the Operion Factory Management System backend.

## Security Vulnerabilities Resolved

### Multer CVE-2025-47935 and CVE-2025-47944
- **Issue**: High-severity Denial of Service vulnerabilities in multer@1.4.5-lts.2
- **Solution**: Replaced multer with express-fileupload@1.4.3
- **Status**: ✅ RESOLVED

## Security Measures Implemented

### 1. CSRF Protection
- **Middleware**: csurf with cookie-based tokens
- **Implementation**: CSRF tokens set in cookies and validated on state-changing requests
- **Frontend**: Automatic CSRF token inclusion in X-XSRF-TOKEN header
- **Status**: ✅ IMPLEMENTED

### 2. XSS Protection
- **Backend**: DOMPurify (isomorphic-dompurify) for input sanitization
- **Frontend**: DOMPurify for user-generated content display
- **Sanitization**: Applied to all text inputs (names, descriptions, notes, addresses)
- **Status**: ✅ IMPLEMENTED

### 3. Password Policy
- **Minimum Length**: 8 characters (increased from 6)
- **Complexity Requirements**: 
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number
  - Optional special character
- **Application**: New users and password changes only (existing users grandfathered)
- **Status**: ✅ IMPLEMENTED

### 4. Rate Limiting
- **HTTP Rate Limiting**: 500 requests per 15 minutes per IP (increased from 100)
- **WebSocket Connection Limiting**: Maximum 50 concurrent connections
- **WebSocket Message Rate Limiting**: 60 messages per minute per connection
- **Connection Throttling**: 5 connections per IP per minute
- **Status**: ✅ IMPLEMENTED

### 5. File Upload Security
- **Middleware**: express-fileupload with secure configuration
- **File Size Limit**: 10MB maximum
- **File Type Validation**: Restricted to safe file types
- **Safe File Names**: Automatic sanitization
- **Temp Files**: Uses temporary files for processing
- **Retry Logic**: Exponential backoff retry (3 attempts)
- **Storage Quota Checks**: Validates available space before upload
- **Partial Upload Cleanup**: Automatic cleanup on failure
- **Status**: ✅ IMPLEMENTED

### 6. API Security
- **Rate Limiting**: 500 requests per 15 minutes per IP
- **CORS**: Configured for specific origins only
- **Helmet**: Enhanced security headers (Referrer-Policy, Permissions-Policy)
- **Input Validation**: express-validator for all inputs with length limits
- **Request Size Limits**: 10MB maximum
- **Request Deduplication**: Prevents duplicate submissions (5-second cache)
- **Response Caching**: 30-second cache for readonly endpoints (products, processes, dashboard)
- **Status**: ✅ IMPLEMENTED

### 7. Authentication & Authorization
- **JWT Tokens**: Secure token-based authentication
- **Password Hashing**: bcryptjs with 12 salt rounds
- **Role-Based Access**: Super Admin, Factory Admin, Supervisor, Employee
- **Token Refresh**: Secure refresh token mechanism
- **Audit Logging**: Logs critical actions (user creation/deletion, password changes, work entry validation)
- **Status**: ✅ IMPLEMENTED

### 8. Database Security
- **MongoDB**: Secure connection with environment variables
- **Connection Pool**: Optimized for t2.micro (max 30, min 3)
- **Input Sanitization**: All user inputs validated and sanitized
- **NoSQL Injection Prevention**: Mongoose ODM protection
- **Optimistic Locking**: Version-based conflict detection for work entries
- **Database Indexes**: Composite indexes for query optimization
- **Status**: ✅ IMPLEMENTED

### 9. WebSocket Security
- **Authentication**: JWT token validation
- **Connection Limiting**: Maximum 50 concurrent connections
- **Message Rate Limiting**: 60 messages per minute per connection
- **Connection Throttling**: 5 connections per IP per minute
- **Heartbeat**: 30-second ping/pong for connection health
- **Status**: ✅ IMPLEMENTED

### 10. Geofence Security
- **GPS Accuracy Validation**: Rejects coordinates with accuracy > 50 meters
- **Distance Calculation**: Haversine formula for accurate distance
- **Timezone Handling**: Timezone-aware timestamp utilities
- **Geofence Violation Logging**: Audit trail for violations
- **Status**: ✅ IMPLEMENTED

### 11. Memory Management
- **Memory Monitoring**: Automatic monitoring every 5 minutes
- **Warning Threshold**: 80% memory usage
- **Critical Threshold**: 90% memory usage
- **Graceful Degradation**: Automatic garbage collection and recommendations
- **Status**: ✅ IMPLEMENTED

### 12. Input Validation
- **Length Limits**: 
  - Names: 100 characters max
  - Descriptions: 1000 characters max
  - Addresses: 200 characters max
  - ZIP codes: 20 characters max
- **Type Validation**: All inputs validated with express-validator
- **Sanitization**: All text inputs sanitized with DOMPurify
- **Status**: ✅ IMPLEMENTED

### 13. Environment Security
- **Environment Variables**: Sensitive data in .env files
- **Development vs Production**: Different security levels
- **Error Handling**: No sensitive data in error messages
- **JWT Secret Validation**: Minimum 32 characters in production
- **Weak Secret Detection**: Prevents default/weak secrets
- **Status**: ✅ IMPLEMENTED

## Security Monitoring

### Regular Audits
```bash
npm audit          # Check for vulnerabilities
npm audit fix      # Fix vulnerabilities automatically
```

### Security Headers
- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Strict-Transport-Security (HSTS)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy (camera, microphone, geolocation, fullscreen)

### Audit Logging
Critical actions are logged for security and compliance:
- User creation/deletion
- Password changes
- Work entry validation
- Factory configuration changes
- Role changes

## File Upload Security Features

### Allowed File Types
- Images: JPEG, PNG, GIF, WebP
- Documents: PDF
- Customizable per endpoint

### File Processing
- Automatic file type detection
- Size validation
- Safe filename generation
- Temporary file processing
- Secure file storage (local, S3, or GCS)
- Retry logic with exponential backoff
- Storage quota validation
- Partial upload cleanup

## Edge Cases Handled

### Concurrent Updates
- **Optimistic Locking**: Version-based conflict detection
- **409 Conflict Response**: Returns conflict status when concurrent updates detected
- **Client Retry**: Frontend can retry with latest data

### GPS Accuracy
- **Validation**: Rejects coordinates with accuracy > 50 meters
- **User Feedback**: Clear error messages for low accuracy

### Photo Upload Failures
- **Retry Logic**: 3 attempts with exponential backoff
- **Storage Quota Checks**: Validates space before upload
- **Partial Upload Cleanup**: Automatic cleanup on failure

### WebSocket Connection Storms
- **Connection Throttling**: 5 connections per IP per minute
- **Connection Limits**: Maximum 50 concurrent connections
- **Message Rate Limiting**: 60 messages per minute per connection

## Best Practices

1. **Never store sensitive data in code**
2. **Always validate user inputs**
3. **Use HTTPS in production**
4. **Regular security updates**
5. **Monitor for vulnerabilities**
6. **Implement proper error handling**
7. **Use secure session management**
8. **Sanitize all user-generated content**
9. **Implement CSRF protection**
10. **Use strong password policies**
11. **Monitor memory usage**
12. **Log critical security events**

## Incident Response

If a security vulnerability is discovered:

1. **Immediate**: Assess the impact
2. **Containment**: Isolate affected systems
3. **Investigation**: Determine root cause
4. **Remediation**: Apply security patches
5. **Verification**: Test the fix
6. **Documentation**: Update this document

## Contact

For security issues, please contact the development team immediately.
