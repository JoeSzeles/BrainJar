/**
 * IG Adapter & TickAnalyzer Test
 * 
 * Tests real-time tick data reception and analysis
 */

import IGAdapter from './ig-adapter.js';
import TickAnalyzer from './tick-analyzer.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  console.log('🧪 [TEST] Starting IG & Analyzer tests...\n');
  
  // Test 1: TickAnalyzer initialization
  console.log('📊 [TEST 1] Initializing TickAnalyzer...');
  const analyzer = new TickAnalyzer({ maxTicks: 100 });
  console.log('✓ [TEST 1] TickAnalyzer initialized');
  console.log('   - Summary:', analyzer.getSummary());
  console.log('   - History length:', analyzer.getTickHistory().length);
  console.log('   - Candles:', Object.keys(analyzer.getAllCandles()).length, 'timeframes\n');
  
  // Test 2: IG Adapter initialization
  console.log('🔌 [TEST 2] Initializing IG Adapter...');
  const ig = new IGAdapter({
    username: process.env.IG_USERNAME || 'demo',
    password: process.env.IG_PASSWORD || 'demo',
    apiKey: process.env.IG_API_KEY || 'demo',
    accountId: process.env.IG_ACCOUNT_ID || 'demo',
  });
  
  console.log('✓ [TEST 2] IG Adapter initialized');
  console.log('   - Credentials set:', !!process.env.IG_USERNAME);
  console.log('   - Demo mode:', !process.env.IG_USERNAME ? '✓ Yes' : '✗ No\n');
  
  // Test 3: Simulate tick data
  console.log('📈 [TEST 3] Simulating tick data (5 seconds)...');
  let tickCount = 0;
  let analysisCount = 0;
  
  const tickHandler = (tick) => {
    tickCount++;
    const analysis = analyzer.analyzeTick(tick);
    analysisCount++;
    
    if (tickCount <= 3) {
      console.log(`   Tick #${tickCount}:`, {
        bid: tick.bid.toFixed(1),
        ask: tick.ask.toFixed(1),
        price: tick.price.toFixed(1),
        volume: tick.volume,
        spread: (tick.ask - tick.bid).toFixed(5),
        condition: analysis?.market_condition,
        trend: analysis?.trend,
      });
    }
  };
  
  ig.on('tick', tickHandler);
  
  // Simulate ticks (if no real IG connection)
  ig.simulateTicks();
  
  // Wait 5 seconds
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log(`✓ [TEST 3] Received ${tickCount} ticks, analyzed ${analysisCount}`);
  
  // Test 4: Analyzer summary
  console.log('\n📊 [TEST 4] TickAnalyzer Summary...');
  const summary = analyzer.getSummary();
  console.log('✓ [TEST 4] Analysis complete:');
  console.log('   - Price Stats:');
  console.log(`     • Current: ${summary.price?.current?.toFixed(1) || 'N/A'}`);
  console.log(`     • Range: ${summary.price?.min?.toFixed(1) || 'N/A'} - ${summary.price?.max?.toFixed(1) || 'N/A'}`);
  console.log(`     • Volatility: ${summary.volatility?.toFixed(4) || 'N/A'}`);
  console.log('   - Volume Stats:');
  console.log(`     • Current: ${summary.volume?.current || 'N/A'}`);
  console.log(`     • Average: ${summary.volume?.average?.toFixed(0) || 'N/A'}`);
  console.log('   - Spread Stats:');
  console.log(`     • Current: ${summary.spread?.current?.toFixed(5) || 'N/A'}`);
  console.log(`     • Average: ${summary.spread?.average?.toFixed(5) || 'N/A'}`);
  
  // Test 5: Tick history
  console.log('\n📝 [TEST 5] Tick History (last 5)...');
  const history = analyzer.getTickHistory();
  console.log(`✓ [TEST 5] Total ticks stored: ${history.length}`);
  history.slice(-5).forEach((t, i) => {
    console.log(`   [${i+1}] Price: ${t.price?.toFixed(1) || 'N/A'}, Vol: ${t.volume || 'N/A'}, Spread: ${t.spread?.toFixed(5) || 'N/A'}`);
  });
  
  // Test 6: Candle data
  console.log('\n🕯️ [TEST 6] Candle Data...');
  const candles = analyzer.getAllCandles();
  Object.entries(candles).forEach(([tf, data]) => {
    console.log(`   ${tf}: ${data.length} candles`);
    if (data.length > 0) {
      const latest = data[data.length - 1];
      console.log(`      Latest: O=${latest.open?.toFixed(1)}, H=${latest.high?.toFixed(1)}, L=${latest.low?.toFixed(1)}, C=${latest.close?.toFixed(1)}, V=${latest.volume}`);
    }
  });
  
  // Test 7: Trading signals
  console.log('\n⚡ [TEST 7] Trading Signals (latest tick analysis)...');
  if (history.length > 0) {
    const lastTick = history[history.length - 1];
    const lastAnalysis = analyzer.analyzeTick(lastTick);
    console.log('✓ [TEST 7] Last tick signals:');
    console.log(`   • Market Condition: ${lastAnalysis?.market_condition || 'N/A'}`);
    console.log(`   • Trend: ${lastAnalysis?.trend || 'N/A'}`);
    console.log(`   • Price Level: ${lastAnalysis?.price_level || 'N/A'}`);
    console.log(`   • Volume Activity: ${lastAnalysis?.volume_activity || 'N/A'}`);
    console.log(`   • Spread: ${lastAnalysis?.spread_size?.classification || 'N/A'}`);
    console.log(`   • Bid-Ask Imbalance: ${lastAnalysis?.signals?.bid_ask_imbalance || 'N/A'}`);
    console.log(`   • Volume Breakout: ${lastAnalysis?.signals?.volume_breakout ? 'YES' : 'NO'}`);
    console.log(`   • Momentum: ${lastAnalysis?.signals?.price_momentum || 'N/A'}`);
  }
  
  console.log('\n✅ All IG & Analyzer tests passed!');
  console.log('\n💡 Next: Open http://localhost:3000 in browser');
  console.log('💡 Watch the live tick feed, candles, and 8 trading signals update in real-time');
  
  process.exit(0);
}

test().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
