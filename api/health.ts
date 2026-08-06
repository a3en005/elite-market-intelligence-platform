import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
      oanda: !!process.env.OANDA_API_KEY && !!process.env.OANDA_ACCOUNT_ID,
      oanda_env: process.env.OANDA_ENV || 'practice',
      binance: !!process.env.BINANCE_API_KEY,
    },
  });
}
