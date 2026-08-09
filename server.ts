import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

// Load environment variables (no-op if the files are absent, e.g. in production
// where the platform injects env vars directly).
dotenv.config({ path: '.env.development.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const requestedPort = Number(process.env.PORT) || 3000;
  const fallbackPorts = [3000, 3001, 3002, 3003, 4173, 5173, 8080];
  const candidatePorts = [...new Set([requestedPort, ...fallbackPorts])];

  // Parse JSON bodies (needed for the AI analysis endpoint). Charts can be
  // large base64 payloads, so raise the default limit.
  app.use(express.json({ limit: '15mb' }));

  // WebSocket Server
  const wss = new WebSocketServer({ server });
  // The WebSocketServer re-emits HTTP listen failures; handle it so the
  // port fallback listener can select the next available port instead of
  // terminating the process with an unhandled error.
  wss.on('error', (error) => {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
      console.error('[v0] WebSocket server error:', error);
    }
  });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('New WebSocket client connected');
    ws.on('close', () => clients.delete(ws));
  });

  const broadcast = (data: any) => {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      config: {
        oanda: !!process.env.OANDA_API_KEY && !!process.env.OANDA_ACCOUNT_ID,
        oanda_env: process.env.OANDA_ENV || 'practice',
        binance: !!process.env.BINANCE_API_KEY
      }
    });
  });

  // Knowledge Base & Intelligence API
  app.get('/api/intel', async (req, res) => {
    try {
      const fs = await import('fs/promises');
      const knowledgeDir = path.join(process.cwd(), 'knowledge');
      
      // Ensure directory exists
      try {
        await fs.access(knowledgeDir);
      } catch {
        await fs.mkdir(knowledgeDir, { recursive: true });
      }

      const files = await fs.readdir(knowledgeDir);
      const intelData = [];

      for (const file of files) {
        if (file === 'README.md' || file.startsWith('.')) continue;
        
        const filePath = path.join(knowledgeDir, file);
        const stats = await fs.stat(filePath);
        
        // For now, we only read text-based files
        let content = '';
        if (file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.json')) {
          content = await fs.readFile(filePath, 'utf-8');
        }

        intelData.push({
          name: file,
          size: stats.size,
          updatedAt: stats.mtime,
          type: path.extname(file).substring(1),
          content: content.substring(0, 1000) // Preview content
        });
      }

      res.json({
        count: intelData.length,
        items: intelData
      });
    } catch (error) {
      console.error('Intel API Error:', error);
      res.status(500).json({ error: 'Failed to scan knowledge base' });
    }
  });

  // AI Chart Analysis (server-side so the Gemini API key is never exposed to the browser)
  app.post('/api/analyze', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI analysis is not configured. Set GEMINI_API_KEY on the server.' });
    }

    const { image, mimeType } = req.body || {};
    if (!image || typeof image !== 'string' || !mimeType || typeof mimeType !== 'string') {
      return res.status(400).json({ error: 'A base64 "image" and "mimeType" are required.' });
    }

    // Strip a data URL prefix if present.
    const base64Data = image.includes(',') ? image.split(',')[1] : image;

    try {
      // Build knowledge base context by reading the local knowledge directory.
      let knowledgeContext = '';
      try {
        const fs = await import('fs/promises');
        const knowledgeDir = path.join(process.cwd(), 'knowledge');
        const files = await fs.readdir(knowledgeDir);
        for (const file of files) {
          if (file === 'README.md' || file.startsWith('.')) continue;
          if (file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.json')) {
            const content = await fs.readFile(path.join(knowledgeDir, file), 'utf-8');
            knowledgeContext += `--- FILE: ${file} ---\n${content.substring(0, 1000)}\n\n`;
          }
        }
      } catch {
        // Knowledge directory is optional.
      }

      const prompt = `
    Analyze this trading chart screenshot with institutional precision.

    ${knowledgeContext ? `Use the following Knowledge Base and Skills to inform your analysis and apply any specific strategies or rules defined there: ${knowledgeContext}` : ''}

    Structure your response as follows:

    # 📊 Institutional Intelligence Report

    ## 🔍 Market Analysis
    - **Market Structure**: [Identify HH/HL or LH/LL]
    - **Current Trend Bias**: [Bullish/Bearish/Neutral]
    - **Session Context**: [Identify current session if possible]

    ## 🛡️ Institutional Footprints
    - **Order Blocks**: [List key Supply/Demand zones]
    - **Fair Value Gaps (FVG)**: [Identify imbalances]
    - **Liquidity Pools**: [Identify Equal Highs/Lows]

    ## 🦄 Unicorn Setup
    - **Confluence**: [Identify OB + FVG confluence]
    - **Probability Score**: [1-5 Stars]

    ## 🎯 Execution Strategy
    - **Entry Zone**: [Price range]
    - **Stop Loss**: [Price level]
    - **Take Profit**: [Target levels]

    ## 📝 Analyst Notes
    [Brief institutional reasoning for the setup]

    Use clean Markdown with professional trading terminology.
  `;

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Data, mimeType } },
          ],
        },
      });

      res.json({ text: response.text });
    } catch (error) {
      console.error('AI Analysis Error:', error);
      res.status(502).json({ error: 'Failed to analyze image.' });
    }
  });

  // Cache for market data
  let latestPrices: Record<string, any> = {};
  const cache = {
    crypto: { data: null as any, timestamp: 0 },
    fx: { data: null as any, timestamp: 0 }
  };
  const CACHE_DURATION = 10000; // 10 seconds for background refresh

  // Unified Forex Fetching Logic
  async function getForexRates() {
    const apiKey = process.env.OANDA_API_KEY;
    const accountId = process.env.OANDA_ACCOUNT_ID;
    const isLive = process.env.OANDA_ENV === 'live';
    const baseUrl = isLive ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';

    // 1. Try OANDA
    if (apiKey && accountId) {
      try {
        const instruments = [
          'EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CAD', 'USD_CHF', 'AUD_USD', 'NZD_USD',
          'EUR_JPY', 'GBP_JPY', 'EUR_GBP', 'EUR_AUD', 'EUR_CHF', 'GBP_CHF', 'GBP_AUD', 'AUD_JPY', 'CHF_JPY', 'CAD_JPY', 'AUD_NZD', 'NZD_JPY',
          'XAU_USD', 'XAG_USD', 'XPT_USD', 'XPD_USD',
          'US30_USD', 'NAS100_USD', 'SPX500_USD', 'UK100_GBP', 'DE30_EUR', 'FR40_EUR', 'HK33_HKD', 'AU200_AUD', 'JP225_USD',
          'WTICO_USD', 'BCO_USD', 'NATGAS_USD'
        ].join(',');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${baseUrl}/v3/accounts/${accountId}/pricing?instruments=${instruments}`, {
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const rates: any = {};
          data.prices.forEach((p: any) => {
            const instrument = p.instrument;
            const price = (parseFloat(p.bids[0].price) + parseFloat(p.asks[0].price)) / 2;
            
            if (instrument === 'EUR_USD') rates['EUR'] = 1 / price;
            else if (instrument === 'GBP_USD') rates['GBP'] = 1 / price;
            else if (instrument === 'USD_JPY') rates['JPY'] = price;
            else if (instrument === 'USD_CAD') rates['CAD'] = price;
            else if (instrument === 'USD_CHF') rates['CHF'] = price;
            else if (instrument === 'AUD_USD') rates['AUD'] = 1 / price;
            else if (instrument === 'NZD_USD') rates['NZD'] = 1 / price;
            else if (instrument === 'XAU_USD') rates['XAUUSD'] = price;
            else if (instrument === 'XAG_USD') rates['XAGUSD'] = price;
            else if (instrument === 'XPT_USD') rates['XPTUSD'] = price;
            else if (instrument === 'XPD_USD') rates['XPDUSD'] = price;
            else if (instrument === 'US30_USD') rates['US30'] = price;
            else if (instrument === 'NAS100_USD') rates['NAS100'] = price;
            else if (instrument === 'SPX500_USD') rates['SPX500'] = price;
            else if (instrument === 'UK100_GBP') rates['UK100'] = price;
            else if (instrument === 'DE30_EUR') rates['GER40'] = price;
            else if (instrument === 'FR40_EUR') rates['FRA40'] = price;
            else if (instrument === 'HK33_HKD') rates['HK50'] = price;
            else if (instrument === 'AU200_AUD') rates['AUS200'] = price;
            else if (instrument === 'JP225_USD') rates['JPN225'] = price;
            else if (instrument === 'WTICO_USD') rates['USOIL'] = price;
            else if (instrument === 'BCO_USD') rates['UKOIL'] = price;
            else if (instrument === 'NATGAS_USD') rates['NATGAS'] = price;
            else {
              const symbol = instrument.replace('_', '');
              rates[symbol] = price;
            }
          });
          return { rates, base: 'USD', source: 'OANDA' };
        } else {
          console.warn(`OANDA API returned ${response.status}. Falling back...`);
        }
      } catch (e) {
        console.error('OANDA Fetch Error:', e);
      }
    }

    // 2. Try ExchangeRate-API (Secondary)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return { rates: data.rates, base: 'USD', source: 'ExchangeRate-API' };
      }
    } catch (e) {
      console.error('ExchangeRate-API Error:', e);
    }

    // 3. Last Resort: Static High-Fidelity Fallback
    console.warn('All Forex APIs failed. Using static fallback data.');
    return {
      rates: {
        'EUR': 0.92, 'GBP': 0.79, 'JPY': 151.50, 'CAD': 1.35, 'CHF': 0.90, 'AUD': 1.52, 'NZD': 1.65,
        'XAUUSD': 2165.40, 'XAGUSD': 24.50, 'US30': 39150, 'NAS100': 18280, 'SPX500': 5175,
        'USOIL': 81.20, 'UKOIL': 85.40, 'BTC': 0.000015, 'ETH': 0.00028
      },
      base: 'USD',
      source: 'Static-Fallback'
    };
  }

  async function getCryptoTickers() {
    try {
      const response = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT', 'ADAUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'AVAXUSDT'])));
      if (!response.ok) throw new Error(`Binance returned ${response.status}`);
      const data = await response.json();
      const map: Record<string, string> = { BTCUSDT: 'BTCUSD', ETHUSDT: 'ETHUSD', BNBUSDT: 'BNBUSD', XRPUSDT: 'XRPUSD', SOLUSDT: 'SOLUSD', ADAUSDT: 'ADAUSD', DOTUSDT: 'DOTUSD', MATICUSDT: 'MATICUSD', LINKUSDT: 'LINKUSD', AVAXUSDT: 'AVAXUSD' };
      return Object.fromEntries(data.map((item: any) => [map[item.symbol], { usd: Number(item.lastPrice), usd_24h_change: Number(item.priceChangePercent) }]));
    } catch (error) {
      console.warn('[v0] Using crypto reference prices:', error);
      return { BTCUSD: { usd: 65000, usd_24h_change: 0 }, ETHUSD: { usd: 3200, usd_24h_change: 0 }, BNBUSD: { usd: 580, usd_24h_change: 0 }, XRPUSD: { usd: 0.52, usd_24h_change: 0 }, SOLUSD: { usd: 145, usd_24h_change: 0 }, ADAUSD: { usd: 0.45, usd_24h_change: 0 }, DOTUSD: { usd: 6.5, usd_24h_change: 0 }, MATICUSD: { usd: 0.7, usd_24h_change: 0 }, LINKUSD: { usd: 14, usd_24h_change: 0 }, AVAXUSD: { usd: 35, usd_24h_change: 0 } };
    }
  }

  // Proxy for Forex API
  app.get('/api/mkt/fx', async (req, res) => {
    const now = Date.now();
    if (cache.fx.data && (now - cache.fx.timestamp < CACHE_DURATION)) {
      return res.json(cache.fx.data);
    }

    try {
      const data = await getForexRates();
      const formattedData = { 
        rates: data.rates, 
        base: data.base, 
        date: new Date().toISOString().split('T')[0],
        source: data.source
      };
      cache.fx.data = formattedData;
      cache.fx.timestamp = now;
      res.json(formattedData);
    } catch (error) {
      console.error('Proxy Forex Error:', error);
      res.status(500).json({ error: 'Internal server error fetching Forex' });
    }
  });

  // Historical Data Endpoint
  app.get('/api/mkt/history/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const supportedSymbols = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'USDCHF', 'AUDUSD', 'NZDUSD', 'XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD', 'US30', 'NAS100', 'SPX500', 'UK100', 'GER40', 'FRA40', 'HK50', 'AUS200', 'JPN225', 'USOIL', 'UKOIL', 'NATGAS', 'BTCUSD', 'ETHUSD', 'BNBUSD', 'XRPUSD', 'SOLUSD', 'ADAUSD', 'DOTUSD', 'MATICUSD', 'LINKUSD', 'AVAXUSD']);
    if (!/^[A-Z0-9]{3,12}$/.test(symbol) || !supportedSymbols.has(symbol)) {
      return res.status(400).json({ error: 'Unsupported history symbol', data: [] });
    }
    const isCrypto = ['BTCUSD', 'ETHUSD', 'BNBUSD', 'XRPUSD', 'SOLUSD', 'ADAUSD', 'DOTUSD', 'MATICUSD', 'LINKUSD', 'AVAXUSD'].includes(symbol);
    
    try {
      if (isCrypto) {
        const binanceSymbol = symbol.replace('USD', 'USDT');
        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=24`);
        if (!response.ok) throw new Error('Binance history failed');
        const data = await response.json();
        const history = data.map((d: any) => ({
          time: new Date(d[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          price: parseFloat(d[4])
        }));
        return res.json(history);
      } else {
        const apiKey = process.env.OANDA_API_KEY;
        const isLive = process.env.OANDA_ENV === 'live';
        const baseUrl = isLive ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
        
        if (!apiKey) throw new Error('OANDA API Key missing');

        // Map app symbol to OANDA instrument
        let instrument = symbol;
        if (symbol === 'EURUSD') instrument = 'EUR_USD';
        else if (symbol === 'GBPUSD') instrument = 'GBP_USD';
        else if (symbol === 'USDJPY') instrument = 'USD_JPY';
        else if (symbol === 'USDCAD') instrument = 'USD_CAD';
        else if (symbol === 'USDCHF') instrument = 'USD_CHF';
        else if (symbol === 'AUDUSD') instrument = 'AUD_USD';
        else if (symbol === 'NZDUSD') instrument = 'NZD_USD';
        else if (symbol === 'XAUUSD') instrument = 'XAU_USD';
        else if (symbol === 'XAGUSD') instrument = 'XAG_USD';
        else if (symbol === 'US30') instrument = 'US30_USD';
        else if (symbol === 'NAS100') instrument = 'NAS100_USD';
        else if (symbol === 'SPX500') instrument = 'SPX500_USD';
        else if (symbol === 'USOIL') instrument = 'WTICO_USD';
        else if (symbol === 'UKOIL') instrument = 'BCO_USD';
        else if (symbol === 'NATGAS') instrument = 'NATGAS_USD';
        else if (symbol.length === 6) instrument = `${symbol.substring(0, 3)}_${symbol.substring(3)}`;

        const response = await fetch(`${baseUrl}/v3/instruments/${instrument}/candles?count=24&price=M&granularity=H1`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) throw new Error('OANDA history failed');
        const data = await response.json();
        const history = data.candles.map((c: any) => ({
          time: new Date(c.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          price: parseFloat(c.mid.c)
        }));
        return res.json(history);
      }
    } catch (error) {
      console.error('History Error:', error);
      // Fallback: Generate mock history if API fails
      const history = Array.from({ length: 24 }, (_, i) => ({
        time: `${i}:00`,
        price: 100 + Math.random() * 10
      }));
      res.json(history);
    }
  });

  // Proxy for Crypto API (Binance)
  app.get('/api/mkt/crypto', async (req, res) => {
    const now = Date.now();
    if (cache.crypto.data && (now - cache.crypto.timestamp < CACHE_DURATION)) {
      return res.json(cache.crypto.data);
    }
    try {
      const data = await getCryptoTickers();
      cache.crypto.data = data;
      cache.crypto.timestamp = now;
      res.json(data);
    } catch (error) {
      console.error('Proxy Crypto Error:', error);
      res.json({
        BTCUSD: { usd: 65000, usd_24h_change: 0 }, ETHUSD: { usd: 3200, usd_24h_change: 0 },
        BNBUSD: { usd: 580, usd_24h_change: 0 }, XRPUSD: { usd: 0.52, usd_24h_change: 0 },
        SOLUSD: { usd: 145, usd_24h_change: 0 }, ADAUSD: { usd: 0.45, usd_24h_change: 0 },
        DOTUSD: { usd: 6.5, usd_24h_change: 0 }, MATICUSD: { usd: 0.7, usd_24h_change: 0 },
        LINKUSD: { usd: 14, usd_24h_change: 0 }, AVAXUSD: { usd: 35, usd_24h_change: 0 },
      });
    }
  });


  // Background price fetching and broadcasting
  let isUpdating = false;
  async function updateMarketData() {
    if (isUpdating) return;
    isUpdating = true;

    try {
      const apiKey = process.env.OANDA_API_KEY;
      const accountId = process.env.OANDA_ACCOUNT_ID;
      const binanceKey = process.env.BINANCE_API_KEY;

      const updates: any[] = [];
      const now = Date.now();

      // 1. Fetch Forex, Metals, Indices, Commodities (Resilient)
      try {
        const fxData = await getForexRates();
        const rates = fxData.rates;
        
        Object.entries(rates).forEach(([symbol, price]) => {
          let appSymbol = symbol;
          // Map back to app symbols if needed
          if (symbol === 'EUR') appSymbol = 'EURUSD';
          else if (symbol === 'GBP') appSymbol = 'GBPUSD';
          else if (symbol === 'JPY') appSymbol = 'USDJPY';
          else if (symbol === 'CAD') appSymbol = 'USDCAD';
          else if (symbol === 'CHF') appSymbol = 'USDCHF';
          else if (symbol === 'AUD') appSymbol = 'AUDUSD';
          else if (symbol === 'NZD') appSymbol = 'NZDUSD';

          const numericPrice = typeof price === 'number' ? price : parseFloat(price as string);
          if (!isNaN(numericPrice)) {
            updates.push({ symbol: appSymbol, price: numericPrice, timestamp: now });
            latestPrices[appSymbol] = numericPrice;
          }
        });

        cache.fx.data = { 
          rates, 
          base: 'USD', 
          date: new Date().toISOString().split('T')[0],
          source: fxData.source
        };
        cache.fx.timestamp = now;
      } catch (e) {
        console.error('Forex Background Fetch Error:', e);
      }

      // 2. Fetch Crypto (Binance)
      if (binanceKey) {
        try {
          const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT', 'ADAUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'AVAXUSDT'];
          const headers: any = { 'Accept': 'application/json', 'X-MBX-APIKEY': binanceKey };

          const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`, { headers });

          if (response.ok) {
            const binanceData = await response.json();
            const mappedData: any = {};
            const symbolMap: any = {
              'BTCUSDT': 'BTCUSD',
              'ETHUSDT': 'ETHUSD',
              'BNBUSDT': 'BNBUSD',
              'XRPUSDT': 'XRPUSD',
              'SOLUSDT': 'SOLUSD',
              'ADAUSDT': 'ADAUSD',
              'DOTUSDT': 'DOTUSD',
              'MATICUSDT': 'MATICUSD',
              'LINKUSDT': 'LINKUSD',
              'AVAXUSDT': 'AVAXUSD'
            };

            binanceData.forEach((item: any) => {
              const sym = symbolMap[item.symbol];
              if (sym) {
                const price = parseFloat(item.lastPrice);
                const change = parseFloat(item.priceChangePercent);
                mappedData[sym] = { usd: price, usd_24h_change: change };
                updates.push({ symbol: sym, price, change, timestamp: now });
                latestPrices[sym] = price;
              }
            });

            cache.crypto.data = mappedData;
            cache.crypto.timestamp = now;
          }
        } catch (e) {
          console.error('Crypto Background Fetch Error:', e);
        }
      }

      if (updates.length > 0) {
        broadcast({ type: 'PRICE_UPDATE', data: updates });
      }
    } finally {
      isUpdating = false;
      setTimeout(updateMarketData, 5000); // Schedule next update
    }
  }

  // Start background updates
  updateMarketData();

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback for client-side routing. Unknown /api routes should 404
    // rather than return the HTML shell.
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const listenOnAvailablePort = (index = 0) => {
    const port = candidatePorts[index];
    if (!port) {
      console.error(`[v0] No available port found. Tried: ${candidatePorts.join(', ')}`);
      process.exitCode = 1;
      return;
    }

    const handleError = (error: NodeJS.ErrnoException) => {
      server.removeListener('error', handleError);
      if (error.code === 'EADDRINUSE') {
        console.warn(`[v0] Port ${port} is busy; trying ${candidatePorts[index + 1] ?? 'no further ports'}.`);
        listenOnAvailablePort(index + 1);
      } else {
        console.error(`[v0] Failed to start on port ${port}:`, error);
        process.exitCode = 1;
      }
    };

    server.once('error', handleError);
    server.listen(port, '0.0.0.0', () => {
      process.env.PORT = String(port);
      console.log(`Server running on port ${port}`);
      if (port !== requestedPort) {
        console.log(`[v0] Port ${requestedPort} was unavailable. Alternative ports: ${candidatePorts.filter((item) => item !== requestedPort).join(', ')}`);
      }
    });
  };

  listenOnAvailablePort();
}

startServer();
