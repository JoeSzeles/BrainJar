# BrainJar Trading Integration - Setup & Usage Tutorial

## Quick Summary
You now have a **complete neural trading system** that:
1. Simulates a Drosophila brain in real-time
2. Streams live (or simulated) market data
3. Maps price movements to neural stimulus
4. Records trading outcomes and learns patterns
5. Exports backtesting data at multiple timeframes

---

## 🚀 5-Minute Setup

### Step 1: Copy Environment Template
```bash
cd BrainJar
cp .env.example .env

# Edit .env with your IG credentials (optional - works without)
# nano .env  or  code .env
```

### Step 2: Install Dependencies
```bash
cd brain-jar
npm install  # dotenv already added
```

### Step 3: Start Dashboard
```bash
node dashboard-v2.js
```

You should see:
```
🎨 Dashboard running on http://localhost:3000
📊 IG Integration ready (demo mode if credentials not set)
```

### Step 4: Open Browser
```
http://localhost:3000
```

### Step 5: Click Boot
- Brain initializes
- IG connection attempts (demo mode if no credentials)
- Charts appear with live tick data
- Ready to trade!

---

## 📊 Dashboard Walkthrough

### Top Bar
- **Status:** Online/Offline indicator
- **Balance:** Your account equity
- **P&L:** Total profit/loss (green if positive)

### System Status Panel
- Engine state (Online = ✅)
- Neuron count (630)
- Synapse count (~50M)
- Simulation step
- Average latency
- IG connection status

### Trading Control Panel
- **Instrument dropdown:** EUR/USD, GBP/USD, USD/JPY
- **Size input:** Lot size (0.5 = half lot)
- **Buy/Sell buttons:** Execute orders
- **Trade log:** Last 10 trades with timestamps

### Neural Stimulus Controls
- **Neuron IDs:** FlyWire IDs (comma-separated)
- **Intensity slider:** 0-500 Hz
- **Stimulate button:** Send stimulus to brain
- **Observe button:** Just read brain state (no stimulus)

### Charts (Real-Time)
1. **Market Ticks:** EUR/USD price streaming
2. **Motor Output:** MN9 motor neuron firing rate
3. **Trade P&L:** Each trade's profit/loss
4. **Neural Activity:** Number of active neurons

### Activity Log
- Timestamped events
- Blue = system events
- Green = successful trades
- Red = errors

---

## 🎯 Common Tasks

### Task 1: Stimulate Brain Manually
1. Enter neuron IDs: `720575940619341105`
2. Set intensity: 250 Hz
3. Click **Stimulate**
4. Watch motor output spike
5. Check activity log for confirmation

### Task 2: Place a Test Trade
1. Select EUR/USD
2. Set size: 1.0
3. Click **Buy**
4. Confirm in trade log
5. Watch P&L update (if IG connected)

### Task 3: Run Auto-Trading Strategy
```bash
# Terminal 1: Dashboard
cd brain-jar && node dashboard-v2.js

# Terminal 2: Strategy
cd brain-jar && node trading-strategy.js
```

Strategy will:
- Listen for ticks
- Auto-generate stimulus from price moves
- Auto-execute trades
- Record outcomes in memory
- Print stats every 30 seconds

### Task 4: Export Data for Backtesting
```bash
# Tick files
ls -la data/ticks/

# Memory data
cat data/brain_memory.json | jq '.stimulus_response | length'  # Total trades
cat data/brain_memory.json | jq '.stimulus_response[0]'        # First trade
```

---

## 💡 How It Works (Simplified)

### Without Credentials (Demo Mode)
```
Tick Simulator (500ms intervals)
       ↓
   {price: 1.0900}
       ↓
   Dashboard
       ↓
Mock IG adapter (responds instantly)
       ↓
Charts update, ticks recorded, memory logs
```

### With IG Credentials (Live Mode)
```
Real IG Market Ticks
       ↓
   {price: 1.0900, bid: 1.0898, ask: 1.0902}
       ↓
   ig-adapter.js (authenticated)
       ↓
   Dashboard websocket
       ↓
Real trading API + actual account balance
       ↓
Charts update with real P&L
```

---

## 🧠 Neural Stimulus → Trading Example

### Scenario: Uptrend Detected
```
Price: 1.0900 → 1.0905 (+5 pips)

Price Processing:
  Delta = +0.0005
  isBullish = true

Stimulus Generation:
  Neuron: JON mechanosensory (bullish sensor)
  Intensity: 350 Hz (high = bullish)

Brain Processing:
  630 neurons receive signal
  ~120 neurons activate
  MN9 motor neuron: 45 Hz

Trade Decision:
  motorActivation (45 Hz) > threshold (35 Hz)
  ✅ Place BUY order

Memory Recording:
  stimulus: [JON @ 350 Hz]
  response: [MN9 @ 45 Hz, 120 active]
  trade: [BUY 1 EUR/USD]
  outcome: +$25 P&L (if profitable)
  
Learning Update:
  JON pattern: +1 positive, +$25 total
  win_rate for JON now: 8/10 = 80%
```

---

## 📁 Understanding File Organization

```
BrainJar/                          # Root project
├── brain_engine_mock.py           # Python API (port 8000)
├── brain_engine.py                # Full Brian2 (pending)
├── brainjar.config.json           # Neuron mappings
├── .env.example                   # Credential template
├── .gitignore                     # Security: excludes .env
│
├── brain-jar/                     # Node.js module
│   ├── dashboard-v2.js            # Main server (port 3000)
│   ├── ig-adapter.js              # IG Markets client
│   ├── tick-recorder.js           # CSV export
│   ├── memory-manager.js          # Learning storage
│   ├── trading-strategy.js        # Example strategy
│   ├── public/index.html          # Web UI
│   └── package.json               # Dependencies
│
├── data/                          # Auto-created
│   ├── ticks/
│   │   ├── tick_*.csv             # Raw ticks
│   │   ├── 1s_*.csv               # 1s candles
│   │   └── 1h_*.csv               # Hourly candles
│   └── brain_memory.json          # Learning data
│
└── docs/                          # Documentation
    ├── PHASE_4_TRADING_INTEGRATION.md
    ├── TRADING_QUICK_START.md
    └── TRADING_INTEGRATION_SUMMARY.md
```

---

## 🔍 Monitoring & Debugging

### Check Python Engine
```bash
curl http://localhost:8000/status
# Should return: {"loaded": true, "neurons_count": 630, ...}
```

### Check Dashboard Server
```bash
# Logs should show:
# 🎨 Dashboard running on http://localhost:3000
# 📡 Client connected: <socket-id>
# ✓ IG connected  (or ⚠️ IG connection failed)
```

### Check Tick Recording
```bash
tail -f data/ticks/tick_*.csv
# Watch ticks being appended in real-time
```

### Check Memory Learning
```bash
jq '.neuron_patterns | keys | length' data/brain_memory.json
# Number of distinct neurons with recorded patterns
```

### Browser Console (F12)
```javascript
// See all Socket.io events
socket.onAll((event, ...args) => console.log(event, args));

// Manually trigger stimulate
socket.emit('stimulate', {neuron_ids: ['720575940619341105'], intensity: 300});

// View account balance
socket.emit('get_memory', {}, (res) => console.log(res.stats));
```

---

## ⚙️ Configuration

### Customize Neuron Mappings
Edit `brainjar.config.json`:
```json
{
  "neuron_mappings": {
    "optic_lobe_mechanosensory": ["720575940619341105", "720575940619341106"],
    "gustatory_sugar": ["720575940661503100", "720575940661503101"],
    "motor_command": "720575940660219265"
  }
}
```

### Customize Stimulus Intensity
Edit `trading-strategy.js`:
```javascript
this.config = {
  stimulus_intensity_up: 350,      // High for uptrends
  stimulus_intensity_down: 80,     // Low for downtrends
  minMoveForTrade: 0.0005,         // Min 5 pips
};
```

### Adjust Memory Capacity
In `MemoryManager` constructor:
```javascript
new MemoryManager({ maxEntries: 10000 });  // Keep last 10k trades
```

---

## 🚨 Troubleshooting

### "Dashboard not loading"
```bash
# Kill any process on port 3000
lsof -i :3000 | grep node | awk '{print $2}' | xargs kill -9

# Restart
node dashboard-v2.js
```

### "IG connection failed"
```bash
# Option 1: Run in demo mode (no credentials needed)
# Just don't fill in .env - it will use simulated ticks

# Option 2: Verify credentials
cat .env | grep IG_
# Should show: IG_USERNAME, IG_PASSWORD, IG_API_KEY, IG_ACCOUNT_ID
```

### "No ticks appearing"
```bash
# Check if ig-adapter is connected
# In browser console:
socket.on('tick', (tick) => console.log('Tick received!', tick));

# Or check server logs - should show:
# IG tick event emitted
```

### "Trades not recording"
```bash
# Check memory file exists
ls -la data/brain_memory.json

# If missing, it will auto-create on first trade
# Make sure ./data directory is writable
chmod 755 data/
```

### "Charts not updating"
```bash
# Refresh browser (Ctrl+R or Cmd+R)
# Check browser console (F12) for errors
# Verify Socket.io connection in console:
console.log(socket.connected);  // Should be true
```

---

## 📈 Interpreting Results

### Memory Stats
```json
{
  "total_experiences": 145,        // Trades executed
  "total_pnl": 2345.67,           // Total profit 
  "avg_pnl": 16.14,               // Average per trade
  "win_count": 89,                // Profitable trades
  "loss_count": 56,               // Losing trades
  "win_rate": 0.614,              // 61.4% success
  "known_patterns": 23             // Neuron patterns learned
}
```

### Profitable Patterns
```json
{
  "neuron_id": "720575940619341105",
  "avg_pnl": 24.50,       // Average profit when this fires
  "win_rate": 0.80,       // 80% win rate
  "positive_count": 8,    // Times it led to profit
  "negative_count": 2,    // Times it led to loss
  "occurrences": 10       // Total times activated
}
```

**Interpretation:**
- High `avg_pnl` + high `win_rate` = profitable neuron pattern
- Use these for auto-trading decisions

---

## 🎓 Learning Mode

### View What Brain Has Learned
```javascript
// In browser console:
socket.emit('get_memory', {}, (res) => {
  console.table(res.patterns.slice(0, 5));
  // Shows top 5 profitable neuron patterns
});
```

### Use Learned Patterns
```javascript
// Get profitable neurons
const patterns = memory.getProfitablePatterns();

// If JON fires again at high intensity → trade
if (stimulus.neuron_ids.includes(patterns[0].neuron_id)) {
  socket.emit('place_order', {
    epic: 'CS.D.EURUSD.MINI.IP',
    direction: 'BUY',  // Or based on pattern history
    size: 1.0
  });
}
```

---

## 🎉 Next Steps

1. **Run it!** Start dashboard and explore the UI
2. **Experiment:** Try different stimuli, observe motor response
3. **Trade:** Place test orders and track P&L
4. **Learn:** Run strategy overnight, analyze patterns
5. **Backtest:** Use exported CSVs to test different approaches
6. **Optimize:** Adjust stimulus mapping based on what trades best
7. **Deploy:** Use real IG credentials for live trading

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| **PHASE_4_TRADING_INTEGRATION.md** | Complete technical reference (375 lines) |
| **TRADING_INTEGRATION_SUMMARY.md** | System architecture & components (400+ lines) |
| **TRADING_QUICK_START.md** | Quick setup guide (150 lines) |
| **This file** | Step-by-step tutorial |

Start with this file, then refer to others as needed.

---

**Ready to trade with your Drosophila brain? Let's go! 🧠🚀**
