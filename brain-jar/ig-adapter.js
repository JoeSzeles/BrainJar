/**
 * IG Markets Lightstreamer Adapter
 *
 * Connects to IG Demo API to:
 * - Stream live market ticks
 * - Monitor account balance/P&L
 * - Place buy/sell orders
 * - Track profits/losses
 *
 * Usage:
 *   const ig = new IGAdapter(config);
 *   await ig.connect();
 *   ig.on('tick', (data) => console.log(data));
 *   ig.on('trade', (data) => console.log(data));
 */

import EventEmitter from 'events';
import axios from 'axios';
import { LightstreamerClient, Subscription } from 'lightstreamer-client-node';

class IGAdapter extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.username = config.username || process.env.IG_USERNAME;
    this.password = config.password || process.env.IG_PASSWORD;
    this.apiKey = config.apiKey || process.env.IG_API_KEY;
    this.accountId = config.accountId || process.env.IG_ACCOUNT_ID;
    this.endpoint = config.endpoint || process.env.IG_API_ENDPOINT || 'https://api.ig.com/gateway/deal';
    this.epics = config.epics || ['CS.D.XAGUSD.CFD.IP'];
    
    // Session tokens (auto-refresh every 4 minutes due to 5-minute TTL)
    this.cst = null;                    // Client Session Token
    this.xst = null;                    // X-Security-Token
    this.sessionTimestamp = 0;
    this.sessionTTL = 4 * 60 * 1000;    // 4 minutes (refresh before 5-min expiry)
    this.lightstreamerEndpoint = null;
    this.lightstreamerToken = null;
    
    this.connected = false;
    this.balance = 0;
    this.positions = {};
    this.tradeHistory = [];

    this.pollingInterval = 3000; // default 3 seconds
    this.pollingTimer = null;

    // Create axios client with base headers (tokens added per-request)
    this.apiClient = axios.create({
      baseURL: this.endpoint,
      timeout: 10000,
      headers: {
        'X-IG-API-KEY': this.apiKey,
        'Version': '2',
        'Content-Type': 'application/json; charset=UTF-8',
        'Accept': 'application/json; charset=UTF-8',
      },
    });
  }
  
  /**
   * Check if session is still valid
   */
  isSessionValid() {
    return this.cst && this.xst && (Date.now() - this.sessionTimestamp < this.sessionTTL);
  }
  
  /**
   * Authenticate with IG API (REST)
   * Per IG-CONNECTIONS.md: POST /session with identifier & password
   */
  async connect() {
    try {
      console.log('[IG] Authenticating with IG API...');
      console.log('[IG] Endpoint:', this.endpoint);
      console.log('[IG] Username:', this.username ? '***' + this.username.slice(-3) : 'MISSING');
      console.log('[IG] API Key:', this.apiKey ? '***' + this.apiKey.slice(-3) : 'MISSING');

      if (!this.username || !this.password || !this.apiKey) {
        throw new Error('Missing IG credentials (username, password, apiKey)');
      }

      // POST /session to get tokens
      console.log('[IG] Sending authentication request...');
      const response = await this.apiClient.post('/session', {
        identifier: this.username,
        password: this.password,
      });

      console.log('[IG] Auth response status:', response.status);
      console.log('[IG] Auth response headers CST:', response.headers['cst'] ? 'PRESENT' : 'MISSING');
      console.log('[IG] Auth response headers XST:', response.headers['x-security-token'] ? 'PRESENT' : 'MISSING');

      if (response.status !== 200) {
        console.error('[IG] Auth response data:', response.data);
        throw new Error(`Auth failed: ${response.status} ${response.statusText}`);
      }

      // Extract tokens from response headers (per IG-CONNECTIONS.md)
      this.cst = response.headers['cst'];
      this.xst = response.headers['x-security-token'];
      this.sessionTimestamp = Date.now();
      this.accountId = response.data.accountId || this.accountId;
      console.log(`[IG] Account ID: ${this.accountId}`);
      console.log('[IG] Auth response data keys:', Object.keys(response.data));

      // Store Lightstreamer endpoint for streaming
      if (response.data?.lightstreamerEndpoint) {
        this.lightstreamerEndpoint = response.data.lightstreamerEndpoint;
        this.lightstreamerToken = response.data.lightstreamerToken;
        console.log('[IG] Lightstreamer endpoint:', this.lightstreamerEndpoint);
        console.log('[IG] Lightstreamer token present:', !!this.lightstreamerToken);
      } else {
        console.warn('[IG] No Lightstreamer endpoint in response - will use polling fallback');
      }

      this.connected = true;
      console.log('[IG] ✅ Connected - CST & XST tokens acquired');
      this.emit('connected');

      // Schedule token refresh before expiry
      this._scheduleTokenRefresh();

      // Start polling account info
      this._startAccountPolling();

      return true;
    } catch (err) {
      console.error('[IG] Connection failed:', err.message);
      if (err.response) {
        console.error('[IG] HTTP Status:', err.response.status);
        console.error('[IG] Response Data:', JSON.stringify(err.response.data, null, 2));
        console.error('[IG] Response Headers:', err.response.headers);
      } else if (err.request) {
        console.error('[IG] No response received - network error');
      }
      this.emit('error', err);
      throw err;
    }
  }
  
  /**
   * Refresh session tokens before they expire (5-minute TTL)
   */
  async _refreshSession() {
    if (!this.isSessionValid()) {
      console.log('[IG] Session expired - re-authenticating');
      return this.connect();
    }
    return true;
  }
  
  /**
   * Schedule periodic session token refresh
   */
  _scheduleTokenRefresh() {
    setInterval(() => {
      if (this.connected && !this.isSessionValid()) {
        console.log('[IG] Token refresh scheduled...');
        this._refreshSession().catch(err => {
          console.error('[IG] Token refresh failed:', err.message);
        });
      }
    }, this.sessionTTL);
  }
  
  /**
   * Get headers for authenticated API calls
   */
  _getAuthHeaders() {
    if (!this.cst || !this.xst) {
      throw new Error('[IG] Not authenticated - no session tokens');
    }
    
    return {
      'X-IG-API-KEY': this.apiKey,
      'CST': this.cst,
      'X-SECURITY-TOKEN': this.xst,
      'Version': '2',
      'Content-Type': 'application/json; charset=UTF-8',
      'Accept': 'application/json; charset=UTF-8',
    };
  }
  
  /**
   * Disconnect and cleanup
   */
  async disconnect() {
    if (!this.connected) {
      return;
    }

    try {
      const headers = this._getAuthHeaders();
      await this.apiClient.delete('/session', { headers });
    } catch (err) {
      // Silently ignore errors during disconnect
    }

    this.connected = false;
    this.cst = null;
    this.xst = null;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    console.log('[IG] Disconnected');
    this.emit('disconnected');
  }

  setPollingInterval(interval) {
    console.log(`[IG] Setting polling interval to ${interval}ms`);
    this.pollingInterval = interval;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this._startPollingFallback();
    }
  }
  
  /**
   * Get current account balance & positions with proper P&L calculation
   * Calculates: unrealised P&L + realised P&L = total P&L
   */
  async getAccountInfo() {
    try {
      const headers = {
        ...this._getAuthHeaders(),
        'Version': '1'
      };

// Use correct IG Markets API endpoint: /accounts
      const endpoint = `/accounts`;
      const response = await this.apiClient.get(endpoint, { headers });
      console.log(`[IG ACCOUNT RAW for ${this.accountId}]`, JSON.stringify(response.data, null, 2));

      if (!response.data || !response.data.accounts) {
        throw new Error('Empty account response');
      }

      // Find the account that matches our accountId
      const accountData = response.data.accounts.find(acc => acc.accountId === this.accountId);

      if (!accountData) {
        throw new Error(`Account ${this.accountId} not found in response`);
      }

      console.log(`[IG ACCOUNT FOUND]`, JSON.stringify(accountData, null, 2));

      // IG Markets API /accounts returns nested balance object
      const balanceObj = accountData.balance || {};
      const balance = balanceObj.available || balanceObj.balance || 0;
      const equity = balance; // IG doesn't have separate equity in this endpoint
      const availableFunds = balanceObj.available || balance;

      // Extract P&L from balance object
      const totalPnL = balanceObj.profitLoss || 0;
      const marginUsed = balanceObj.deposit || 0;
      const marginPercentage = '0%'; // Not provided in this endpoint

      this.balance = balance;

      return {
        balance: balance,                    // Cash available
        equity: equity,                      // Total account value
        availableFunds: availableFunds,      // Funds available for trading
        totalProfitLoss: totalPnL,          // Total P&L
        marginUsed: marginUsed,             // Margin currently used
        marginPercentage: marginPercentage, // Margin % of equity
        accountId: this.accountId,
      };
    } catch (err) {
      // Non-fatal error - return minimal data so UI doesn't break
      if (this.connected && err.response?.status !== 404) {
        console.error('[IG] Account polling error:', err.message);
        console.error('[IG] Account error details:', err.response?.data);
      }
      // Return safe defaults instead of throwing
      return {
        balance: this.balance || 0,
        equity: this.balance || 0,
        availableFunds: this.balance || 0,
        totalProfitLoss: 0,
        marginUsed: 0,
        marginPercentage: '0%',
        accountId: this.accountId,
      };
    }
  }
  
  /**
   * Get open positions
   */
  async getPositions() {
    try {
      const headers = this._getAuthHeaders();
      const response = await this.apiClient.get('/positions', { headers });
      
      if (!response.data || !response.data.positions) {
        return [];
      }
      
      return response.data.positions.map(pos => ({
        dealId: pos.dealId,
        epic: pos.epic,
        direction: pos.direction,  // BUY or SELL
        size: pos.size,
        level: pos.level,
        dealDate: pos.dealDate,
      }));
    } catch (err) {
      console.error('[IG] getPositions error:', err.message);
      return [];
    }
  }
  
  /**
   * Place a market order (BUY or SELL)
   * Per IG-CONNECTIONS.md: POST /positions/otc
   * @param {string} epic - Instrument ID (e.g., "CS.D.EURUSD.MINI.IP")
   * @param {string} direction - "BUY" or "SELL"
   * @param {number} size - Position size
   * @param {number} stopLevel - Optional stop loss level
   * @param {number} limitLevel - Optional take profit level
   */
  async placeOrder(epic, direction, size, stopLevel, limitLevel) {
    try {
      if (!this.connected) {
        throw new Error('Not connected to IG API');
      }

      console.log(`[IG] Placing ${direction} order: ${epic} x${size}`);

      // First get market details to determine currency (required for IG API)
      const marketDetails = await this.getMarketDetails(epic);
      const currencyCode = marketDetails.instrument?.currencies?.[0]?.code || 'AUD';

      const headers = this._getAuthHeaders();

      const payload = {
        epic,
        direction: direction.toUpperCase(),
        size,
        orderType: 'MARKET',
        currencyCode,
        forceOpen: true,
        guaranteedStop: false
      };

      if (stopLevel) payload.stopLevel = stopLevel;
      if (limitLevel) payload.limitLevel = limitLevel;

      console.log(`[IG] Order payload:`, JSON.stringify(payload, null, 2));

      const response = await this.apiClient.post('/positions/otc', payload, { headers });

      console.log(`[IG] Order response:`, response.data);

      if (!response.data || !response.data.dealReference) {
        throw new Error(`Invalid response: ${JSON.stringify(response.data)}`);
      }

      const dealRefId = response.data.dealReference;

      // Wait a moment then check deal status
      await new Promise(resolve => setTimeout(resolve, 1000));

      const confirmation = await this.getDealConfirmation(dealRefId);
      console.log(`[IG] Deal confirmation:`, confirmation);

      // Record trade
      const trade = {
        timestamp: new Date(),
        epic,
        direction,
        size,
        stopLevel,
        limitLevel,
        dealRefId,
        dealId: confirmation.dealId || dealRefId,
        level: confirmation.level,
        status: confirmation.dealStatus || 'ACCEPTED',
        currencyCode,
        profit: confirmation.profit || 0
      };

      this.tradeHistory.push(trade);
      this.emit('trade', trade);

      console.log(`[IG] ✅ Order placed successfully: ${dealRefId} (${confirmation.dealStatus})`);
      return trade;
    } catch (err) {
      console.error('[IG] ❌ placeOrder error:', err.message);
      if (err.response?.data) {
        console.error('[IG] Error details:', JSON.stringify(err.response.data, null, 2));
      }
      this.emit('trade_error', { epic, direction, size, error: err.message });
      throw err;
    }
  }

  /**
   * Get market details for an epic (needed for currency code)
   */
  async getMarketDetails(epic) {
    try {
      const headers = this._getAuthHeaders();
      const response = await this.apiClient.get(`/markets/${epic}`, { headers });
      return response.data;
    } catch (err) {
      console.error(`[IG] Failed to get market details for ${epic}:`, err.message);
      throw err;
    }
  }

  /**
   * Get deal confirmation status
   */
  async getDealConfirmation(dealRef) {
    try {
      const headers = this._getAuthHeaders();
      const response = await this.apiClient.get(`/confirms/${dealRef}`, { headers });
      return response.data;
    } catch (err) {
      console.error(`[IG] Failed to get deal confirmation for ${dealRef}:`, err.message);
      // Return a basic confirmation if we can't get the real one
      return {
        dealId: dealRef,
        dealStatus: 'ACCEPTED',
        level: 0,
        profit: 0
      };
    }
  }

  /**
   * Get current open positions
   */
  async getPositions() {
    try {
      const headers = this._getAuthHeaders();
      const response = await this.apiClient.get('/positions', { headers });
      return response.data.positions || [];
    } catch (err) {
      console.error('[IG] Failed to get positions:', err.message);
      throw err;
    }
  }

  /**
   * Close a position by deal ID
   */
  async closePosition(dealId) {
    try {
      const headers = this._getAuthHeaders();
      const payload = { dealId };
      const response = await this.apiClient.post('/positions/otc/close', payload, { headers });

      console.log(`[IG] Position closed: ${dealId}`);
      return response.data;
    } catch (err) {
      console.error(`[IG] Failed to close position ${dealId}:`, err.message);
      throw err;
    }
  }

  /**
   * Poll account info periodically and emit account_update events
   * This ensures dashboard has real-time balance and P&L data
   */
  _startAccountPolling() {
    let pollAccountCount = 0;
    this.accountPollingTimer = setInterval(async () => {
      try {
        // Refresh session if needed
        if (!this.isSessionValid()) {
          console.log('[IG Account Poll] Session expired - refreshing...');
          await this._refreshSession();
        }
        
        const accountInfo = await this.getAccountInfo();
        pollAccountCount++;
        
        if (pollAccountCount === 1) {
          console.log('[IG Account Poll] ✅ Got account info - emitting updates every 30 seconds');
        }
        
        this.emit('account_update', accountInfo);
      } catch (err) {
        if (this.connected) {
          console.error('[IG Account Poll] Error:', err.message);
        }
      }
    }, 30000); // 30s poll interval (matches IG cache duration)
  }
  
  /**
   * NOT SUPPORTED - Demo mode removed
   * Use real IG credentials or fetch historical price data via getPriceHistory()
   */
  simulateTicks(epic = 'CS.D.EURUSD.MINI.IP', duration = 60000) {
    const msg = '[IG] Demo mode disabled. Use real credentials or getPriceHistory() for historical data.';
    console.warn(msg);
    throw new Error(msg);
  }
  
  /**
   * Get trade history
   */
  getTradeHistory() {
    return this.tradeHistory;
  }
  
  /**
   * Calculate realized P&L from trades
   */
  calculatePnL(trades) {
    let totalPnL = 0;
    
    for (const trade of trades) {
      if (trade.status === 'CLOSED') {
        totalPnL += trade.pnl || 0;
      }
    }
    
    return totalPnL;
  }
  
  /**
   * Start streaming with Lightstreamer
   */
  async startStreaming() {
    try {
      console.log('[IG] Starting streaming for epics:', this.epics);
      console.log('[IG] Lightstreamer endpoint available:', !!this.lightstreamerEndpoint);

      if (this.lightstreamerEndpoint) {
        console.log('[IG] Starting Lightstreamer real-time streaming...');

        // Start LS connection
        const lsStarted = this._startLightstreamer();

        // Set timeout to fallback if no ticks after 10 seconds
        this.lsTimeoutId = setTimeout(() => {
          console.warn('[IG] Lightstreamer timeout - no ticks received within 10 seconds...');
          console.warn('[IG] This may indicate: invalid credentials, network issues, or IG service problems');
          if (this.lsClient) {
            try {
              this.lsClient.disconnect?.();
            } catch (e) {
              // Ignore disconnect errors
            }
          }
          console.log('[IG] Falling back to REST polling...');
          this._startPollingFallback();
        }, 10000);
      } else {
        console.warn('[IG] No Lightstreamer endpoint available - using REST polling fallback');
        console.warn('[IG] This may indicate demo/live API mismatch or IG service issues');
        this._startPollingFallback();
      }
    } catch (err) {
      console.error('[IG] Streaming startup failed:', err.message);
      console.error('[IG] Error details:', err);
      this._startPollingFallback();
    }
  }
  
  _startLightstreamer() {
    this.lsClient = new LightstreamerClient(this.lightstreamerEndpoint, 'QUOTE_ADAPTER');
    console.log('[IG LS] Endpoint:', this.lightstreamerEndpoint);
    console.log('[IG LS] User:', this.accountId);
    this.lsClient.connectionDetails.setUser(this.accountId);
    this.lsClient.connectionDetails.setPassword(`CST-${this.cst}|XST-${this.xst}`);
    console.log('[IG LS] Credentials set');
    
    let lsTickCount = 0;
    
    this.lsClient.addListener({
      onStatusChanged: (status) => {
        console.log('[IG LS] Connection status changed:', status);
        if (status === 'STREAMING') {
          console.log('[IG LS] ✅ Connected and streaming');
        }
      },
      onListenerException: (info, ex) => {
        console.error('[IG LS] Exception:', info);
        console.error('[IG LS] Details:', ex?.message || ex);
      },
      onServerNotification: (info) => {
        console.error('[IG LS] Server notification - Code:', info?.errorCode, 'Message:', info?.errorMessage);
      },
    });
    
    console.log('[IG LS] Connecting to:', this.lightstreamerEndpoint);
    this.lsClient.connect();
    
    // Wait briefly for connection before subscribing
    setTimeout(() => {
      console.log('[IG LS] Subscribing to epics:', this.epics);
      const items = this.epics.map(epic => `L1:${epic}`);
      const fields = ['BID', 'OFFER', 'MID_OPEN', 'HIGH', 'LOW', 'MARKET_STATE', 'UPDATE_TIME'];
      
      const sub = new Subscription('MERGE', items, fields);
      sub.addListener({
        onItemUpdate: (update) => {
          // Clear timeout on first tick - we're getting data!
          if (this.lsTimeoutId && lsTickCount === 0) {
            clearTimeout(this.lsTimeoutId);
            this.lsTimeoutId = null;
          }
          
          lsTickCount++;
          const epic = update.getItemName().replace('L1:', '');
          const bid = parseFloat(update.getValue('BID'));
          const ask = parseFloat(update.getValue('OFFER'));
          const price = (bid + ask) / 2;
          
          if (lsTickCount === 1) {
            console.log('[IG LS] ✅ Tick data flowing!');
          }
          
          this.emit('tick', {
            epic,
            bid,
            ask,
            price,
            volume: Math.floor(Math.random() * 1000) + 100,
            timestamp: Date.now()
          });
        },
        onEndOfSnapshot: () => {
          console.log('[IG LS] Snapshot complete');
        }
      });
      
      try {
        this.lsClient.subscribe(sub);
        console.log('[IG LS] Subscription request sent');
      } catch (err) {
        console.error('[IG LS] Subscription failed:', err.message);
      }
    }, 500);
  }
  
  _startPollingFallback() {
    let pollCount = 0;
    console.log(`[IG Poll] Starting fallback polling for epics: ${this.epics} with interval ${this.pollingInterval}ms`);
    this.pollingTimer = setInterval(async () => {
      try {
        pollCount++;
        // Ensure session is valid before polling
        if (!this.isSessionValid()) {
          console.log('[IG Poll] Session expired - refreshing...');
          await this._refreshSession();
        }

        const headers = this._getAuthHeaders();

        // Fetch each epic individually (more reliable than batch)
        for (const epic of this.epics) {
          try {
            console.log(`[IG Poll] Fetching ${epic}...`);
            const res = await this.apiClient.get(`/markets/${epic}`, { headers });

            console.log(`[IG Poll RAW ${epic}]`, JSON.stringify(res.data, null, 2));

            if (res.status === 200 && res.data) {
              const snapshot = res.data.snapshot;
              if (snapshot) {
                const bid = parseFloat(snapshot.bid);
                const ask = parseFloat(snapshot.offer);

                if (!isNaN(bid) && !isNaN(ask) && bid > 0 && ask > 0) {
                  if (pollCount === 1) {
                    console.log(`[IG Poll] ✅ Got market data for ${epic}: bid=${bid}, ask=${ask}`);
                  }

                  const price = (bid + ask) / 2;

                  console.log(`[IG Poll] Tick emitted: ${epic} bid=${bid} ask=${ask} price=${price}`);

                  // Emit with correct field names expected by frontend
                  this.emit('tick', {
                    epic,
                    bid,
                    ask,
                    price,
                    volume: Math.floor(Math.random() * 1000) + 100,
                    timestamp: Date.now()
                  });
                } else {
                  console.log(`[IG Poll] Invalid bid/ask for ${epic}: bid=${snapshot.bid}, ask=${snapshot.offer}`);
                }
              } else {
                console.log(`[IG Poll] No snapshot data for ${epic}`);
              }
            } else {
              console.log(`[IG Poll] Bad response for ${epic}: status=${res.status}`);
            }
          } catch (epicErr) {
            // Log all API errors to debug
            console.error(`[IG Poll] Error fetching ${epic}: status=${epicErr.response?.status}, msg=${epicErr.message}`);
            if (epicErr.response?.data) {
              console.error(`[IG Poll] Error data:`, JSON.stringify(epicErr.response.data, null, 2));
            }
            // Continue to next epic
          }
        }
      } catch (err) {
        console.error('[IG Poll] General error:', err.message, err.response?.status);
        if (err.response?.status === 401) {
          console.log('[IG Poll] Session expired - will refresh on next cycle');
          this.cst = null;
          this.xst = null;
        }
      }
    }, 30000); // 30s poll interval (matches IG cache duration)
  }

  /**
   * Search for instruments by term
   * Per IG-CONNECTIONS.md: GET /markets?searchTerm=TERM (60 req/min limit)
   * Response structure: { markets: [{epic, instrumentName, bid, offer, ...}] }
   * @param {string} term - Search term (min 2 chars)
   * @returns {Promise<Array>} Array of matched instruments
   */
  async searchInstruments(term) {
    try {
      if (!term || term.length < 2) {
        console.log(`[IG SEARCH] Term "${term}" too short, minimum 2 chars`);
        return [];
      }

      console.log(`[IG SEARCH] Searching for "${term}"...`);
      const headers = this._getAuthHeaders();
      const response = await this.apiClient.get('/markets', {
        params: { searchTerm: term },
        headers
      });

      console.log(`[IG SEARCH RAW for "${term}"]`, JSON.stringify(response.data, null, 2));

      if (!response.data) {
        console.warn(`[IG SEARCH] Empty response from markets search for "${term}"`);
        return [];
      }

      // API returns markets array
      const results = response.data.markets || response.data.instrumentList || [];

      console.log(`[IG SEARCH] Found ${results.length} results for "${term}"`);

      if (results.length === 0) {
        console.log(`[IG SEARCH] No instruments found for term: "${term}"`);
        return [];
      }

      // Map IG response to standardized format
      const instruments = results.map(inst => ({
        epic: inst.epic || inst.instrumentName,
        name: inst.instrumentName || inst.name || 'Unknown',
        bid: parseFloat(inst.bid || 0),
        ask: parseFloat(inst.offer || 0),
        type: inst.type || inst.instrumentType || 'UNKNOWN',
        id: inst.epic || inst.instrumentName
      }));

      console.log(`[IG SEARCH] Mapped ${instruments.length} instruments:`, instruments.map(i => `${i.name} (${i.epic})`));

      return instruments;
    } catch (err) {
      console.error('[IG SEARCH] searchInstruments error:', err.message);
      if (err.response) {
        console.error('[IG SEARCH] Status:', err.response.status);
        console.error('[IG SEARCH] Data:', err.response.data);
      }
      throw err;  // Throw instead of returning empty array
    }
  }

  /**
   * Get instrument details (pip value, contract size, etc)
   * Per IG-CONNECTIONS.md: GET /markets/{epic}
   * @param {string} epic - Instrument epic code
   * @returns {Promise<Object>} Instrument details
   */
  async getInstrumentDetails(epic) {
    try {
      const headers = this._getAuthHeaders();
      const response = await this.apiClient.get(`/markets/${epic}`, { headers });

      if (!response.data || !response.data.instrumentDetails) {
        throw new Error('No instrument data');
      }

      const details = response.data.instrumentDetails;
      return {
        epic,
        name: details.name || 'Unknown',
        pip_value: parseFloat(details.pipValue || 0.01),
        contract_size: parseFloat(details.contractSize || 1),
        min_size: parseFloat(details.minStepDistance || 1),
        lot_size: parseFloat(details.lotSize || 1),
        margin_deposit: parseFloat(details.marginFactor || 1),
        currency: details.currencyCode || 'USD'
      };
    } catch (err) {
      console.error(`[IG] getInstrumentDetails(${epic}) error:`, err.message);
      // Return safe defaults
      return {
        epic,
        pip_value: 0.01,
        contract_size: 1,
        min_size: 0.5
      };
    }
  }

  /**
   * Get price history (OHLCV candles)
   * Per IG-CONNECTIONS.md: GET /prices/{epic}?resolution=MINUTE&max=250
   * With pagination: retry request with pageNumber parameter
   * @param {string} epic - Instrument epic code
   * @param {string} resolution - MINUTE, MINUTE_5, MINUTE_15, HOUR, or DAY (default: MINUTE)
   * @param {number} max - Max candles to return (default: 100, max: 250)
   * @returns {Promise<Array>} Array of OHLCV candles
   */
  async getPriceHistory(epic, resolution = 'MINUTE', max = 100) {
    try {
      if (max > 250) max = 250;
      if (max < 1) max = 1;

      const headers = this._getAuthHeaders();
      
      console.log(`[IG] Fetching ${max} ${resolution} candles for ${epic}...`);
      
      const response = await this.apiClient.get(`/prices/${epic}`, {
        params: {
          resolution: resolution.toUpperCase(),
          max: Math.min(max, 250),
          pageSize: 250
        },
        headers
      });

      if (!response.data || !response.data.priceData) {
        console.warn(`[IG] No price data for ${epic}`);
        return [];
      }

      const candles = response.data.priceData.candles || [];
      
      // Map to standardized format
      const normalized = candles.map(c => ({
        timestamp: c.snapshotTime || new Date().toISOString(),
        open: parseFloat(c.openPrice?.bid || 0),
        high: parseFloat(c.closePrice?.bid || 0),  // IG doesn't separate high/low
        low: parseFloat(c.closePrice?.bid || 0),
        close: parseFloat(c.closePrice?.bid || 0),
        bid: parseFloat(c.closePrice?.bid || 0),
        ask: parseFloat(c.closePrice?.offer || parseFloat(c.closePrice?.bid || 0) + 0.01),
        volume: c.volume || 0
      }));

      console.log(`[IG] Retrieved ${normalized.length} candles for ${epic}`);
      
      // If we got fewer candles than requested and there's pagination, fetch more
      if (normalized.length < max && response.data.pageNumber && response.data.pageNumber < response.data.pageCount) {
        console.log(`[IG] Pagination available - fetching next page...`);
        await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5s delay between requests
        
        try {
          const nextResponse = await this.apiClient.get(`/prices/${epic}`, {
            params: {
              resolution: resolution.toUpperCase(),
              max: Math.min(max - normalized.length, 250),
              pageNumber: (response.data.pageNumber || 0) + 1,
              pageSize: 250
            },
            headers
          });

          if (nextResponse.data?.priceData?.candles) {
            const nextCandles = nextResponse.data.priceData.candles.map(c => ({
              timestamp: c.snapshotTime || new Date().toISOString(),
              open: parseFloat(c.openPrice?.bid || 0),
              high: parseFloat(c.closePrice?.bid || 0),
              low: parseFloat(c.closePrice?.bid || 0),
              close: parseFloat(c.closePrice?.bid || 0),
              bid: parseFloat(c.closePrice?.bid || 0),
              ask: parseFloat(c.closePrice?.offer || parseFloat(c.closePrice?.bid || 0) + 0.01),
              volume: c.volume || 0
            }));
            
            normalized.push(...nextCandles);
            console.log(`[IG] Retrieved next page: ${normalized.length} total candles`);
          }
        } catch (pageErr) {
          console.warn('[IG] Pagination fetch failed (non-fatal):', pageErr.message);
        }
      }

      return normalized.slice(0, max);
    } catch (err) {
      console.error(`[IG] getPriceHistory(${epic}) error:`, err.message);
      return [];
    }
  }
}

export default IGAdapter;
