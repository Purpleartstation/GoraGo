export interface PartnerNotificationPayload {
  senderName: string;
  senderEmail: string;
  partnerEmail: string;
  eventType: 'transaction' | 'bill' | 'loan' | 'transfer' | 'account' | 'sync';
  title: string;
  amount?: number;
  action: 'created' | 'updated' | 'paid' | 'withdrawn' | 'deposited' | 'transferred';
  note?: string;
}

export async function sendPartnerNotification(
  payload: PartnerNotificationPayload
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
  if (!payload.partnerEmail || !payload.partnerEmail.includes('@')) {
    return { success: false, error: 'Invalid partner email' };
  }

  try {
    const res = await fetch('/api/notify-partner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        timestamp: Date.now(),
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return { success: true, notificationId: data.notificationId };
  } catch (err: any) {
    console.warn('Partner email notification dispatch notice:', err?.message || err);
    return { success: false, error: err?.message || 'Failed to dispatch notification' };
  }
}
