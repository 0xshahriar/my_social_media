import { initializeAuth, sendMessage } from "./auth.js";
import { initializeTheme } from "./theme.js";

const messageStream = document.querySelector("[data-message-stream]");
const composerForm = document.querySelector("[data-composer]");
const messageInput = document.querySelector("[data-message-input]");
const feedback = document.querySelector("[data-feedback]");

function showFeedback(message, type = "info") {
  if (!feedback) return;
  feedback.textContent = message;
  feedback.removeAttribute("role");
  if (type === "error") {
    feedback.setAttribute("role", "alert");
  }
}

export function setComposerState(isDisabled) {
  if (!composerForm) return;
  const submitButton = composerForm.querySelector("button[type='submit']");
  if (submitButton) {
    submitButton.disabled = isDisabled;
  }
  if (messageInput) {
    messageInput.disabled = isDisabled;
  }
}

export function resetStream() {
  if (messageStream) {
    messageStream.innerHTML = "";
  }
}

function createMessageElement({ id, text, displayName, createdAt, uid }, currentUid, colorFn) {
  const wrapper = document.createElement("article");
  wrapper.classList.add("message");
  if (uid === currentUid) {
    wrapper.classList.add("self");
  }
  wrapper.dataset.messageId = id;

  const avatar = document.createElement("div");
  avatar.classList.add("avatar");
  avatar.style.background = colorFn(uid);
  avatar.textContent = displayName?.charAt(0)?.toUpperCase() ?? "?";

  const body = document.createElement("div");
  body.classList.add("message-body");

  const header = document.createElement("header");
  const title = document.createElement("h3");
  title.textContent = displayName || "Social0x1 User";

  const timestamp = document.createElement("span");
  if (createdAt?.seconds) {
    const date = new Date(createdAt.seconds * 1000);
    timestamp.textContent = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

export function renderMessage(message, currentUid, colorFn) {
  if (!messageStream) return;
  const element = createMessageElement(message, currentUid, colorFn);
  messageStream.appendChild(element);
  messageStream.scrollTop = messageStream.scrollHeight;
}

composerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!messageInput) return;

  const text = messageInput.value;
  try {
    setComposerState(true);
    await sendMessage(text);
    messageInput.value = "";
    showFeedback("Delivered ✔");
  } catch (error) {
    console.error("Send message error", error);
    showFeedback(error.message || "Message failed.", "error");
  } finally {
    setComposerState(false);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  initializeAuth();
});
