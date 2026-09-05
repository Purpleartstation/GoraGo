import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase'; // Adjust path if in App.tsx

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        // Existing account: Load data directly from Firestore
        const userData = userSnap.data();
        setUser({ ...user, ...userData });
      } else {
        // New user: Create profile and assign default household ID
        const newUserData = {
          email: user.email,
          displayName: user.displayName,
          householdId: user.uid,
          createdAt: new Date(),
        };
        await setDoc(userRef, newUserData);
        setUser({ ...user, ...newUserData });
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  });

  return () => unsubscribe();
}, []);
