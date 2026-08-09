import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { readKnowledgeContext } from './_lib/market';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI analysis is not configured' });
  const { image, mimeType } = req.body ?? {};
  if (typeof image !== 'string' || image.length < 16 || image.length > 14_000_000 || typeof mimeType !== 'string' || !/^image\/(png|jpe?g|webp|gif)$/i.test(mimeType)) {
    return res.status(400).json({ error: 'A valid image and image mimeType are required' });
  }
  const base64Data = image.includes(',') ? image.slice(image.indexOf(',') + 1) : image;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const knowledgeContext = await readKnowledgeContext();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: `Analyze this trading chart with institutional precision. Return clean Markdown covering market structure, trend bias, order blocks, fair value gaps, liquidity, setup probability, entry, stop, targets, and analyst notes. ${knowledgeContext}` }, { inlineData: { data: base64Data, mimeType } }] },
    });
    return res.status(200).json({ text: response.text ?? '' });
  } catch (error) {
    console.error('[v0] AI analysis error:', error);
    return res.status(502).json({ error: 'Failed to analyze image' });
  }
}
