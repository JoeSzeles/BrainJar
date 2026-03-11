/**
 * Brain Memory Manager
 *
 * Stores and retrieves learning data:
 * - Stimulus-response associations
 * - P&L correlations (profitable stimuli)
 * - Neuron activation patterns linked to trading outcomes
 *
 * Enables the brain to "learn" which market conditions
 * correlate with profitable trading decisions.
 */

import fs from 'fs';
import path from 'path';

class MemoryManager {
  constructor(config = {}) {
    this.memoryFile = config.memoryFile || './data/brain_memory.json';
    this.maxEntries = config.maxEntries || 10000;
    this.enabled = config.enabled !== false;
    
    this.memory = {
      stimulus_response: [],  // [{ stimulus, response, pnl, timestamp }]
      neuron_patterns: {},    // { neuron_id: { positive_count, negative_count, avg_pnl } }
      strategies: [],         // [{ name, trigger_neurons, avg_pnl, win_rate }]
    };
    
    if (this.enabled) {
      this._loadMemory();
    }
  }
  
  /**
   * Load memory from disk
   */
  _loadMemory() {
    const dir = path.dirname(this.memoryFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (fs.existsSync(this.memoryFile)) {
      try {
        const data = fs.readFileSync(this.memoryFile, 'utf8');
        this.memory = JSON.parse(data);
        console.log(`[Memory] Loaded ${this.memory.stimulus_response.length} experiences`);
      } catch (err) {
        console.warn('[Memory] Could not load previous memory:', err.message);
      }
    }
  }
  
  /**
   * Save memory to disk
   */
  _saveMemory() {
    if (!this.enabled) return;
    
    const dir = path.dirname(this.memoryFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(this.memoryFile, JSON.stringify(this.memory, null, 2));
  }
  
  /**
   * Record a stimulus-response-outcome triple
   * @param {object} stimulus - { neuron_ids, intensity }
   * @param {object} response - { motor_rates, active_neurons }
   * @param {object} trade - { epic, direction, size }
   * @param {number} pnl - Profit/Loss from the trade
   */
  recordExperience(stimulus, response, trade, pnl) {
    if (!this.enabled) return;
    
    const entry = {
      timestamp: new Date(),
      stimulus,
      response,
      trade,
      pnl,
      reward: this._calculateReward(pnl),  // 1.0 for +$100, -1.0 for -$100, etc.
    };
    
    // Keep memory bounded
    this.memory.stimulus_response.push(entry);
    if (this.memory.stimulus_response.length > this.maxEntries) {
      this.memory.stimulus_response.shift();
    }
    
    // Update neuron pattern statistics
    if (stimulus.neuron_ids) {
      for (const nid of stimulus.neuron_ids) {
        if (!this.memory.neuron_patterns[nid]) {
          this.memory.neuron_patterns[nid] = {
            positive_count: 0,
            negative_count: 0,
            total_pnl: 0,
            occurrences: 0,
          };
        }
        
        const pattern = this.memory.neuron_patterns[nid];
        if (pnl > 0) {
          pattern.positive_count++;
        } else if (pnl < 0) {
          pattern.negative_count++;
        }
        pattern.total_pnl += pnl;
        pattern.occurrences++;
      }
    }
    
    this._saveMemory();
  }
  
  /**
   * Calculate reward signal (-1.0 to +1.0) from P&L
   */
  _calculateReward(pnl) {
    // Scale: $100 profit = +1.0, $100 loss = -1.0
    return Math.max(-1.0, Math.min(1.0, pnl / 100));
  }
  
  /**
   * Get profitable neuron patterns
   * @param {number} threshold - Min positive occurrences
   */
  getProfitablePatterns(threshold = 2) {
    const profitable = [];
    
    for (const [neuronId, stats] of Object.entries(this.memory.neuron_patterns)) {
      if (stats.positive_count >= threshold) {
        const winRate = stats.positive_count / stats.occurrences;
        profitable.push({
          neuron_id: neuronId,
          positive_count: stats.positive_count,
          negative_count: stats.negative_count,
          avg_pnl: stats.total_pnl / stats.occurrences,
          win_rate: winRate,
          occurrences: stats.occurrences,
        });
      }
    }
    
    return profitable.sort((a, b) => b.avg_pnl - a.avg_pnl);
  }
  
  /**
   * Find similar past experiences
   */
  findSimilarExperiences(stimulus, topN = 5) {
    const similar = this.memory.stimulus_response
      .filter(exp => {
        // Simple similarity: same neurons stimulated
        const stimNids = new Set(stimulus.neuron_ids);
        const expNids = new Set(exp.stimulus.neuron_ids);
        const intersection = [...stimNids].filter(n => expNids.has(n));
        return intersection.length > 0;
      })
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, topN);
    
    return similar;
  }
  
  /**
   * Get statistics
   */
  getStats() {
    const experiences = this.memory.stimulus_response;
    const totalPnL = experiences.reduce((sum, e) => sum + e.pnl, 0);
    const winCount = experiences.filter(e => e.pnl > 0).length;
    const lossCount = experiences.filter(e => e.pnl < 0).length;
    
    return {
      total_experiences: experiences.length,
      total_pnl: totalPnL,
      avg_pnl: experiences.length > 0 ? totalPnL / experiences.length : 0,
      win_count: winCount,
      loss_count: lossCount,
      win_rate: experiences.length > 0 ? winCount / experiences.length : 0,
      known_patterns: Object.keys(this.memory.neuron_patterns).length,
    };
  }
  
  /**
   * Clear all memory
   */
  clear() {
    this.memory = {
      stimulus_response: [],
      neuron_patterns: {},
      strategies: [],
    };
    this._saveMemory();
  }
}

export default MemoryManager;
