import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCpjHEv1CIn_W_edl0Nzbz_AsDy2O4TEIM",
  authDomain: "kita-57526.firebaseapp.com",
  projectId: "kita-57526",
  storageBucket: "kita-57526.firebasestorage.app",
  messagingSenderId: "867286937159",
  appId: "1:867286937159:web:a3aba66d55575847ff4b62",
  measurementId: "G-HH5BSBBMTP"
};

const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
