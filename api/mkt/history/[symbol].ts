import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getHistory } from '../../_lib/market';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const rawSymbol = req.query.symbol;
  const symbol = Array.isArray(rawSymbol) ? rawSymbol[0] : rawSymbol;
  if (!symbol || !/^[A-Z0-9]{3,12}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }
  try {
    return res.status(200).json(await getHistory(symbol));
  } catch (error) {
    console.error('[v0] history handler error:', error);
    return res.status(502).json({ error: 'Unable to fetch history', data: [] });
  }
}
