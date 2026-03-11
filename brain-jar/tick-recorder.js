/**
 * Tick Data Recorder
 *
 * Records market tick data at multiple timeframes:
 * - Raw tick level
 * - Aggregated: 1s, 2s, 1h
 *
 * Exports to CSV for backtesting
 */

import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';

class TickRecorder {
  constructor(config = {}) {
    this.dataDir = config.dataDir || './data/ticks';
    this.enabled = config.enabled !== false;
    this.timeframes = config.timeframes || ['tick', '1s', '2s', '1h'];
    
    // Data buffers for different timeframes
    this.buffers = {
      tick: [],
      '1s': {},
      '2s': {},
      '1h': {},
    };
    
    // File writers (CSV streams) for each timeframe
    this.writers = {};
    
    // Initialize encoding if enabled
    if (this.enabled) {
      this._initializeStorage();
    }
  }
  
  /**
   * Initialize data directory and CSV headers
   */
  _initializeStorage() {
    // Create data directory
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      console.log(`[TickRecorder] Created directory: ${this.dataDir}`);
    }
    
    // Initialize CSV writers for each timeframe
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    
    for (const tf of this.timeframes) {
      const filename = `${tf}_${timestamp}.csv`;
      const filepath = path.join(this.dataDir, filename);
      
      // Write CSV header
      const header = 'timestamp,epic,bid,ask,price,volume,timeframe\n';
      fs.writeFileSync(filepath, header);
      
      // Create stream for appending
      this.writers[tf] = fs.createWriteStream(filepath, { flags: 'a' });
      
      console.log(`[TickRecorder] Initialized: ${filename}`);
    }
  }
  
  /**
   * Record a tick and aggregate at different timeframes
   */
  recordTick(tick) {
    if (!this.enabled) return;
    
    // Record raw tick
    this._writeTick(tick, 'tick');
    
    // Aggregate to 1s, 2s, 1h
    this._aggregateAndWrite(tick, '1s');
    this._aggregateAndWrite(tick, '2s');
    this._aggregateAndWrite(tick, '1h');
  }
  
  /**
   * Write tick to CSV
   */
  _writeTick(tick, timeframe) {
    // Convert timestamp number to ISO string if needed
    let timestampStr;
    if (typeof tick.timestamp === 'number') {
      timestampStr = new Date(tick.timestamp).toISOString();
    } else if (tick.timestamp instanceof Date) {
      timestampStr = tick.timestamp.toISOString();
    } else {
      timestampStr = tick.timestamp.toString();
    }
    
    const line = [
      timestampStr,
      tick.epic || 'N/A',
      tick.bid || tick.price,
      tick.ask || tick.price,
      tick.price,
      tick.volume || 0,
      timeframe,
    ].join(',') + '\n';
    
    if (this.writers[timeframe]) {
      this.writers[timeframe].write(line);
    }
  }
  
  /**
   * Aggregate ticks into timeframe buckets
   */
  _aggregateAndWrite(tick, timeframe) {
    const bucketKey = this._getBucketKey(tick.timestamp, timeframe);
    const buffer = this.buffers[timeframe];
    
    if (!buffer[bucketKey]) {
      buffer[bucketKey] = {
        timestamp: tick.timestamp,
        epic: tick.epic,
        prices: [],
        bids: [],
        asks: [],
        volumes: [],
        count: 0,
      };
    }
    
    // Accumulate data
    buffer[bucketKey].prices.push(tick.price);
    buffer[bucketKey].bids.push(tick.bid || tick.price);
    buffer[bucketKey].asks.push(tick.ask || tick.price);
    buffer[bucketKey].volumes.push(tick.volume || 0);
    buffer[bucketKey].count++;
    
    // If bucket is complete, write it out
    if (this._isBucketComplete(tick.timestamp, bucketKey, timeframe)) {
      const aggregated = this._aggregateBucket(buffer[bucketKey], timeframe);
      this._writeTick(aggregated, timeframe);
      delete buffer[bucketKey];
    }
  }
  
  /**
   * Get bucket key for timeframe
   */
  _getBucketKey(timestamp, timeframe) {
    const time = new Date(timestamp);
    
    switch (timeframe) {
      case '1s':
        return `${time.getFullYear()}-${time.getMonth()}-${time.getDate()}-${time.getHours()}-${time.getMinutes()}-${time.getSeconds()}`;
      case '2s':
        return `${time.getFullYear()}-${time.getMonth()}-${time.getDate()}-${time.getHours()}-${time.getMinutes()}-${Math.floor(time.getSeconds() / 2)}`;
      case '1h':
        return `${time.getFullYear()}-${time.getMonth()}-${time.getDate()}-${time.getHours()}`;
      default:
        return '';
    }
  }
  
  /**
   * Check if bucket period has ended
   */
  _isBucketComplete(timestamp, bucketKey, timeframe) {
    const nextTime = new Date(timestamp);
    let nextKey;
    
    switch (timeframe) {
      case '1s':
        nextTime.setSeconds(nextTime.getSeconds() + 1);
        break;
      case '2s':
        nextTime.setSeconds(nextTime.getSeconds() + 2);
        break;
      case '1h':
        nextTime.setHours(nextTime.getHours() + 1);
        break;
    }
    
    nextKey = this._getBucketKey(nextTime, timeframe);
    return nextKey !== bucketKey;
  }
  
  /**
   * Aggregate bucket data (OHLCV)
   */
  _aggregateBucket(bucket, timeframe) {
    const prices = bucket.prices;
    
    return {
      timestamp: bucket.timestamp,
      epic: bucket.epic,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
      bid: Math.min(...bucket.bids),
      ask: Math.max(...bucket.asks),
      price: prices[prices.length - 1],
      volume: bucket.volumes.reduce((a, b) => a + b, 0),
    };
  }
  
  /**
   * Flush and close all writers
   */
  async flush() {
    return new Promise((resolve) => {
      let completed = 0;
      const total = Object.keys(this.writers).length;
      
      for (const writer of Object.values(this.writers)) {
        writer.end(() => {
          completed++;
          if (completed === total) {
            console.log('[TickRecorder] Flushed all files');
            resolve();
          }
        });
      }
    });
  }
  
  /**
   * Get recorded tick files
   */
  getFiles() {
    if (!fs.existsSync(this.dataDir)) return [];
    return fs.readdirSync(this.dataDir);
  }
}

export default TickRecorder;
