export interface ReceiptScanResult {
  merchantName: string;
  totalAmount: number;
  dateStr?: string;
  categoryHint?: string;
  items?: Array<{ name: string; price: number }>;
  confidence: number;
  rawText?: string;
}

export async function scanReceipt(base64Image: string): Promise<ReceiptScanResult> {
  const res = await fetch('/api/ai-receipt-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image })
  });

  if (!res.ok) {
    throw new Error('Failed to scan receipt via AI OCR');
  }

  return await res.json();
}
