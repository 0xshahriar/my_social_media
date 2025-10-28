import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { auth, normalizeEmail, observeAuthState } from "./auth.js";
import { initializeTheme } from "./theme.js";

const authTabs = Array.from(document.querySelectorAll("[data-auth-tab]"));
const authForms = new Map();
const authFormElements = document.querySelectorAll("[data-auth-form]");
authFormElements.forEach((form) => {
  authForms.set(form.dataset.authForm, form);
});

const authFeedback = document.querySelector("[data-auth-feedback]");
const inviteNote = document.querySelector("[data-invite-note]");
const googleButton = document.querySelector("[data-google-signin]");

let activeAuthMode = "login";
let redirectTarget = "index.html";

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
  clearFeedback();
}

function setFeedback(message, type = "info") {
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

function clearFeedback() {
  setFeedback("");
}

function setFormBusy(form, isBusy) {
  if (!form) return;
  const controls = form.querySelectorAll("input, button");
  controls.forEach((control) => {
    control.disabled = isBusy;
  });
}

function resolveRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  redirectTarget = redirect && redirect.startsWith("/") ? redirect : "index.html";
  const inviteEmail = params.get("inviteEmail");
  const mode = params.get("mode");
  if (inviteEmail) {
    const signupForm = authForms.get("signup");
    const loginForm = authForms.get("login");
    if (signupForm) {
      signupForm.email.value = inviteEmail;
    }
    if (loginForm) {
      loginForm.email.value = inviteEmail;
    }
    toggleAuthMode("signup");
    if (inviteNote) {
      const normalized = normalizeEmail(inviteEmail);
      inviteNote.textContent =
        mode === "secret"
          ? `You were invited to a secret chat. Create an account for ${normalized} to continue.`
          : `You were invited to Social0x1. Create an account for ${normalized} to start messaging.`;
      inviteNote.removeAttribute("hidden");
    }
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.email.value;
  const password = form.password.value;
  setFormBusy(form, true);
  setFeedback("Signing you in…");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    setFeedback("Welcome back!", "success");
    window.location.replace(redirectTarget);
  } catch (error) {
    console.error("Login failed", error);
    setFeedback(error.message || "Unable to log in. Check your credentials and try again.", "error");
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
    setFeedback("Passwords do not match.", "error");
    return;
  }
  if (displayName.length < 2) {
    setFeedback("Display name must be at least 2 characters.", "error");
    return;
  }

  setFormBusy(form, true);
  setFeedback("Creating your account…");
  try {
    const credentials = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credentials.user, { displayName });
    setFeedback("Account created! Redirecting…", "success");
    window.location.replace(redirectTarget);
  } catch (error) {
    console.error("Signup failed", error);
    setFeedback(error.message || "Unable to create your account. Please try again.", "error");
  } finally {
    setFormBusy(form, false);
  }
}

async function handleGoogleSignIn() {
  setFeedback("Connecting to Google…");
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    setFeedback("Signed in with Google!", "success");
    window.location.replace(redirectTarget);
  } catch (error) {
    console.error("Google sign-in failed", error);
    if (error?.code === "auth/popup-closed-by-user") {
      setFeedback("Google sign-in was closed before completing.", "error");
    } else {
      setFeedback(error.message || "Unable to sign in with Google. Try again.", "error");
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  resolveRedirectTarget();

  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      toggleAuthMode(tab.dataset.authTab);
    });
  });

  toggleAuthMode(activeAuthMode);

  authForms.get("login")?.addEventListener("submit", handleLogin);
  authForms.get("signup")?.addEventListener("submit", handleSignup);
  googleButton?.addEventListener("click", handleGoogleSignIn);

  observeAuthState({
    onChange: (user) => {
      if (user) {
        window.location.replace(redirectTarget);
      }
    },
    onError: (error) => {
      console.error("Auth observer error", error);
      setFeedback("Authentication error. Refresh the page and try again.", "error");
    },
  });
});
