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

**Local results:** 57 tests passed; the production build succeeded. Lint completed without errors, with 16 existing warnings. The offline Chromium smoke test uses mocked readings and geocoding, so it does not measure live provider availability.

**Landing-page measurement:** Two local production builds with the same settings, before and after deferring Firestore, loaded **253.6 KiB → 117.6 KiB** of compressed JavaScript before Guest entry (**53.6% less**). This sums gzip sizes of the JavaScript requested by Chromium on a 390 px viewport; it is not a live latency or leaderboard score.
