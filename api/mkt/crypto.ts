import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCryptoTickers } from '../_lib/market';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    return res.status(200).json(await getCryptoTickers());
  } catch (error) {
    console.error('[v0] crypto handler error:', error);
    return res.status(502).json({ error: 'Unable to fetch crypto prices' });
  }
}
