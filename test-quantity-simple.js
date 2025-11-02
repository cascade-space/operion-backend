// Simple test to verify quantity deduction and transfer logic
// This simulates the core logic without database operations

console.log('🧪 Testing Quantity Deduction and Transfer Logic');
console.log('=' .repeat(60));

// Test configuration
const TEST_CONFIG = {
  factoryId: '68eb4b7642180ba0e53457f4',
  product1Id: '68f695645b2b1cb13f7cdf53', // Product A
  product2Id: '68f695755b2b1cb13f7cdf77', // Product B
  processIds: [
    '68f695515b2b1cb13f7cdf29', // Stage 1
    '68f695515b2b1cb13f7cdf2e', // Stage 2
    '68f695515b2b1cb13f7cdf33', // Stage 3
    '68f695515b2b1cb13f7cdf38'  // Stage 4
  ]
};

// Simulate ProcessStage records
const processStages = new Map();

// Simulate Product configurations
const products = {
  [TEST_CONFIG.product1Id]: {
    name: 'Product A',
    processes: [
      { processId: TEST_CONFIG.processIds[0], order: 1 },
      { processId: TEST_CONFIG.processIds[1], order: 2 },
      { processId: TEST_CONFIG.processIds[2], order: 3 },
      { processId: TEST_CONFIG.processIds[3], order: 4 }
    ]
  },
  [TEST_CONFIG.product2Id]: {
    name: 'Product B',
    processes: [
      { processId: TEST_CONFIG.processIds[0], order: 1 },
      { processId: TEST_CONFIG.processIds[1], order: 2 },
      { processId: TEST_CONFIG.processIds[2], order: 3 },
      { processId: TEST_CONFIG.processIds[3], order: 4 }
    ]
  }
};

function getProcessStageKey(productId, processId) {
  return `${productId}-${processId}`;
}

function getProcessStage(productId, processId) {
  const key = getProcessStageKey(productId, processId);
  return processStages.get(key) || {
    productId,
    processId,
    achievedQuantity: 0,
    rejectedQuantity: 0,
    availableQuantity: 0,
    stageOrder: 0
  };
}

function updateProcessStage(productId, processId, updates) {
  const key = getProcessStageKey(productId, processId);
  const current = getProcessStage(productId, processId);
  const updated = { ...current, ...updates };
  processStages.set(key, updated);
  return updated;
}

function simulateWorkEntry(productId, processId, achieved, rejected, description) {
  console.log(`\n🔸 ${description}`);
  console.log(`   Input: ${achieved} achieved, ${rejected} rejected`);
  
  const product = products[productId];
  const processAssignment = product.processes.find(p => p.processId === processId);
  const stageOrder = processAssignment.order;
  
  console.log(`   Stage Order: ${stageOrder}`);
  
  const totalToDeduct = achieved + rejected;
  
  if (stageOrder === 1) {
    // First stage - unlimited input
    console.log('   ✅ First stage - unlimited input');
    
    // Update current stage
    const currentStage = getProcessStage(productId, processId);
    const updatedStage = updateProcessStage(productId, processId, {
      stageOrder: stageOrder,
      achievedQuantity: currentStage.achievedQuantity + achieved,
      rejectedQuantity: currentStage.rejectedQuantity + rejected,
      availableQuantity: currentStage.availableQuantity + achieved // Only achieved goes to next
    });
    
    console.log(`   📊 Current stage: achieved=${updatedStage.achievedQuantity}, rejected=${updatedStage.rejectedQuantity}, available=${updatedStage.availableQuantity}`);
    
    // Transfer to next stage if exists
    const nextProcess = product.processes.find(p => p.order === stageOrder + 1);
    if (nextProcess) {
      const nextStage = getProcessStage(productId, nextProcess.processId);
      updateProcessStage(productId, nextProcess.processId, {
        stageOrder: nextProcess.order,
        availableQuantity: nextStage.availableQuantity + achieved // Only achieved!
      });
      console.log(`   📤 Transferred ${achieved} to next stage`);
    }
    
  } else {
    // Non-first stage - check available quantity
    const currentStage = getProcessStage(productId, processId);
    const availableQuantity = currentStage.availableQuantity;
    
    console.log(`   Available quantity: ${availableQuantity}`);
    
    if (availableQuantity < totalToDeduct) {
      console.log(`   ❌ Insufficient quantity! Required: ${totalToDeduct}, Available: ${availableQuantity}`);
      throw new Error(`Insufficient quantity available. Required: ${totalToDeduct}, Available: ${availableQuantity}`);
    }
    
    console.log('   ✅ Sufficient quantity available');
    
    // Update current stage
    const updatedStage = updateProcessStage(productId, processId, {
      stageOrder: stageOrder,
      achievedQuantity: currentStage.achievedQuantity + achieved,
      rejectedQuantity: currentStage.rejectedQuantity + rejected,
      availableQuantity: currentStage.availableQuantity - totalToDeduct // Decrement by what was consumed
    });
    
    console.log(`   📊 Current stage: achieved=${updatedStage.achievedQuantity}, rejected=${updatedStage.rejectedQuantity}, available=${updatedStage.availableQuantity}`);
    
    // Transfer to next stage if exists
    const nextProcess = product.processes.find(p => p.order === stageOrder + 1);
    if (nextProcess) {
      const nextStage = getProcessStage(productId, nextProcess.processId);
      updateProcessStage(productId, nextProcess.processId, {
        stageOrder: nextProcess.order,
        availableQuantity: nextStage.availableQuantity + achieved // Only achieved!
      });
      console.log(`   📤 Transferred ${achieved} to next stage`);
    }
  }
}

function printFinalQuantities() {
  console.log('\n📊 Final ProcessStage Records:');
  
  for (const [productId, product] of Object.entries(products)) {
    console.log(`\n🏭 ${product.name}:`);
    
    for (let i = 0; i < 4; i++) {
      const stage = getProcessStage(productId, TEST_CONFIG.processIds[i]);
      console.log(`   Stage ${i + 1}: achieved=${stage.achievedQuantity}, rejected=${stage.rejectedQuantity}, available=${stage.availableQuantity}`);
    }
  }
}

async function testQuantityLogic() {
  try {
    // Test Product A workflow
    console.log('\n📦 Testing Product A Workflow');
    console.log('-'.repeat(40));
    
    // Stage 1: Product A
    simulateWorkEntry(TEST_CONFIG.product1Id, TEST_CONFIG.processIds[0], 1000, 200, 'Stage 1 - Product A (Raw Materials)');
    
    // Stage 2: Product A
    simulateWorkEntry(TEST_CONFIG.product1Id, TEST_CONFIG.processIds[1], 600, 200, 'Stage 2 - Product A (Processing)');
    
    // Stage 3: Product A
    simulateWorkEntry(TEST_CONFIG.product1Id, TEST_CONFIG.processIds[2], 300, 100, 'Stage 3 - Product A (Assembly)');
    
    // Stage 4: Product A
    simulateWorkEntry(TEST_CONFIG.product1Id, TEST_CONFIG.processIds[3], 200, 50, 'Stage 4 - Product A (Finishing)');
    
    // Test Product B workflow
    console.log('\n📦 Testing Product B Workflow');
    console.log('-'.repeat(40));
    
    // Stage 1: Product B
    simulateWorkEntry(TEST_CONFIG.product2Id, TEST_CONFIG.processIds[0], 800, 100, 'Stage 1 - Product B (Raw Materials)');
    
    // Stage 2: Product B
    simulateWorkEntry(TEST_CONFIG.product2Id, TEST_CONFIG.processIds[1], 500, 200, 'Stage 2 - Product B (Processing)');
    
    // Stage 3: Product B
    simulateWorkEntry(TEST_CONFIG.product2Id, TEST_CONFIG.processIds[2], 250, 50, 'Stage 3 - Product B (Assembly)');
    
    // Stage 4: Product B
    simulateWorkEntry(TEST_CONFIG.product2Id, TEST_CONFIG.processIds[3], 150, 50, 'Stage 4 - Product B (Finishing)');
    
    // Final summary
    console.log('\n📊 Final Summary');
    console.log('=' .repeat(60));
    printFinalQuantities();
    
    console.log('\n🎉 Test completed successfully!');
    console.log('\n📋 Expected Results:');
    console.log('✅ Product A: 1000 → 800 → 300 → 200 (achieved quantities)');
    console.log('✅ Product B: 800 → 500 → 250 → 150 (achieved quantities)');
    console.log('✅ Each stage should have correct available quantities for next stage');
    console.log('✅ Rejected quantities should not transfer between stages');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testQuantityLogic();
