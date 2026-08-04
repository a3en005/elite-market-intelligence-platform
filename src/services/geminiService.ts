// The Gemini API key is server-side only. This client calls the secure
// /api/analyze endpoint so the key is never shipped to the browser.
export async function analyzeChartImage(base64Image: string, mimeType: string) {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image, mimeType }),
  });

  if (!response.ok) {
    let message = 'Failed to analyze image.';
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // Ignore JSON parse errors and use the default message.
    }
    throw new Error(message);
  }

  const data = await response.json();
  return data.text as string;
}
