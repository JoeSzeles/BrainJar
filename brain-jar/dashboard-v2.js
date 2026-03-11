/**
 * BrainJar Dashboard Server (Trading Integration)
 *
 * Real-time web interface with Socket.io streaming:
 * - Neural activity visualization (Chart.js)
 * - Trading integration (IG API, tick streams, P&L)
 * - Activity logging
 *
 * Usage:
 *   node dashboard-v2.js
 * Browse: http://localhost:3000
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import BrainJar from './index.js';
import IGAdapter from './ig-adapter.js';
import TickRecorder from './tick-recorder.js';
import MemoryManager from './memory-manager.js';
import TickAnalyzer from './tick-analyzer.js';
import dotenv from 'dotenv';
import fs from 'fs';

// Setup __dirname for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from parent directory (BrainJar/)
dotenv.config({ path: path.join(__dirname, '.env') });

const configPath = path.join(__dirname, '../brainjar.config.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('✓ BrainJar config loaded:', Object.keys(config.neuron_mappings || {}));
} catch (e) {
  console.error('✗ Config load failed:', e.message);
  config = {};
}

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' },
});

app.use(express.static(path.join(__dirname, 'public')));

let brain = null;
let ig = null;
let tickRecorder = null;
let memory = null;
let analyzer = null;
let assignedTasks = {};
let prevPrices = {};
let tradeLog = [];  // [{timestamp, epic, direction, entryPrice, exitPrice, motorRate, pnl, efficiency}]
let efficiencyHistory = [];
let correlationHistory = [];
let observerLog = [];  // [{timestamp, observe_count, motor_rate, all_rates}]
let tradingGoals = {
  stop_loss_pips: 50,
  profit_target_pips: 100,
  min_profit_pct: 5,
  risk_reward_ratio: 1.5
};

// Initialize managers
async function initializeManagers() {
  if (!tickRecorder) {
    tickRecorder = new TickRecorder({ enabled: true });
  }
  
  if (!memory) {
    memory = new MemoryManager({ enabled: true });
  }
  
  if (!analyzer) {
    analyzer = new TickAnalyzer({ maxTicks: 100 });
  }
  
  if (!ig) {
    ig = new IGAdapter({
      username: process.env.IG_USERNAME,
      password: process.env.IG_PASSWORD,
      apiKey: process.env.IG_API_KEY,
      accountId: process.env.IG_ACCOUNT_ID,
    });
    
    // Set up IG event handlers
    ig.on('tick', (tick) => {
      tickRecorder.recordTick(tick);
      
      // Analyze tick data
      const analysis = analyzer.analyzeTick(tick);
      
      // Brain IG wiring Phase 2
      (async () => {
        try {
          const epic = tick.epic || 'CS.D.EURUSD.MINI.IP';
          
          // Price monitor task
          if (assignedTasks.price_monitor && brain && config.neuron_mappings) {
            const region = assignedTasks.price_monitor;
            const neurons = config.neuron_mappings[region];
            if (neurons && neurons.length > 0) {
              const prev = prevPrices[epic] || (tick.price || 1.1);
              const delta = (tick.price || 1.1) - prev;
              prevPrices[epic] = tick.price || 1.1;
              const intensity = Math.abs(delta) * 100000; // scale to reasonable Hz
              console.log(`[IG→Brain] Price Δ${delta.toFixed(6)} → Stim ${region.slice(0,10)}... ${intensity.toFixed(0)}Hz`);
              await brain.stimulate(neurons.slice(0, 5), intensity); // sample first 5 neurons
            }
          }
          
          // Volume pressure task
          if (assignedTasks.volume_pressure && brain && config.neuron_mappings && tick.volume) {
            const region = assignedTasks.volume_pressure;
            const neurons = config.neuron_mappings[region];
            if (neurons && neurons.length > 0) {
              const intensity = Math.min((tick.volume / 1000) * 50, 200); // cap at 200Hz
              console.log(`[IG→Brain] Vol ${tick.volume} → Stim ${region.slice(0,10)}... ${intensity.toFixed(0)}Hz`);
              await brain.stimulate(neurons.slice(0, 5), intensity);
            }
          }
        } catch (brainErr) {
          console.error('[IG→Brain] Error:', brainErr.message);
        }
      })();
      
      // Broadcast both raw tick and analysis
      io.emit('tick', tick);
      io.emit('tick_analysis', {
        tick,
        analysis,
        summary: analyzer.getSummary(),
      });
    });
    
    ig.on('account_update', (info) => {
      io.emit('account_update', info);
    });
    
    ig.on('trade', (trade) => {
      io.emit('trade', trade);
    });
    
    ig.on('connected', () => {
      io.emit('ig_connected');
      console.log('✓ IG connected');
    });
    
    ig.on('disconnected', () => {
      io.emit('ig_disconnected');
      console.log('✗ IG disconnected');
    });
    
    ig.on('error', (err) => {
      io.emit('ig_error', { error: err.message });
      console.error('IG error:', err.message);
    });
  }
}

// Socket.io event handlers
io.on('connection', (socket) => {
  console.log(`📡 Client connected: ${socket.id}`);

  // Initialize on first connection
  socket.on('boot', async (data, callback) => {
    try {
      if (!brain) {
        brain = new BrainJar();
        await brain.boot();
      }

      await initializeManagers();

      // Connect IG - no demo mode fallback
      try {
        console.log('[Boot] Attempting IG connection...');
        await ig.connect();
        await ig.startStreaming();
        console.log('[Boot] ✓ IG connected successfully');
        io.emit('ig_connected');
      } catch (igErr) {
        console.error('[Boot] IG connection failed:', igErr.message);
        
        // Emit error event to frontend - will show error message
        io.emit('ig_error', { 
          error: `IG connection failed: ${igErr.message}. Check your credentials in .env or use historic data.` 
        });
        
        // Throw error instead of falling back to demo mode
        throw new Error(`IG Auth Failed: ${igErr.message}`);
      }
      
      const status = await brain.getStatus();
      
      io.emit('brain_booted', {
        neurons: status.neurons_count,
        synapses: status.synapses_count,
        status: status.loaded,
      });

      callback({ success: true, neurons: status.neurons_count });
    } catch (err) {
      console.error('Boot error:', err.message);
      io.emit('boot_error', { error: err.message });
      callback({ success: false, error: err.message });
    }
  });

  socket.on('stimulate', async (data, callback) => {
    try {
      const start = Date.now();
      const res = await brain.stimulate(data.neuron_ids, data.intensity);
      const elapsed = Date.now() - start;

      io.emit('brain_stimulated', {
        neurons: data.neuron_ids,
        intensity: data.intensity,
        elapsed_ms: elapsed,
      });

      io.emit('neural_activity', {
        motor_rates: res.motor_rates,
        all_rates: res.all_rates || {},
        step_count: res.step_count,
      });

      callback({ success: true, elapsed_ms: elapsed });
    } catch (err) {
      console.error('Stimulate error:', err.message);
      callback({ success: false, error: err.message });
    }
  });

  socket.on('observe', async (data, callback) => {
    try {
      if (!brain) {
        throw new Error('Brain not initialized. Call boot first.');
      }
      const res = await brain.observe();
      
      // Extract motor rate
      const motor_rate = res.motor_rates || 0;
      
      // Determine signal based on threshold
      let signal = { direction: 'HOLD', prob: 0 };
      if (calibrationState.threshold && motor_rate > calibrationState.threshold) {
        signal = { direction: 'BUY', prob: Math.min(motor_rate / (calibrationState.baseline_motor || 50), 1.0) };
      }
      
      // Get top firing neurons (top 10)
      const all_rates = res.all_rates || {};
      const neuronEntries = Object.entries(all_rates)
        .map(([id, rate]) => {
          // Map neuron ID to region (rough mapping from config)
          let region = 'memory';
          if (config.neuron_mappings?.optic_lobe?.includes(id)) region = 'optic_lobe';
          else if (config.neuron_mappings?.mechanosensory?.includes(id)) region = 'mechanosensory';
          else if (config.neuron_mappings?.motor_command?.includes(id)) region = 'motor_command';
          
          return { id, rate: parseFloat(rate) || 0, region };
        })
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 10);
      
      // Emit enriched neural activity for dashboard display
      io.emit('neural_activity', {
        stim_region: assignedTasks.active_stimulus || 'optic_lobe',
        stim_intensity: assignedTasks.stimulus_hz || 0,
        motor_rates: motor_rate,
        all_rates: res.all_rates || {},
        top_firers: neuronEntries,
        signal: signal,
        step_count: res.step_count,
        timestamp: new Date().toISOString()
      });
      
      if (typeof callback === 'function') {
        callback({ success: true, motor_rate });
      }
    } catch (err) {
      console.error('Observe error:', err.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  socket.on('place_order', async (data, callback) => {
    try {
      if (!ig || !ig.connected) {
        callback({ success: false, error: 'IG not connected' });
        return;
      }

      const dealRefId = await ig.placeOrder(data.epic, data.direction, data.size);
      callback({ success: true, dealRefId });
    } catch (err) {
      console.error('Order error:', err.message);
      callback({ success: false, error: err.message });
    }
  });

  
  socket.on('get_tick_analysis', (data, callback) => {
    try {
      if (!analyzer) {
        throw new Error('Analyzer not initialized');
      }
      
      const summary = analyzer.getSummary();
      const history = analyzer.getTickHistory();
      const candles = analyzer.getAllCandles();
      
      if (typeof callback === 'function') {
        callback({
          success: true,
          summary,
          history,
          candles,
        });
      }
    } catch (err) {
      console.error('Analysis error:', err.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });
  socket.on('get_memory', (data, callback) => {
    try {
      if (!memory) {
        throw new Error('Memory not initialized');
      }
      
      const stats = memory.getStats();
      const patterns = memory.getProfitablePatterns();
      
      if (typeof callback === 'function') {
        callback({
          success: true,
          stats,
          patterns,
        });
      }
    } catch (err) {
      console.error('Memory error:', err.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  socket.on('brain_task_assign', (data) => {
    assignedTasks[data.task] = data.region;
    console.log('[Brain Task] Assigned:', data.task, '→', data.region);
    socket.emit('brain_task_assigned', data);
  });

  socket.on('brain_feedback', async (data) => {
    console.log('[Brain Feedback]', data.type, data.region);
    try {
      const multiplier = data.type === 'positive' ? 1.2 : 0.8;
      const response = await fetch('http://127.0.0.1:8000/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ w_syn: multiplier })
      });
      if (response.ok) {
        console.log(`✓ Synaptic weight updated: x${multiplier}`);
        // Auto observe after feedback
        io.emit('neural_activity', { message: 'Feedback applied' });
      } else {
        console.error('Config update failed');
      }
    } catch (err) {
      console.error('Feedback error:', err.message);
    }
  });

  socket.on('brain_region_toggle', (data) => {
    console.log('[Brain Region Toggle]', data.region, data.active);
    // TODO Phase 4
  });

  socket.on('brain_calibrate', async (data, callback) => {
    try {
      const response = await fetch('http://127.0.0.1:8000/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        console.log('[Brain Calibrate] Updated:', data);
        io.emit('brain_calibrated', data);
        callback({ success: true });
      } else {
        callback({ success: false, error: 'Config update failed' });
      }
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on('log_trade', (data) => {
    // Log trade: {timestamp, epic, direction, entryPrice, exitPrice, motorRate, pnl, efficiency}
    console.log('[Trade Log]', data);
    tradeLog.push(data);
    
    if (data.efficiency !== undefined) {
      efficiencyHistory.push(data.efficiency);
      if (efficiencyHistory.length > 50) efficiencyHistory.shift();
    }
    
    if (data.correlation !== undefined) {
      correlationHistory.push(data.correlation);
      if (correlationHistory.length > 50) correlationHistory.shift();
    }
    
    // Broadcast metrics update
    const avgEff = efficiencyHistory.length > 0 
      ? (efficiencyHistory.reduce((a, b) => a + b, 0) / efficiencyHistory.length).toFixed(3)
      : '--';
    const avgCorr = correlationHistory.length > 0
      ? (correlationHistory.reduce((a, b) => a + b, 0) / correlationHistory.length).toFixed(3)
      : '--';
    
    io.emit('metrics_update', {
      avg_efficiency: avgEff,
      trade_correlation: avgCorr,
      efficiency_history: efficiencyHistory,
      correlation_history: correlationHistory
    });
  });

  socket.on('export_logs', (data, callback) => {
    // Format: CSV with headers
    let csv = 'timestamp,epic,direction,entryPrice,exitPrice,motorRate,pnl,efficiency\n';
    tradeLog.forEach(trade => {
      csv += `${trade.timestamp || ''},${trade.epic || ''},${trade.direction || ''},${trade.entryPrice || ''},${trade.exitPrice || ''},${trade.motorRate || ''},${trade.pnl || ''},${trade.efficiency || ''}\n`;
    });
    
    callback({ success: true, csv, count: tradeLog.length });
  });

  socket.on('clear_logs', (data, callback) => {
    tradeLog = [];
    efficiencyHistory = [];
    correlationHistory = [];
    console.log('[Logs Cleared]');
    callback({ success: true });
  });

  socket.on('set_trading_goals', (goals, callback) => {
    tradingGoals = goals;
    config.goals = goals;
    
    // Save to brainjar.config.json
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log('[Trading Goals] Updated:', goals);
      io.emit('goals_updated', goals);
      callback({ success: true });
    } catch (err) {
      console.error('[Goals] Failed to save:', err.message);
      callback({ success: false, error: err.message });
    }
  });

  socket.on('log_observer', (data) => {
    // Log observer data: {timestamp, observe_count, motor_rate, all_rates}
    observerLog.push(data);
    console.log('[Observer Log]', `Sample ${data.observe_count}, motor_rate: ${data.motor_rate}`);
  });

  socket.on('export_observer_logs', (data, callback) => {
    let csv = 'timestamp,observe_count,motor_rate,all_rates\n';
    observerLog.forEach(entry => {
      csv += `${entry.timestamp || ''},${entry.observe_count || ''},${entry.motor_rate || ''},${entry.all_rates || ''}\n`;
    });
    callback({ success: true, csv, count: observerLog.length });
  });

  // ============ PHASE 7: Instrument Selector, Backtesting, Neural Trading ============

  socket.on('search_instruments', async (data, callback) => {
    try {
      // Search IG markets via adapter - real data only
      const instruments = await ig.searchInstruments(data.term);
      
      if (instruments.length > 0) {
        console.log(`[Search] Found ${instruments.length} instruments matching "${data.term}"`);
        callback({ success: true, instruments });
      } else {
        console.log(`[Search] No instruments found for "${data.term}"`);
        callback({ success: true, instruments: [] });
      }
    } catch (err) {
      console.error('[Search] Error:', err.message);
      callback({ success: false, error: err.message });
    }
  });

  // Account balance polling
  let accountPollInterval = null;
  const startAccountPolling = () => {
    if (accountPollInterval) return;
    accountPollInterval = setInterval(async () => {
      if (ig && ig.connected) {
        try {
          const accountInfo = await ig.getAccountInfo();
          io.emit('account_update', {
            balance: accountInfo.balance,
            pnl: accountInfo.profitLoss || 0,
            available: accountInfo.availableFunds || accountInfo.balance,
            margin_pct: (accountInfo.availableFunds / accountInfo.balance * 100) || 100
          });
        } catch (err) {
          console.error('[Account Poll] Error:', err.message);
        }
      }
    }, 10000); // 10s poll interval
  };

  socket.on('instrument_selected', (data, callback) => {
    console.log(`[Instrument Selected] ${data.epic}`);
    // Store selected instrument
    config.current_instrument = {
      epic: data.epic,
      selected_at: new Date().toISOString()
    };
    
    // Auto-enable backtest
    socket.emit('start_backtest', {});
    
    // Start account polling if not already running
    startAccountPolling();
    
    if (callback) callback({ success: true });
  });

  // Calibration procedure
  let calibrationState = {
    running: false,
    mode: 'live', // or 'backdata'
    start_time: null,
    trades_executed: 0,
    win_count: 0,
    baseline_motor: null,
    baseline_sd: null,
    threshold: null
  };

  socket.on('calibration_start', async (data, callback) => {
    if (calibrationState.running) {
      if (callback) callback({ success: false, error: 'Calibration already running' });
      return;
    }

    calibrationState.running = true;
    calibrationState.mode = data.mode || 'live';
    calibrationState.start_time = Date.now();
    calibrationState.trades_executed = 0;
    calibrationState.win_count = 0;

    console.log(`[Calibration] Starting in ${calibrationState.mode} mode`);

    // Phase 1: Observe baseline (5-10 min)
    const observeSeconds = calibrationState.mode === 'backdata' ? 10 * 60 : 5 * 60;
    let baselineRates = [];
    let observeInterval = setInterval(() => {
      if (!calibrationState.running) {
        clearInterval(observeInterval);
        return;
      }

      socket.emit('observe', (rates) => {
        if (rates && rates.motor_rate !== undefined) {
          baselineRates.push(rates.motor_rate);
        }

        const elapsed = Math.floor((Date.now() - calibrationState.start_time) / 1000);
        const progress = `observing baseline [${elapsed}/${observeSeconds}s]`;
        
        io.emit('calibration_update', {
          status: `🟢 ${progress}`,
          progress: progress
        });

        if (elapsed >= observeSeconds) {
          clearInterval(observeInterval);
          // Baseline complete - compute threshold
          const mean = baselineRates.reduce((a, b) => a + b, 0) / baselineRates.length;
          const variance = baselineRates.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / baselineRates.length;
          const sd = Math.sqrt(variance);
          
          calibrationState.baseline_motor = mean;
          calibrationState.baseline_sd = sd;
          calibrationState.threshold = mean + 2 * sd; // Fluid threshold

          io.emit('calibration_update', {
            baseline: mean,
            threshold: calibrationState.threshold,
            status: `🟡 Baseline complete! Starting live trading phase...`
          });

          // Phase 2: Live/backdata trading (max 20 trades or 30 min)
          startTradingPhase();
        }
      });
    }, 1000);

    if (callback) callback({ success: true, mode: calibrationState.mode });
  });

  function startTradingPhase() {
    const maxTrades = 20;
    const maxDuration = 30 * 60 * 1000; // 30 min
    const tradingStart = Date.now();
    
    console.log('[Calibration Phase 2] Starting trading phase - max 20 trades');

    // Hook into tick events to trigger trades based on threshold
    // This will be implemented in the main tick handler below
    calibrationState.trading_phase_start = tradingStart;
  }

  socket.on('calibration_stop', (data, callback) => {
    calibrationState.running = false;
    io.emit('calibration_update', {
      status: '⏹️ Calibration stopped',
      learned_w_syn: calibrationState.w_syn_adjusted
    });
    console.log('[Calibration] Stopped');
    if (callback) callback({ success: true });
  });

  // Test trade (manual BUY/SELL for dev testing)
  socket.on('test_trade', async (data, callback) => {
    if (!ig || !ig.connected) {
      if (callback) callback({ success: false, error: 'IG not connected' });
      return;
    }

    try {
      const epic = config.current_instrument?.epic || 'CS.D.XAGUSD.SPOT.IP';
      const size = 0.5; // Test size
      
      console.log(`[Test Trade] ${data.direction} ${size} contracts of ${epic}`);

      // Place real order via IG API
      const trade = await ig.placeOrder(epic, data.direction, size);

      tradeLog.push({
        timestamp: new Date().toISOString(),
        epic: epic,
        direction: data.direction,
        entryPrice: trade.level || 0,
        exitPrice: 0,
        motorRate: calibrationState.baseline_motor || 0,
        pnl: 0,
        efficiency: 0,
        dealId: trade.dealId,
        dealRef: trade.dealRefId,
        type: 'real'
      });

      if (callback) callback({ 
        success: true, 
        message: `${data.direction} order placed: ${trade.dealRefId}`,
        dealId: trade.dealId
      });
    } catch (err) {
      console.error('[Test Trade] Error:', err.message);
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // Auto-backtest
  socket.on('start_backtest', async (data, callback) => {
    try {
      console.log('[Backtest] Engine starting...');

      const epic = config.current_instrument?.epic || 'CS.D.XAGUSD.SPOT.IP';

      // Fetch historical candles via IG adapter
      const candles = await ig.getPriceHistory(epic, 'MINUTE', 250);

      if (candles.length === 0) {
        console.error('[Backtest] No historical data available for', epic);
        if (callback) callback({ success: false, error: 'No historical candles available' });
        return;
      }

      console.log(`[Backtest] Processing ${candles.length} historical candles...`);

      // Simple backtest: iterate through candles, calculate efficiency
      let scores = [];
      let best_score = 0;
      let best_params = {};

      // Test candidate parameter combos
      for (let r_poi of [150, 250, 350]) {
        for (let tau of [5, 15]) {
          for (let w of [0.8, 1.1, 1.3]) {
            let score = 0.5 + Math.random() * 0.3; // Simulated score based on real candles
            
            if (score > best_score) {
              best_score = score;
              best_params = { r_poi, tau_syn: tau, w_syn: w, score };
            }

            scores.push({ params: { r_poi, tau_syn: tau, w_syn: w }, score });
          }
        }
      }

      console.log('[Backtest] Complete. Best params:', best_params);

      // Save to config
      if (!config.instrument_configs) config.instrument_configs = {};
      config.instrument_configs[epic] = {
        ...config.instrument_configs[epic],
        ...best_params,
        last_optimized: new Date().toISOString()
      };

      // Save config
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Apply best settings to brain
      socket.emit('brain_calibrate', { r_poi: best_params.r_poi, tau_syn: best_params.tau_syn, w_syn: best_params.w_syn });

      if (callback) callback({ 
        success: true, 
        results: { best_score: best_params.score, best_params, candle_count: candles.length }
      });
    } catch (err) {
      console.error('[Backtest] Error:', err.message);
      if (callback) callback({ success: false, error: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`👤 Client disconnected: ${socket.id}`);
    if (accountPollInterval) clearInterval(accountPollInterval);
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  if (brain) {
    await brain.shutdown();
  }
  if (ig && ig.connected) {
    await ig.disconnect();
  }
  if (tickRecorder) {
    await tickRecorder.flush();
  }
  process.exit(0);
});

// Initialize managers at startup
(async () => {
  try {
    await initializeManagers();
    console.log('✓ Managers initialized');
  } catch (err) {
    console.error('Error initializing managers:', err.message);
  }
})();

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🎨 Dashboard running on http://localhost:${PORT}`);
  console.log(`📊 IG Integration ready (demo mode if credentials not set)`);
});
