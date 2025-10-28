import { initializeTheme } from "./theme.js";
import { db, normalizeEmail, observeAuthState, signOutUser } from "./auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
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
const chatMode = document.querySelector("[data-chat-mode]");
const chatMeta = document.querySelector("[data-chat-meta]");
const messageStream = document.querySelector("[data-message-stream]");
const emptyState = document.querySelector("[data-empty-state]");
const composerForm = document.querySelector("[data-composer]");
const messageInput = document.querySelector("[data-message-input]");
const feedback = document.querySelector("[data-feedback]");
const secretHint = document.querySelector("[data-secret-hint]");
const inviteHint = document.querySelector("[data-invite-hint]");
const inviteLinkElement = document.querySelector("[data-invite-link]");
const copyInviteButton = document.querySelector("[data-copy-invite]");
const userChip = document.querySelector("[data-user-chip]");
const signOutButton = document.querySelector("[data-sign-out]");
const userName = document.querySelector("[data-user-name]");
const userEmail = document.querySelector("[data-user-email]");

let currentUser = null;
let activeConversationId = null;
let activeConversation = null;
let unsubscribeConversations = null;
let unsubscribeMessages = null;
let unsubscribeSecretPackets = null;
const conversationsCache = new Map();
const secretMessageCache = new Map();

const SECRET_STORAGE_PREFIX = "social0x1:secret:";

function getSecretStorageKey(conversationId) {
  if (!currentUser?.uid) return `${SECRET_STORAGE_PREFIX}${conversationId}`;
  return `${SECRET_STORAGE_PREFIX}${conversationId}:${currentUser.uid}`;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    return value.toDate();
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === "number") {
    return new Date(value);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }
  return null;
}

function formatTimestamp(value) {
  const date = toDate(value);
  if (!date) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getSecretMessages(conversationId) {
  if (secretMessageCache.has(conversationId)) {
    return secretMessageCache.get(conversationId);
  }
  let stored = [];
  try {
    const key = getSecretStorageKey(conversationId);
    const raw = window.localStorage.getItem(key);
    if (raw) {
      stored = JSON.parse(raw);
    }
  } catch (error) {
    console.warn("Unable to load secret messages", error);
  }
  if (!Array.isArray(stored)) {
    stored = [];
  }
  secretMessageCache.set(conversationId, stored);
  return stored;
}

function persistSecretMessages(conversationId) {
  if (!secretMessageCache.has(conversationId)) return;
  try {
    const key = getSecretStorageKey(conversationId);
    const data = JSON.stringify(secretMessageCache.get(conversationId));
    window.localStorage.setItem(key, data);
  } catch (error) {
    console.warn("Unable to persist secret messages", error);
  }
}

function appendSecretMessage(conversationId, message) {
  const messages = getSecretMessages(conversationId);
  messages.push(message);
  messages.sort((a, b) => {
    const aTime = toDate(a.createdAt)?.getTime() || 0;
    const bTime = toDate(b.createdAt)?.getTime() || 0;
    return aTime - bTime;
  });
  secretMessageCache.set(conversationId, messages);
  persistSecretMessages(conversationId);
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
  avatar.style.background = randomColor(uid || displayName || id || "message");
  avatar.textContent = (displayName || "?").charAt(0).toUpperCase();

  const body = document.createElement("div");
  body.classList.add("message-body");

  const header = document.createElement("header");
  const title = document.createElement("h3");
  title.textContent = displayName || "Social0x1 user";

  const timestamp = document.createElement("span");
  const formatted = formatTimestamp(createdAt);
  timestamp.textContent = formatted || "";

  header.append(title, timestamp);

  const paragraph = document.createElement("p");
  paragraph.textContent = text;

  body.append(header, paragraph);
  wrapper.append(avatar, body);

  return wrapper;
}

function resetStream() {
  if (messageStream) {
    messageStream.innerHTML = "";
  }
}

function clearInviteHint() {
  if (inviteHint) {
    inviteHint.setAttribute("hidden", "");
  }
  if (inviteLinkElement) {
    inviteLinkElement.textContent = "";
    delete inviteLinkElement.dataset.href;
  }
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
  submitButton.disabled = isDisabled;
  if (messageInput) {
    messageInput.disabled = isDisabled;
  }
}

function renderSecretConversation(conversationId) {
  if (!messageStream) return;
  resetStream();
  const messages = getSecretMessages(conversationId);
  if (!messages.length) {
    showFeedback("Secret chats are stored locally. Start the conversation!", "info");
  } else {
    messages.forEach((message) => {
      const element = createMessageElement(message);
      messageStream.appendChild(element);
    });
    messageStream.scrollTop = messageStream.scrollHeight;
    showFeedback(`${messages.length} secret message${messages.length === 1 ? "" : "s"} on this device.`);
  }
  messageStream.removeAttribute("hidden");
  emptyState?.setAttribute("hidden", "");
}

function renderConversationList(conversations) {
  if (!conversationList) return;
  conversationList.innerHTML = "";

  const sorted = conversations
    .slice()
    .sort((a, b) => {
      const aTime = toDate(a.updatedAt)?.getTime() || 0;
      const bTime = toDate(b.updatedAt)?.getTime() || 0;
      return bTime - aTime;
    });

  if (!sorted.length) {
    showConversationFeedback("No conversations yet. Start one to begin chatting!");
    return;
  }

  sorted.forEach((conversation) => {
    const listItem = document.createElement("li");
    listItem.classList.add("conversation-item");
    if (conversation.mode === "secret") {
      listItem.classList.add("secret");
    }
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
    const messagePreview = conversation.mode === "secret" ? "🔒 Secret chat" : conversation.lastMessage || "No messages yet";
    const timePreview = formatTimestamp(conversation.lastMessageAt || conversation.updatedAt);
    preview.textContent = timePreview ? `${messagePreview} · ${timePreview}` : messagePreview;

    if (conversation.mode === "secret") {
      const badge = document.createElement("span");
      badge.classList.add("mode-badge");
      badge.textContent = "Secret";
      title.appendChild(badge);
    }

    body.append(title, preview);
    listItem.append(avatar, body);
    conversationList.appendChild(listItem);
  });

  updateConversationActiveState();
  showConversationFeedback(`${sorted.length} conversation${sorted.length === 1 ? "" : "s"} available.`);
}

function updateConversationActiveState() {
  if (!conversationList) return;
  const items = conversationList.querySelectorAll(".conversation-item");
  items.forEach((item) => {
    const isActive = item.dataset.conversationId === activeConversationId;
    item.classList.toggle("active", isActive);
  });
}

function randomColor(uid = "") {
  const palette = ["#ff6f61", "#ec4899", "#6366f1", "#22d3ee", "#f97316", "#14b8a6"];
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % palette.length;
  return palette[index];
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

function applyConversationMetadata(conversation) {
  if (!conversation) return;
  const peer = getPeerProfile(conversation);
  if (chatTitle) {
    chatTitle.textContent = peer.displayName || peer.email || "Direct chat";
  }
  if (chatSubtitle) {
    if (conversation.mode === "secret") {
      chatSubtitle.textContent = peer.email
        ? `Secret messages with ${peer.email} stay on each device.`
        : "Secret chat stored locally on this device.";
    } else {
      chatSubtitle.textContent = peer.email
        ? `Private messages with ${peer.email}`
        : "Encrypted in transit via Firebase.";
    }
  }
  if (chatMeta && chatMode) {
    chatMode.textContent = conversation.mode === "secret" ? "Secret chat · stored locally" : "General chat · synced securely";
    chatMeta.removeAttribute("hidden");
  }
  if (secretHint) {
    if (conversation.mode === "secret") {
      secretHint.removeAttribute("hidden");
    } else {
      secretHint.setAttribute("hidden", "");
    }
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
    chatSubtitle.textContent = "Start a chat from the sidebar to view messages.";
  }
  chatMeta?.setAttribute("hidden", "");
  if (secretHint) {
    secretHint.setAttribute("hidden", "");
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
  if (unsubscribeSecretPackets) {
    unsubscribeSecretPackets();
    unsubscribeSecretPackets = null;
  }
}

function renderMessage(message) {
  if (!messageStream) return;
  const element = createMessageElement(message);
  messageStream.appendChild(element);
  messageStream.scrollTop = messageStream.scrollHeight;
}

function startMessagesListener(conversationId) {
  if (!conversationId) return;
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
  resetStream();

  const messagesRef = collection(db, "conversations", conversationId, "messages");
  const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"), limit(200));

  unsubscribeMessages = onSnapshot(
    messagesQuery,
    (snapshot) => {
      resetStream();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        renderMessage({ id: docSnap.id, ...data });
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

function startSecretPacketsListener(conversationId) {
  if (!conversationId) return;
  if (unsubscribeSecretPackets) {
    unsubscribeSecretPackets();
    unsubscribeSecretPackets = null;
  }

  const packetsRef = collection(db, "conversations", conversationId, "secretPackets");
  const packetsQuery = query(packetsRef, orderBy("createdAt", "asc"), limit(200));

  unsubscribeSecretPackets = onSnapshot(
    packetsQuery,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        const data = change.doc.data();
        if (data.recipientId !== currentUser?.uid) {
          return;
        }
        const message = {
          id: change.doc.id,
          text: data.text || "",
          uid: data.senderId,
          displayName: data.senderName || "Contact",
          createdAt: data.createdAt || Date.now(),
        };
        appendSecretMessage(conversationId, message);
        renderSecretConversation(conversationId);
        deleteDoc(change.doc.ref).catch((error) => {
          console.warn("Failed to clear secret packet", error);
        });
      });
    },
    (error) => {
      console.error("Secret packet listener error", error);
      showFeedback("Secret chat connection interrupted. Retrying…", "error");
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
      const conversationRef = doc(db, "conversations", conversationId);
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
  applyConversationMetadata(activeConversation);

  emptyState?.setAttribute("hidden", "");
  messageStream?.removeAttribute("hidden");
  resetStream();
  showFeedback("Loading messages…");

  setComposerState(false);

  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
  if (unsubscribeSecretPackets) {
    unsubscribeSecretPackets();
    unsubscribeSecretPackets = null;
  }

  if (activeConversation.mode === "secret") {
    renderSecretConversation(conversationId);
    startSecretPacketsListener(conversationId);
  } else {
    startMessagesListener(conversationId);
  }
}

async function subscribeToConversations() {
  if (!currentUser) return;
  if (unsubscribeConversations) {
    unsubscribeConversations();
    unsubscribeConversations = null;
  }

  const conversationsRef = collection(db, "conversations");
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
        if (!data.mode) {
          data.mode = "general";
        }
        conversationsCache.set(id, data);
        if (id === activeConversationId) {
          activeConversation = data;
          applyConversationMetadata(activeConversation);
          if (activeConversation.mode === "secret") {
            renderSecretConversation(id);
          }
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
  const mode = conversationForm?.elements?.mode?.value || "general";
  if (!email) {
    showConversationFeedback("Enter an email address to start a chat.", "error");
    return;
  }

  clearInviteHint();

  const normalizedEmail = normalizeEmail(email);
  if (currentUser.email && normalizeEmail(currentUser.email) === normalizedEmail) {
    showConversationFeedback("You cannot start a conversation with yourself.", "error");
    return;
  }

  setConversationFormBusy(true);
  showConversationFeedback("Looking up that account…");

  try {
    const profilesRef = collection(db, "profiles");
    const profileQuery = query(profilesRef, where("emailLowercase", "==", normalizedEmail), limit(1));
    const profileSnap = await getDocs(profileQuery);

    if (profileSnap.empty) {
      await handleMissingUserInvite({ email, normalizedEmail, mode });
      return;
    }

    const peerDoc = profileSnap.docs[0];
    const peerData = { uid: peerDoc.id, ...peerDoc.data() };

    const memberIds = [currentUser.uid, peerData.uid];
    const sorted = memberIds.slice().sort();
    const memberHash = sorted.join("_");

    const conversationsRef = collection(db, "conversations");
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
        mode: mode === "secret" ? "secret" : "general",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: mode === "secret" ? "🔒 Secret chat active" : "",
        lastMessageAt: mode === "secret" ? serverTimestamp() : null,
        lastSender: "",
      };

      const docRef = await addDoc(conversationsRef, payload);
      conversationId = docRef.id;
      if (mode === "secret") {
        showConversationFeedback(
          `Secret conversation started with ${peerData.displayName || peerData.email}.`,
          "success"
        );
      } else {
        showConversationFeedback(
          `Conversation started with ${peerData.displayName || peerData.email}.`,
          "success"
        );
      }
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

async function handleMissingUserInvite({ email, normalizedEmail, mode }) {
  const invitesRef = collection(db, "invites");
  const pendingInviteQuery = query(
    invitesRef,
    where("emailLowercase", "==", normalizedEmail),
    where("inviterId", "==", currentUser.uid),
    where("status", "==", "pending"),
    limit(1)
  );
  const pendingSnap = await getDocs(pendingInviteQuery);

  if (!pendingSnap.empty) {
    const inviteLink = buildInviteLink({ email, mode });
    revealInviteLink(inviteLink);
    showConversationFeedback("Invitation already sent. Share the link below.", "info");
    return;
  }

  await addDoc(invitesRef, {
    email,
    emailLowercase: normalizedEmail,
    inviterId: currentUser.uid,
    inviterProfile: {
      displayName: currentUser.displayName || currentUser.email || "You",
      email: currentUser.email || "",
    },
    mode: mode === "secret" ? "secret" : "general",
    status: "pending",
    createdAt: serverTimestamp(),
  });

  const inviteLink = buildInviteLink({ email, mode });
  revealInviteLink(inviteLink);
  showConversationFeedback("Invitation created. Share the link with your contact.", "success");
}

function buildInviteLink({ email, mode }) {
  const params = new URLSearchParams();
  params.set("inviteEmail", email);
  if (mode === "secret") {
    params.set("mode", "secret");
  }
  return `${window.location.origin}/login.html?${params.toString()}`;
}

function revealInviteLink(link) {
  if (!inviteHint || !inviteLinkElement) return;
  inviteLinkElement.textContent = link;
  inviteLinkElement.dataset.href = link;
  inviteHint.removeAttribute("hidden");
}

function setConversationFormBusy(isBusy) {
  if (!conversationForm) return;
  const controls = conversationForm.querySelectorAll("input, button");
  controls.forEach((control) => {
    control.disabled = isBusy;
  });
}

async function sendGeneralMessage(text) {
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

  const messagesRef = collection(db, "conversations", activeConversationId, "messages");
  const payload = {
    text: trimmed,
    uid: currentUser.uid,
    displayName: currentUser.displayName || currentUser.email || "You",
    createdAt: serverTimestamp(),
  };

  const conversationRef = doc(db, "conversations", activeConversationId);
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

async function sendSecretMessage(text) {
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
  if (!activeConversationId || !activeConversation) {
    throw new Error("Select a conversation before sending a message.");
  }
  const peer = getPeerProfile(activeConversation);
  if (!peer?.uid) {
    throw new Error("Unable to resolve the other participant.");
  }

  const localMessage = {
    id: `local-${Date.now()}`,
    text: trimmed,
    uid: currentUser.uid,
    displayName: currentUser.displayName || currentUser.email || "You",
    createdAt: Date.now(),
  };
  appendSecretMessage(activeConversationId, localMessage);
  renderSecretConversation(activeConversationId);

  const packetsRef = collection(db, "conversations", activeConversationId, "secretPackets");
  await addDoc(packetsRef, {
    text: trimmed,
    senderId: currentUser.uid,
    senderName: currentUser.displayName || currentUser.email || "You",
    recipientId: peer.uid,
    createdAt: serverTimestamp(),
  });

  const conversationRef = doc(db, "conversations", activeConversationId);
  await updateDoc(conversationRef, {
    lastMessage: "🔒 Secret message", // do not expose plaintext
    lastMessageAt: serverTimestamp(),
    lastSender: currentUser.uid,
    updatedAt: serverTimestamp(),
  });
}

async function handleSendMessage(event) {
  event.preventDefault();
  if (!messageInput) return;
  const text = messageInput.value;
  if (!text) return;

  try {
    setComposerState(true);
    if (activeConversation?.mode === "secret") {
      await sendSecretMessage(text);
    } else {
      await sendGeneralMessage(text);
    }
    messageInput.value = "";
    showFeedback("Delivered ✔", "success");
  } catch (error) {
    console.error("Send message error", error);
    showFeedback(error.message || "Message failed.", "error");
  } finally {
    setComposerState(!currentUser || !activeConversationId);
  }
}

function handleConversationListInteraction(event) {
  const item = event.target.closest(".conversation-item");
  if (!item) return;
  const conversationId = item.dataset.conversationId;
  selectConversation(conversationId);
}

function revealSignedInUi(user) {
  if (userChip) {
    userChip.textContent = user.displayName || user.email || "Signed in";
  }
  if (userName) {
    userName.textContent = user.displayName || "—";
  }
  if (userEmail) {
    userEmail.textContent = user.email || "—";
  }
}

function resetStateForSignedOutUser() {
  conversationsCache.clear();
  renderConversationList([]);
  clearActiveConversation();
  showFeedback("Log in to start private conversations.");
  showConversationFeedback("Log in to create or view private chats.");
}

copyInviteButton?.addEventListener("click", async () => {
  if (!inviteLinkElement?.dataset?.href) return;
  try {
    await navigator.clipboard.writeText(inviteLinkElement.dataset.href);
    showConversationFeedback("Invite link copied!", "success");
  } catch (error) {
    console.warn("Clipboard copy failed", error);
    showConversationFeedback("Copy the link manually from the code block.", "error");
  }
});

composerForm?.addEventListener("submit", handleSendMessage);
conversationForm?.addEventListener("submit", startPrivateConversation);
conversationList?.addEventListener("click", handleConversationListInteraction);
conversationList?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handleConversationListInteraction(event);
  }
});

signOutButton?.addEventListener("click", async () => {
  signOutButton.disabled = true;
  try {
    await signOutUser();
  } catch (error) {
    console.error("Sign out failed", error);
    signOutButton.disabled = false;
  }
});

window.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  observeAuthState({
    onChange: (user) => {
      detachListeners();
      currentUser = user;
      conversationsCache.clear();
      secretMessageCache.clear();
      if (user) {
        revealSignedInUi(user);
        subscribeToConversations();
        setComposerState(true);
      } else {
        resetStateForSignedOutUser();
        window.location.replace(`login.html?redirect=${encodeURIComponent(window.location.pathname)}`);
      }
    },
    onError: () => {
      showFeedback("Authentication error. Refresh and try again.", "error");
    },
  });
});
