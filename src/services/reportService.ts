import mongoose from 'mongoose';
import WorkEntry from '@/models/WorkEntry';
import cacheService from '@/services/cacheService';

interface DateRange {
  startDate?: string;
  endDate?: string;
}

interface ProcessStagesReportResult {
  _id: {
    productId: string;
    processId: string;
    productName: string;
    productCode: string;
    processName: string;
    stageOrder: number;
  };
  achievedQuantity: number;
  rejectedQuantity: number;
  targetQuantity: number;
  workEntryCount: number;
  latestEntry: Date;
}

/**
 * Build date range query from optional start and end dates
 */
function buildDateQuery(startDate?: string, endDate?: string): Record<string, any> {
  const dateQuery: Record<string, any> = {};
  
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    dateQuery.$gte = start;
    dateQuery.$lte = end;
  } else if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    dateQuery.$gte = start;
  } else if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateQuery.$lte = end;
  }
  
  return dateQuery;
}

/**
 * Get process stages aggregation pipeline
 * This is the common pipeline used across multiple report endpoints
 */
export function getProcessStagesPipeline(
  factoryId: string,
  startDate?: string,
  endDate?: string
): any[] {
  const dateQuery = buildDateQuery(startDate, endDate);
  
  return [
    {
      $match: {
        factoryId: new mongoose.Types.ObjectId(factoryId),
        ...(Object.keys(dateQuery).length > 0 && { createdAt: dateQuery })
      }
    },
    {
      $lookup: {
        from: 'products',
        localField: 'productId',
        foreignField: '_id',
        as: 'product'
      }
    },
    {
      $lookup: {
        from: 'processes',
        localField: 'processId',
        foreignField: '_id',
        as: 'process'
      }
    },
    {
      $unwind: '$product'
    },
    {
      $unwind: '$process'
    },
    {
      $addFields: {
        stageOrder: {
          $let: {
            vars: {
              processInProduct: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: '$product.processes',
                      cond: { 
                        $eq: [
                          { $toString: '$$this.processId' }, 
                          { $toString: '$processId' }
                        ] 
                      }
                    }
                  },
                  0
                ]
              }
            },
            in: '$$processInProduct.order'
          }
        }
      }
    },
    {
      $group: {
        _id: {
          productId: '$productId',
          processId: '$processId',
          productName: '$product.name',
          productCode: '$product.code',
          processName: '$process.name',
          stageOrder: '$stageOrder'
        },
        achievedQuantity: { $sum: '$achieved' },
        rejectedQuantity: { $sum: '$rejected' },
        targetQuantity: { $sum: '$targetQuantity' },
        workEntryCount: { $sum: 1 },
        latestEntry: { $max: '$createdAt' }
      }
    }
  ];
}

/**
 * Get process stages report data with caching
 */
export async function getProcessStagesReport(
  factoryId: string,
  startDate?: string,
  endDate?: string,
  useCache: boolean = true
): Promise<ProcessStagesReportResult[]> {
  // Build cache key
  const cacheKey = `report:process-stages:${factoryId}:${startDate || 'all'}:${endDate || 'all'}`;
  
  // Try to get from cache first
  if (useCache) {
    const cached = await cacheService.get<ProcessStagesReportResult[]>(cacheKey, { factoryId });
    if (cached) {
      return cached;
    }
  }
  
  // Build pipeline
  const pipeline = getProcessStagesPipeline(factoryId, startDate, endDate);
  
  // Execute aggregation
  const results = await WorkEntry.aggregate(pipeline);
  
  // Cache results for 10 minutes
  if (useCache) {
    await cacheService.set(cacheKey, results, { 
      factoryId, 
      ttl: 600 // 10 minutes
    });
  }
  
  return results;
}

/**
 * Get product process stages pipeline (same as process stages but with different naming)
 */
export function getProductProcessStagesPipeline(
  factoryId: string,
  startDate?: string,
  endDate?: string
): any[] {
  // Same pipeline structure, just using different function name for clarity
  return getProcessStagesPipeline(factoryId, startDate, endDate);
}

/**
 * Get product process stages report data with caching
 */
export async function getProductProcessStagesReport(
  factoryId: string,
  startDate?: string,
  endDate?: string,
  useCache: boolean = true
): Promise<ProcessStagesReportResult[]> {
  // Build cache key
  const cacheKey = `report:product-process-stages:${factoryId}:${startDate || 'all'}:${endDate || 'all'}`;
  
  // Try to get from cache first
  if (useCache) {
    const cached = await cacheService.get<ProcessStagesReportResult[]>(cacheKey, { factoryId });
    if (cached) {
      return cached;
    }
  }
  
  // Build pipeline
  const pipeline = getProductProcessStagesPipeline(factoryId, startDate, endDate);
  
  // Execute aggregation
  const results = await WorkEntry.aggregate(pipeline);
  
  // Cache results for 10 minutes
  if (useCache) {
    await cacheService.set(cacheKey, results, { 
      factoryId, 
      ttl: 600 // 10 minutes
    });
  }
  
  return results;
}

/**
 * Invalidate report cache for a factory
 */
export async function invalidateReportCache(factoryId: string): Promise<void> {
  await cacheService.invalidateFactoryCache(factoryId, 'report:*');
}

/**
 * Invalidate specific report cache
 */
export async function invalidateProcessStagesCache(
  factoryId: string,
  startDate?: string,
  endDate?: string
): Promise<void> {
  const cacheKey = `report:process-stages:${factoryId}:${startDate || 'all'}:${endDate || 'all'}`;
  await cacheService.invalidate(cacheKey, { factoryId });
  
  const productCacheKey = `report:product-process-stages:${factoryId}:${startDate || 'all'}:${endDate || 'all'}`;
  await cacheService.invalidate(productCacheKey, { factoryId });
}

export default {
  getProcessStagesPipeline,
  getProcessStagesReport,
  getProductProcessStagesPipeline,
  getProductProcessStagesReport,
  invalidateReportCache,
  invalidateProcessStagesCache
};

