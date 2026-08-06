import type { VercelRequest, VercelResponse } from '@vercel/node';
import path from 'path';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const fs = await import('fs/promises');
    const knowledgeDir = path.join(process.cwd(), 'knowledge');

    // The serverless filesystem is read-only; if the directory isn't bundled,
    // treat it as empty rather than trying to create it.
    let files: string[] = [];
    try {
      files = await fs.readdir(knowledgeDir);
    } catch {
      return res.json({ count: 0, items: [] });
    }

    const intelData = [];
    for (const file of files) {
      if (file === 'README.md' || file.startsWith('.')) continue;

      const filePath = path.join(knowledgeDir, file);
      const stats = await fs.stat(filePath);

      let content = '';
      if (file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.json')) {
        content = await fs.readFile(filePath, 'utf-8');
      }

      intelData.push({
        name: file,
        size: stats.size,
        updatedAt: stats.mtime,
        type: path.extname(file).substring(1),
        content: content.substring(0, 1000),
      });
    }

    res.json({ count: intelData.length, items: intelData });
  } catch (error) {
    console.error('Intel API Error:', error);
    res.status(500).json({ error: 'Failed to scan knowledge base' });
  }
}
