import WorkEntry from '@/models/WorkEntry';

export interface ValidationCleanupResult {
  totalValidationsChecked: number;
  validationsCleaned: number;
  errors: string[];
  executionTime: number;
}

/**
 * Cleanup validation data older than 1 week from work entries
 * This function will:
 * 1. Find all work entries with validation data older than 7 days
 * 2. Remove validation-related fields (validationStatus, validatedBy, validatedAt, validationNotes)
 * 3. Reset validationStatus back to 'pending'
 */
export const cleanupOldValidations = async (): Promise<ValidationCleanupResult> => {
  const startTime = Date.now();
  const result: ValidationCleanupResult = {
    totalValidationsChecked: 0,
    validationsCleaned: 0,
    errors: [],
    executionTime: 0
  };

  try {
    console.log('🧹 Starting validation cleanup process...');

    // Calculate the cutoff date (7 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    console.log(`📅 Cleaning up validations older than: ${cutoffDate.toISOString()}`);

    // Find all work entries with validation data older than 7 days
    // Only include entries that have been validated (not pending)
    const oldValidations = await WorkEntry.find({
      validationStatus: { $in: ['approved', 'rejected'] },
      validatedAt: { $lt: cutoffDate }
    });

    result.totalValidationsChecked = oldValidations.length;
    console.log(`📊 Found ${oldValidations.length} work entries with old validation data`);

    // Process each work entry
    for (const workEntry of oldValidations) {
      try {
        // Reset validation data
        workEntry.validationStatus = 'pending';
        workEntry.validatedBy = undefined;
        workEntry.validatedAt = undefined;
        workEntry.validationNotes = undefined;

        await workEntry.save();

        console.log(`✅ Cleaned validation data for work entry ${workEntry._id}`);
        result.validationsCleaned++;

      } catch (error: any) {
        const errorMsg = `Error processing work entry ${workEntry._id}: ${error.message}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    result.executionTime = Date.now() - startTime;
    
    console.log(`✅ Validation cleanup completed in ${result.executionTime}ms`);
    console.log(`📊 Summary: ${result.validationsCleaned}/${result.totalValidationsChecked} validations cleaned`);
    
    if (result.errors.length > 0) {
      console.log(`⚠️ ${result.errors.length} errors occurred during cleanup`);
    }

    return result;

  } catch (error: any) {
    result.executionTime = Date.now() - startTime;
    const errorMsg = `Validation cleanup failed: ${error.message}`;
    console.error(errorMsg);
    result.errors.push(errorMsg);
    return result;
  }
};

/**
 * Get validation cleanup statistics for monitoring
 */
export const getValidationCleanupStats = async (): Promise<{
  totalValidations: number;
  oldValidations: number;
  cutoffDate: Date;
  validationBreakdown: {
    approved: number;
    rejected: number;
    pending: number;
  };
}> => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);

  // Get total validations count
  const totalValidations = await WorkEntry.countDocuments({
    validationStatus: { $in: ['approved', 'rejected'] }
  });

  // Get old validations count
  const oldValidations = await WorkEntry.countDocuments({
    validationStatus: { $in: ['approved', 'rejected'] },
    validatedAt: { $lt: cutoffDate }
  });

  // Get validation status breakdown
  const validationBreakdown = await WorkEntry.aggregate([
    {
      $group: {
        _id: '$validationStatus',
        count: { $sum: 1 }
      }
    }
  ]);

  const breakdown = {
    approved: 0,
    rejected: 0,
    pending: 0
  };

  validationBreakdown.forEach(item => {
    if (item._id === 'approved') breakdown.approved = item.count;
    else if (item._id === 'rejected') breakdown.rejected = item.count;
    else if (item._id === 'pending') breakdown.pending = item.count;
  });

  return {
    totalValidations,
    oldValidations,
    cutoffDate,
    validationBreakdown: breakdown
  };
};

/**
 * Manual cleanup function for testing or immediate execution
 */
export const manualValidationCleanup = async (): Promise<ValidationCleanupResult> => {
  console.log('🔧 Manual validation cleanup initiated...');
  return await cleanupOldValidations();
};
