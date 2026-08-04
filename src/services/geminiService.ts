import { GoogleGenAI } from "@google/genai";

export async function analyzeChartImage(base64Image: string, mimeType: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Fetch knowledge base content
  let knowledgeContext = "";
  try {
    const intelRes = await fetch('/api/intel');
    if (intelRes.ok) {
      const intelData = await intelRes.json();
      if (intelData.items && intelData.items.length > 0) {
        knowledgeContext = "\n\n### 🧠 KNOWLEDGE BASE & SKILLS CONTEXT\n";
        intelData.items.forEach((item: any) => {
          if (item.content) {
            knowledgeContext += `--- FILE: ${item.name} ---\n${item.content}\n\n`;
          }
        });
      }
    }
  } catch (e) {
    console.warn('Failed to fetch knowledge base context:', e);
  }

  const prompt = `
    Analyze this trading chart screenshot with institutional precision.
    
    ${knowledgeContext ? `Use the following Knowledge Base and Skills to inform your analysis and apply any specific strategies or rules defined there: ${knowledgeContext}` : ""}

    Structure your response as follows:
    
    # 📊 Institutional Intelligence Report
    
    ## 🔍 Market Analysis
    - **Market Structure**: [Identify HH/HL or LH/LL]
    - **Current Trend Bias**: [Bullish/Bearish/Neutral]
    - **Session Context**: [Identify current session if possible]
    
    ## 🛡️ Institutional Footprints
    - **Order Blocks**: [List key Supply/Demand zones]
    - **Fair Value Gaps (FVG)**: [Identify imbalances]
    - **Liquidity Pools**: [Identify Equal Highs/Lows]
    
    ## 🦄 Unicorn Setup
    - **Confluence**: [Identify OB + FVG confluence]
    - **Probability Score**: [1-5 Stars]
    
    ## 🎯 Execution Strategy
    - **Entry Zone**: [Price range]
    - **Stop Loss**: [Price level]
    - **Take Profit**: [Target levels]
    
    ## 📝 Analyst Notes
    [Brief institutional reasoning for the setup]
    
    Use clean Markdown with professional trading terminology.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { data: base64Image.split(',')[1], mimeType } }
        ]
      }
    });

    return response.text;
  } catch (error) {
    console.error('AI Analysis Error:', error);
    throw error;
  }
}
