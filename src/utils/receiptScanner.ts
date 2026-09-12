import { scanReceiptWithAI, type ReceiptScanResult } from './ai';

export type { ReceiptScanResult };

export async function scanReceipt(base64Image: string): Promise<ReceiptScanResult> {
  return scanReceiptWithAI(base64Image);
}
