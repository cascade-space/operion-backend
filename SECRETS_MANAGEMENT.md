# Secrets Management Guide

## Overview
This document outlines best practices for managing secrets in the Operion Factory Management System.

## Generating Strong Secrets

### JWT Secrets
The application requires two JWT secrets:
- `JWT_SECRET` - For access tokens
- `JWT_REFRESH_SECRET` - For refresh tokens (MUST be different from JWT_SECRET)

### Method 1: Using OpenSSL (Recommended)
```bash
# Generate JWT_SECRET
openssl rand -base64 32

# Generate JWT_REFRESH_SECRET (different from JWT_SECRET)
openssl rand -base64 32
```

### Method 2: Using Node.js
```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Generate JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Method 3: Using Python
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Requirements

### Development Environment
- Secrets must be provided (no defaults)
- Minimum 16 characters (recommended: 32+)
- Weak patterns are detected and logged as warnings

### Production Environment
- **MUST** be at least 32 characters
- **MUST NOT** contain default values or weak patterns
- **MUST** be unique per environment
- **MUST NOT** be shared between environments
- Application will fail to start if secrets are weak or default

## Configuration

### Local Development
1. Copy `env.example` to `.env`
2. Generate secrets using methods above
3. Replace placeholder values in `.env`
4. Never commit `.env` to version control

### Production Deployment
1. Copy `.env.production.example` to `.env.production`
2. Generate production-grade secrets (32+ characters)
3. Use secrets management service:
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault
   - Google Cloud Secret Manager
4. Configure environment variables in your deployment platform
5. Never commit production secrets

## Security Best Practices

1. **Rotation**: Rotate secrets regularly (every 90 days recommended)
2. **Uniqueness**: Use different secrets for each environment
3. **Storage**: Use secure secrets management services
4. **Access**: Limit access to secrets to authorized personnel only
5. **Monitoring**: Monitor for secret exposure in logs and code
6. **Validation**: Application validates secret strength on startup

## Secret Validation

The application automatically validates secrets on startup:

### Weak Patterns Detected
- Default placeholder values
- Common words (secret, password, default, etc.)
- Application-specific terms (operion, factory, etc.)
- Simple repetitions
- Length < 16 characters

### Production Validation
In production mode (`NODE_ENV=production`):
- Secrets must be 32+ characters
- Weak patterns cause startup failure
- Application will not start with insecure secrets

## Environment Variables

### Development
```bash
JWT_SECRET=<your-generated-secret>
JWT_REFRESH_SECRET=<your-generated-different-secret>
```

### Docker Compose
```yaml
environment:
  JWT_SECRET: ${JWT_SECRET}
  JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
```

Secrets should be provided via `.env` file or environment variables.

## Troubleshooting

### Application fails to start with "weak secret" error
- Generate a new secret using methods above
- Ensure secret is 32+ characters in production
- Check that secret doesn't contain weak patterns
- Verify secret is properly set in environment

### "JWT_SECRET is required" error
- Ensure JWT_SECRET is set in environment
- Check `.env` file exists and is loaded
- Verify docker-compose environment variable mapping

### Secrets validation warnings
- Review warnings in startup logs
- Consider upgrading to stronger secrets
- Production will fail on warnings - address before deploying

## See Also
- `.env.production.example` - Production environment template
- `env.example` - Development environment template
- `SECURITY.md` - General security guidelines

