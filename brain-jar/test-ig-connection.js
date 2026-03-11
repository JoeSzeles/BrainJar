#!/usr/bin/env node

/**
 * Test IG API Connection
 * 
 * Validates that:
 * 1. IG credentials are loaded from .env
 * 2. REST API connection works
 * 3. Session tokens are obtained
 * 4. Market data can be fetched
 * 5. Polling generates ticks correctly
 * 
 * Usage:
 *   node test-ig-connection.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import IGAdapter from './ig-adapter.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// Load .env
console.log('[Test] Loading .env from:', path.join(__dir, '.env'));
dotenv.config({ path: path.join(__dir, '.env') });

// Validate credentials
const creds = {
  username: process.env.IG_USERNAME,
  password: process.env.IG_PASSWORD,
  apiKey: process.env.IG_API_KEY,
  accountId: process.env.IG_ACCOUNT_ID,
  endpoint: process.env.IG_API_ENDPOINT,
};

console.log('\n[Test] IG Credentials:');
console.log('  Username:', creds.username ? '✓ Loaded' : '✗ MISSING');
console.log('  Password:', creds.password ? '✓ Loaded' : '✗ MISSING');
console.log('  API Key:', creds.apiKey ? '✓ Loaded' : '✗ MISSING');
console.log('  Account ID:', creds.accountId ? '✓ Loaded' : '✗ MISSING');
console.log('  Endpoint:', creds.endpoint || 'https://demo-api.ig.com/gateway/deal');

if (!creds.username || !creds.password || !creds.apiKey) {
  console.error('\n✗ Missing credentials! Set IG_USERNAME, IG_PASSWORD, and IG_API_KEY in .env');
  process.exit(1);
}

// Test connection
async function test() {
  const ig = new IGAdapter({
    username: creds.username,
    password: creds.password,
    apiKey: creds.apiKey,
    accountId: creds.accountId,
    epics: ['CS.D.EURUSD.MINI.IP', 'CS.D.GBPUSD.MINI.IP'],
  });
  
  // Event listeners
  let tickCount = 0;
  ig.on('tick', (tick) => {
    tickCount++;
    console.log(`[Tick ${tickCount}]`, {
      bid: tick.bid?.toFixed(5),
      ask: tick.ask?.toFixed(5),
      price: tick.price?.toFixed(5),
      volume: tick.volume,
    });
  });
  
  ig.on('account_update', (info) => {
    console.log('\n[Account Update]', {
      accountId: info.accountId,
      balance: info.balance?.toFixed(2),
      equity: info.equity?.toFixed(2),
    });
  });
  
  ig.on('connected', () => {
    console.log('\n✓ IG Connected - Starting stream...');
  });
  
  ig.on('error', (err) => {
    console.error('\n✗ IG Error:', err.message);
  });
  
  // Try to connect
  try {
    console.log('\n[Test] Attempting IG connection...');
    await ig.connect();
    
    console.log('\n[Test] Starting data stream...');
    await ig.startStreaming();
    
    // Wait 10 seconds for ticks
    console.log('\n[Test] Waiting 10 seconds for ticks...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Summary
    console.log('\n[Test] Summary:');
    console.log('  Total ticks received:', tickCount);
    console.log('  Tick format: { bid, ask, price, volume, timestamp }');
    
    if (tickCount > 0) {
      console.log('\n✓ Connection working! Ticks are flowing.');
    } else {
      console.log('\n⚠ No ticks received - check API responses above');
    }
    
    await ig.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Connection failed:', err.message);
    if (err.response?.data) {
      console.error('[Response Data]', err.response.data);
    }
    process.exit(1);
  }
}

// Run test
test();
