# BrainJar Trading Integration - Quick Start

## Overview

Phase 4 adds real-time market integration to the Drosophila neural simulator:
- **Stream live ticks** from IG Markets API (or simulated)
- **Map prices → neural stimulus** (uptrend = high frequency, downtrend = low frequency)
- **Record trades + outcomes** in brain memory for learning
- **Generate CSVs** at multiple timeframes (tick, 1s, 2s, 1h) for backtesting

## Files Created

| File | Purpose |
|------|---------|
| **ig-adapter.js** | IG Markets API client (auth, orders, ticks, account info) |
| **tick-recorder.js** | Records ticks to CSV, aggregates OHLCV at 1s/2s/1h |
| **memory-manager.js** | Stores stimulus→response→P&L triples; learns profitable patterns |
| **dashboard-v2.js** | Dashboard server with trading socket handlers |
| **trading-strategy.js** | Example: maps price moves → brain stimulus → trade decisions |
| **PHASE_4_TRADING_INTEGRATION.md** | Detailed technical documentation |

## Quick Setup (5 minutes)

### 1. Configure Credentials
```bash
cd BrainJar
cp .env.example .env

# Edit .env with IG credentials:
# IG_USERNAME=
# IG_PASSWORD=your_password
# IG_API_KEY=your_api_key
# IG_ACCOUNT_ID=
```

### 2. Start Brain + Dashboard + IG
```bash
cd brain-jar
node dashboard-v2.js

# Output:
# 🎨 Dashboard running on http://localhost:3000
# 📊 IG Integration ready (demo mode if no .env)
```

### 3. Open Browser
Open http://localhost:3000 in your browser
- Click **"Boot"** to initialize brain + IG connection
- You'll see real ticks streaming (simulated if no API credentials)
- Watch **P&L** and **Motor Output** charts update

### 4. Place Test Trades (Optional)
1. Select an instrument (EUR/USD, GBP/USD, USD/JPY)
2. Set size (e.g., 0.5 lots)
3. Click **Buy** or **Sell**
4. Watch trade log and P&L update

## How It Works

### Price → Brain Mapping
```
EUR/USD Price ↑ 0.0005 
    ↓
Input processing:
  - Uptrend detected
  - Price delta > threshold
    ↓
Neural stimulus:
  - Neuron: JON mechanosensory (bullish)
  - Intensity: 350 Hz
    ↓
Brain processes stimulus:
  - ~120 neurons activate
  - MN9 motor neuron fires at 45 Hz
    ↓
Trade decision:
  - High motor activation → Place BUY order
    ↓
Memory recorded:
  - Stimulus: [JON @ 350 Hz]
  - Response: [MN9 firing 45 Hz]
  - Outcome: [+$25 P&L]
```

### Learning
Brain learns: **When JON fires at high intensity → profits likely**

Next time similar stimulus → remembered as profitable pattern.

## Data Files Generated

After running for a while, you'll see:
```bash
BrainJar/data/
  ticks/
    tick_2024-01-15T14-32-45.csv    # Raw tick data
    1s_2024-01-15T14-32-45.csv      # 1-second OHLCV
    2s_2024-01-15T14-32-45.csv      # 2-second OHLCV
    1h_2024-01-15T14-32-45.csv      # Hourly OHLCV
  brain_memory.json                  # Learning data
```

Use these files for **backtesting** your trading strategies.

## Advanced: Auto-Trading Strategy

Run the included strategy:
```bash
node trading-strategy.js
```

This demonstrates:
- Automatic tick listening
- Price-based stimulus generation
- Motor activation trading signals
- Trade outcome recording
- Memory-based learning

## Troubleshooting

**"IG not connected" in dashboard**
- If no `.env`: Uses simulated ticks (still works!)
- If `.env` set: Check credentials are correct
- Dashboard works in demo mode either way

**No data appearing**
- Refresh browser (F5)
- Check console for Socket.io errors
- Ensure `dashboard-v2.js` is running (not old `dashboard.js`)

**Want to use real IG API?**
- Get live account at ig.com
- Set `IG_PASSWORD` and `IG_API_KEY` in `.env`
- Change endpoint if needed (live vs demo)

## Architecture Diagram

```
IG Markets API (or Simulator)
       ↓
   ig-adapter.js
       ↓
    Socket.io
    /  |  \
   /   |   \
Tick  Trade Account
Records Updates Events
  ↓      ↓      ↓
tick-  memory  UI
record  mgr  Charts
  ↓      ↓      ↓
CSVs  JSON     Dashboard
```

## Key Features

- ✅ **Real-time streaming:** Ticks broadcast via Socket.io
- ✅ **Memory learning:** Stimulus-response-outcome triples stored
- ✅ **Multi-timeframe:** Tick, 1s, 2s, 1h CSV exports
- ✅ **Demo mode:** Works without API credentials
- ✅ **Secure:** Credentials in `.env` (gitignored)
- ✅ **Graceful:** Ctrl+C flushes all data cleanly

## Next Steps

1. **Use real IG credentials** for actual market data
2. **Customize stimulus mapping** in `trading-strategy.js`
3. **Implement auto-trading** based on memory patterns
4. **Backtest** using recorded CSV tick files
5. **Optimize** which neurons map to which market conditions

## Docs

See **PHASE_4_TRADING_INTEGRATION.md** for:
- Full API documentation
- Memory format specification
- CSV format details
- Production deployment notes
- Extension guides

---

**Status:** ✅ Phase 4 Complete & Ready to Use

Start with demo mode, then upgrade to live trading!
