import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";

function normalizeEmail(email = "") {
  return email.trim().toLowerCase();
}

async function ensureProfileDocument(user) {
  if (!user?.uid) return;
  const profileRef = doc(db, "profiles", user.uid);
  const snapshot = await getDoc(profileRef);
  const payload = {
    displayName: user.displayName || user.email?.split("@")[0] || "Social0x1 user",
    email: user.email ?? "",
    emailLowercase: user.email ? normalizeEmail(user.email) : "",
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };
  if (!snapshot.exists()) {
    payload.createdAt = serverTimestamp();
  }
  await setDoc(profileRef, payload, { merge: true });
}

async function createConversationForInvite({ inviteData, inviteId, inviteRef, invitee }) {
  const inviterId = inviteData.inviterId;
  if (!inviterId || !invitee?.uid) {
    return;
  }

  const members = [inviterId, invitee.uid];
  const sorted = members.slice().sort();
  const memberHash = sorted.join("_");

  const conversationsRef = collection(db, "conversations");
  const existingQuery = query(conversationsRef, where("memberHash", "==", memberHash), limit(1));
  const existingSnap = await getDocs(existingQuery);

  let conversationId = null;

  if (!existingSnap.empty) {
    conversationId = existingSnap.docs[0].id;
  } else {
    const inviterProfile = inviteData.inviterProfile ?? {};
    const inviteeProfile = {
      displayName: invitee.displayName || invitee.email || "You",
      email: invitee.email || "",
    };
    const isSecret = inviteData.mode === "secret";
    const payload = {
      members,
      memberHash,
      memberProfiles: {
        [inviterId]: {
          displayName: inviterProfile.displayName || "Contact",
          email: inviterProfile.email || "",
        },
        [invitee.uid]: inviteeProfile,
      },
      mode: isSecret ? "secret" : "general",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: isSecret ? "🔒 Secret chat active" : "",
      lastMessageAt: isSecret ? serverTimestamp() : null,
      lastSender: "",
    };
    const docRef = await addDoc(conversationsRef, payload);
    conversationId = docRef.id;
  }

  await updateDoc(inviteRef, {
    status: "accepted",
    acceptedAt: serverTimestamp(),
    conversationId,
  });
}

async function processPendingInvites(user) {
  if (!user?.email) {
    return;
  }
  const emailLowercase = normalizeEmail(user.email);
  const invitesRef = collection(db, "invites");
  const invitesQuery = query(invitesRef, where("emailLowercase", "==", emailLowercase), where("status", "==", "pending"));
  const snapshot = await getDocs(invitesQuery);
  if (snapshot.empty) {
    return;
  }

  const operations = snapshot.docs.map((docSnap) =>
    createConversationForInvite({
      inviteData: docSnap.data(),
      inviteId: docSnap.id,
      inviteRef: docSnap.ref,
      invitee: user,
    })
  );

  await Promise.allSettled(operations);
}

function observeAuthState({ onChange, onError } = {}) {
  return onAuthStateChanged(
    auth,
    async (user) => {
      try {
        if (user) {
          await ensureProfileDocument(user);
          await processPendingInvites(user);
        }
        if (typeof onChange === "function") {
          onChange(user);
        }
      } catch (error) {
        console.error("Auth lifecycle error", error);
        if (typeof onError === "function") {
          onError(error);
        }
      }
    },
    (error) => {
      console.error("Auth observer error", error);
      if (typeof onError === "function") {
        onError(error);
      }
    }
  );
}

async function signOutUser() {
  await signOut(auth);
}

export { auth, db, ensureProfileDocument, normalizeEmail, observeAuthState, processPendingInvites, signOutUser };
