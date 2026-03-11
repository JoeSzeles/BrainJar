/**
 * BrainJar Dashboard Server
 *
 * Real-time web UI for neural firing rate visualization and monitoring.
 * Uses Socket.io to stream data from Brain to connected clients.
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import BrainJar from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// BrainJar instance
let brain = null;

// ===========================
// Socket.io Handlers
// ===========================

io.on('connection', (socket) => {
  console.log(`[Dashboard] Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`[Dashboard] Client disconnected: ${socket.id}`);
  });
  
  /**
   * Client request: boot the brain
   */
  socket.on('boot', async (data, callback) => {
    try {
      console.log('[Dashboard] Boot request');
      if (!brain.isBooted) {
        await brain._bootBrain();
      }
      callback({ status: 'ok', booted: brain.isBooted });
      io.emit('brain_booted', { neurons: brain.neuronsCount });
    } catch (err) {
      callback({ status: 'error', message: err.message });
    }
  });
  
  /**
   * Client request: stimulate neurons
   */
  socket.on('stimulate', async (data, callback) => {
    try {
      const { neuron_ids, intensity } = data;
      console.log(`[Dashboard] Stimulate: ${neuron_ids.length} neurons @ ${intensity}Hz`);
      
      const result = await brain.stimulate(neuron_ids, intensity);
      callback({ status: 'ok', result });
      
      // Broadcast to all clients
      io.emit('neural_activity', {
        timestamp: result.timestamp,
        motor_rates: result.motor_rates,
        all_rates: result.all_rates,
        stimulus: data,
      });
    } catch (err) {
      callback({ status: 'error', message: err.message });
    }
  });
  
  /**
   * Client request: observe without stimulus
   */
  socket.on('observe', async (data, callback) => {
    try {
      const result = await brain.observe();
      callback({ status: 'ok', result });
      
      io.emit('neural_activity', {
        timestamp: result.timestamp,
        motor_rates: result.motor_rates,
        all_rates: result.all_rates,
        stimulus: null,
      });
    } catch (err) {
      callback({ status: 'error', message: err.message });
    }
  });
  
  /**
   * Client request: get status
   */
  socket.on('status', async (data, callback) => {
    try {
      const status = await brain.getStatus();
      callback({ status: 'ok', data: status });
    } catch (err) {
      callback({ status: 'error', message: err.message });
    }
  });
  
  /**
   * Client request: get metrics
   */
  socket.on('metrics', (data, callback) => {
    try {
      const metrics = brain.getMetrics();
      callback({ status: 'ok', data: metrics });
    } catch (err) {
      callback({ status: 'error', message: err.message });
    }
  });
});

/**
 * Setup BrainJar event listeners to broadcast to dashboard clients
 */
function setupBrainListeners() {
  brain.on('booted', () => {
    console.log('[Dashboard] Brain booted - broadcasting');
    io.emit('brain_booted', { neurons: brain.neuronsCount });
  });
  
  brain.on('stimulated', (data) => {
    io.emit('brain_stimulated', {
      neurons: data.neurons,
      intensity: data.intensity,
      elapsed_ms: data.elapsed_ms,
    });
  });
  
  brain.on('observed', (data) => {
    io.emit('neural_activity', {
      timestamp: data.timestamp,
      motor_rates: data.motor_rates,
      all_rates: data.all_rates,
    });
  });
  
  brain.on('shutdown', () => {
    io.emit('brain_shutdown');
  });
}

/**
 * Start dashboard server
 */
async function start() {
  const port = process.env.PORT || 3000;
  
  // Create BrainJar instance
  brain = new BrainJar({
    port,
    apiPort: 8000,
    pythonScript: 'brain_engine_mock.py',
  });
  
  // Setup listeners
  setupBrainListeners();
  
  // Boot brain in background
  brain.boot()
    .then(() => console.log('[Dashboard] Brain booted'))
    .catch((err) => console.error('[Dashboard] Boot error:', err.message));
  
  // Start HTTP server
  httpServer.listen(port, () => {
    console.log(`[Dashboard] Server running on http://localhost:${port}`);
    console.log(`[Dashboard] Serving static files from ${path.join(__dirname, 'public')}`);
  });
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('[Dashboard] SIGINT - shutting down');
    await brain.shutdown();
    httpServer.close();
    process.exit(0);
  });
}

start();
