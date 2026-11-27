# EcoPulse AI — code submission verification

## Hack2Skill PromptWars Virtual — Challenge 06

EcoPulse helps households plan around winter smog for the [Urban Air Quality Assistant brief](https://promptwars.in/promptwarsVirtual.html). In Guest Chat, try:

> Make a smog action plan for Navi Mumbai, Maharashtra, India. I drive to work, cook with gas, and have a child.

> Suggest a low-emission daily routine for Bengaluru, Karnataka, India. I take the metro and cook with induction.

Compare the city and commute/cooking advice, not a fixed AQI number. You can also use **Set my city to …**, choose **Smog Action Plan**, then share a routine or say **skip**. Each section distinguishes reducing exposure from reducing emissions at the source. The plan uses explicit details and environmental data rather than model guesses; the existing generative chat handles open-ended questions and photo analysis.

`src/agent/smogPlan.js` builds the plan from the stated lifestyle and verified city. The default Open-Meteo/CAMS source provides **modeled U.S. AQI**, not a CPCB station measurement. An undated or older-than-two-hours reading is not used as current. The plan searches the next 24 hours for the lowest modeled AQI between 06:00 and 18:00 local time and warns if even that slot is unhealthy. With no current reading, it still gives general guidance without inventing a value.

## Verification

```sh
npm test
npm run lint
npm run build
```

| Rubric area | Evidence to review |
| --- | --- |
| Code Quality | `smogPlan.js` separates plan rules from Chat routing. `server/chatRequest.js` keeps HTTP input validation separate from provider calls. |
| Problem Statement Alignment | `tests/chatPlaces.test.js` covers city+routine in one message and verifies city corrections before using new data. `tests/smogPlan.test.js` covers different routines, sensitive households, escalating AQI thresholds, stale or unavailable readings, and forecast timing using synthetic data. |
| Security | `tests/chatProxy.test.js` checks rejected requests, valid Guest and photo requests, search-history isolation and generic errors. Model credentials are server-side; use `GEMINI_API_KEY`, not a `VITE_` key. The endpoint still allows Guest access and these limits are not a distributed rate limiter. |
| Efficiency | The environmental cache is bounded and expires data. Provider attempts share a deadline, photos are sent once per request to a provider, and Firestore loads after app entry rather than on the signed-out landing page. |
| Testing | The Node tests use fixtures and mock external providers; they do not require paid calls, credentials or a live database. |
| Accessibility | Chat has a named message log, a separate progress announcement, visible keyboard focus and reduced-motion support. Tab to controls and use Enter to send or Shift+Enter for a new line. |

**Earlier local run at `3b758da8`.** The suite passed 57 tests, the production build succeeded and lint reported 16 warnings. The offline Chromium smoke test uses mocked readings and geocoding, so it does not measure live provider availability.

**Landing-page measurement:** Two local production builds with the same settings, before and after deferring Firestore, loaded **253.6 KiB → 117.6 KiB** of compressed JavaScript before Guest entry (**53.6% less**). This sums gzip sizes of the JavaScript requested by Chromium on a 390 px viewport; it is not a live latency or leaderboard score.

## Submission checks

Use Node.js 22.12 or later on a supported LTS release. Install from the lockfile with `npm ci`.

| Rubric area | How to check EcoPulse |
| --- | --- |
| Code quality (high) | `npm run verify` runs lint, the Node suite and the production build. Profile parsing, advice generation and environmental data remain independently testable. |
| Problem statement alignment (high) | `npm run benchmark` exercises location, commute, cooking, children's exposure, indoor air, community recommendations and missing or stale AQI. Each of the six fixed household or community scenarios checks the advice and five explanations of direct impact. |
| Security (medium) | With Java 21 installed, `npm run test:rules` starts local Auth and Firestore emulators for an isolated demo project. It tests owner edits, privacy, allowed public post fields and Guest permissions. The regular Node suite covers the chat endpoint's input limits and generic errors. |
| Efficiency (medium) | The seventh benchmark check counts data requests. It expects three for a first plan, zero additional calls for an immediate repeat and three after the cache expires. The repeated plan must match the first. |
| Testing (low) | `npm run test:coverage` reports native Node coverage. The cooking regression covers a missing appliance, coordinated denials, a later affirmative mention and Hindi input. The verification workflow also runs the build and emulator checks. |
| Accessibility (low) | Check Guest Chat, Community and Events at a 390 px viewport. Try keyboard input, active navigation, filter labels, the chat log and reply announcements. Mobile zoom is enabled and the dark green used for active text contrasts with white at 5.02:1. |

Before the cooking correction, the published code at `3b758da8` passed five of the six fixed smog scenarios. A family saying it cooked with gas and had no induction stove received an induction profile. The corrected parser passed all six scenarios in a browser fixture run. It gives that household gas-specific ventilation and burner-use advice.

The deterministic plan and generative follow-up are separate paths. In a live Guest Chat check, the model-backed reply explained that damp dusting reduces indoor particle exposure and carpooling reduces travel emissions. The proxy identified its provider and the answer appeared in the chat log.

Start with incorrect advice, private data access and broken checks when triaging a new revision. The longer-term cleanup is to separate photo and report handling from the main chat orchestrator.
