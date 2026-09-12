import type { Category } from '../db';
import { suggestCategoryWithAI, type CategorizeResult } from './ai';

export type { CategorizeResult };

/**
 * AI Transaction Categorizer utility inspired by sakowicz/actual-ai.
 * Uses secure server-side AI proxy with local heuristic fallback.
 * Keeps API keys exclusively on the server.
 */
export async function suggestCategory(
  description: string,
  amount: number,
  type: 'income' | 'expense' | 'transfer',
  categories: Category[]
): Promise<CategorizeResult> {
  return suggestCategoryWithAI(description, amount, type, categories);
}
