import Process from '@/models/Process';
import Product from '@/models/Product';
import WorkEntry from '@/models/WorkEntry';
import ProcessStage from '@/models/ProcessStage';
import { Types } from 'mongoose';
import logger from '@/utils/logger';

export interface QuantityUpdateResult {
  success: boolean;
  remainingQuantity: number;
  stageCompleted: boolean;
  transferredToNext?: number;
}

export interface ProcessQuantityStatus {
  processId: string;
  availableQuantity: number;
  isLocked: boolean;
  lockedAt?: Date;
  dailyTarget: number;
  totalAchieved: number;
  totalRejected: number;
}

class QuantityService {

  /**
   * Get stage information for dynamic stage detection
   */
  private async getStageInfo(productId: string, processId: string) {
    const product = await Product.findById(productId);
    if (!product || !product.processes) {
      console.log('🔍 getStageInfo: Product not found or no processes:', { productId, hasProcesses: !!product?.processes });
      return null;
    }
    
    const processes = product.processes.sort((a, b) => a.order - b.order);
    const currentProcess = processes.find(p => p.processId.toString() === processId);
    
    if (!currentProcess) {
      console.log('🔍 getStageInfo: Process not found in product:', {
        productId,
        processId,
        productProcesses: processes.map(p => ({ id: p.processId, order: p.order }))
      });
      return null;
    }
    
    // Find previous and next by ORDER VALUE, not array index
    const previousProcess = processes.find(p => p.order === currentProcess.order - 1);
    const nextProcess = processes.find(p => p.order === currentProcess.order + 1);
    
    const stageInfo = {
      product,
      currentProcess,
      previousProcess: previousProcess || null,
      nextProcess: nextProcess || null,
      isFirst: currentProcess.order === 1, // First stage has order 1
      isLast: !nextProcess,
      totalStages: processes.length,
      allProcesses: processes
    };
    
    console.log('🔍 getStageInfo result:', {
      productId,
      processId,
      productName: product.name,
      currentOrder: stageInfo.currentProcess.order,
      isFirst: stageInfo.isFirst,
      isLast: stageInfo.isLast,
      totalStages: stageInfo.totalStages,
      previousProcess: stageInfo.previousProcess ? { id: stageInfo.previousProcess.processId, order: stageInfo.previousProcess.order } : null,
      nextProcess: stageInfo.nextProcess ? { id: stageInfo.nextProcess.processId, order: stageInfo.nextProcess.order } : null,
      allProcesses: processes.map(p => ({ id: p.processId, order: p.order }))
    });
    
    return stageInfo;
  }

  /**
   * Validate that a process belongs to a product
   */
  private async validateProductProcess(productId: string, processId: string): Promise<boolean> {
    try {
      const product = await Product.findById(productId);
      if (!product || !product.processes) {
        logger.debug('validateProductProcess: Product not found or no processes', { productId });
        return false;
      }

      const processExists = product.processes.some(p => p.processId.toString() === processId);
      
      logger.debug('validateProductProcess result', {
        productId,
        processId,
        productName: product.name,
        processExists,
        productProcesses: product.processes.map(p => ({ id: p.processId, order: p.order }))
      });

      return processExists;
    } catch (error) {
      logger.error('validateProductProcess error', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Get current available quantity for a process
   */
  async getAvailableQuantity(processId: string): Promise<number> {
    const process = await Process.findById(processId);
    return process?.availableQuantity || 0;
  }

  /**
   * Calculate cumulative available quantity from previous days plus today
   * Returns sum of all previous days' remaining availableQuantity + today's availableQuantity
   * Includes ALL previous days (positive and negative) to accurately represent total available pool
   */
  async calculateCumulativeAvailableQuantity(
    factoryId: Types.ObjectId,
    productId: Types.ObjectId,
    processId: Types.ObjectId,
    today: Date
  ): Promise<number> {
    try {
      // Query all ProcessStage records from previous days (date < today)
      // Include ALL days regardless of availableQuantity value (positive or negative)
      // Negative values represent consumption from that day's pool
      const previousDaysTotal = await ProcessStage.aggregate([
        {
          $match: {
            factoryId: factoryId,
            productId: productId,
            processId: processId,
            date: { $lt: today }
            // Removed availableQuantity filter to include ALL previous days
          }
        },
        {
          $group: {
            _id: null,
            totalAvailable: { $sum: '$availableQuantity' }
          }
        }
      ]);

      const previousDaysSum = previousDaysTotal.length > 0 ? previousDaysTotal[0].totalAvailable : 0;

      // Get today's availableQuantity
      const todayStage = await ProcessStage.findOne({
        factoryId: factoryId,
        productId: productId,
        processId: processId,
        date: today
      });

      const todayAvailable = todayStage?.availableQuantity || 0;

      const cumulativeTotal = previousDaysSum + todayAvailable;

      console.log('🔍 Cumulative available quantity calculated:', {
        processId: processId.toString(),
        previousDaysSum,
        todayAvailable,
        cumulativeTotal
      });

      return cumulativeTotal;
    } catch (error) {
      console.error('❌ Error calculating cumulative available quantity:', error);
      // Fallback to today's availableQuantity only if calculation fails
      const todayStage = await ProcessStage.findOne({
        factoryId: factoryId,
        productId: productId,
        processId: processId,
        date: today
      });
      return todayStage?.availableQuantity || 0;
    }
  }

  /**
   * Get detailed quantity status for a process
   */
  async getProcessQuantityStatus(processId: string, productId?: string): Promise<ProcessQuantityStatus | null> {
    console.log('🔍 getProcessQuantityStatus called:', { processId, productId });
    
    if (!productId) {
      // Fallback for old logic
      const process = await Process.findById(processId);
      if (!process) return null;
      
      return {
        processId: process._id.toString(),
        availableQuantity: process.availableQuantity || 0,
        isLocked: process.isLocked,
        lockedAt: process.lockedAt,
        dailyTarget: process.dailyTarget || 0,
        totalAchieved: 0,
        totalRejected: 0
      };
    }
    
    // Validate product-process relationship
    const isValid = await this.validateProductProcess(productId, processId);
    if (!isValid) {
      console.log('🔍 getProcessQuantityStatus: Invalid product-process relationship:', { productId, processId });
      return null;
    }
    
    // Get stage info (single query)
    const stageInfo = await this.getStageInfo(productId, processId);
    if (!stageInfo) {
      console.log('🔍 getProcessQuantityStatus: No stage info found:', { productId, processId });
      return null;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get current and previous stage records in one batch query
    const processIds = [processId];
    if (stageInfo.previousProcess) {
      processIds.push(stageInfo.previousProcess.processId.toString());
    }
    
    const stages = await ProcessStage.find({
      factoryId: stageInfo.product.factoryId,
      productId: new Types.ObjectId(productId),
      processId: { $in: processIds.map(id => new Types.ObjectId(id)) },
      date: today
    });
    
    const currentStage = stages.find(s => s.processId.toString() === processId);
    const previousStage = stageInfo.previousProcess 
      ? stages.find(s => s.processId.toString() === stageInfo.previousProcess!.processId.toString())
      : null;
    
    // Calculate available quantity
    let availableQuantity = 0;
    if (stageInfo.isFirst) {
      availableQuantity = 999999; // Unlimited for first stage
      console.log('🔍 First stage - setting unlimited quantity:', availableQuantity);
    } else {
      // For non-first stages, calculate cumulative available quantity:
      // sum of all previous days' remaining availableQuantity + today's availableQuantity
      availableQuantity = await this.calculateCumulativeAvailableQuantity(
        stageInfo.product.factoryId,
        new Types.ObjectId(productId),
        new Types.ObjectId(processId),
        today
      );
      console.log('🔍 Cumulative available quantity for current stage:', {
        cumulativeAvailable: availableQuantity,
        todayAvailable: currentStage?.availableQuantity || 0,
        currentStageAchieved: currentStage?.achievedQuantity || 0,
        currentStageRejected: currentStage?.rejectedQuantity || 0
      });
    }
    
    // Dynamically check and update locking status based on cumulative available quantity
    let isLocked = currentStage?.isLocked || false;
    if (!stageInfo.isFirst && currentStage) {
      if (availableQuantity > 0 && isLocked) {
        // Auto-unlock if cumulative quantity becomes positive
        await ProcessStage.updateOne(
          { _id: currentStage._id },
          { $set: { isLocked: false, lockedAt: null } }
        );
        isLocked = false;
        console.log('🔓 Stage auto-unlocked due to positive cumulative available quantity:', {
          processId,
          cumulativeAvailable: availableQuantity
        });
      } else if (availableQuantity <= 0 && !isLocked) {
        // Auto-lock if cumulative quantity reaches zero
        await ProcessStage.updateOne(
          { _id: currentStage._id },
          { $set: { isLocked: true, lockedAt: new Date() } }
        );
        isLocked = true;
        console.log('🔒 Stage auto-locked due to zero cumulative available quantity:', {
          processId,
          cumulativeAvailable: availableQuantity
        });
      }
    }
    
    const result = {
      processId,
      availableQuantity,
      isLocked,
      lockedAt: isLocked ? (currentStage?.lockedAt || new Date()) : null,
      dailyTarget: stageInfo.product.dailyTarget || 0,
      totalAchieved: currentStage?.achievedQuantity || 0,
      totalRejected: currentStage?.rejectedQuantity || 0
    };
    
    console.log('🔍 Returning quantity status:', result);
    return {
      ...result,
      lockedAt: result.lockedAt || undefined
    };
  }

  /**
   * Atomically deduct quantity from a process
   * Returns success status and remaining quantity
   */
  async deductQuantity(
    processId: string, 
    achieved: number, 
    rejected: number,
    productId?: string
  ): Promise<QuantityUpdateResult> {
    try {
      console.log('⚙️ deductQuantity called:', { productId, processId, achieved, rejected });
      
      if (!productId) {
        throw new Error('Product ID is required for process stage tracking');
      }

      // Validate product-process relationship
      const isValid = await this.validateProductProcess(productId, processId);
      if (!isValid) {
        throw new Error(`Process ${processId} does not belong to product ${productId}`);
      }

      // Get stage info
      const stageInfo = await this.getStageInfo(productId, processId);
      if (!stageInfo) {
        throw new Error('Invalid stage configuration');
      }
      
      console.log('⚙️ Stage Info:', {
        currentProcessOrder: stageInfo.currentProcess.order,
        previousProcessOrder: stageInfo.previousProcess?.order,
        nextProcessOrder: stageInfo.nextProcess?.order,
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const totalToDeduct = achieved + rejected;
      
      // Prepare batch updates
      const updates: any[] = [];
      
      if (stageInfo.isFirst) {
        // First stage: Just increment achieved/rejected and transfer to next
        updates.push(
          ProcessStage.updateOne(
            { 
              factoryId: stageInfo.product.factoryId, 
              productId: new Types.ObjectId(productId), 
              processId: new Types.ObjectId(processId), 
              date: today 
            },
            { 
              $setOnInsert: {
                stageOrder: stageInfo.currentProcess.order,
                isLocked: false
              },
              $inc: { 
                achievedQuantity: achieved, 
                rejectedQuantity: rejected
                // REMOVED: availableQuantity: achieved - first stage doesn't track its own available
              } 
            },
            { upsert: true }
          )
        );
        
        // Transfer to next stage if exists
        if (stageInfo.nextProcess) {
          updates.push(
            ProcessStage.updateOne(
              { 
                factoryId: stageInfo.product.factoryId, 
                productId: new Types.ObjectId(productId), 
                processId: new Types.ObjectId(stageInfo.nextProcess.processId), 
                date: today 
              },
              { 
                $setOnInsert: {
                  stageOrder: stageInfo.nextProcess.order,
                  isLocked: false,
                  achievedQuantity: 0,
                  rejectedQuantity: 0
                },
                $inc: { availableQuantity: achieved } // Only achieved!
              },
              { upsert: true }
            )
          );
        }
      } else {
        // Non-first stage: Consumption-based system
        
        console.log('⚙️ Non-first stage processing:', {
          currentProcessId: stageInfo.currentProcess.processId,
          currentProcessOrder: stageInfo.currentProcess.order,
        });
        
        // Get current stage to check available quantity
        const currentStage = await ProcessStage.findOne({
          factoryId: stageInfo.product.factoryId,
          productId: new Types.ObjectId(productId),
          processId: new Types.ObjectId(processId),
          date: today
        });
        
        if (currentStage) {
          console.log('⚙️ Current Stage Record (before update):', {
            processId: currentStage.processId,
            availableQuantity: currentStage.availableQuantity,
            achievedQuantity: currentStage.achievedQuantity,
            rejectedQuantity: currentStage.rejectedQuantity,
          });
        }
        
        // For validation, check cumulative available quantity (previous days + today)
        // but consumption will still happen from today's ProcessStage only
        const cumulativeAvailableQuantity = await this.calculateCumulativeAvailableQuantity(
          stageInfo.product.factoryId,
          new Types.ObjectId(productId),
          new Types.ObjectId(processId),
          today
        );
        
        const todayAvailableQuantity = currentStage?.availableQuantity || 0;
        const totalToConsume = achieved + rejected;
        
        console.log('🔍 Checking consumption limits:', {
          processId,
          productId,
          stageOrder: stageInfo.currentProcess.order,
          todayAvailableQuantity,
          cumulativeAvailableQuantity,
          totalToConsume,
          achieved,
          rejected,
          currentStageData: currentStage
        });
        
        // Check if there's enough cumulative available quantity to consume
        if (cumulativeAvailableQuantity < totalToConsume) {
          console.log('❌ Insufficient quantity available for consumption:', {
            required: totalToConsume,
            cumulativeAvailable: cumulativeAvailableQuantity,
            todayAvailable: todayAvailableQuantity,
            shortfall: totalToConsume - cumulativeAvailableQuantity,
            currentStageData: currentStage
          });
          throw new Error(`Insufficient quantity available. Required: ${totalToConsume}, Available: ${cumulativeAvailableQuantity}. Cannot process this quantity.`);
        }
        
        // Calculate remaining after consumption
        // Note: We validate against cumulative quantity, but consumption always happens from today's ProcessStage
        // If today's availableQuantity becomes negative, it represents consumption from the cumulative pool
        const remainingAfterConsumption = todayAvailableQuantity - totalToConsume;
        // Lock stage only if cumulative quantity is fully consumed
        const shouldLock = cumulativeAvailableQuantity - totalToConsume <= 0;
        
        console.log('🔍 Consumption analysis:', {
          todayAvailableQuantity,
          cumulativeAvailableQuantity,
          totalToConsume,
          remainingAfterConsumption,
          shouldLock,
          willExceedTodayLimit: totalToConsume > todayAvailableQuantity
        });
        
        // 1. Update current stage - consume units and add achieved/rejected
        // Consumption always happens from today's ProcessStage (may go negative if consuming from cumulative pool)
        console.log('⚙️ Updating current stage availableQuantity:', {
          processId: stageInfo.currentProcess.processId,
          decrementBy: -totalToConsume,
        });
        
        updates.push(
          ProcessStage.updateOne(
            { 
              factoryId: stageInfo.product.factoryId, 
              productId: new Types.ObjectId(productId), 
              processId: new Types.ObjectId(processId), 
              date: today 
            },
            { 
              $setOnInsert: {
                stageOrder: stageInfo.currentProcess.order,
                isLocked: false
              },
              $inc: { 
                achievedQuantity: achieved, 
                rejectedQuantity: rejected,
                availableQuantity: -totalToConsume // Consume the units (may make today negative)
              }
            },
            { upsert: true }
          )
        );
        
        // 2. If the stage should be locked, do it in a separate operation
        if (shouldLock) {
          updates.push(
            ProcessStage.updateOne(
              { 
                factoryId: stageInfo.product.factoryId, 
                productId: new Types.ObjectId(productId), 
                processId: new Types.ObjectId(processId), 
                date: today 
              },
              { 
                $set: { 
                  isLocked: true, 
                  lockedAt: new Date() 
                }
              }
            )
          );
        }
        
        // 3. Transfer achieved quantity to next stage (only achieved, NOT rejected)
        if (stageInfo.nextProcess) {
          console.log('⚙️ Updating next stage availableQuantity:', {
            nextProcessId: stageInfo.nextProcess.processId,
            incrementBy: achieved,
          });
          
          updates.push(
            ProcessStage.updateOne(
              { 
                factoryId: stageInfo.product.factoryId, 
                productId: new Types.ObjectId(productId), 
                processId: new Types.ObjectId(stageInfo.nextProcess.processId), 
                date: today 
              },
              { 
                $setOnInsert: {
                  stageOrder: stageInfo.nextProcess.order,
                  isLocked: false
                },
                $inc: { availableQuantity: achieved } // Only achieved transfers!
              },
              { upsert: true }
            )
          );
        }
        
        console.log('✅ Consumption processed:', {
          consumed: totalToConsume,
          remaining: remainingAfterConsumption,
          stageLocked: shouldLock,
          transferredToNext: achieved
        });
      }
      
      // Execute all updates in parallel
      await Promise.all(updates);
      
      // Get updated stages for WebSocket events
      const affectedProcessIds = [processId];
      if (stageInfo.previousProcess) affectedProcessIds.push(stageInfo.previousProcess.processId.toString());
      if (stageInfo.nextProcess) affectedProcessIds.push(stageInfo.nextProcess.processId.toString());
      
      console.log('🔍 WebSocket events for affected stages:', {
        affectedProcessIds,
        currentStage: processId,
        previousStage: stageInfo.previousProcess?.processId.toString(),
        nextStage: stageInfo.nextProcess?.processId.toString()
      });
      
      // Emit WebSocket events for all affected stages
      for (const affectedProcessId of affectedProcessIds) {
        const affectedStage = await ProcessStage.findOne({
          factoryId: stageInfo.product.factoryId,
          productId: new Types.ObjectId(productId),
          processId: new Types.ObjectId(affectedProcessId),
          date: today
        });
        
        console.log('🔍 Emitting WebSocket for stage:', {
          processId: affectedProcessId,
          availableQuantity: affectedStage?.availableQuantity,
          achievedQuantity: affectedStage?.achievedQuantity,
          rejectedQuantity: affectedStage?.rejectedQuantity,
          isLocked: affectedStage?.isLocked
        });
        
      }

      // Check for auto-lock conditions (only for non-first stages)
      if (!stageInfo.isFirst) {
        const currentStage = await ProcessStage.findOne({
          factoryId: stageInfo.product.factoryId,
          productId: new Types.ObjectId(productId),
          processId: new Types.ObjectId(processId),
          date: today
        });

        // Auto-lock only if cumulative available quantity (previous days + today) reaches zero
        // Don't lock just because today's availableQuantity is negative (could be consuming from previous days' pool)
        const cumulativeAvailableQuantity = await this.calculateCumulativeAvailableQuantity(
          stageInfo.product.factoryId,
          new Types.ObjectId(productId),
          new Types.ObjectId(processId),
          today
        );

        if (currentStage && cumulativeAvailableQuantity <= 0) {
          await ProcessStage.updateOne(
            { _id: currentStage._id },
            { $set: { isLocked: true, lockedAt: new Date() } }
          );
          console.log('🔒 Stage auto-locked due to zero cumulative available quantity:', {
            processId,
            todayAvailable: currentStage.availableQuantity,
            cumulativeAvailable: cumulativeAvailableQuantity
          });
        }
      }
      // Note: First stage (stageInfo.isFirst) is never auto-locked
      // because it has unlimited input and multiple employees can submit

      return {
        success: true,
        remainingQuantity: 0,
        stageCompleted: false
      };

    } catch (error) {
      console.error('Error deducting quantity:', error);
      return {
        success: false,
        remainingQuantity: 0,
        stageCompleted: false
      };
    }
  }

  /**
   * Transfer achieved quantity to the next process in the waterfall
   */
  async transferToNextProcess(processId: string, quantity: number): Promise<boolean> {
    try {
      const currentProcess = await Process.findById(processId);
      if (!currentProcess) return false;

      // Find the next process in the same factory with higher order
      const nextProcess = await Process.findOne({
        factoryId: currentProcess.factoryId,
        order: { $gt: currentProcess.order }
      }).sort({ order: 1 });

      if (nextProcess) {
        // Add the quantity to the next process
        await Process.findByIdAndUpdate(
          nextProcess._id,
          { $inc: { availableQuantity: quantity } }
        );
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error transferring to next process:', error);
      return false;
    }
  }

  /**
   * Check if a stage should be locked and lock it if necessary
   * Note: First stage (order = 1) is never auto-locked
   */
  async checkAndLockStage(processId: string): Promise<boolean> {
    try {
      const process = await Process.findById(processId);
      if (!process || process.isLocked) return false;

      // Never lock the first stage (order = 1) as it has unlimited input
      if (process.order === 1) {
        return false;
      }

      // If available quantity is 0 or less, lock the stage
      if (process.availableQuantity <= 0) {
        await Process.findByIdAndUpdate(processId, {
          isLocked: true,
          lockedAt: new Date()
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking stage lock:', error);
      return false;
    }
  }

  /**
   * Manually unlock a stage (for supervisor override)
   */
  async unlockStage(processId: string): Promise<boolean> {
    try {
      const process = await Process.findById(processId);
      if (!process) return false;

      await Process.findByIdAndUpdate(processId, {
        isLocked: false,
        lockedAt: null
      });

      // Also unlock ProcessStage records for this process
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      await ProcessStage.updateMany(
        {
          processId: new Types.ObjectId(processId),
          date: today
        },
        {
          isLocked: false,
          lockedAt: null
        }
      );

      console.log('🔓 Stage unlocked:', {
        processId,
        processName: process.name,
        factoryId: process.factoryId
      });


      return true;
    } catch (error) {
      console.error('Error unlocking stage:', error);
      return false;
    }
  }

  /**
   * Unlock all locked stages for a factory (debugging utility)
   */
  async unlockAllStages(factoryId: string): Promise<boolean> {
    try {
      console.log('🔓 Unlocking all stages for factory:', factoryId);
      
      // Unlock Process model stages
      await Process.updateMany(
        { factoryId: new Types.ObjectId(factoryId) },
        { isLocked: false, lockedAt: null }
      );

      // Unlock ProcessStage records
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      await ProcessStage.updateMany(
        {
          factoryId: new Types.ObjectId(factoryId),
          date: today
        },
        {
          isLocked: false,
          lockedAt: null
        }
      );

      console.log('🔓 All stages unlocked for factory:', factoryId);
      return true;
    } catch (error) {
      console.error('Error unlocking all stages:', error);
      return false;
    }
  }

  /**
   * Set daily target for a process (typically Process 1)
   */
  async setDailyTarget(processId: string, target: number): Promise<boolean> {
    try {
      await Process.findByIdAndUpdate(processId, {
        dailyTarget: target,
        availableQuantity: target,
        isLocked: false,
        lockedAt: null
      });
      return true;
    } catch (error) {
      console.error('Error setting daily target:', error);
      return false;
    }
  }

  /**
   * Reset daily quantities for all processes in a factory
   */
  async resetDailyQuantities(factoryId: string): Promise<boolean> {
    try {
      // Reset all processes in the factory
      await Process.updateMany(
        { factoryId: new Types.ObjectId(factoryId) },
        {
          availableQuantity: 0,
          isLocked: false,
          lockedAt: null
        }
      );

      // Set Process 1 (order = 1) to its daily target
      const firstProcess = await Process.findOne({
        factoryId: new Types.ObjectId(factoryId),
        order: 1
      });

      if (firstProcess && firstProcess.dailyTarget > 0) {
        await Process.findByIdAndUpdate(firstProcess._id, {
          availableQuantity: firstProcess.dailyTarget
        });
      }

      // Reset or archive ProcessStage records
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      await ProcessStage.updateMany(
        { 
          factoryId: new Types.ObjectId(factoryId),
          date: { $lt: today }
        },
        {
          isLocked: true, // Lock old records
          lockedAt: new Date()
        }
      );


      return true;
    } catch (error) {
      console.error('Error resetting daily quantities:', error);
      return false;
    }
  }

  /**
   * Get waterfall view for all processes in a factory
   */
  async getWaterfallView(factoryId: string): Promise<ProcessQuantityStatus[]> {
    try {
      const processes = await Process.find({ 
        factoryId: new Types.ObjectId(factoryId) 
      }).sort({ order: 1 });

      const waterfallData: ProcessQuantityStatus[] = [];

      for (const process of processes) {
        const status = await this.getProcessQuantityStatus(process._id.toString());
        if (status) {
          waterfallData.push(status);
        }
      }

      return waterfallData;
    } catch (error) {
      console.error('Error getting waterfall view:', error);
      return [];
    }
  }

  /**
   * Validate if work can be started on a process
   */
  async canStartWork(processId: string, productId?: string): Promise<{ canStart: boolean; reason?: string }> {
    try {
      const process = await Process.findById(processId);
      if (!process) {
        return { canStart: false, reason: 'Process not found' };
      }

      if (process.isLocked) {
        return { canStart: false, reason: 'Process stage is locked' };
      }

      // If productId is provided, use the new logic to calculate available quantity from previous stage
      if (productId) {
        const product = await Product.findById(productId);
        if (!product) {
          return { canStart: false, reason: 'Product not found' };
        }

        // Find the process order in the product
        const processAssignment = product.processes?.find(p => p.processId.toString() === processId);
        const processOrder = processAssignment?.order;
        
        if (processOrder === 1) {
          // First process stage - always allow
          return { canStart: true };
        } else if (processOrder && processOrder > 1) {
          // Get previous process and calculate cumulative available quantity
          const previousProcess = product.processes?.find(p => p.order === processOrder - 1);
          if (previousProcess) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Calculate cumulative available quantity from previous stage
            // This includes all previous days' remaining availableQuantity + today's availableQuantity
            const cumulativeAvailableQuantity = await this.calculateCumulativeAvailableQuantity(
              product.factoryId,
              new Types.ObjectId(productId),
              new Types.ObjectId(previousProcess.processId),
              today
            );
            
            if (cumulativeAvailableQuantity <= 0) {
              return { canStart: false, reason: 'No quantity available from previous stage' };
            }
            
            return { canStart: true };
          }
        }
      }

      // Fallback to old logic if no productId provided
      if (process.availableQuantity <= 0) {
        return { canStart: false, reason: 'No quantity available for this stage' };
      }

      return { canStart: true };
    } catch (error) {
      console.error('Error validating work start:', error);
      return { canStart: false, reason: 'Validation error' };
    }
  }
}

export default new QuantityService();
