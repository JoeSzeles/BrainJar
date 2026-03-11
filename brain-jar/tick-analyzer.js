/**
 * Tick Data Analyzer
 *
 * Analyzes incoming tick data and provides insights:
 * - Price statistics (bid-ask spread, volatility)
 * - Volume analysis (cumulative, average)
 * - Trend detection (uptrend/downtrend/neutral)
 * - Candle formation tracking
 * - Market microstructure patterns
 */

class TickAnalyzer {
  constructor(config = {}) {
    this.maxTicks = config.maxTicks || 100;
    this.ticks = [];
    
    // Aggregation buffers for candles
    this.candles = {
      '1s': {},    // Second-based
      '5s': {},    // 5-second based
      '1m': {},    // Minute-based
    };
    
    // Statistics
    this.stats = {
      totalTicks: 0,
      lastUpdate: null,
      priceStats: {},
      volumeStats: {},
      spreadStats: {},
      trendAnalysis: {},
      volatility: 0,
    };
  }
  
  /**
   * Add a new tick and analyze
   */
  analyzeTick(tick) {
    if (!tick) return null;
    
    // Normalize tick data
    const normalizedTick = {
      timestamp: new Date(tick.timestamp || Date.now()),
      epic: tick.epic || 'UNKNOWN',
      bid: parseFloat(tick.bid) || 0,
      ask: parseFloat(tick.ask) || 0,
      price: parseFloat(tick.price) || 0,
      volume: parseInt(tick.volume) || 0,
    };
    
    // Keep bounded history
    this.ticks.push(normalizedTick);
    if (this.ticks.length > this.maxTicks) {
      this.ticks.shift();
    }
    
    // Aggregate into candles
    this._aggregateCandles(normalizedTick);
    
    // Update statistics
    this._updateStats(normalizedTick);
    
    return this._generateInsights(normalizedTick);
  }
  
  /**
   * Aggregate tick into multi-timeframe candles
   */
  _aggregateCandles(tick) {
    const timeframes = [
      { key: '1s', bucketFn: (t) => Math.floor(t.getTime() / 1000) },
      { key: '5s', bucketFn: (t) => Math.floor(t.getTime() / 5000) },
      { key: '1m', bucketFn: (t) => Math.floor(t.getTime() / 60000) },
    ];
    
    for (const tf of timeframes) {
      const bucket = tf.bucketFn(tick.timestamp);
      const key = `${tick.epic}_${bucket}`;
      
      if (!this.candles[tf.key][key]) {
        this.candles[tf.key][key] = {
          timestamp: tick.timestamp,
          epic: tick.epic,
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          bid_open: tick.bid,
          bid_high: tick.bid,
          bid_low: tick.bid,
          bid_close: tick.bid,
          ask_open: tick.ask,
          ask_high: tick.ask,
          ask_low: tick.ask,
          ask_close: tick.ask,
          volume: tick.volume,
          count: 1,
          volume_weighted_price: tick.price * tick.volume,
          bid_ask_spread: (tick.ask - tick.bid).toFixed(5),
        };
      } else {
        const candle = this.candles[tf.key][key];
        candle.high = Math.max(candle.high, tick.price);
        candle.low = Math.min(candle.low, tick.price);
        candle.close = tick.price;
        candle.bid_high = Math.max(candle.bid_high, tick.bid);
        candle.bid_low = Math.min(candle.bid_low, tick.bid);
        candle.bid_close = tick.bid;
        candle.ask_high = Math.max(candle.ask_high, tick.ask);
        candle.ask_low = Math.min(candle.ask_low, tick.ask);
        candle.ask_close = tick.ask;
        candle.volume += tick.volume;
        candle.count++;
        candle.volume_weighted_price += tick.price * tick.volume;
      }
    }
  }
  
  /**
   * Update running statistics
   */
  _updateStats(tick) {
    this.stats.totalTicks++;
    this.stats.lastUpdate = tick.timestamp;
    
    if (this.ticks.length < 2) return;
    
    // Price stats
    const prices = this.ticks.map(t => t.price);
    this.stats.priceStats = {
      current: tick.price,
      min: Math.min(...prices),
      max: Math.max(...prices),
      mean: prices.reduce((a, b) => a + b) / prices.length,
      range: Math.max(...prices) - Math.min(...prices),
    };
    
    // Volume stats
    const volumes = this.ticks.map(t => t.volume);
    this.stats.volumeStats = {
      current: tick.volume,
      total: volumes.reduce((a, b) => a + b),
      average: volumes.reduce((a, b) => a + b) / volumes.length,
      max: Math.max(...volumes),
      min: Math.min(...volumes),
    };
    
    // Spread stats
    const spreads = this.ticks.map(t => t.ask - t.bid);
    this.stats.spreadStats = {
      current: (tick.ask - tick.bid).toFixed(5),
      average: (spreads.reduce((a, b) => a + b) / spreads.length).toFixed(5),
      max: Math.max(...spreads).toFixed(5),
      min: Math.min(...spreads).toFixed(5),
    };
    
    // Volatility (standard deviation of returns)
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    if (returns.length > 0) {
      const meanReturn = returns.reduce((a, b) => a + b) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
      this.stats.volatility = Math.sqrt(variance);
    }
    
    // Trend analysis
    this._analyzeTrend(prices);
  }
  
  /**
   * Detect trend direction
   */
  _analyzeTrend(prices) {
    if (prices.length < 3) {
      this.stats.trendAnalysis = { direction: 'NEUTRAL', strength: 0 };
      return;
    }
    
    const recent = prices.slice(-10);
    const slope = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
    const avgPrice = recent.reduce((a, b) => a + b) / recent.length;
    const strength = Math.abs(slope / avgPrice);
    
    let direction = 'NEUTRAL';
    if (slope > 0.0001) direction = 'UPTREND';
    if (slope < -0.0001) direction = 'DOWNTREND';
    
    this.stats.trendAnalysis = {
      direction,
      strength: strength.toFixed(6),
      slope: slope.toFixed(6),
    };
  }
  
  /**
   * Generate trading insights from tick
   */
  _generateInsights(tick) {
    const insights = {
      timestamp: tick.timestamp,
      epic: tick.epic,
      
      // Price level insights
      price_level: this._classifyPriceLevel(),
      
      // Spread implications
      spread_size: {
        value: (tick.ask - tick.bid).toFixed(5),
        classification: this._classifySpread(tick.ask - tick.bid),
      },
      
      // Volume insights
      volume_activity: this._classifyVolume(tick.volume),
      
      // Trading signals
      signals: {
        bid_ask_imbalance: this._detectBidAskImbalance(),
        volume_breakout: this._detectVolumeBreakout(tick.volume),
        price_momentum: this._detectMomentum(),
      },
      
      // Candle data
      candles_1s: this._getCandleData('1s'),
      candles_5s: this._getCandleData('5s'),
      
      // Overall market condition
      market_condition: this._assessMarketCondition(),
    };
    
    return insights;
  }
  
  /**
   * Classify current price level (high/mid/low in recent range)
   */
  _classifyPriceLevel() {
    const stats = this.stats.priceStats;
    if (!stats.range) return 'UNKNOWN';
    
    const position = (stats.current - stats.min) / stats.range;
    
    if (position > 0.8) return 'HIGH';
    if (position > 0.6) return 'UPPER_MID';
    if (position > 0.4) return 'MID';
    if (position > 0.2) return 'LOWER_MID';
    return 'LOW';
  }
  
  /**
   * Classify spread size
   */
  _classifySpread(spread) {
    if (spread < 0.0001) return 'TIGHT';
    if (spread < 0.0002) return 'NORMAL';
    if (spread < 0.0005) return 'WIDE';
    return 'VERY_WIDE';
  }
  
  /**
   * Classify volume activity
   */
  _classifyVolume(volume) {
    const avgVolume = this.stats.volumeStats?.average || 0;
    if (!avgVolume) return 'UNKNOWN';
    
    const ratio = volume / avgVolume;
    if (ratio > 2) return 'HIGH';
    if (ratio > 1.5) return 'ABOVE_AVERAGE';
    if (ratio > 0.75) return 'NORMAL';
    return 'LOW';
  }
  
  /**
   * Detect bid-ask imbalance
   */
  _detectBidAskImbalance() {
    if (this.ticks.length < 3) return 'NEUTRAL';
    
    const recent = this.ticks.slice(-3);
    const bidCount = recent.filter(t => t.bid > (t.ask + t.bid) / 2).length;
    const askCount = recent.filter(t => t.ask < (t.ask + t.bid) / 2).length;
    
    if (bidCount > askCount) return 'BID_PRESSURE';
    if (askCount > bidCount) return 'ASK_PRESSURE';
    return 'BALANCED';
  }
  
  /**
   * Detect volume breakout
   */
  _detectVolumeBreakout(currentVolume) {
    const avgVolume = this.stats.volumeStats?.average || 0;
    if (!avgVolume) return false;
    
    return currentVolume > avgVolume * 2;
  }
  
  /**
   * Detect price momentum
   */
  _detectMomentum() {
    const trend = this.stats.trendAnalysis;
    const volatility = this.stats.volatility;
    
    if (trend.direction === 'UPTREND' && volatility > 0.0001) return 'BULLISH';
    if (trend.direction === 'DOWNTREND' && volatility > 0.0001) return 'BEARISH';
    return 'NEUTRAL';
  }
  
  /**
   * Get current candle data for timeframe
   */
  _getCandleData(timeframe) {
    const candles = this.candles[timeframe];
    const keys = Object.keys(candles);
    
    if (keys.length === 0) return null;
    
    // Return last 5 candles
    return keys.slice(-5).map(key => {
      const c = candles[key];
      return {
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        count: c.count,
        vwap: c.volume_weighted_price / c.volume,
        range: c.high - c.low,
        color: c.close >= c.open ? 'GREEN' : 'RED',
      };
    });
  }
  
  /**
   * Assess overall market condition
   */
  _assessMarketCondition() {
    const trend = this.stats.trendAnalysis.direction;
    const volatility = this.stats.volatility;
    const spread = parseFloat(this.stats.spreadStats.current);
    
    let condition = 'NORMAL';
    
    if (volatility > 0.001) condition = 'HIGH_VOLATILITY';
    if (spread > 0.0005) condition = 'WIDE_SPREAD';
    
    if (trend === 'UPTREND') condition = 'TRENDING_UP';
    if (trend === 'DOWNTREND') condition = 'TRENDING_DOWN';
    
    if (volatility < 0.00001) condition = 'QUIET';
    
    return condition;
  }
  
  /**
   * Get summary report
   */
  getSummary() {
    return {
      total_ticks: this.stats.totalTicks,
      last_update: this.stats.lastUpdate,
      price_stats: this.stats.priceStats,
      volume_stats: this.stats.volumeStats,
      spread_stats: this.stats.spreadStats,
      trend_analysis: this.stats.trendAnalysis,
      volatility: this.stats.volatility,
      market_condition: this._assessMarketCondition(),
    };
  }
  
  /**
   * Get tick history
   */
  getTickHistory() {
    return this.ticks.map(t => ({
      timestamp: t.timestamp.toISOString(),
      price: t.price,
      bid: t.bid,
      ask: t.ask,
      spread: t.ask - t.bid,
      volume: t.volume,
    }));
  }
  
  /**
   * Get all candle data
   */
  getAllCandles() {
    const result = {};
    for (const [tf, candles] of Object.entries(this.candles)) {
      result[tf] = Object.values(candles).slice(-10).map((c) => ({
        timestamp: c.timestamp.toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        tick_count: c.count,
        range: c.high - c.low,
      }));
    }
    return result;
  }
}

export default TickAnalyzer;
