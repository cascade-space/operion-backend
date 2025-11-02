# Database Migrations Guide

## Overview

This document describes how to run database migrations for the Operion Factory Management System.

## Migration System

Migrations are tracked in the `migrations` collection in MongoDB. Each migration file follows the naming pattern: `XXX_description.ts` where `XXX` is a sequential number.

## Running Migrations

### Automatic Migration (On Startup)

Set the `AUTO_MIGRATE` environment variable to `true`:

```env
AUTO_MIGRATE=true
```

Migrations will run automatically when the server starts.

### Manual Migration

Run migrations manually using npm script:

```bash
npm run migrate:run
```

Or using tsx directly:

```bash
tsx src/scripts/run-migrations.ts
```

### In Production/CI/CD

For production deployments, use the migration script:

```bash
# In your deployment pipeline
npm run migrate:run
```

The script will:
- Connect to the database specified in `MONGODB_URI` or `MONGODB_URI_PROD`
- Run all pending migrations in order
- Exit with code 0 on success, 1 on failure
- Log all migration activities

## Migration Files

### Current Migrations

1. **001_initial_schema.ts** - Initial schema setup (placeholder)
2. **002_add_performance_indexes.ts** - Adds critical database indexes for performance

### Creating New Migrations

1. Create a new file in `Backend/src/migrations/` following the pattern `XXX_description.ts`
2. Export a default object with `up()` and `down()` methods:

```typescript
import mongoose from 'mongoose';
import logger from '@/utils/logger';

export default {
  async up(): Promise<void> {
    logger.info('Running migration XXX: Description');
    // Migration logic here
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not available');
    
    // Example: Create an index
    await db.collection('collectionName').createIndex(
      { field: 1 },
      { background: true }
    );
    
    logger.info('Migration XXX completed');
  },

  async down(): Promise<void> {
    logger.info('Rolling back migration XXX: Description');
    // Rollback logic here
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not available');
    
    // Example: Drop an index
    await db.collection('collectionName').dropIndex('field_1').catch(() => {});
    
    logger.info('Migration XXX rolled back');
  }
};
```

## Migration Status

Check migration status programmatically:

```typescript
import migrationRunner from '@/migrations/migrationRunner';

const status = await migrationRunner.getStatus();
console.log('Applied:', status.applied);
console.log('Pending:', status.pending);
```

## Rollback

To rollback the last migration:

```typescript
import migrationRunner from '@/migrations/migrationRunner';

await migrationRunner.rollback();
```

**Note:** Rollback should be used carefully in production. Test thoroughly before rolling back.

## Best Practices

1. **Always test migrations locally first**
2. **Use background indexing** (`background: true`) for large collections to avoid blocking operations
3. **Make migrations idempotent** - they should be safe to run multiple times
4. **Test rollback procedures** before deploying to production
5. **Backup database** before running migrations in production
6. **Run migrations during low-traffic periods** if possible

## Production Deployment Checklist

- [ ] Backup database
- [ ] Review migration changes
- [ ] Test migrations on staging environment
- [ ] Set `AUTO_MIGRATE=true` OR run `npm run migrate:run` manually
- [ ] Monitor migration logs for errors
- [ ] Verify indexes were created (check MongoDB logs or use `db.collection.getIndexes()`)
- [ ] Monitor application performance after migration

## Troubleshooting

### Migration Fails

1. Check migration logs for specific errors
2. Verify database connection
3. Ensure sufficient database permissions
4. Check if migration was partially applied (check `migrations` collection)
5. If needed, manually remove migration record and retry

### Index Creation Takes Too Long

- Indexes are created with `background: true` to avoid blocking
- Large collections may take time to index
- Monitor MongoDB logs for progress
- Consider creating indexes during maintenance window

### Migration Already Applied

If a migration appears to be already applied but you need to re-run it:
1. Manually remove the migration record from `migrations` collection
2. Re-run the migration

**Warning:** Only do this if you understand the implications. The migration's `up()` method should be idempotent.

