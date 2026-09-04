import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import type { User } from 'firebase/auth';
// We'll just import auth from firebase.ts
import { auth, googleProvider } from '../firebase';

// Add the required scopes
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events');

let cachedAccessToken: string | null = null;
let isSigningIn = false;

/**
 * Prompt the user to sign in with Google and grant Calendar scopes.
 */
export const connectGoogleCalendar = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }
    
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getCalendarToken = (): string | null => {
  return cachedAccessToken;
};

/**
 * Creates a recurring calendar event for a monthly bill or debt.
 */
export const createMonthlyRecurringEvent = async (
  title: string,
  amount: number,
  dueDay: number,
  note?: string
): Promise<string | null> => {
  if (!cachedAccessToken) return null;

  // Find the next occurrence of this due day
  const now = new Date();
  let startMonth = now.getMonth();
  let startYear = now.getFullYear();
  
  // If the due day has already passed this month, start next month
  if (now.getDate() > dueDay) {
    startMonth += 1;
    if (startMonth > 11) {
      startMonth = 0;
      startYear += 1;
    }
  }

  // Ensure dueDay is valid for the month (e.g. Feb 30 -> Feb 28/29)
  const daysInStartMonth = new Date(startYear, startMonth + 1, 0).getDate();
  const actualStartDay = Math.min(dueDay, daysInStartMonth);

  const startDate = new Date(startYear, startMonth, actualStartDay, 9, 0, 0); // 9:00 AM
  const endDate = new Date(startYear, startMonth, actualStartDay, 10, 0, 0); // 10:00 AM

  const event = {
    summary: `${title} - ₱${amount.toLocaleString()}`,
    description: note || 'Automated reminder from GoraGo',
    start: {
      dateTime: startDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    recurrence: [
      `RRULE:FREQ=MONTHLY;BYMONTHDAY=${dueDay}`
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 4320 }, // 3 days before (3 * 24 * 60)
        { method: 'popup', minutes: 1440 }, // 1 day before
        { method: 'email', minutes: 1440 }, // Email 1 day before
        { method: 'popup', minutes: 0 }     // At 9:00 AM on due date
      ],
    },
  };

  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cachedAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });
    const data = await res.json();
    return data.id || null;
  } catch (err) {
    console.error('Failed to create calendar event:', err);
    return null;
  }
};

/**
 * Updates an existing calendar event. If marking as paid for a recurring event, 
 * it finds the instance for the current month and updates only that instance.
 */
export const updateCalendarEvent = async (
  eventId: string,
  title: string,
  amount: number,
  isPaid: boolean = false
): Promise<void> => {
  if (!cachedAccessToken || !eventId) return;

  try {
    if (isPaid) {
      // Find the specific instance for the current time period (e.g. this month)
      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      
      const instancesRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}/instances?timeMin=${timeMin}&timeMax=${timeMax}`, {
        headers: { 'Authorization': `Bearer ${cachedAccessToken}` },
      });
      
      if (instancesRes.ok) {
        const instancesData = await instancesRes.json();
        const instances = instancesData.items || [];
        
        if (instances.length > 0) {
          // Update the first matching instance
          const instance = instances[0];
          instance.summary = `✅ [PAID] ${title} - ₱${amount.toLocaleString()}`;
          instance.colorId = '8'; // Grey out the completed event
          
          await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${instance.id}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${cachedAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(instance),
          });
          return;
        }
      }
    }

    // If not paid, or if it's a regular update of the series
    const getRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      headers: { 'Authorization': `Bearer ${cachedAccessToken}` },
    });
    
    if (!getRes.ok) return;
    
    const event = await getRes.json();
    event.summary = `${title} - ₱${amount.toLocaleString()}`;
    
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${cachedAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });
  } catch (err) {
    console.error('Failed to update calendar event:', err);
  }
};

/**
 * Deletes a calendar event
 */
export const deleteCalendarEvent = async (eventId: string): Promise<void> => {
  if (!cachedAccessToken || !eventId) return;

  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${cachedAccessToken}` },
    });
  } catch (err) {
    console.error('Failed to delete calendar event:', err);
  }
};

/**
 * Disconnects Google Calendar session
 */
export const disconnectGoogleCalendar = (): void => {
  cachedAccessToken = null;
};

/**
 * Batch sync all upcoming bills, debt schedules, and savings goals
 * directly to Google Calendar using server-side googleapis.
 */
export const syncAllToGoogleCalendar = async (
  bills: any[],
  debts: any[],
  savingsGoals: any[] = []
): Promise<{ success: boolean; syncedCount: number; results?: any[]; error?: string }> => {
  if (!cachedAccessToken) {
    return { success: false, syncedCount: 0, error: 'Google Calendar is not connected. Please connect first.' };
  }

  try {
    const res = await fetch('/api/calendar/sync-all', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cachedAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bills,
        debts,
        savingsGoals,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila',
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      success: true,
      syncedCount: data.syncedCount || 0,
      results: data.results || [],
    };
  } catch (err: any) {
    console.error('Failed to batch sync to Google Calendar:', err);
    return {
      success: false,
      syncedCount: 0,
      error: err?.message || 'Failed to sync to Google Calendar',
    };
  }
};

