import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Category } from "../db";

export interface CategorizeResult {
  categoryId: string;
  categoryName?: string;
  confidence: number;
  reasoning?: string;
}

/**
 * AI Transaction Categorizer utility inspired by sakowicz/actual-ai
 * Uses @google/generative-ai with server-side proxy or client-side fallback.
 */
export async function suggestCategory(
  description: string,
  amount: number,
  type: 'income' | 'expense' | 'transfer',
  categories: Category[]
): Promise<CategorizeResult> {
  // 1. Try server-side API proxy first (secure architecture)
  try {
    const res = await fetch('/api/ai-categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, amount, type, categories }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.categoryId) {
        return {
          categoryId: data.categoryId,
          categoryName: data.categoryName,
          confidence: data.confidence || 0.85,
          reasoning: data.reasoning,
        };
      }
    }
  } catch (err) {
    console.warn("Server AI categorize proxy error, attempting client-side or fallback:", err);
  }

  // 2. Try direct client-side if VITE_GEMINI_API_KEY is available
  const clientApiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (clientApiKey) {
    try {
      const genAI = new GoogleGenerativeAI(clientApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `You are an expert financial transaction classification assistant (inspired by sakowicz/actual-ai).
Available Categories:
${JSON.stringify(categories.map(c => ({ id: c.id, name: c.name, type: c.type })), null, 2)}

Transaction to Classify:
- Description: "${description}"
- Amount: ₱${amount}
- Type: "${type}"

Output strictly a JSON object with:
{
  "categoryId": "<matched category id>",
  "categoryName": "<matched category name>",
  "confidence": <number 0 to 1>,
  "reasoning": "<short explanation>"
}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed && parsed.categoryId) {
        return {
          categoryId: parsed.categoryId,
          categoryName: parsed.categoryName,
          confidence: parsed.confidence || 0.9,
          reasoning: parsed.reasoning,
        };
      }
    } catch (clientErr) {
      console.warn("Client-side AI categorization failed:", clientErr);
    }
  }

  // 3. Fallback heuristic matching
  const lowerDesc = (description || '').toLowerCase();
  const matching = categories.find(c => {
    const catName = c.name.toLowerCase();
    return lowerDesc.includes(catName) || catName.includes(lowerDesc);
  });

  if (matching) {
    return {
      categoryId: matching.id,
      categoryName: matching.name,
      confidence: 0.7,
      reasoning: "Matched by keyword heuristic.",
    };
  }

  const defaultCat = categories.find(c => c.type === type) || categories[0];
  return {
    categoryId: defaultCat ? defaultCat.id : 'cat_general',
    categoryName: defaultCat ? defaultCat.name : 'General',
    confidence: 0.4,
    reasoning: "Default fallback category.",
  };
}
