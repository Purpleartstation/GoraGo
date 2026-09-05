import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';

// Save or Sync User Profile to Firestore
export async function syncUserProfile(user: any) {
  if (!user) return null;
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return userSnap.data();
  } else {
    const newUserData = {
      email: user.email,
      displayName: user.displayName,
      householdId: user.uid,
      createdAt: new Date(),
    };
    await setDoc(userRef, newUserData);
    return newUserData;
  }
}

// Join Partner Household via Household/Pairing Code
export async function joinHousehold(currentUserId: string, partnerHouseholdId: string) {
  const userRef = doc(db, 'users', currentUserId);
  await updateDoc(userRef, {
    householdId: partnerHouseholdId,
  });
}
export function useSafeDocumentData(docRef: any) {
  // returns safe document data with fallback
  return {};
}
export function useSafeCollectionData(queryRef: any) {
  // returns safe collection data array with fallback
  return [];
}
export { db };
export const collections = {
  users: 'users',
  households: 'households',
  accounts: 'accounts',
  transactions: 'transactions',
  bills: 'bills',
  goals: 'goals'
};
