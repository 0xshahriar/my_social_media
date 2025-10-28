# Vibrant Chat

A minimalistic yet vibrant messenger-style social media web application built with HTML, CSS, JavaScript, and Firebase. It supports real-time conversations, typing indicators, user presence, and account management – all from the browser.

## Features

- 🔐 Email & password authentication with friendly onboarding
- 💬 Direct one-to-one conversations powered by Cloud Firestore
- ⚡ Real-time updates for messages, typing indicators, and conversation lists
- 🟢 Presence tracking that shows when contacts were last active
- ✨ Personal profiles with custom accent colors and avatars
- 📨 Start new chats by inviting existing users via their email address
- 📱 Responsive layout optimized for both desktop and mobile screens

## Project structure

```
my_social_media/
├── index.html          # Application markup
├── styles.css          # Minimal yet vibrant design
├── app.js              # Front-end Firebase logic and UI management
├── firebase-config.js  # Your Firebase project configuration (replace placeholders)
└── LICENSE
```

## Getting started

1. **Create a Firebase project**
   - Visit the [Firebase Console](https://console.firebase.google.com/) and create a new project.
   - Enable **Authentication** (Email/Password provider) and **Cloud Firestore** in production or test mode.

2. **Configure web credentials**
   - From *Project settings → General → Your apps*, add a new Web app if you do not already have one.
   - Copy the configuration object and replace the placeholder values in `firebase-config.js`.

3. **Deploy or run locally**
   - You can open `index.html` directly in the browser for quick testing or serve the folder via a simple HTTP server (e.g. `npx serve`).
   - Ensure the domain you use is added to the Firebase authentication authorized domains list.

4. **Use the app**
   - Register a new account, customize your profile color, and invite friends by their email addresses to start chatting in real time.

## Firestore data model

```text
users (collection)
  └── {uid}
        displayName: string
        email: string
        accentColor: string (hex)
        lastActive: timestamp
        createdAt: timestamp

conversations (collection)
  └── {conversationId}
        participantIds: string[]
        participantKey: string
        participants: map<uid, profile data>
        typing: map<uid, boolean>
        lastMessage: { text, senderId, createdAt }
        lastMessageAt: timestamp
        createdAt: timestamp
        messages (subcollection)
          └── {messageId}
                text: string
                senderId: string
                createdAt: timestamp
```

## Customization tips

- Update `styles.css` to tweak colors or layout while keeping the glassmorphism aesthetic.
- Add more profile settings by extending the profile dialog in `index.html` and handling the data in `app.js`.
- To support group chats, store more than two participant IDs and adjust the queries that depend on the `participantKey`.

## License

This project is licensed under the [MIT License](./LICENSE).
