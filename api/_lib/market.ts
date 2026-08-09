// Shared market-data helpers used by the Vercel serverless functions.
// These mirror the logic that previously lived in the custom Express server
// (server.ts), adapted for a stateless serverless environment.

import path from 'path';

export interface ForexResult {
  rates: Record<string, number>;
  base: string;
  source: string;
}

const OANDA_INSTRUMENTS = [
  'EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CAD', 'USD_CHF', 'AUD_USD', 'NZD_USD',
  'EUR_JPY', 'GBP_JPY', 'EUR_GBP', 'EUR_AUD', 'EUR_CHF', 'GBP_CHF', 'GBP_AUD', 'AUD_JPY', 'CHF_JPY', 'CAD_JPY', 'AUD_NZD', 'NZD_JPY',
  'XAU_USD', 'XAG_USD', 'XPT_USD', 'XPD_USD',
  'US30_USD', 'NAS100_USD', 'SPX500_USD', 'UK100_GBP', 'DE30_EUR', 'FR40_EUR', 'HK33_HKD', 'AU200_AUD', 'JP225_USD',
  'WTICO_USD', 'BCO_USD', 'NATGAS_USD',
];

export const CRYPTO_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT', 'ADAUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'AVAXUSDT'];

export const CRYPTO_SYMBOL_MAP: Record<string, string> = {
  'BTCUSDT': 'BTCUSD',
  'ETHUSDT': 'ETHUSD',
  'BNBUSDT': 'BNBUSD',
  'XRPUSDT': 'XRPUSD',
  'SOLUSDT': 'SOLUSD',
  'ADAUSDT': 'ADAUSD',
  'DOTUSDT': 'DOTUSD',
  'MATICUSDT': 'MATICUSD',
  'LINKUSDT': 'LINKUSD',
  'AVAXUSDT': 'AVAXUSD',
};

export function oandaBaseUrl(): string {
  const isLive = process.env.OANDA_ENV === 'live';
  return isLive ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
}

// Unified Forex fetching logic with layered fallbacks (OANDA -> ExchangeRate-API -> static).
export async function getForexRates(): Promise<ForexResult> {
  const apiKey = process.env.OANDA_API_KEY;
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const baseUrl = oandaBaseUrl();

  // 1. Try OANDA
  if (apiKey && accountId) {
    try {
      const instruments = OANDA_INSTRUMENTS.join(',');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${baseUrl}/v3/accounts/${accountId}/pricing?instruments=${instruments}`, {
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const rates: Record<string, number> = {};
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
      }
      console.warn(`OANDA API returned ${response.status}. Falling back...`);
    } catch (e) {
      console.error('OANDA Fetch Error:', e);
    }
  }

  // 2. Try ExchangeRate-API (Secondary)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: controller.signal,
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
      'USOIL': 81.20, 'UKOIL': 85.40, 'BTC': 0.000015, 'ETH': 0.00028,
    },
    base: 'USD',
    source: 'Static-Fallback',
  };
}

// Fetch 24hr crypto tickers from Binance and map them to app symbols.
export async function getCryptoTickers(): Promise<Record<string, { usd: number; usd_24h_change: number }>> {
  const binanceKey = process.env.BINANCE_API_KEY;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (binanceKey) headers['X-MBX-APIKEY'] = binanceKey;

  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(CRYPTO_SYMBOLS)}`,
      { signal: controller.signal, headers },
    );
    if (!response.ok) throw new Error(`Binance returned ${response.status}`);

    const binanceData = await response.json();
    const mappedData: Record<string, { usd: number; usd_24h_change: number }> = {};
    binanceData.forEach((item: any) => {
      const sym = CRYPTO_SYMBOL_MAP[item.symbol];
      if (sym) {
        mappedData[sym] = {
          usd: parseFloat(item.lastPrice),
          usd_24h_change: parseFloat(item.priceChangePercent),
        };
      }
    });
    return mappedData;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Read text-based files from the local knowledge directory. Returns a combined
// context string (used by the AI analysis endpoint).
const HISTORY_CRYPTO_SYMBOLS = new Set(['BTCUSD', 'ETHUSD', 'BNBUSD', 'XRPUSD', 'SOLUSD', 'ADAUSD', 'DOTUSD', 'MATICUSD', 'LINKUSD', 'AVAXUSD']);
const HISTORY_OANDA_MAP: Record<string, string> = {
  EURUSD: 'EUR_USD', GBPUSD: 'GBP_USD', USDJPY: 'USD_JPY', USDCAD: 'USD_CAD', USDCHF: 'USD_CHF',
  AUDUSD: 'AUD_USD', NZDUSD: 'NZD_USD', XAUUSD: 'XAU_USD', XAGUSD: 'XAG_USD', XPTUSD: 'XPT_USD',
  XPDUSD: 'XPD_USD', US30: 'US30_USD', NAS100: 'NAS100_USD', SPX500: 'SPX500_USD', UK100: 'UK100_GBP',
  GER40: 'DE30_EUR', FRA40: 'FR40_EUR', HK50: 'HK33_HKD', AUS200: 'AU200_AUD', JPN225: 'JP225_USD',
  USOIL: 'WTICO_USD', UKOIL: 'BCO_USD', NATGAS: 'NATGAS_USD',
};

export interface HistoryPoint { time: string; price: number }

export async function getHistory(symbol: string): Promise<HistoryPoint[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    if (HISTORY_CRYPTO_SYMBOLS.has(symbol)) {
      const pair = `${symbol.replace(/USD$/, '')}USDT`;
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1h&limit=24`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Binance history returned ${response.status}`);
      const data = await response.json();
      return data.map((c: any) => ({ time: new Date(c[0]).toISOString(), price: Number(c[4]) })).filter((p: HistoryPoint) => Number.isFinite(p.price));
    }

    const instrument = HISTORY_OANDA_MAP[symbol] ?? (symbol.length === 6 ? `${symbol.slice(0, 3)}_${symbol.slice(3)}` : null);
    if (!instrument) throw new Error('Unsupported history symbol');
    const apiKey = process.env.OANDA_API_KEY;
    if (!apiKey) throw new Error('OANDA API key is not configured');
    const response = await fetch(`${oandaBaseUrl()}/v3/instruments/${instrument}/candles?count=24&price=M&granularity=H1`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`OANDA history returned ${response.status}`);
    const data = await response.json();
    return (data.candles ?? []).map((c: any) => ({ time: c.time, price: Number(c.mid?.c) })).filter((p: HistoryPoint) => Number.isFinite(p.price));
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function readKnowledgeContext(maxCharsPerFile = 1000): Promise<string> {
  let knowledgeContext = '';
  try {
    const fs = await import('fs/promises');
    const knowledgeDir = path.join(process.cwd(), 'knowledge');
    const files = await fs.readdir(knowledgeDir);
    for (const file of files) {
      if (file === 'README.md' || file.startsWith('.')) continue;
      if (file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.json')) {
        const content = await fs.readFile(path.join(knowledgeDir, file), 'utf-8');
        knowledgeContext += `--- FILE: ${file} ---\n${content.substring(0, maxCharsPerFile)}\n\n`;
      }
    }
  } catch {
    // Knowledge directory is optional.
  }
  return knowledgeContext;
}
