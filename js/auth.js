import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = window?.SOCIAL0X1_FIREBASE_CONFIG;

if (!firebaseConfig) {
  throw new Error(
    "Missing Firebase configuration. Copy config/firebase-config.example.js to config/firebase-config.js and include it via index.html."
  );
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

auth.useDeviceLanguage?.();

const authTabs = document.querySelectorAll("[data-auth-tab]");
const authForms = new Map();
const authFormElements = document.querySelectorAll("[data-auth-form]");
authFormElements.forEach((form) => {
  authForms.set(form.dataset.authForm, form);
});

const authCard = document.querySelector("[data-auth-card]");
const conversationPanel = document.querySelector("[data-conversation-panel]");
const authFeedback = document.querySelector("[data-auth-feedback]");
const userChip = document.querySelector("[data-user-chip]");
const signOutButton = document.querySelector("[data-sign-out]");

let activeAuthMode = "login";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function setAuthFeedback(message, type = "info") {
  if (!authFeedback) return;
  authFeedback.textContent = message;
  if (!message) {
    delete authFeedback.dataset.state;
    authFeedback.removeAttribute("role");
    authFeedback.removeAttribute("aria-live");
    return;
  }
  authFeedback.dataset.state = type === "error" ? "error" : type === "success" ? "success" : "info";
  if (type === "error") {
    authFeedback.setAttribute("role", "alert");
    authFeedback.removeAttribute("aria-live");
  } else {
    authFeedback.setAttribute("aria-live", "polite");
    authFeedback.removeAttribute("role");
  }
}

function clearAuthFeedback() {
  setAuthFeedback("");
}

function toggleAuthMode(mode) {
  if (!authForms.has(mode)) {
    return;
  }
  activeAuthMode = mode;
  authTabs.forEach((tab) => {
    const isActive = tab.dataset.authTab === mode;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  authForms.forEach((form, key) => {
    if (key === mode) {
      form.removeAttribute("hidden");
    } else {
      form.setAttribute("hidden", "");
    }
  });
  clearAuthFeedback();
}

function setFormBusy(form, isBusy) {
  if (!form) return;
  const elements = form.querySelectorAll("input, button");
  elements.forEach((element) => {
    element.disabled = isBusy;
  });
}

async function ensureProfileDocument(user) {
  if (!user?.uid) return;
  const profileRef = doc(db, "profiles", user.uid);
  const existing = await getDoc(profileRef);
  const payload = {
    displayName: user.displayName || user.email?.split("@")?.[0] || "Social0x1 user",
    email: user.email ?? "",
    emailLowercase: user.email ? normalizeEmail(user.email) : "",
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };
  if (!existing.exists()) {
    payload.createdAt = serverTimestamp();
  }
  await setDoc(profileRef, payload, { merge: true });
}

function updateUserUi(user) {
  if (user) {
    authCard?.setAttribute("hidden", "");
    conversationPanel?.removeAttribute("hidden");
    signOutButton?.removeAttribute("hidden");
    if (userChip) {
      userChip.textContent = user.displayName || user.email || "Signed in";
    }
  } else {
    authCard?.removeAttribute("hidden");
    conversationPanel?.setAttribute("hidden", "");
    signOutButton?.setAttribute("hidden", "");
    if (userChip) {
      userChip.textContent = "Signed out";
    }
  }
  document.body.dataset.authenticated = user ? "true" : "false";
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.email.value;
  const password = form.password.value;

  setFormBusy(form, true);
  setAuthFeedback("Signing you in…");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    form.reset();
    setAuthFeedback("Welcome back!", "success");
  } catch (error) {
    console.error("Login failed", error);
    setAuthFeedback(error.message || "Unable to log in. Check your credentials and try again.", "error");
  } finally {
    setFormBusy(form, false);
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const displayName = form.displayName.value.trim();
  const email = form.email.value;
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;

  if (password !== confirmPassword) {
    setAuthFeedback("Passwords do not match.", "error");
    return;
  }
  if (displayName.length < 2) {
    setAuthFeedback("Display name must be at least 2 characters.", "error");
    return;
  }

  setFormBusy(form, true);
  setAuthFeedback("Creating your account…");

  try {
    const credentials = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credentials.user, { displayName });
    await ensureProfileDocument({ ...credentials.user, displayName });
    form.reset();
    setAuthFeedback("Account created! You're signed in.", "success");
  } catch (error) {
    console.error("Signup failed", error);
    setAuthFeedback(error.message || "Unable to create your account. Please try again.", "error");
  } finally {
    setFormBusy(form, false);
  }
}

async function handleSignOut() {
  if (!signOutButton) return;
  signOutButton.disabled = true;
  try {
    await signOut(auth);
    setAuthFeedback("Signed out successfully.", "success");
  } catch (error) {
    console.error("Sign-out failed", error);
    setAuthFeedback(error.message || "Unable to sign out. Please try again.", "error");
  } finally {
    signOutButton.disabled = false;
  }
}

export function initializeAuth({ onAuthStateChange } = {}) {
  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      toggleAuthMode(tab.dataset.authTab);
    });
  });

  authForms.get("login")?.addEventListener("submit", handleLogin);
  authForms.get("signup")?.addEventListener("submit", handleSignup);
  signOutButton?.addEventListener("click", handleSignOut);

  toggleAuthMode(activeAuthMode);

  onAuthStateChanged(
    auth,
    async (user) => {
      try {
        if (user) {
          await ensureProfileDocument(user);
        }
      } catch (error) {
        console.error("Profile sync failed", error);
      } finally {
        updateUserUi(user);
        if (typeof onAuthStateChange === "function") {
          onAuthStateChange(user);
        }
      }
    },
    (error) => {
      console.error("Auth observer error", error);
      setAuthFeedback("Authentication error. Refresh the page and try again.", "error");
    }
  );
}

export { auth as firebaseAuth, db as firebaseDb };
