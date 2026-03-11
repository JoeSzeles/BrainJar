# BrainJar Dashboard - Live IG Data - Quick Start

## Prerequisites
- Node.js 16+ installed
- Valid IG Markets trading account (Demo or Live)

## Setup Steps

### 1. Verify IG Credentials in .env

The credentials are already in place at `BrainJar/brain-jar/.env`:

```bash
cat BrainJar/brain-jar/.env
```

**Output should show:**
```
IG_USERNAME=xxxx
IG_PASSWORD=xxxx
IG_API_KEY=xxxx
IG_ACCOUNT_ID=xxxx
IG_API_ENDPOINT=https://demo-api.ig.com/gateway/deal
```

✅ Credentials are already configured!

### 2. Test Connection


cd BrainJar/brain-jar
node test-ig-connection.js  # Verify IG API works
node dashboard-v2.js         # Start dashboard
# Then open http://localhost:3000

From `BrainJar/brain-jar/` directory, run the connection test:

```bash
cd BrainJar/brain-jar
npm install  # If not already done
node test-ig-connection.js
```

**Expected output:**
```
[Test] Loading .env from: .../BrainJar/brain-jar/.env

[Test] IG Credentials:
  Username: ✓ Loaded
  Password: ✓ Loaded
  API Key: ✓ Loaded
  Account ID: ✓ Loaded
  Endpoint: https://demo-api.ig.com/gateway/deal

[Test] Attempting IG connection...
✓ IG Connected - Starting stream...

[Test] Waiting 10 seconds for ticks...
[Tick 1] { bid: 1.08965, ask: 1.08968, price: 1.089665, volume: 487 }
[Tick 2] { bid: 1.08962, ask: 1.08965, price: 1.089635, volume: 234 }
[Tick 3] { bid: 1.08968, ask: 1.08971, price: 1.089695, volume: 892 }

[Test] Summary:
  Total ticks received: 15
  Tick format: { bid, ask, price, volume, timestamp }

✓ Connection working! Ticks are flowing.
```

### 3. Start the Dashboard

From `BrainJar/brain-jar/` directory:

```bash
node dashboard-v2.js
```

**Expected output:**
```
✓ Managers initialized
🎨 Dashboard running on http://localhost:3000
📊 IG Integration ready (demo mode if credentials not set)
```

### 4. Open Dashboard in Browser

Navigate to: **http://localhost:3000**

**You should see:**
- ✅ Green indicator in top-right: "✓ IG Connected (Live)"
- ✅ Tick data flowing in "Live Tick Data Feed" section
- ✅ Charts updating with price history
- ✅ Market analysis stats being populated
- ✅ Real-time candle data in the table

## Troubleshooting

### Issue: Dashboard shows "⚠️ Demo Mode"

**Cause**: IG credentials are invalid or unreachable  
**Solution**: 
1. Verify credentials in `.env` are correct for your IG account
2. Check that your IG account is active
3. Ensure you have internet connectivity
4. The dashboard will still work with simulated data for testing

### Issue: Dashboard shows "✗ IG Error"

**Cause**: IG API connection failed  
**Check browser console** (F12):
```
[Boot] IG connection failed: Error message shows here
```

**Common causes:**
- Wrong API key → Update `.env` with correct key from IG
- Invalid username/password → Verify with IG
- Network issue → Check internet connection
- IG API server down → Try again later

### Issue: No ticks in feed

**Check:**
1. Browser console (F12) for errors
2. That dashboard is still running (`node dashboard-v2.js`)
3. That you see green "✓ IG Connected" indicator
4. Run test script to verify connection works: `node test-ig-connection.js`

### Issue: Charts don't update

**Check:**
1. The "Live Tick Data Feed" section - should have ticks flowing
2. Browser console for JavaScript errors
3. Try refreshing the page (F5) and restart dashboard

## Data Flow

```
IG Demo API                Dashboard                    Browser
     ↓                          ↓                            ↓
POST /session          Authenticate &            Connection status
CST token              get Lightstreamer        IG Indicator (🟢/🔴)
     ↓                          ↓                            ↓
GET /markets          Stream ticks via:         Live Tick Feed
Bid/Ask prices        • Lightstreamer (real-time) Charts
     ↓                • REST polling (fallback)    Analysis stats
Every 3 seconds                ↓                            ↓
(REST fallback)       Emit 'tick' events    Update every 3-500ms
```

## Features Enabled

✅ **Real-Time Streaming** (Lightstreamer if available)  
✅ **Automatic Fallback** (REST polling every 3 seconds)  
✅ **Session Management** (5-minute token auto-refresh)  
✅ **Error Handling** (Graceful demo mode if IG fails)  
✅ **Market Microstructure Analysis** (Spread, volatility, trends)  
✅ **Trading Signals** (Volume, momentum, imbalance detection)  
✅ **Multi-Timeframe Candles** (1s, 5s, 1m aggregation)  
✅ **Price & Volume Charts** (Real-time Chart.js visualization)  

## Next Steps

Once live data is flowing:

1. **Test a trade** (if using demo credentials):
   - Click "Place Order" button in trading section
   - Verify trade appears in trade history

2. **Customize epics** (instruments):
   - Edit `ig-adapter.js` line where `epics = [...]` is defined
   - Update with desired IG instrument codes (e.g., 'CS.D.GBPUSD.TODAY.IP')

3. **Configure analysis**:
   - Adjust tick analyzer thresholds in `tick-analyzer.js`
   - Customize candle timeframes
   - Modify signal detection logic

## Reference

- [IG Markets API Documentation](https://labs.ig.com/rest-trading-api-guide)
- [Lightstreamer Documentation](https://lightstreamer.com/)
- [IG Demo Account Setup](https://www.ig.com/en/demo-account)
- Local reference: `BrainJar/IG-CONNECTIONS.md`

---

**Status**: ✅ Fixed & Ready to Use!

The dashboard now correctly displays live IG trading data with proper formatting, error handling, and automatic fallback modes.
