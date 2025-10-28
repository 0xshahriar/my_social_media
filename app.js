import firebaseConfig from "./firebase-config.js";
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// UI references
const authContainer = document.getElementById("auth-container");
const signInCard = document.getElementById("sign-in-card");
const signUpCard = document.getElementById("sign-up-card");
const goToSignUpButton = document.getElementById("go-to-sign-up");
const goToSignInButton = document.getElementById("go-to-sign-in");
const signInForm = document.getElementById("sign-in-form");
const signUpForm = document.getElementById("sign-up-form");
const toast = document.getElementById("toast");

const chatLayout = document.getElementById("chat-layout");
const profileName = document.getElementById("profile-name");
const profileEmail = document.getElementById("profile-email");
const profileAvatar = document.getElementById("profile-avatar");
const profileDialog = document.getElementById("profile-dialog");
const profileForm = document.getElementById("profile-form");
const profileDisplayNameInput = document.getElementById("profile-display-name");
const profileColorInput = document.getElementById("profile-color");
const openProfileSettingsButton = document.getElementById("open-profile-settings");
const signOutButton = document.getElementById("sign-out-button");

const conversationList = document.getElementById("conversation-list");
const conversationHeader = document.getElementById("conversation-header");
const conversationEmpty = document.getElementById("conversation-empty");
const chatAvatar = document.getElementById("chat-avatar");
const chatName = document.getElementById("chat-name");
const chatStatus = document.getElementById("chat-status");
const typingIndicator = document.getElementById("typing-indicator");
const messageList = document.getElementById("message-list");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

const newChatDialog = document.getElementById("new-chat-dialog");
const newChatButton = document.getElementById("new-chat-button");
const newChatForm = document.getElementById("new-chat-form");
const newChatEmailInput = document.getElementById("new-chat-email");

let currentUser = null;
let currentUserDocUnsub = null;
let conversationsUnsub = null;
let activeConversationUnsub = null;
let messagesUnsub = null;
let otherUserUnsub = null;
let presenceInterval = null;
let typingTimeout = null;
let presenceVisibilityHandler = null;
let currentOtherUserId = null;

const state = {
  conversations: [],
  activeConversationId: null,
  activeConversationData: null,
  otherParticipant: null
};

const ACCENT_PALETTE = [
  "#6366f1",
  "#22d3ee",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
  "#f59e0b"
];

function randomAccentColor() {
  const index = Math.floor(Math.random() * ACCENT_PALETTE.length);
  return ACCENT_PALETTE[index];
}

function ensureHexColor(color, fallback = "#6366f1") {
  if (/^#([0-9a-f]{6})$/i.test(color || "")) {
    return color;
  }
  return typeof fallback === "function" ? fallback() : fallback;
}

async function updateConversationParticipantProfile(userId, profile) {
  try {
    const conversationsRef = collection(db, "conversations");
    const conversationsQuery = query(conversationsRef, where("participantIds", "array-contains", userId));
    const snapshot = await getDocs(conversationsQuery);
    const updates = snapshot.docs.map((docSnap) =>
      updateDoc(docSnap.ref, {
        [`participants.${userId}`]: {
          ...(docSnap.data().participants?.[userId] || {}),
          ...profile
        }
      })
    );
    await Promise.all(updates);
  } catch (error) {
    console.error("Failed to sync conversation profiles", error);
  }
}

function showToast(message, duration = 3000) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

function toggleAuth(showSignUp = false) {
  signInCard.classList.toggle("hidden", showSignUp);
  signUpCard.classList.toggle("hidden", !showSignUp);
}

goToSignUpButton.addEventListener("click", () => toggleAuth(true));
goToSignInButton.addEventListener("click", () => toggleAuth(false));

function initialsFromName(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const initials = parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
  return initials || "?";
}

function applyAvatar(element, user) {
  element.textContent = initialsFromName(user?.displayName || user?.email || "?");
  const color = ensureHexColor(user?.accentColor);
  element.style.background = color;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : timestamp;
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function formatPresence(timestamp) {
  if (!timestamp) return "Offline";
  const date = timestamp.toDate ? timestamp.toDate() : timestamp;
  const diff = Date.now() - date.getTime();
  if (diff < 120000) {
    return "Online";
  }
  return `Last seen ${formatRelativeTime(date)}`;
}

function autoResizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

messageInput.addEventListener("input", () => {
  autoResizeTextarea(messageInput);
  updateTypingState(true);
});

messageInput.addEventListener("blur", () => {
  updateTypingState(false);
});

async function ensureUserDocument(user, additional = {}) {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);
  const baseData = {
    email: user.email,
    displayName: user.displayName || user.email?.split("@")[0] || "Friend",
    accentColor: ensureHexColor(additional.accentColor, randomAccentColor),
    createdAt: serverTimestamp(),
    lastActive: serverTimestamp()
  };
  if (!snapshot.exists()) {
    await setDoc(userRef, { ...baseData, ...additional });
  } else {
    await setDoc(userRef, { lastActive: serverTimestamp(), ...additional }, { merge: true });
  }
}

function resetAuthForms() {
  signInForm.reset();
  signUpForm.reset();
}

signInForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = event.target.elements["sign-in-email"].value.trim();
  const password = event.target.elements["sign-in-password"].value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast("Signed in successfully");
    resetAuthForms();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to sign in");
  }
});

signUpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const displayName = event.target.elements["sign-up-display-name"].value.trim();
  const email = event.target.elements["sign-up-email"].value.trim();
  const password = event.target.elements["sign-up-password"].value;
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(user, { displayName });
    await ensureUserDocument(user, { displayName });
    showToast("Account created! Welcome to Vibrant Chat");
    resetAuthForms();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to sign up");
  }
});

signOutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    showToast("Sign out failed");
  }
});

openProfileSettingsButton.addEventListener("click", () => {
  if (!profileDialog.open) {
    profileDialog.showModal();
  }
});

profileDialog.addEventListener("close", () => {
  profileForm.reset();
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const displayName = profileDisplayNameInput.value.trim();
  const accentColor = ensureHexColor(profileColorInput.value, randomAccentColor);
  if (!currentUser) return;
  try {
    await updateProfile(currentUser, { displayName });
    await setDoc(
      doc(db, "users", currentUser.uid),
      {
        displayName,
        accentColor,
        lastActive: serverTimestamp()
      },
      { merge: true }
    );
    await updateConversationParticipantProfile(currentUser.uid, {
      displayName,
      email: currentUser.email,
      accentColor
    });
    showToast("Profile updated");
    profileDialog.close("confirm");
  } catch (error) {
    console.error(error);
    showToast("Unable to update profile");
  }
});

newChatButton.addEventListener("click", () => {
  if (!newChatDialog.open) {
    newChatForm.reset();
    newChatDialog.showModal();
  }
});

newChatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const email = newChatEmailInput.value.trim().toLowerCase();
  if (!email || email === currentUser.email?.toLowerCase()) {
    showToast("Please enter a different user's email");
    return;
  }
  try {
    const usersQuery = query(collection(db, "users"), where("email", "==", email));
    const result = await getDocs(usersQuery);
    if (result.empty) {
      showToast("No user found with that email");
      return;
    }
    const otherUser = result.docs[0];
    const otherUserData = { id: otherUser.id, ...otherUser.data() };
    const conversationId = await createOrGetConversation(otherUserData);
    newChatDialog.close("confirm");
    setActiveConversation(conversationId);
  } catch (error) {
    console.error(error);
    showToast("Unable to create conversation");
  }
});

async function updateTypingState(isTyping) {
  if (!state.activeConversationId || !currentUser) return;
  try {
    const conversationRef = doc(db, "conversations", state.activeConversationId);
    await setDoc(
      conversationRef,
      { [`typing.${currentUser.uid}`]: isTyping },
      { merge: true }
    );
    if (isTyping) {
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => updateTypingState(false), 2500);
    }
  } catch (error) {
    console.error("Failed to update typing state", error);
  }
}

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.activeConversationId || !currentUser) return;
  const text = messageInput.value.trim();
  if (!text) return;

  const conversationRef = doc(db, "conversations", state.activeConversationId);
  const messagesRef = collection(conversationRef, "messages");

  messageForm.reset();
  autoResizeTextarea(messageInput);

  try {
    const messageData = {
      text,
      senderId: currentUser.uid,
      createdAt: serverTimestamp()
    };
    await addDoc(messagesRef, messageData);
    await updateDoc(conversationRef, {
      lastMessage: messageData,
      lastMessageAt: serverTimestamp(),
      [`typing.${currentUser.uid}`]: false
    });
    await updateDoc(doc(db, "users", currentUser.uid), {
      lastActive: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
    showToast("Failed to send message");
  }
});

function subscribeToCurrentUser(user) {
  if (currentUserDocUnsub) currentUserDocUnsub();
  const userRef = doc(db, "users", user.uid);
  currentUserDocUnsub = onSnapshot(userRef, (snapshot) => {
    const data = snapshot.data();
    const accentColor = ensureHexColor(data?.accentColor);
    const userInfo = {
      uid: user.uid,
      email: user.email,
      displayName: data?.displayName || user.displayName || user.email,
      accentColor,
      lastActive: data?.lastActive
    };
    profileName.textContent = userInfo.displayName;
    profileEmail.textContent = userInfo.email;
    applyAvatar(profileAvatar, userInfo);
    profileDisplayNameInput.value = userInfo.displayName || "";
    profileColorInput.value = accentColor;
  });
}

function subscribeToConversations(user) {
  if (conversationsUnsub) conversationsUnsub();
  const conversationsRef = collection(db, "conversations");
  const conversationsQuery = query(
    conversationsRef,
    where("participantIds", "array-contains", user.uid),
    orderBy("lastMessageAt", "desc")
  );

  conversationsUnsub = onSnapshot(conversationsQuery, (snapshot) => {
    state.conversations = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    renderConversationList();
  });
}

function renderConversationList() {
  conversationList.innerHTML = "";
  if (!state.conversations.length) {
    const emptyState = document.createElement("li");
    emptyState.className = "conversation-item";
    emptyState.innerHTML = "<p class=\"muted\">No conversations yet. Start one!</p>";
    conversationList.appendChild(emptyState);
    return;
  }

  state.conversations.forEach((conversation) => {
    const item = document.createElement("li");
    item.className = "conversation-item";
    if (conversation.id === state.activeConversationId) {
      item.classList.add("active");
    }
    const otherParticipant = getOtherParticipant(conversation);
    const textPreview = conversation.lastMessage?.text || "New conversation";
    const lastMessageTime = conversation.lastMessageAt
      ? formatRelativeTime(conversation.lastMessageAt)
      : "";
    item.innerHTML = `
      <div class="avatar"></div>
      <div>
        <h4>${otherParticipant?.displayName || otherParticipant?.email || "Friend"}</h4>
        <p>${sanitizeHtml(textPreview)}</p>
      </div>
      <span class="badge">${lastMessageTime}</span>
    `;
    applyAvatarForItem(item, otherParticipant);

    item.addEventListener("click", () => setActiveConversation(conversation.id));

    conversationList.appendChild(item);
  });
}

function applyAvatarForItem(item, user) {
  const avatar = item.querySelector(".avatar");
  if (!avatar) return;
  avatar.textContent = initialsFromName(user?.displayName || user?.email || "");
  avatar.style.background = ensureHexColor(user?.accentColor);
}

function sanitizeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getOtherParticipant(conversation) {
  const participantIds = conversation.participantIds || [];
  const otherId = participantIds.find((id) => id !== currentUser?.uid);
  if (!otherId) return null;
  const participants = conversation.participants || {};
  const data = participants[otherId];
  return data ? { uid: otherId, ...data } : { uid: otherId };
}

function setActiveConversation(conversationId) {
  if (state.activeConversationId === conversationId) return;
  state.activeConversationId = conversationId;
  state.activeConversationData = state.conversations.find((conv) => conv.id === conversationId) || null;
  state.otherParticipant = state.activeConversationData
    ? getOtherParticipant(state.activeConversationData)
    : null;

  if (activeConversationUnsub) activeConversationUnsub();
  if (messagesUnsub) messagesUnsub();
  if (otherUserUnsub) {
    otherUserUnsub();
    otherUserUnsub = null;
  }
  currentOtherUserId = null;

  if (!state.activeConversationData) {
    conversationHeader.classList.add("hidden");
    messageForm.classList.add("hidden");
    conversationEmpty.classList.remove("hidden");
    messageList.innerHTML = "";
    return;
  }

  conversationEmpty.classList.add("hidden");
  conversationHeader.classList.remove("hidden");
  messageForm.classList.remove("hidden");

  renderConversationHeader();
  subscribeToConversationDocument(conversationId);
  subscribeToOtherUser(state.otherParticipant?.uid);
  subscribeToMessages(conversationId);
  renderConversationList();
}

function renderConversationHeader() {
  const otherUser = state.otherParticipant;
  if (!otherUser) {
    chatName.textContent = "Conversation";
    chatStatus.textContent = "";
    chatAvatar.textContent = "?";
    chatAvatar.style.background = "#6366f1";
    return;
  }
  chatName.textContent = otherUser.displayName || otherUser.email || "Friend";
  chatStatus.textContent = formatPresence(otherUser.lastActive);
  chatAvatar.textContent = initialsFromName(otherUser.displayName || otherUser.email || "");
  chatAvatar.style.background = ensureHexColor(otherUser.accentColor);
}

function subscribeToConversationDocument(conversationId) {
  const conversationRef = doc(db, "conversations", conversationId);
  activeConversationUnsub = onSnapshot(conversationRef, (snapshot) => {
    if (!snapshot.exists()) {
      setActiveConversation(null);
      renderConversationList();
      return;
    }
    const data = snapshot.data();
    state.activeConversationData = { id: conversationId, ...data };
    const baseOther = getOtherParticipant(state.activeConversationData);
    if (baseOther) {
      state.otherParticipant = {
        ...baseOther,
        ...state.otherParticipant,
        uid: baseOther.uid
      };
      renderConversationHeader();
      subscribeToOtherUser(baseOther.uid);
    }
    renderTypingIndicator(data.typing || {});
  });
}

function subscribeToOtherUser(userId) {
  if (currentOtherUserId === userId && otherUserUnsub) {
    return;
  }
  if (otherUserUnsub) {
    otherUserUnsub();
    otherUserUnsub = null;
  }
  if (!userId) {
    currentOtherUserId = null;
    return;
  }
  currentOtherUserId = userId;
  const otherUserRef = doc(db, "users", userId);
  otherUserUnsub = onSnapshot(otherUserRef, (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    state.otherParticipant = {
      uid: userId,
      ...(state.activeConversationData?.participants?.[userId] || {}),
      ...data
    };
    renderConversationHeader();
  });
}

function renderTypingIndicator(typing = {}) {
  if (!state.otherParticipant) {
    typingIndicator.hidden = true;
    return;
  }
  const isTyping = typing[state.otherParticipant.uid];
  typingIndicator.hidden = !isTyping;
}

function subscribeToMessages(conversationId) {
  const conversationRef = doc(db, "conversations", conversationId);
  const messagesRef = collection(conversationRef, "messages");
  const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"), limit(200));
  messagesUnsub = onSnapshot(messagesQuery, (snapshot) => {
    const messages = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    renderMessages(messages);
  });
}

function renderMessages(messages) {
  messageList.innerHTML = "";
  let lastSender = null;
  let groupElement = null;

  messages.forEach((message) => {
    const own = message.senderId === currentUser?.uid;
    if (lastSender !== message.senderId) {
      groupElement = document.createElement("div");
      groupElement.className = `message-group${own ? " own" : ""}`;
      messageList.appendChild(groupElement);
      lastSender = message.senderId;
    }
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = message.text;
    groupElement.appendChild(bubble);

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = formatRelativeTime(message.createdAt);
    groupElement.appendChild(meta);
  });

  messageList.scrollTop = messageList.scrollHeight;
}

async function createOrGetConversation(otherUser) {
  const ids = [currentUser.uid, otherUser.id].sort();
  const participantKey = ids.join("_");
  const conversationsRef = collection(db, "conversations");
  const existingQuery = query(conversationsRef, where("participantKey", "==", participantKey));
  const existing = await getDocs(existingQuery);
  if (!existing.empty) {
    return existing.docs[0].id;
  }

  const conversationData = {
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    participantIds: ids,
    participantKey,
    participants: {
      [currentUser.uid]: {
        displayName: currentUser.displayName || currentUser.email,
        email: currentUser.email,
        accentColor: ensureHexColor(profileColorInput.value, randomAccentColor),
        lastActive: serverTimestamp()
      },
      [otherUser.id]: {
        displayName: otherUser.displayName || otherUser.email,
        email: otherUser.email,
        accentColor: ensureHexColor(otherUser.accentColor, randomAccentColor),
        lastActive: otherUser.lastActive || serverTimestamp()
      }
    },
    typing: {
      [currentUser.uid]: false,
      [otherUser.id]: false
    }
  };

  const conversationRef = await addDoc(conversationsRef, conversationData);
  return conversationRef.id;
}

function handlePresence(user) {
  const updatePresence = async () => {
    try {
      await updateDoc(doc(db, "users", user.uid), {
        lastActive: serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to update presence", error);
    }
  };

  if (presenceInterval) clearInterval(presenceInterval);
  presenceInterval = setInterval(updatePresence, 60000);
  if (presenceVisibilityHandler) {
    document.removeEventListener("visibilitychange", presenceVisibilityHandler);
  }
  presenceVisibilityHandler = () => {
    if (document.visibilityState === "visible") {
      updatePresence();
    }
  };
  document.addEventListener("visibilitychange", presenceVisibilityHandler);
  updatePresence();
}

function cleanupSubscriptions() {
  if (currentUserDocUnsub) {
    currentUserDocUnsub();
    currentUserDocUnsub = null;
  }
  if (conversationsUnsub) {
    conversationsUnsub();
    conversationsUnsub = null;
  }
  if (activeConversationUnsub) {
    activeConversationUnsub();
    activeConversationUnsub = null;
  }
  if (messagesUnsub) {
    messagesUnsub();
    messagesUnsub = null;
  }
  if (otherUserUnsub) {
    otherUserUnsub();
    otherUserUnsub = null;
  }
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
  if (presenceVisibilityHandler) {
    document.removeEventListener("visibilitychange", presenceVisibilityHandler);
    presenceVisibilityHandler = null;
  }
  currentOtherUserId = null;
  state.conversations = [];
  state.activeConversationId = null;
  state.activeConversationData = null;
  state.otherParticipant = null;
  messageList.innerHTML = "";
  renderConversationList();
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  cleanupSubscriptions();
  if (!user) {
    authContainer.classList.remove("hidden");
    chatLayout.classList.add("hidden");
    toggleAuth(false);
    return;
  }

  await ensureUserDocument(user);
  subscribeToCurrentUser(user);
  subscribeToConversations(user);
  handlePresence(user);

  authContainer.classList.add("hidden");
  chatLayout.classList.remove("hidden");
});

window.addEventListener("beforeunload", () => {
  updateTypingState(false);
});

document.addEventListener("DOMContentLoaded", () => {
  autoResizeTextarea(messageInput);
});
