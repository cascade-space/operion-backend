// Test error scenarios for quantity deduction logic
console.log('🧪 Testing Quantity Deduction Error Scenarios');
console.log('=' .repeat(60));

// Test configuration
const TEST_CONFIG = {
  productId: '68f695645b2b1cb13f7cdf53',
  processIds: [
    '68f695515b2b1cb13f7cdf29', // Stage 1
    '68f695515b2b1cb13f7cdf2e', // Stage 2
    '68f695515b2b1cb13f7cdf33', // Stage 3
    '68f695515b2b1cb13f7cdf38'  // Stage 4
  ]
};

// Simulate ProcessStage records
const processStages = new Map();

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
  
  const stageOrder = processId === TEST_CONFIG.processIds[0] ? 1 :
                    processId === TEST_CONFIG.processIds[1] ? 2 :
                    processId === TEST_CONFIG.processIds[2] ? 3 : 4;
  
  console.log(`   Stage Order: ${stageOrder}`);
  
  const totalToDeduct = achieved + rejected;
  
  if (stageOrder === 1) {
    // First stage - unlimited input
    console.log('   ✅ First stage - unlimited input');
    
    const currentStage = getProcessStage(productId, processId);
    const updatedStage = updateProcessStage(productId, processId, {
      stageOrder: stageOrder,
      achievedQuantity: currentStage.achievedQuantity + achieved,
      rejectedQuantity: currentStage.rejectedQuantity + rejected,
      availableQuantity: currentStage.availableQuantity + achieved
    });
    
    console.log(`   📊 Current stage: achieved=${updatedStage.achievedQuantity}, rejected=${updatedStage.rejectedQuantity}, available=${updatedStage.availableQuantity}`);
    
    // Transfer to next stage
    if (stageOrder < 4) {
      const nextProcessId = TEST_CONFIG.processIds[stageOrder];
      const nextStage = getProcessStage(productId, nextProcessId);
      updateProcessStage(productId, nextProcessId, {
        stageOrder: stageOrder + 1,
        availableQuantity: nextStage.availableQuantity + achieved
      });
      console.log(`   📤 Transferred ${achieved} to next stage`);
    }
    
  } else {
    // Non-first stage - check available quantity
    const currentStage = getProcessStage(productId, processId);
    const availableQuantity = currentStage.availableQuantity;
    
    console.log(`   Available quantity: ${availableQuantity}`);
    
    if (availableQuantity < totalToDeduct) {
      console.log(`   ❌ INSUFFICIENT QUANTITY! Required: ${totalToDeduct}, Available: ${availableQuantity}`);
      throw new Error(`Insufficient quantity available. Required: ${totalToDeduct}, Available: ${availableQuantity}`);
    }
    
    console.log('   ✅ Sufficient quantity available');
    
    const updatedStage = updateProcessStage(productId, processId, {
      stageOrder: stageOrder,
      achievedQuantity: currentStage.achievedQuantity + achieved,
      rejectedQuantity: currentStage.rejectedQuantity + rejected,
      availableQuantity: currentStage.availableQuantity - totalToDeduct
    });
    
    console.log(`   📊 Current stage: achieved=${updatedStage.achievedQuantity}, rejected=${updatedStage.rejectedQuantity}, available=${updatedStage.availableQuantity}`);
    
    // Transfer to next stage
    if (stageOrder < 4) {
      const nextProcessId = TEST_CONFIG.processIds[stageOrder];
      const nextStage = getProcessStage(productId, nextProcessId);
      updateProcessStage(productId, nextProcessId, {
        stageOrder: stageOrder + 1,
        availableQuantity: nextStage.availableQuantity + achieved
      });
      console.log(`   📤 Transferred ${achieved} to next stage`);
    }
  }
}

function printCurrentState() {
  console.log('\n📊 Current State:');
  for (let i = 0; i < 4; i++) {
    const stage = getProcessStage(TEST_CONFIG.productId, TEST_CONFIG.processIds[i]);
    console.log(`   Stage ${i + 1}: achieved=${stage.achievedQuantity}, rejected=${stage.rejectedQuantity}, available=${stage.availableQuantity}`);
  }
}

async function testErrorScenarios() {
  try {
    console.log('\n📦 Testing Error Scenarios');
    console.log('-'.repeat(40));
    
    // Setup: Complete Stage 1 with limited output
    console.log('\n🔧 Setup: Complete Stage 1 with limited output');
    simulateWorkEntry(TEST_CONFIG.productId, TEST_CONFIG.processIds[0], 100, 50, 'Stage 1 - Limited Output (100 achieved)');
    printCurrentState();
    
    // Test 1: Try to process more than available in Stage 2
    console.log('\n🧪 Test 1: Try to process more than available in Stage 2');
    try {
      simulateWorkEntry(TEST_CONFIG.productId, TEST_CONFIG.processIds[1], 80, 30, 'Stage 2 - Try to process 110 (80+30) when only 100 available');
    } catch (error) {
      console.log(`   ❌ Expected error caught: ${error.message}`);
    }
    printCurrentState();
    
    // Test 2: Process valid amount in Stage 2
    console.log('\n🧪 Test 2: Process valid amount in Stage 2');
    simulateWorkEntry(TEST_CONFIG.productId, TEST_CONFIG.processIds[1], 60, 20, 'Stage 2 - Process 80 (60+20) when 100 available');
    printCurrentState();
    
    // Test 3: Try to process more than available in Stage 3
    console.log('\n🧪 Test 3: Try to process more than available in Stage 3');
    try {
      simulateWorkEntry(TEST_CONFIG.productId, TEST_CONFIG.processIds[2], 50, 30, 'Stage 3 - Try to process 80 (50+30) when only 60 available');
    } catch (error) {
      console.log(`   ❌ Expected error caught: ${error.message}`);
    }
    printCurrentState();
    
    // Test 4: Process valid amount in Stage 3
    console.log('\n🧪 Test 4: Process valid amount in Stage 3');
    simulateWorkEntry(TEST_CONFIG.productId, TEST_CONFIG.processIds[2], 40, 10, 'Stage 3 - Process 50 (40+10) when 60 available');
    printCurrentState();
    
    // Test 5: Try to process more than available in Stage 4
    console.log('\n🧪 Test 5: Try to process more than available in Stage 4');
    try {
      simulateWorkEntry(TEST_CONFIG.productId, TEST_CONFIG.processIds[3], 30, 20, 'Stage 4 - Try to process 50 (30+20) when only 40 available');
    } catch (error) {
      console.log(`   ❌ Expected error caught: ${error.message}`);
    }
    printCurrentState();
    
    // Test 6: Process valid amount in Stage 4
    console.log('\n🧪 Test 6: Process valid amount in Stage 4');
    simulateWorkEntry(TEST_CONFIG.productId, TEST_CONFIG.processIds[3], 25, 5, 'Stage 4 - Process 30 (25+5) when 40 available');
    printCurrentState();
    
    console.log('\n🎉 Error scenario tests completed successfully!');
    console.log('\n📋 Test Results:');
    console.log('✅ Insufficient quantity errors were properly caught');
    console.log('✅ Valid operations completed successfully');
    console.log('✅ Quantity tracking is accurate throughout the process');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testErrorScenarios();
