import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = window?.SOCIAL0X1_FIREBASE_CONFIG;

if (!firebaseConfig) {
  throw new Error(
    "Missing Firebase configuration. Ensure config/firebase-config.js defines window.SOCIAL0X1_FIREBASE_CONFIG."
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

auth.useDeviceLanguage?.();

export { app, auth, db };
