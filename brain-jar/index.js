/**
 * BrainJar - Node.js Neural Simulation Wrapper
 *
 * Manages lifecycle of Python FastAPI brain engine and exposes modular API
 * for stimulus injection and neural observation.
 *
 * Usage:
 *   const BrainJar = require('./index.js');
 *   const brain = new BrainJar({ port: 3000, apiPort: 8000 });
 *   await brain.boot();
 *   await brain.stimulate([neuron_id], 100);
 *   const obs = await brain.observe();
 */

import { spawn } from 'child_process';
import axios from 'axios';
import EventEmitter from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rootVenvPython = path.join(__dirname, '../..', '.venv/Scripts/python.exe');

class BrainJar extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.port = config.port || 3000;
    this.apiPort = config.apiPort || 8000;
    this.pythonScript = config.pythonScript || 'brain_engine.py';
    this.pythonPath = config.pythonPath || rootVenvPython;
    
    this.apiClient = null;
    this.engineProcess = null;
    this.isBooted = false;
    this.metrics = [];
    
    this.neuronsCount = 0;
    this.synapsesCount = 0;
  }
  
  /**
   * Boot the Python backend and wait for readiness.
   */
  async boot() {
    return new Promise((resolve, reject) => {
      if (this.isBooted) {
        resolve();
        return;
      }
      
      console.log(`[BrainJar] Spawning Python engine on port ${this.apiPort}...`);
      
      const scriptPath = path.join(__dirname, '..', this.pythonScript);
      
      this.engineProcess = spawn(this.pythonPath, [scriptPath], {
        cwd: path.join(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      this.engineProcess.on('error', (err) => {
        console.error(`[BrainJar] Python process error:`, err);
        reject(err);
      });
      
      this.engineProcess.stderr.on('data', (data) => {
        // Suppress errors from reload; check for server startup
        const msg = data.toString();
        if (msg.includes('running on') || msg.includes('Started server')) {
          this._onEngineReady();
          resolve();
        }
      });
      
      this.engineProcess.stdout.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('running on') || msg.includes('Uvicorn running')) {
          this._onEngineReady();
          resolve();
        }
      });
      
      // Fallback: try to connect after 2 seconds
      setTimeout(() => {
        this._checkEngineReady()
          .then(() => {
            this._onEngineReady();
            resolve();
          })
          .catch((err) => {
            console.warn(`[BrainJar] Timeout waiting for engine. Retrying...`);
            setTimeout(() => {
              this._checkEngineReady()
                .then(() => {
                  this._onEngineReady();
                  resolve();
                })
                .catch(reject);
            }, 2000);
          });
      }, 1000);
    });
  }
  
  /**
   * Check if engine is responding to requests.
   */
  async _checkEngineReady() {
    this.apiClient = axios.create({
      baseURL: `http://127.0.0.1:${this.apiPort}`,
      timeout: 5000,
    });
    
    const response = await this.apiClient.get('/');
    return response.status === 200;
  }
  
  /**
   * Called once engine is ready for requests.
   */
  async _onEngineReady() {
    if (this.isBooted) return;
    
    this.isBooted = true;
    console.log(`[BrainJar] Engine ready on http://127.0.0.1:${this.apiPort}`);
    
    try {
      await this._bootBrain();
    } catch (err) {
      console.error(`[BrainJar] Boot request failed:`, err.message);
    }
  }
  
  /**
   * Call /boot endpoint to initialize network.
   */
  async _bootBrain() {
    try {
      const res = await this.apiClient.post('/boot', {
        motor_neurons: [720575940660219265],  // MN9 default
      });
      
      this.neuronsCount = res.data.neurons_count || 630;
      this.synapsesCount = res.data.synapses_count || 50000000;
      
      console.log(
        `[BrainJar] Booted: ${this.neuronsCount} neurons, ` +
        `${this.synapsesCount} synapses, boot_time=${res.data.boot_time_ms}ms`
      );
      
      this.emit('booted');
      return res.data;
    } catch (err) {
      console.error(`[BrainJar] _bootBrain failed:`, err.message);
      throw err;
    }
  }
  
  /**
   * Inject stimulus: activate neurons and step simulation.
   * @param {number[]} neuronIds FlyWire IDs
   * @param {number} intensity Poisson rate (Hz)
   */
  async stimulate(neuronIds, intensity = 100) {
    if (!this.isBooted) throw new Error('Brain not booted.');
    
    const startTime = Date.now();
    
    try {
      const res = await this.apiClient.post('/stimulate', {
        neuron_ids: neuronIds,
        intensity,
      });
      
      const elapsed = Date.now() - startTime;
      this.metrics.push({
        timestamp: new Date(),
        operation: 'stimulate',
        elapsed_ms: elapsed,
        neurons: neuronIds.length,
        intensity,
      });
      
      this.emit('stimulated', {
        neurons: neuronIds,
        intensity,
        response: res.data,
        elapsed_ms: elapsed,
      });
      
      return res.data;
    } catch (err) {
      console.error(`[BrainJar] stimulate failed:`, err.message);
      throw err;
    }
  }
  
  /**
   * Observe neural activity without additional stimulus.
   */
  async observe() {
    if (!this.isBooted) throw new Error('Brain not booted.');
    
    try {
      const res = await this.apiClient.get('/observe');
      
      this.emit('observed', res.data);
      return res.data;
    } catch (err) {
      console.error(`[BrainJar] observe failed:`, err.message);
      throw err;
    }
  }
  
  /**
   * Update network parameters (dynamics, gains, etc.)
   */
  async updateConfig(config) {
    if (!this.isBooted) throw new Error('Brain not booted.');
    
    try {
      const res = await this.apiClient.post('/config', config);
      this.emit('configured', config);
      return res.data;
    } catch (err) {
      console.error(`[BrainJar] updateConfig failed:`, err.message);
      throw err;
    }
  }
  
  /**
   * Get engine status.
   */
  async getStatus() {
    if (!this.isBooted) throw new Error('Brain not booted.');
    
    try {
      const res = await this.apiClient.get('/status');
      return res.data;
    } catch (err) {
      console.error(`[BrainJar] getStatus failed:`, err.message);
      throw err;
    }
  }
  
  /**
   * Wire brain to external environment.
   * Example:
   *   brain.wire({
   *     on: (event, handler) => { ... },
   *     emit: (event, data) => { ... }
   *   })
   */
  wire(environment) {
    if (!environment) return;
    
    // On input from environment, stimulate brain
    if (environment.on && typeof environment.on === 'function') {
      environment.on('input', async (data) => {
        try {
          const result = await this.stimulate(data.neurons, data.intensity);
          if (environment.emit) {
            environment.emit('brain_response', result);
          }
        } catch (err) {
          console.error(`[BrainJar] wire handler error:`, err);
        }
      });
    }
    
    // Emit brain reactions
    this.on('stimulated', (data) => {
      if (environment.emit) {
        environment.emit('brain_reaction', data);
      }
    });
  }
  
  /**
   * Clean shutdown.
   */
  async shutdown() {
    console.log(`[BrainJar] Shutting down...`);
    
    if (this.engineProcess) {
      this.engineProcess.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    
    this.isBooted = false;
    this.emit('shutdown');
  }
  
  /**
   * Get performance metrics.
   */
  getMetrics() {
    return {
      total_operations: this.metrics.length,
      avg_latency_ms: this.metrics.length > 0
        ? this.metrics.reduce((sum, m) => sum + m.elapsed_ms, 0) / this.metrics.length
        : 0,
      metrics: this.metrics,
    };
  }
}

export default BrainJar;
