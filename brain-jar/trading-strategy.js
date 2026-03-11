/**
 * Trading Strategy Example
 * 
 * Demonstrates how to:
 * 1. Map market ticks → neural stimulus
 * 2. Execute trades based on brain activity
 * 3. Record outcomes in memory for learning
 * 
 * Usage:
 *   node trading-strategy.js
 */

import axios from 'axios';
import io from 'socket.io-client';
import MemoryManager from './memory-manager.js';

class TradingBrainStrategy {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || 'http://localhost:8000';
    this.dashboardUrl = config.dashboardUrl || 'http://localhost:3000';
    this.socket = null;
    this.memory = new MemoryManager();
    
    this.currentPrice = 1.0900;
    this.previousPrice = 1.0900;
    this.positions = [];
    this.tradeBuffer = [];  // Buffer for incomplete trades
    
    this.config = {
      minMoveForTrade: 0.0005,  // Min 5 pips to trigger
      stimulus_intensity_up: 350,
      stimulus_intensity_down: 80,
      neuron_bullish: '720575940619341105',  // JON mechanosensory (example)
      neuron_bearish: '720575940661503107',  // Taste bitter (example)
    };
  }
  
  /**
   * Connect to dashboard & start listening for ticks
   */
  async connect() {
    try {
      this.socket = io(this.dashboardUrl);
      
      this.socket.on('connect', () => {
        console.log('[Strategy] Connected to dashboard');
        this.socket.emit('boot', {});
      });
      
      this.socket.on('tick', (tick) => {
        this.onTick(tick);
      });
      
      this.socket.on('account_update', (info) => {
        console.log(`[Strategy] Account update: balance=$${info.balance.toFixed(2)}, P&L=$${info.totalProfitLoss.toFixed(2)}`);
      });
      
      this.socket.on('trade', (trade) => {
        console.log(`[Strategy] Trade executed: ${trade.direction} @ ${trade.dealRefId}`);
      });
      
      // Wait for connection
      await new Promise(resolve => {
        this.socket.on('brain_booted', () => {
          console.log('[Strategy] Brain ready');
          resolve();
        });
      });
      
    } catch (err) {
      console.error('[Strategy] Connection error:', err.message);
      throw err;
    }
  }
  
  /**
   * Process incoming tick
   */
  onTick(tick) {
    this.currentPrice = tick.price;
    
    const priceDelta = this.currentPrice - this.previousPrice;
    const priceMove = Math.abs(priceDelta);
    
    // Only trade on significant moves
    if (priceMove < this.config.minMoveForTrade) {
      return;
    }
    
    const isBullish = priceDelta > 0;
    
    // Map price movement to neural stimulus
    const stimulus = this._priceToStimulus(isBullish, priceMove);
    
    console.log(`[Strategy] Tick: ${this.currentPrice.toFixed(4)} (${isBullish ? '▲' : '▼'} ${priceMove.toFixed(5)})`);
    console.log(`[Strategy] Stimulus: ${stimulus.intensity}Hz on ${stimulus.neuron_ids}`);
    
    // Send stimulus to brain
    this._stimulateBrain(stimulus).then(response => {
      // Evaluate brain response
      const motorActivation = this._getMotorActivation(response);
      
      console.log(`[Strategy] Motor MN9: ${motorActivation.toFixed(1)}Hz`);
      
      // Trade decision based on brain + price momentum
      this._evaluateTradeSignal(isBullish, motorActivation, stimulus, response);
    });
    
    this.previousPrice = this.currentPrice;
  }
  
  /**
   * Convert price movement to stimulus
   */
  _priceToStimulus(isBullish, priceMove) {
    const baseIntensity = isBullish ? 
      this.config.stimulus_intensity_up : 
      this.config.stimulus_intensity_down;
    
    const intensity = baseIntensity + (priceMove * 5000);
    
    return {
      neuron_ids: [isBullish ? 
        this.config.neuron_bullish : 
        this.config.neuron_bearish],
      intensity: Math.min(500, intensity),  // Cap at 500 Hz
    };
  }
  
  /**
   * Send stimulus request to brain
   */
  async _stimulateBrain(stimulus) {
    return new Promise((resolve) => {
      this.socket.emit('stimulate', stimulus, (response) => {
        if (response && response.success) {
          resolve(response);
        } else {
          console.error('[Strategy] Stimulate failed:', response?.error);
          resolve(null);
        }
      });
    });
  }
  
  /**
   * Extract motor activation level
   */
  _getMotorActivation(response) {
    if (!response || !response.result) return 0;
    
    const motorRates = response.result.motor_rates || {};
    const motorValues = Object.values(motorRates);
    
    if (motorValues.length === 0) return 0;
    return motorValues[0];  // MN9 firing rate
  }
  
  /**
   * Decide to trade based on brain activity + price
   */
  _evaluateTradeSignal(isBullish, motorActivation, stimulus, brainResponse) {
    // Simple rule: 
    // - Bullish move + high motor activation → BUY
    // - Bearish move + high motor activation → SELL
    // - Low motor activation → hold/close
    
    const motorThreshold = 35;  // Hz
    const tradeSize = 0.5;
    
    if (motorActivation > motorThreshold) {
      const direction = isBullish ? 'BUY' : 'SELL';
      console.log(`[Strategy] ✅ TRADE SIGNAL: ${direction} (motor=${motorActivation.toFixed(1)}Hz)`);
      
      // Place order
      this._placeOrder({
        direction,
        size: tradeSize,
        stimulus,
        brainResponse,
      });
    } else {
      console.log(`[Strategy] ⏸ No signal (motor=${motorActivation.toFixed(1)}Hz < ${motorThreshold}Hz)`);
    }
  }
  
  /**
   * Execute trade and log
   */
  _placeOrder(orderData) {
    const epic = 'CS.D.EURUSD.MINI.IP';
    
    this.socket.emit('place_order', {
      epic,
      direction: orderData.direction,
      size: orderData.size,
    }, (response) => {
      if (response && response.success) {
        const tradeRecord = {
          dealRefId: response.dealRefId,
          direction: orderData.direction,
          size: orderData.size,
          epic,
          price: this.currentPrice,
          stimulus: orderData.stimulus,
          timestamp: new Date(),
          status: 'OPEN',
        };
        
        this.tradeBuffer.push(tradeRecord);
        console.log(`[Strategy] 📊 Order placed: ${response.dealRefId}`);
        
      } else {
        console.error(`[Strategy] ❌ Order failed: ${response?.error}`);
      }
    });
  }
  
  /**
   * Close trade and record learning
   */
  closeTradeAndLearn(dealRefId, exitPrice, pnl) {
    // Find trade in buffer
    const tradeIdx = this.tradeBuffer.findIndex(t => t.dealRefId === dealRefId);
    if (tradeIdx === -1) {
      console.warn('[Strategy] Trade not found:', dealRefId);
      return;
    }
    
    const trade = this.tradeBuffer[tradeIdx];
    
    // Record in memory for future learning
    this.memory.recordExperience(
      trade.stimulus,
      { motor_rates: { MN9: 40 } },  // Mock response
      {
        epic: trade.epic,
        direction: trade.direction,
        size: trade.size,
      },
      pnl
    );
    
    console.log(`[Strategy] 📈 Trade closed: ${direction} ${size} @ ${trade.price.toFixed(4)} → ${exitPrice.toFixed(4)} = ${pnl > 0 ? '+' : ''}$${pnl.toFixed(2)}`);
    
    // Remove from buffer
    this.tradeBuffer.splice(tradeIdx, 1);
  }
  
  /**
   * Print memory summary
   */
  getMemorySummary() {
    const stats = this.memory.getStats();
    const patterns = this.memory.getProfitablePatterns();
    
    console.log('\n📚 Brain Memory Summary:');
    console.log(`   Total Experiences: ${stats.total_experiences}`);
    console.log(`   Total P&L: $${stats.total_pnl.toFixed(2)}`);
    console.log(`   Avg P&L per trade: $${stats.avg_pnl.toFixed(2)}`);
    console.log(`   Win Rate: ${(stats.win_rate * 100).toFixed(1)}%`);
    console.log(`   Known Patterns: ${stats.known_patterns}`);
    console.log(`\n   Top Profitable Neurons:`);
    
    patterns.slice(0, 3).forEach(p => {
      console.log(`   - ${p.neuron_id}: avg +$${p.avg_pnl.toFixed(2)} (${(p.win_rate * 100).toFixed(0)}% win)`);
    });
  }
  
  /**
   * Run strategy until interrupted
   */
  async run() {
    console.log('[Strategy] Running... Press Ctrl+C to stop');
    
    setInterval(() => {
      this.getMemorySummary();
    }, 30000);  // Print stats every 30s
  }
}

// ===========================
// Main
// ===========================

async function main() {
  const strategy = new TradingBrainStrategy({
    apiUrl: 'http://localhost:8000',
    dashboardUrl: 'http://localhost:3000',
  });
  
  try {
    await strategy.connect();
    await strategy.run();
  } catch (err) {
    console.error('[Strategy] Fatal error:', err.message);
    process.exit(1);
  }
}

main();
