#!/usr/bin/env node

/**
 * BrainJar Quick Start Script
 *
 * Usage:
 *   node brain-jar/start.js
 *   node brain-jar/start.js --test
 *   node brain-jar/start.js --help
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import BrainJar from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function showHelp() {
  console.log(`
BrainJar Quick Start Script

Usage:
  node start.js              Start dashboard server (http://localhost:3000)
  node start.js --test       Run comprehensive tests
  node start.js --help       Show this help message

Environment:
  PORT=3000                  Dashboard server port (default: 3000)
  API_PORT=8000              Python API port (default: 8000)

Examples:
  PORT=4000 node start.js    Start dashboard on port 4000
  node start.js --test       Run full test suite
  `);
}

async function runTests() {
  console.log('🧪 Running BrainJar Test Suite...\n');
  
  const brain = new BrainJar({
    pythonScript: '../brain_engine_mock.py',
  });
  
  let passed = 0, failed = 0;
  
  // Test 1: Boot
  try {
    console.log('Test 1: boot()');
    await brain.boot();
    console.log('✅ PASS\n');
    passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}\n`);
    failed++;
  }
  
  // Test 2: Stimulate
  try {
    console.log('Test 2: stimulate()');
    const res = await brain.stimulate([720575940619341105], 100);
    if (!res.motor_rates || !res.step_count) throw new Error('Invalid response');
    console.log('✅ PASS\n');
    passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}\n`);
    failed++;
  }
  
  // Test 3: Observe
  try {
    console.log('Test 3: observe()');
    const res = await brain.observe();
    if (!res.timestamp) throw new Error('Invalid response');
    console.log('✅ PASS\n');
    passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}\n`);
    failed++;
  }
  
  // Test 4: Config
  try {
    console.log('Test 4: updateConfig()');
    await brain.updateConfig({ r_poi: 200 });
    console.log('✅ PASS\n');
    passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}\n`);
    failed++;
  }
  
  // Test 5: Status
  try {
    console.log('Test 5: getStatus()');
    const res = await brain.getStatus();
    if (!res.loaded) throw new Error('Not loaded');
    console.log('✅ PASS\n');
    passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}\n`);
    failed++;
  }
  
  // Test 6: Metrics
  try {
    console.log('Test 6: getMetrics()');
    const res = brain.getMetrics();
    if (res.total_operations < 1) throw new Error('No operations recorded');
    console.log('✅ PASS\n');
    passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}\n`);
    failed++;
  }
  
  // Cleanup
  console.log('Shutting down...');
  await brain.shutdown();
  
  // Summary
  console.log('\n' + '='.repeat(40));
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

async function startDashboard() {
  const port = process.env.PORT || 3000;
  
  console.log(`
╔════════════════════════════════════╗
║        🧠 BrainJar Dashboard       ║
║     Neural Observatory v0.1.0     ║
╚════════════════════════════════════╝

🚀 Starting services...
  Dashboard: http://localhost:${port}
  Python API: http://127.0.0.1:8000
  
Booting neural network...
  `);
  
  // Start dashboard server as subprocess
  const dashboardProcess = spawn('node', [
    path.join(__dirname, 'dashboard-v2.js'),
  ], {
    cwd: __dirname,
    stdio: 'inherit',  // Inherit stdio so we see all output
    env: {
      ...process.env,
      PORT: port,
    },
  });
  
  // Handle termination
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    dashboardProcess.kill('SIGINT');
    process.exit(0);
  });
  
  dashboardProcess.on('error', (err) => {
    console.error('❌ Dashboard error:', err);
    process.exit(1);
  });
  
  dashboardProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ Dashboard exited with code ${code}`);
      process.exit(code);
    }
  });
}

// Main
const command = args[0] || 'dashboard';

switch (command) {
  case '--help':
  case '-h':
    showHelp();
    break;
    
  case '--test':
  case 'test':
    runTests();
    break;
    
  case 'dashboard':
  default:
    startDashboard();
}
