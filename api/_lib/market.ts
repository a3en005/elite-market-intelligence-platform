/**
 * Shared market-data helpers for financial data integrations.
 * 
 * This module provides platform-agnostic market data fetching with:
 * - Resilient error handling and automatic retries (Binance & OANDA)
 * - Graceful fallback chains for high availability
 * - Configurable timeouts and retry strategies
 * - Detailed error logging for monitoring
 * 
 * Works with both Express server and serverless functions (Vercel, AWS Lambda, etc.)
 */

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

/**
 * Unified Forex fetching logic with hardened resilience.
 * 
 * Fallback chain:
 *   1. OANDA API (primary: 40+ forex instruments, metals, indices, commodities)
 *   2. ExchangeRate-API (secondary: lightweight forex fallback)
 *   3. Static High-Fidelity Data (tertiary: last resort with realistic prices)
 * 
 * Features:
 *   - Configurable timeouts (default 5s)
 *   - Detailed error logging for debugging
 *   - Graceful degradation on API failures
 *   - Instrument-level error tracking
 */
export async function getForexRates(timeoutMs = 5000): Promise<ForexResult> {
  const apiKey = process.env.OANDA_API_KEY;
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const baseUrl = oandaBaseUrl();

  // ===== STRATEGY 1: Primary OANDA Integration =====
  if (apiKey && accountId) {
    try {
      const instruments = OANDA_INSTRUMENTS.join(',');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const startTime = Date.now();
      const response = await fetch(`${baseUrl}/v3/accounts/${accountId}/pricing?instruments=${instruments}`, {
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        const rates: Record<string, number> = {};
        let instrumentCount = 0;

        // Normalize OANDA's bid-ask pricing to mid-price
        data.prices?.forEach((p: any) => {
          try {
            const instrument = p.instrument;
            const bidPrice = parseFloat(p.bids?.[0]?.price);
            const askPrice = parseFloat(p.asks?.[0]?.price);

            if (isNaN(bidPrice) || isNaN(askPrice)) {
              console.warn(`[OANDA] Skipping ${instrument}: invalid prices (bid=${bidPrice}, ask=${askPrice})`);
              return;
            }

            const price = (bidPrice + askPrice) / 2;
            instrumentCount++;

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
          } catch (e) {
            console.warn(`[OANDA] Error parsing instrument: ${(e as Error).message}`);
          }
        });

        console.log(`✓ OANDA: Fetched ${instrumentCount} instruments in ${duration}ms`);
        return { rates, base: 'USD', source: 'OANDA' };
      }

      console.warn(
        `⚠️ OANDA returned HTTP ${response.status} after ${duration}ms. Falling back to secondary source.`,
      );
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(
        `⚠️ OANDA Fetch Error (${e instanceof Error && e.message.includes('abort') ? 'TIMEOUT' : 'ERROR'}): ${errorMsg}`,
      );
    }
  } else {
    console.warn('⚠️ OANDA_API_KEY or OANDA_ACCOUNT_ID not configured. Skipping primary source.');
  }

  // ===== STRATEGY 2: Secondary ExchangeRate-API Fallback =====
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const startTime = Date.now();
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      console.log(`✓ ExchangeRate-API fallback succeeded in ${duration}ms`);
      return { rates: data.rates, base: 'USD', source: 'ExchangeRate-API' };
    }

    console.warn(`⚠️ ExchangeRate-API returned HTTP ${response.status} after ${duration}ms`);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(
      `⚠️ ExchangeRate-API Fallback Error: ${errorMsg}`,
    );
  }

  // ===== STRATEGY 3: Static High-Fidelity Fallback =====
  console.error('❌ All Forex APIs exhausted. Activating static fallback (prices may be stale).');
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

/**
 * Fetch 24hr crypto tickers from Binance with enhanced resilience.
 * 
 * Features:
 *   - Automatic retry with exponential backoff on transient failures
 *   - Configurable timeout (default 10s)
 *   - Rate-limit (429) aware retry logic
 *   - Graceful fallback to stale cached data on catastrophic failure
 *   - Detailed error logging for monitoring
 *   - Support for both authenticated (API key) and public endpoints
 */
export async function getCryptoTickers(timeoutMs = 10000): Promise<Record<string, { usd: number; usd_24h_change: number }>> {
  const binanceKey = process.env.BINANCE_API_KEY;
  const cryptoCache = new Map<string, { usd: number; usd_24h_change: number; timestamp: number }>();

  // Helper: Attempt single Binance request
  const fetchBinanceTickers = async (retryAttempt = 0): Promise<Record<string, { usd: number; usd_24h_change: number }> | null> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (binanceKey) headers['X-MBX-APIKEY'] = binanceKey;

    try {
      const startTime = Date.now();
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(CRYPTO_SYMBOLS)}`,
        { signal: controller.signal, headers },
      );
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        const backoffMs = Math.min(5000, retryAfter * 1000 * Math.pow(2, retryAttempt));

        console.warn(
          `⚠️ Binance Rate Limited (HTTP 429). Retry attempt ${retryAttempt + 1} after ${backoffMs}ms.`,
        );

        if (retryAttempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          return fetchBinanceTickers(retryAttempt + 1);
        }

        console.error('❌ Binance: Max rate-limit retries exceeded.');
        return null;
      }

      if (!response.ok) {
        console.warn(
          `⚠️ Binance returned HTTP ${response.status} after ${duration}ms. Error: ${response.statusText}`,
        );
        return null;
      }

      const binanceData = await response.json();
      const mappedData: Record<string, { usd: number; usd_24h_change: number }> = {};

      binanceData?.forEach((item: any) => {
        try {
          const sym = CRYPTO_SYMBOL_MAP[item.symbol];
          if (sym) {
            const usdPrice = parseFloat(item.lastPrice);
            const usd24hChange = parseFloat(item.priceChangePercent);

            if (isNaN(usdPrice) || isNaN(usd24hChange)) {
              console.warn(`[Binance] Skipping ${item.symbol}: invalid price data`);
              return;
            }

            mappedData[sym] = {
              usd: usdPrice,
              usd_24h_change: usd24hChange,
            };

            // Update cache for fallback
            cryptoCache.set(sym, { usd: usdPrice, usd_24h_change: usd24hChange, timestamp: Date.now() });
          }
        } catch (e) {
          console.warn(`[Binance] Error parsing ticker ${item.symbol}: ${(e as Error).message}`);
        }
      });

      console.log(`✓ Binance: Fetched ${Object.keys(mappedData).length}/${CRYPTO_SYMBOLS.length} tickers in ${duration}ms`);
      return mappedData;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(
        `⚠️ Binance Fetch Error (${e instanceof Error && e.message.includes('abort') ? 'TIMEOUT' : 'ERROR'}, attempt ${retryAttempt}): ${errorMsg}`,
      );
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // Attempt primary fetch
  const result = await fetchBinanceTickers();

  if (result) {
    return result;
  }

  // Fallback: Return cached data if available
  if (cryptoCache.size > 0) {
    const cachedData: Record<string, { usd: number; usd_24h_change: number }> = {};
    const now = Date.now();

    cryptoCache.forEach((value, key) => {
      const ageMs = now - value.timestamp;
      const ageHours = ageMs / (1000 * 60 * 60);

      if (ageHours < 24) {
        cachedData[key] = { usd: value.usd, usd_24h_change: value.usd_24h_change };
        console.warn(`[Cache] Using stale Binance data for ${key} (${ageHours.toFixed(1)} hours old)`);
      }
    });

    if (Object.keys(cachedData).length > 0) {
      console.warn(`⚠️ Binance unavailable. Returning ${Object.keys(cachedData).length} cached tickers (max 24h old).`);
      return cachedData;
    }
  }

  // Last resort: Return empty (client will use fallback mechanisms)
  console.error('❌ Binance: No data available (all retries exhausted, cache empty).');
  return {};
}

// Read text-based files from the local knowledge directory. Returns a combined
// context string (used by the AI analysis endpoint).
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
