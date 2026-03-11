# Phase 7: Neural Trading 

## Features Implemented
- **Instrument Selector**: Search IG markets (`search_instruments`), select epic → dynamic ticks/P&L.
- **Account Health**: Real-time balance, equity, P&L (unrealised + realised), margin (poll 10s).
- **Calibration**: Baseline observe → threshold → live/backtest trading phase.
- **Brain Monitor**: Top firers, motor rate → BUY/HOLD/SELL signals, quality badges.
- **Backtest**: Historic candles → optimize r_poi/tau_syn/w_syn, save to `brainjar.config.json`.
- **Test Trade**: Real IG orders (placeOrder).

## Backend (`dashboard-v2.js`)
```
socket.on('search_instruments'): ig.searchInstruments(term) → instrumentList
socket.on('instrument_selected'): config.epic = data.epic; ig.epics=[epic]; startStreaming/polling
accountPollInterval: ig.getAccountInfo() → emit account_update {balance, pnl, ...}
socket.on('start_backtest'): ig.getPriceHistory → param opt, apply calibrate
socket.on('test_trade'): ig.placeOrder real
```

## Frontend (`public/index.html`)
- Panels: Search dropdown, Balance display, Calibration controls, Top firers table, Signal badges.

## Status
- [x] Handlers/UI (search, select, backtest, test_trade, calibration)
- [x] IG search/P&L/Silver default/demo remove (instrumentList, totalProfitLoss, CS.D.XAGUSD.SPOT.IP, simulateTicks error)
- [x] Epic switch on select (ig.epics=[epic]; ig.startStreaming())
- [x] Account endpoint (/accounts/{id}/summary with totalProfitLoss/marginPercentage)
- Server: `npm start` → `localhost:3000`

**Next: 1s OHLCV agg, auto-trade loop, signals/quality badges.**