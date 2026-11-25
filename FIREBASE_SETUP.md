# EcoPulse AI Firebase setup

EcoPulse uses a separate Firebase project. Do not connect it to an unrelated app's project.

## Authentication providers

Enable these in **Firebase Console → Authentication → Sign-in method**:

1. **Google**
2. **Email/Password**, with **Email link (passwordless sign-in)** enabled
3. **Anonymous** (used only for Guest mode)

Firebase does not provide a native numeric email OTP in the standard web SDK. EcoPulse uses Firebase's secure, passwordless email link. Google may request its own MFA/OTP according to the user's Google Account settings.

## Privacy model

- Firebase Authentication retains the email required to identify an email/Google account.
- EcoPulse does **not** copy email addresses into Firestore community documents.
- A community post stores only the Firebase UID, chosen public name, message, timestamp, and optional location label.
- The chosen community name is kept in that browser's local storage and copied into posts; there is no public profile document.
- Guests can read the public channel but cannot publish.

## Web app configuration

Register a Web app, then place its values in `.env`:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Add every deployed host under **Authentication → Settings → Authorized domains**. Keep `localhost` for local development.

## Firestore

Create the default Firestore database, then deploy the included privacy rules:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

The included rules make Guest community access read-only and reject email fields from public posts.
