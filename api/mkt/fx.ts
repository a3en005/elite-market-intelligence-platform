import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getForexRates } from '../_lib/market';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    const data = await getForexRates();
    return res.status(200).json({ ...data, date: new Date().toISOString().slice(0, 10) });
  } catch (error) {
    console.error('[v0] FX handler error:', error);
    return res.status(502).json({ error: 'Unable to fetch forex prices' });
  }
}
