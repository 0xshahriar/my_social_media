# Social0x1

Social0x1 is a Firebase-backed, private messenger designed with a vibrant yet minimalistic interface. This repository contains the front-end implementation written in HTML, CSS, and JavaScript, along with a detailed guide for setting up Firebase services securely so every conversation stays between the people participating in it.

## Index

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Setup Guide](#setup-guide)
   1. [Clone the Repository](#1-clone-the-repository)
   2. [Install Development Dependencies (Optional)](#2-install-development-dependencies-optional)
   3. [Configure Firebase](#3-configure-firebase)
   4. [Serve the Application Locally](#4-serve-the-application-locally)
   5. [Deploying to Production](#5-deploying-to-production)
5. [Security Considerations](#security-considerations)
6. [Testing the Experience](#testing-the-experience)
7. [Project Structure](#project-structure)
8. [Contributing](#contributing)
9. [License](#license)

## Project Overview

Social0x1 delivers real-time chat with Firebase Authentication and Cloud Firestore as the backbone. The UI emphasizes clean typography, ample whitespace, and a vibrant accent palette while supporting light, dark, and system-driven themes.

## Architecture

- **Frontend:** Vanilla HTML, CSS, and JavaScript served as static assets.
- **Backend:** Firebase Authentication (email/password) and Cloud Firestore storing `profiles`, `conversations`, and per-conversation `messages` subcollections.
- **Security:** Principle of least privilege enforced with granular Firebase Security Rules, scoped Firestore queries, and client-side validation to reduce attack surface.

## Prerequisites

- A Firebase project with Authentication and Cloud Firestore enabled.
- Node.js ≥ 18 if you plan to use the Firebase CLI for local hosting or deployment.
- A modern browser that supports ES modules.

## Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/your-account/social0x1.git
cd social0x1
```

### 2. Install Development Dependencies (Optional)

This project has no mandatory build step. For convenience when running a local HTTPS server or linting, you can install tools via `npm`:

```bash
npm install --global firebase-tools serve
```

### 3. Configure Firebase

1. Visit the [Firebase console](https://console.firebase.google.com/) and create a project (or reuse an existing one).
2. Enable **Authentication** and turn on the **Email/Password** provider. (You can add additional providers later, but the UI ships with email/password flows.)
3. Enable **Cloud Firestore** in production mode and set regional preferences close to your user base.
4. From **Project Settings → General**, register a web app named `Social0x1` and copy the configuration object.
5. Duplicate the provided template:
   ```bash
   cp config/firebase-config.example.js config/firebase-config.js
   ```
6. Replace each placeholder in `config/firebase-config.js` with the values from the Firebase console. Never commit your secrets to version control.
7. Update your Firestore security rules to the example in [`security/firestore.rules`](security/firestore.rules) to enforce authenticated access, per-conversation privacy, and payload validation.
8. (Optional but recommended) Add a composite index for the `conversations` collection on the fields `members` (array contains) and `memberHash` equality if the Firebase console requests it during testing.

### 4. Serve the Application Locally

You can host the static files however you prefer. Two common approaches:

- **Using Firebase CLI (recommended for parity with production):**
  ```bash
  firebase login
  firebase serve --only hosting
  ```
- **Using a lightweight static server (e.g., `serve`):**
  ```bash
  serve .
  ```

Open the reported URL (usually `http://localhost:5000/`) in your browser.

### 5. Deploying to Production

1. Configure Firebase Hosting in the console if you have not already.
2. Run `firebase init hosting` and select `dist` as the public directory if you adopt a build pipeline, or simply `.` for this repository.
3. Ensure `config/firebase-config.js` is excluded via `.firebaseignore` and `.gitignore` if you add one.
4. Deploy with:
   ```bash
   firebase deploy --only hosting
   ```

## Security Considerations

- **Authentication required:** Email/password sign-in gates every read/write, and profiles are created per user to prevent email reuse exploits.
- **Conversation scoping:** Firestore rules restrict `conversations` and `messages` so only listed members can read or write data, and payloads are validated for shape and length.
- **Client-side validation:** Inputs are trimmed, length-limited, and rendered via `textContent` to prevent XSS or injection attacks.
- **Error transparency:** All Firebase interactions are wrapped in guarded async functions that surface actionable feedback to the user without leaking stack traces.
- **Transport security:** Always serve via HTTPS (Firebase Hosting does this automatically).
- **Dependency-free frontend:** No third-party scripts beyond Firebase SDK to reduce supply-chain risk.

## Testing the Experience

1. Create an account from the **Sign Up** tab or log in with an existing email/password pair.
2. Use the **Start private chat** form to invite another registered email and confirm a new conversation appears.
3. Exchange messages between two different browser sessions and verify the conversation stays private to those accounts.
4. Toggle light/dark/system themes to ensure color contrast remains high.
5. Disable the network tab in your dev tools to confirm graceful error handling.

## Project Structure

```
├── assets/
│   └── icons.svg
├── config/
│   ├── firebase-config.example.js
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── auth.js
│   └── theme.js
├── security/
│   └── firestore.rules
├── index.html
├── README.md
└── LICENSE
```

## Contributing

1. Fork the repository and create a feature branch.
2. Follow the code style enforced by ESLint/Prettier if you add them.
3. Ensure Firebase credentials are never committed.
4. Submit a PR describing your changes and test coverage.

## License

Social0x1 is distributed under the terms of the [MIT License](LICENSE).

