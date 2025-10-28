import { initializeAuth, firebaseDb } from "./auth.js";
import { initializeTheme } from "./theme.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const conversationList = document.querySelector("[data-conversation-list]");
const conversationFeedback = document.querySelector("[data-conversation-feedback]");
const conversationForm = document.querySelector("[data-start-conversation]");
const conversationEmailInput = conversationForm?.querySelector("input[name='email']");
const chatTitle = document.querySelector("[data-chat-title]");
const chatSubtitle = document.querySelector("[data-chat-subtitle]");
const messageStream = document.querySelector("[data-message-stream]");
const emptyState = document.querySelector("[data-empty-state]");
const composerForm = document.querySelector("[data-composer]");
const messageInput = document.querySelector("[data-message-input]");
const feedback = document.querySelector("[data-feedback]");

let currentUser = null;
let activeConversationId = null;
let activeConversation = null;
let unsubscribeConversations = null;
let unsubscribeMessages = null;
const conversationsCache = new Map();

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function showFeedback(message, type = "info") {
  if (!feedback) return;
  feedback.textContent = message;
  if (!message) {
    delete feedback.dataset.state;
    feedback.removeAttribute("role");
    feedback.removeAttribute("aria-live");
    return;
  }
  feedback.dataset.state = type === "error" ? "error" : type === "success" ? "success" : "info";
  if (type === "error") {
    feedback.setAttribute("role", "alert");
    feedback.removeAttribute("aria-live");
  } else {
    feedback.setAttribute("aria-live", "polite");
    feedback.removeAttribute("role");
  }
}

function showConversationFeedback(message, type = "info") {
  if (!conversationFeedback) return;
  conversationFeedback.textContent = message;
  if (!message) {
    delete conversationFeedback.dataset.state;
    conversationFeedback.removeAttribute("role");
    conversationFeedback.removeAttribute("aria-live");
    return;
  }
  conversationFeedback.dataset.state =
    type === "error" ? "error" : type === "success" ? "success" : "info";
  if (type === "error") {
    conversationFeedback.setAttribute("role", "alert");
    conversationFeedback.removeAttribute("aria-live");
  } else {
    conversationFeedback.setAttribute("aria-live", "polite");
    conversationFeedback.removeAttribute("role");
  }
}

function setComposerState(isDisabled) {
  if (!composerForm) return;
  const submitButton = composerForm.querySelector("button[type='submit']");
  if (submitButton) {
    submitButton.disabled = isDisabled;
  }
  if (messageInput) {
    messageInput.disabled = isDisabled;
  }
}

function setConversationFormBusy(isBusy) {
  if (!conversationForm) return;
  const controls = conversationForm.querySelectorAll("input, button");
  controls.forEach((control) => {
    control.disabled = isBusy;
  });
}

function resetStream() {
  if (messageStream) {
    messageStream.innerHTML = "";
  }
}

function clearActiveConversation() {
  activeConversationId = null;
  activeConversation = null;
  resetStream();
  messageStream?.setAttribute("hidden", "");
  emptyState?.removeAttribute("hidden");
  setComposerState(true);
  if (chatTitle) {
    chatTitle.textContent = "Select a conversation";
  }
  if (chatSubtitle) {
    chatSubtitle.textContent = "Start a private chat to see messages.";
  }
}

function detachListeners() {
  if (unsubscribeConversations) {
    unsubscribeConversations();
    unsubscribeConversations = null;
  }
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
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

function formatTimestamp(timestamp) {
  if (!timestamp?.seconds) {
    return "";
  }
  const date = new Date(timestamp.seconds * 1000);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getPeerProfile(conversation) {
  if (!conversation?.members || !currentUser) {
    return {};
  }
  const otherId = conversation.members.find((member) => member !== currentUser.uid);
  const profiles = conversation.memberProfiles ?? {};
  const profile = profiles[otherId] ?? {};
  return { uid: otherId, ...profile };
}

function createMessageElement({ id, text, displayName, createdAt, uid }) {
  const wrapper = document.createElement("article");
  wrapper.classList.add("message");
  if (uid === currentUser?.uid) {
    wrapper.classList.add("self");
  }
  wrapper.dataset.messageId = id;

  const avatar = document.createElement("div");
  avatar.classList.add("avatar");
  avatar.style.background = randomColor(uid);
  avatar.textContent = (displayName || "?").charAt(0).toUpperCase();

  const body = document.createElement("div");
  body.classList.add("message-body");

  const header = document.createElement("header");
  const title = document.createElement("h3");
  title.textContent = displayName || "Social0x1 user";

  const timestamp = document.createElement("span");
  if (createdAt?.seconds) {
    timestamp.textContent = formatTimestamp(createdAt);
  } else {
    timestamp.textContent = "Sending…";
  }

  header.append(title, timestamp);

  const paragraph = document.createElement("p");
  paragraph.textContent = text;

  body.append(header, paragraph);
  wrapper.append(avatar, body);

  return wrapper;
}

function renderMessage(message) {
  if (!messageStream) return;
  const element = createMessageElement(message);
  messageStream.appendChild(element);
  messageStream.scrollTop = messageStream.scrollHeight;
}

function updateConversationActiveState() {
  if (!conversationList) return;
  const items = conversationList.querySelectorAll(".conversation-item");
  items.forEach((item) => {
    const isActive = item.dataset.conversationId === activeConversationId;
    item.classList.toggle("active", isActive);
  });
}

function renderConversationList(conversations) {
  if (!conversationList) return;
  conversationList.innerHTML = "";

  const sorted = conversations
    .slice()
    .sort((a, b) => {
      const aTime = a.updatedAt?.seconds || 0;
      const bTime = b.updatedAt?.seconds || 0;
      return bTime - aTime;
    });

  if (!sorted.length) {
    showConversationFeedback("No conversations yet. Start one to begin chatting!");
    return;
  }

  sorted.forEach((conversation) => {
    const listItem = document.createElement("li");
    listItem.classList.add("conversation-item");
    listItem.tabIndex = 0;
    listItem.dataset.conversationId = conversation.id;

    const counterpart = getPeerProfile(conversation);

    const avatar = document.createElement("div");
    avatar.classList.add("avatar");
    avatar.style.background = randomColor(counterpart.uid || conversation.id);
    avatar.textContent = (counterpart.displayName || counterpart.email || "?").charAt(0).toUpperCase();

    const body = document.createElement("div");

    const title = document.createElement("h3");
    title.textContent = counterpart.displayName || counterpart.email || "Direct chat";

    const preview = document.createElement("p");
    const messagePreview = conversation.lastMessage || "No messages yet";
    const timePreview = formatTimestamp(conversation.lastMessageAt || conversation.updatedAt);
    preview.textContent = timePreview ? `${messagePreview} · ${timePreview}` : messagePreview;

    body.append(title, preview);
    listItem.append(avatar, body);
    conversationList.appendChild(listItem);
  });

  updateConversationActiveState();
  showConversationFeedback(`${sorted.length} conversation${sorted.length === 1 ? "" : "s"} available.`);
}

function startMessagesListener(conversationId) {
  if (!conversationId) return;
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
  resetStream();

  const messagesRef = collection(firebaseDb, "conversations", conversationId, "messages");
  const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"), limit(200));

  unsubscribeMessages = onSnapshot(
    messagesQuery,
    (snapshot) => {
      resetStream();
      snapshot.forEach((docSnap) => {
        renderMessage({ id: docSnap.id, ...docSnap.data() });
      });
      if (snapshot.empty) {
        showFeedback("No messages yet. Say hello!", "info");
      } else {
        showFeedback(`${snapshot.size} message${snapshot.size === 1 ? "" : "s"} loaded.`);
      }
      messageStream?.removeAttribute("hidden");
      emptyState?.setAttribute("hidden", "");
    },
    (error) => {
      console.error("Realtime listener error", error);
      showFeedback("Connection lost. Retrying…", "error");
    }
  );
}

async function selectConversation(conversationId) {
  if (!conversationId || conversationId === activeConversationId) {
    return;
  }
  activeConversationId = conversationId;
  activeConversation = conversationsCache.get(conversationId) || null;

  if (!activeConversation) {
    try {
      const conversationRef = doc(firebaseDb, "conversations", conversationId);
      const snapshot = await getDoc(conversationRef);
      if (!snapshot.exists()) {
        showFeedback("Conversation not found.", "error");
        clearActiveConversation();
        return;
      }
      activeConversation = { id: snapshot.id, ...snapshot.data() };
      conversationsCache.set(conversationId, activeConversation);
    } catch (error) {
      console.error("Unable to load conversation", error);
      showFeedback(error.message || "Unable to load that conversation.", "error");
      return;
    }
  }

  updateConversationActiveState();

  if (chatTitle) {
    const peer = getPeerProfile(activeConversation);
    chatTitle.textContent = peer.displayName || peer.email || "Direct chat";
  }
  if (chatSubtitle) {
    const peer = getPeerProfile(activeConversation);
    chatSubtitle.textContent = peer.email ? `Private messages with ${peer.email}` : "Encrypted in transit via Firebase.";
  }

  emptyState?.setAttribute("hidden", "");
  messageStream?.removeAttribute("hidden");
  resetStream();
  showFeedback("Loading messages…");

  setComposerState(false);
  startMessagesListener(conversationId);
}

async function subscribeToConversations() {
  if (!currentUser) return;
  if (unsubscribeConversations) {
    unsubscribeConversations();
    unsubscribeConversations = null;
  }

  const conversationsRef = collection(firebaseDb, "conversations");
  const conversationsQuery = query(conversationsRef, where("members", "array-contains", currentUser.uid));

  unsubscribeConversations = onSnapshot(
    conversationsQuery,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const id = change.doc.id;
        if (change.type === "removed") {
          conversationsCache.delete(id);
          if (id === activeConversationId) {
            clearActiveConversation();
            showFeedback("This conversation is no longer available.", "error");
          }
          return;
        }
        const data = { id, ...change.doc.data() };
        conversationsCache.set(id, data);
        if (id === activeConversationId) {
          activeConversation = data;
        }
      });

      renderConversationList(Array.from(conversationsCache.values()));
    },
    (error) => {
      console.error("Conversation listener error", error);
      showConversationFeedback("Unable to load conversations. Retrying…", "error");
    }
  );
}

async function startPrivateConversation(event) {
  event.preventDefault();
  if (!currentUser) {
    showConversationFeedback("You must be signed in to start a conversation.", "error");
    return;
  }

  const email = conversationEmailInput?.value?.trim();
  if (!email) {
    showConversationFeedback("Enter an email address to start a chat.", "error");
    return;
  }

  const normalizedEmail = normalizeEmail(email);
  if (currentUser.email && normalizeEmail(currentUser.email) === normalizedEmail) {
    showConversationFeedback("You cannot start a conversation with yourself.", "error");
    return;
  }

  setConversationFormBusy(true);
  showConversationFeedback("Looking up that account…");

  try {
    const profilesRef = collection(firebaseDb, "profiles");
    const profileQuery = query(profilesRef, where("emailLowercase", "==", normalizedEmail), limit(1));
    const profileSnap = await getDocs(profileQuery);

    if (profileSnap.empty) {
      showConversationFeedback("No user found with that email.", "error");
      return;
    }

    const peerDoc = profileSnap.docs[0];
    const peerData = { uid: peerDoc.id, ...peerDoc.data() };

    const memberIds = [currentUser.uid, peerData.uid];
    const sorted = memberIds.slice().sort();
    const memberHash = sorted.join("_");

    const conversationsRef = collection(firebaseDb, "conversations");
    const existingQuery = query(conversationsRef, where("memberHash", "==", memberHash), limit(1));
    const existingSnap = await getDocs(existingQuery);

    let conversationId = null;

    if (!existingSnap.empty) {
      conversationId = existingSnap.docs[0].id;
      showConversationFeedback("Conversation already exists. Opening it…", "info");
    } else {
      const payload = {
        members: memberIds,
        memberHash,
        memberProfiles: {
          [currentUser.uid]: {
            displayName: currentUser.displayName || currentUser.email || "You",
            email: currentUser.email || "",
          },
          [peerData.uid]: {
            displayName: peerData.displayName || peerData.email || "Contact",
            email: peerData.email || "",
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: "",
        lastMessageAt: null,
        lastSender: "",
      };

      const docRef = await addDoc(conversationsRef, payload);
      conversationId = docRef.id;
      showConversationFeedback(
        `Conversation started with ${peerData.displayName || peerData.email}.`,
        "success"
      );
    }

    conversationForm?.reset();
    if (conversationId) {
      selectConversation(conversationId);
    }
  } catch (error) {
    console.error("Failed to start conversation", error);
    showConversationFeedback(error.message || "Unable to create the conversation.", "error");
  } finally {
    setConversationFormBusy(false);
  }
}

async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Message cannot be empty.");
  }
  if (trimmed.length > 1000) {
    throw new Error("Messages are limited to 1000 characters.");
  }
  if (!currentUser) {
    throw new Error("You must be signed in to send messages.");
  }
  if (!activeConversationId) {
    throw new Error("Select a conversation before sending a message.");
  }

  const messagesRef = collection(firebaseDb, "conversations", activeConversationId, "messages");
  const payload = {
    text: trimmed,
    uid: currentUser.uid,
    displayName: currentUser.displayName || currentUser.email || "You",
    createdAt: serverTimestamp(),
  };

  const conversationRef = doc(firebaseDb, "conversations", activeConversationId);
  const senderProfilePath = `memberProfiles.${currentUser.uid}`;

  await addDoc(messagesRef, payload);
  await updateDoc(conversationRef, {
    lastMessage: trimmed,
    lastMessageAt: serverTimestamp(),
    lastSender: currentUser.uid,
    updatedAt: serverTimestamp(),
    [senderProfilePath]: {
      displayName: currentUser.displayName || currentUser.email || "You",
      email: currentUser.email || "",
    },
  });
}

function handleConversationListInteraction(event) {
  const item = event.target.closest(".conversation-item");
  if (!item) return;
  const conversationId = item.dataset.conversationId;
  selectConversation(conversationId);
}

function resetStateForSignedOutUser() {
  conversationsCache.clear();
  renderConversationList([]);
  clearActiveConversation();
  showFeedback("Log in to start private conversations.");
  showConversationFeedback("Log in to create or view private chats.");
}

composerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!messageInput) return;

  const text = messageInput.value;
  try {
    setComposerState(true);
    await sendMessage(text);
    messageInput.value = "";
    showFeedback("Delivered ✔", "success");
  } catch (error) {
    console.error("Send message error", error);
    showFeedback(error.message || "Message failed.", "error");
  } finally {
    setComposerState(!currentUser || !activeConversationId);
  }
});

conversationForm?.addEventListener("submit", startPrivateConversation);
conversationList?.addEventListener("click", handleConversationListInteraction);
conversationList?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handleConversationListInteraction(event);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  initializeAuth({
    onAuthStateChange: (user) => {
      detachListeners();
      currentUser = user;
      conversationsCache.clear();
      if (user) {
        showFeedback("Select a conversation or start a new one to begin chatting.");
        subscribeToConversations();
        setComposerState(true);
      } else {
        resetStateForSignedOutUser();
      }
    },
  });
});
