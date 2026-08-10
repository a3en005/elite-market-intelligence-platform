import { PriceData } from '../types';
import { ASSETS } from '../constants';

const FX_API = '/api/mkt/fx';
const CRYPTO_API = '/api/mkt/crypto';

function freshUrl(url: string) {
  return `${url}?t=${Date.now()}`;
}

async function fetchWithRetry(url: string, retries = 2, delay = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(freshUrl(url), {
        signal: controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (response.ok) return response;
      if (response.status === 429) { // Rate limited
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        continue;
      }
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

export async function fetchPrices(): Promise<Record<string, PriceData>> {
  const prices: Record<string, PriceData> = {};
  let rates: any = null;
  let cryptoData: any = null;

  // Fetch Forex independently
  try {
    const fxRes = await fetchWithRetry(FX_API);
    if (fxRes.ok) {
      const fxJson = await fxRes.json();
      const nextRates = fxJson.rates || fxJson;
      if (nextRates && typeof nextRates === 'object' && Object.values(nextRates).some((value) => Number.isFinite(Number(value)))) {
        rates = nextRates;
      }
    } else {
      console.warn('Forex API returned non-OK status:', fxRes.status);
    }
  } catch (error) {
    console.error('Error fetching Forex prices:', error);
  }

  // Fetch Crypto independently
  try {
    const cryptoRes = await fetchWithRetry(CRYPTO_API);
    if (cryptoRes.ok) {
      const nextCrypto = await cryptoRes.json();
      if (nextCrypto && typeof nextCrypto === 'object') {
        cryptoData = nextCrypto;
      }
    } else {
      console.warn('Crypto API returned non-OK status:', cryptoRes.status);
      cryptoData = {};
    }
  } catch (error) {
    console.warn('[v0] Crypto API unavailable; using reference prices:', error);
    cryptoData = {};
  }

  const fallbackPrices: Record<string, number> = {
    XAUUSD: 2165.4, XAGUSD: 24.5, XPTUSD: 950, XPDUSD: 980,
    US30: 39150, NAS100: 18280, SPX500: 5175, UK100: 7900, GER40: 17800,
    FRA40: 8100, HK50: 16800, AUS200: 7800, JPN225: 38500,
    USOIL: 81.2, UKOIL: 85.4, NATGAS: 1.75,
    BTCUSD: 65000, ETHUSD: 3200, BNBUSD: 580, XRPUSD: 0.52,
    SOLUSD: 145, ADAUSD: 0.45, DOTUSD: 6.5, MATICUSD: 0.7, LINKUSD: 14, AVAXUSD: 35,
  };

  ASSETS.forEach(asset => {
    let price = 0;
    let change = 0;
    let isLive = false;

    if (asset.category === 'Forex' && rates) {
      if (rates[asset.symbol]) {
        price = rates[asset.symbol];
        isLive = true;
      } else if (asset.symbol === 'EURUSD') {
        price = 1 / (rates.EUR || 1);
        isLive = !!rates.EUR;
      } else if (asset.symbol === 'GBPUSD') {
        price = 1 / (rates.GBP || 1);
        isLive = !!rates.GBP;
      } else if (asset.symbol.startsWith('USD')) {
        const target = asset.symbol.substring(3);
        price = rates[target] || 0;
        isLive = !!rates[target];
      } else {
        const from = asset.symbol.substring(0, 3);
        const to = asset.symbol.substring(3);
        if (rates[from] && rates[to]) {
          price = rates[to] / rates[from];
          isLive = true;
        }
      }
    } else if (asset.category === 'Crypto' && cryptoData) {
      if (cryptoData[asset.symbol]) {
        price = cryptoData[asset.symbol].usd;
        change = cryptoData[asset.symbol].usd_24h_change;
        isLive = true;
      }
    } else if (asset.category === 'Currency Indexes' && rates) {
      if (asset.symbol === 'DXY') {
        const eur = 1 / (rates.EUR || 1);
        const jpy = rates.JPY || 110;
        const gbp = 1 / (rates.GBP || 0.8);
        const cad = rates.CAD || 1.3;
        const sek = rates.SEK || 10;
        const chf = rates.CHF || 0.9;
        
        price = 50.14348112 * 
                Math.pow(eur, -0.576) * 
                Math.pow(jpy, 0.136) * 
                Math.pow(gbp, -0.119) * 
                Math.pow(cad, 0.091) * 
                Math.pow(sek, 0.042) * 
                Math.pow(chf, 0.036);
        isLive = true;
      } else if (asset.symbol === 'EXY') {
        price = (1 / (rates.EUR || 1)) * 100;
        isLive = true;
      } else if (asset.symbol === 'BXY') {
        price = (1 / (rates.GBP || 1)) * 100;
        isLive = true;
      } else if (asset.symbol === 'JXY') {
        price = (1 / (rates.JPY || 110)) * 10000;
        isLive = true;
      } else {
        const rate = rates[asset.symbol.substring(0, 3)];
        if (rate) {
          price = (1 / rate) * 100;
          isLive = true;
        }
      }
    } else if (rates && (asset.category === 'Metals' || asset.category === 'Indices' || asset.category === 'Commodities') && rates[asset.symbol]) {
      price = rates[asset.symbol];
      isLive = true;
    }

    if (!isLive && price === 0 && fallbackPrices[asset.symbol]) {
      price = fallbackPrices[asset.symbol];
    }

    prices[asset.symbol] = {
      symbol: asset.symbol,
      price,
      change24h: change,
      isLive
    };
  });

  return prices;
}

function getDemoPrice(symbol: string): number {
  const bases: Record<string, number> = {
    'XAUUSD': 2150.50,
    'XAGUSD': 24.20,
    'US30': 39120,
    'NAS100': 18250,
    'SPX500': 5180,
    'USOIL': 81.50,
    'UKOIL': 85.20,
    'NATGAS': 1.75,
    'GER40': 18000,
    'JPN225': 40000
  };
  return bases[symbol] || 1.0;
}

export function setupPriceWebSocket(onUpdate: (updates: any[]) => void) {
  let stopped = false;
  let polling = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const poll = async () => {
    if (stopped || polling || document.visibilityState === 'hidden') return;
    polling = true;
    try {
      const prices = await fetchPrices();
      if (stopped) return;
      onUpdate(Object.values(prices).map((item) => ({
        symbol: item.symbol,
        price: item.price,
        change: item.change24h,
        isLive: item.isLive,
        timestamp: Date.now(),
      })));
    } catch (error) {
      console.warn('[v0] Price polling failed:', error);
    } finally {
      polling = false;
    }
  };

  void poll();
  pollTimer = setInterval(poll, 10_000);

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void poll();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    close() {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
