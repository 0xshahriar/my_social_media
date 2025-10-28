import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  addDoc,
  collection,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { renderMessage, resetStream, setComposerState } from "./app.js";

const firebaseConfig = window?.SOCIAL0X1_FIREBASE_CONFIG;

if (!firebaseConfig) {
  throw new Error(
    "Missing Firebase configuration. Copy config/firebase-config.example.js to config/firebase-config.js and include it via index.html."
  );
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const feedback = document.querySelector("[data-feedback]");
const welcomeModal = document.querySelector("[data-welcome-modal]");
const signInButton = document.querySelector("[data-start-chat]");

function setFeedback(message, type = "info") {
  if (!feedback) return;
  feedback.textContent = message;
  feedback.removeAttribute("role");
  if (type === "error") {
    feedback.setAttribute("role", "alert");
  }
}

function randomColor(uid) {
  const palette = ["#ff6f61", "#ec4899", "#6366f1", "#22d3ee", "#f97316", "#14b8a6"];
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % palette.length;
  return palette[index];
}

export function startListening() {
  const messagesRef = collection(db, "messages");
  const recentMessagesQuery = query(messagesRef, orderBy("createdAt", "desc"), limit(50));

  onSnapshot(
    recentMessagesQuery,
    (snapshot) => {
      const currentUid = auth.currentUser?.uid ?? "";
      const docs = snapshot.docs.slice().reverse();
      resetStream();
      docs.forEach((docSnap) => {
        renderMessage({ id: docSnap.id, ...docSnap.data() }, currentUid, randomColor);
      });
      setFeedback(`${docs.length} message${docs.length === 1 ? "" : "s"} loaded.`);
    },
    (error) => {
      console.error("Realtime listener error", error);
      setFeedback("Connection lost. Retrying…", "error");
    }
  );
}

export async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Message cannot be empty.");
  }
  if (trimmed.length > 500) {
    throw new Error("Messages are limited to 500 characters.");
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be signed in to send messages.");
  }

  const payload = {
    text: trimmed,
    uid: user.uid,
    displayName: user.isAnonymous ? "Anonymous" : user.displayName || "Social0x1 User",
    createdAt: serverTimestamp(),
  };

  await addDoc(collection(db, "messages"), payload);
}

async function authenticateAnonymously() {
  try {
    setComposerState(true);
    setFeedback("Connecting securely…");
    await signInAnonymously(auth);
  } catch (error) {
    console.error("Anonymous sign-in failed", error);
    setFeedback("Sign-in failed. Please refresh and try again.", "error");
    setComposerState(false);
  }
}

export function initializeAuth() {
  signInButton?.addEventListener("click", authenticateAnonymously);

  onAuthStateChanged(
    auth,
    (user) => {
      if (!user) {
        welcomeModal?.classList.add("active");
        setFeedback("Connect to join the conversation.");
        setComposerState(true);
        return;
      }
      welcomeModal?.classList.remove("active");
      setFeedback("You are connected. Say hello!");
      setComposerState(false);
      startListening();
    },
    (error) => {
      console.error("Auth state error", error);
      setFeedback("Authentication error. Please refresh the page.", "error");
    }
  );
}
