/**
 * Quick BrainJar Test Script
 *
 * Tests boot, stimulate, observe, and metrics.
 */

import BrainJar from './index.js';

async function test() {
  const brain = new BrainJar({
    pythonScript: '../brain_engine_mock.py',
  });
  
  try {
    console.log('🚀 [TEST] Starting BrainJar...');
    await brain.boot();
    
    console.log('✓ [TEST] Brain booted successfully');
    
    // Test stimulate
    console.log('⚡ [TEST] Stimulating...');
    const stimulus_result = await brain.stimulate([720575940619341105, 720575940660219265], 150);
    console.log('✓ [TEST] Stimulus response:', {
      step_count: stimulus_result.step_count,
      motor_rates: stimulus_result.motor_rates,
    });
    
    // Test observe
    console.log('👁️ [TEST] Observing...');
    const observation = await brain.observe();
    console.log('✓ [TEST] Observation:', {
      step_count: observation.step_count,
      active_neurons: Object.keys(observation.all_rates || {}).length,
    });
    
    // Test config
    console.log('⚙️ [TEST] Updating config...');
    const config_result = await brain.updateConfig({ r_poi: 200 });
    console.log('✓ [TEST] Config updated');
    
    // Test status
    console.log('📊 [TEST] Checking status...');
    const status = await brain.getStatus();
    console.log('✓ [TEST] Status:', {
      loaded: status.loaded,
      step_count: status.step_count,
      neurons_count: status.neurons_count,
    });
    
    // Test metrics
    console.log('📈 [TEST] Collecting metrics...');
    const metrics = brain.getMetrics();
    console.log('✓ [TEST] Metrics:', {
      total_operations: metrics.total_operations,
      avg_latency_ms: metrics.avg_latency_ms.toFixed(2),
    });
    
    // Shutdown
    console.log('🛑 [TEST] Shutting down...');
    await brain.shutdown();
    console.log('✓ [TEST] Shutdown complete');
    
    console.log('\n✅ All tests passed!');
  } catch (err) {
    console.error('❌ [TEST] Error:', err.message);
    process.exit(1);
  }
}

test();
