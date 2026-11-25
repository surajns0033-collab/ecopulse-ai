# EcoPulse AI

> A privacy-conscious AI companion for everyday questions, live environmental data, civic complaints, community coordination, and grounded web research.

**Live application:** https://ecopulse-ai-ruby.vercel.app  
**Firebase:** Spark free plan · Mumbai region · production security rules

EcoPulse combines natural-language conversation with deterministic tools. Gemini handles open-ended reasoning and writing; trusted APIs provide live AQI, weather, maps, search sources, and authority contacts. The app never needs to invent a live reading or government contact.

## Highlights

- **Natural AI conversation** for writing, planning, study, technology, brainstorming, decisions, and supportive chat.
- **Live AQI and weather** from Open-Meteo with condition-based precautions.
- **Typo-tolerant global maps** through Open-Meteo, Photon, Nominatim, and Google Maps links.
- **Grounded web research** through Tavily with clickable citations.
- **Image understanding** through Gemini Vision with a private on-device CLIP fallback.
- **Opt-in OCR** for English, Hindi, and Marathi, with verification warnings.
- **Complaint assistance** with issue classification, authority routing, report previews, and editable drafts.
- **Privacy-minimized community** using a chosen public alias instead of an email address.
- **Guest mode** with read-only access to the public community channel.

## Architecture

```text
React UI
  ├── Intent router
  │    ├── AQI / weather        → Open-Meteo
  │    ├── Maps                 → Open-Meteo + Photon + Nominatim
  │    ├── Current web facts    → Tavily + cited links
  │    ├── Complaints           → verified authority directory
  │    └── General conversation → Gemini + safe fallbacks
  ├── Image pipeline
  │    ├── Gemini Vision
  │    ├── On-device CLIP
  │    └── Tesseract OCR (opt-in)
  └── Firebase
       ├── Google OAuth
       ├── Passwordless email links
       ├── Anonymous guest auth
       └── Firestore community messages

Vite development proxy / Vercel Functions
  └── keeps AI and search keys server-side
```

## Provider routing

| Need | Primary | Fallback |
|---|---|---|
| Conversation and drafting | Gemini | OpenRouter Free / keyless provider / deterministic guidance |
| Current web information | Tavily | Gemini Search grounding / honest unavailable response |
| Image understanding | Gemini Vision | On-device CLIP / user confirmation |
| OCR | Tesseract.js | Ask the user to type unclear text |
| AQI and weather | Open-Meteo | Honest unavailable state |

All provider secrets stay behind `/api/ai/chat`; they are not bundled into browser JavaScript.

## Privacy model

Firebase Authentication retains the account identifier required for Google or email sign-in. EcoPulse does not copy the email address into public Firestore documents.

A community post contains only:

- Firebase UID for ownership
- chosen public alias
- message text
- timestamp
- optional location label (defaults to `Global`)

It does **not** contain the user's email, phone number, Google display name, precise GPS coordinates, or private assistant history. Firestore access is governed by [`firestore.rules`](./firestore.rules). Anonymous users can read the public channel but cannot publish.

## Tech stack

- React 19 and Vite 8
- Firebase Authentication and Cloud Firestore
- Google Gemini API
- Tavily Search API
- Transformers.js / CLIP
- Tesseract.js
- Open-Meteo APIs
- OpenStreetMap geocoding and Google Maps links
- Vercel Functions

## Local development

Requirements: Node.js 20+, npm, a Firebase project, and a Gemini API key.

```bash
git clone https://github.com/surajns0033-collab/ecopulse-ai.git
cd ecopulse-ai
npm install
copy .env.example .env
npm run dev
```

Important environment variables:

```env
GEMINI_API_KEY=
TAVILY_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Never commit `.env`.

## Firebase

See [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md) for full setup details.

Required providers:

1. Google
2. Email/Password with **Email link (passwordless sign-in)** enabled
3. Anonymous

Deploy the included privacy rules:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

## Vercel

Production support is included:

- `api/ai/chat.js` — server-side AI/search orchestration
- `api/ai/health.js` — provider health endpoint
- `vercel.json` — API and SPA routing

Add secret values under Vercel Project Settings → Environment Variables. Add `VITE_FIREBASE_*` values as build-time variables. After deployment, add the Vercel hostname to Firebase Authentication → Settings → Authorized domains.

## Tested behavior

- Misspelled `sanfransico` resolves to San Francisco live data and map.
- Dynamic Udaipur and Tokyo maps.
- Polluted naala, waste burning, road obstruction, rubble, excavation material, and garbage images.
- Normal/non-issue images are rejected rather than forced into a complaint.
- OCR does not force text-only images into an environmental category.
- General leave-email drafting, sleep guidance, and casual conversation stay outside environmental routes.
- Tavily answers render clickable official sources.

Image classifications are probabilistic. The UI shows confidence and asks the user to verify a result before using a draft.

## Safety

- Complaints are never sent automatically.
- Unknown contacts are not guessed.
- Current-information questions require grounded sources.
- Emergency guidance distinguishes immediate danger from ordinary complaint routes.
- Medical guidance is general information, not diagnosis.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start local development with the AI proxy |
| `npm run build` | Create the production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run Oxlint |

## Status

EcoPulse AI is under active development. Before broad public use, review authority contacts periodically and define a moderation/retention policy for public community messages.
