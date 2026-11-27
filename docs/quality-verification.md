# Verifying EcoPulse AI

EcoPulse helps families, schools and neighbourhoods make daily choices during winter smog. A confirmed city, the source time of the air reading and the user's stated routine determine the plan. [Urban Air Quality Assistant brief](https://promptwars.in/promptwarsVirtual.html)

## Try the household and school flows

Open the live app in a fresh browser session, select **Continue as Guest**, and enter either request.

> Make a smog action plan for Navi Mumbai, Maharashtra, India. I drive to work, cook with gas, and have a child.

> Make a smog plan for our school in Delhi, India.

The household plan connects commute and cooking choices to their effects. The school plan addresses outdoor assembly, exercise and idling at pickup. The default source provides modeled U.S. AQI. The plan shows its source time in UTC and searches the next 24 hours for a lower-exposure window between 06:00 and 18:00 local time. It labels missing or stale readings and gives a warning if the lowest daytime forecast still poses a risk.

Select **Explain these choices with AI** on either plan. The server-side AI proxy receives that plan's recommendations, their recorded impacts and the question. Each button remains attached to its original plan after another conversation turn. When the model is unavailable or reaches its output limit, Chat shows the recorded impacts. The live school example uses a short model prompt that asks for one exposure choice and one emissions choice. [Plan builder](../src/agent/smogPlan.js) · [AI explanation handler](../src/agent/environmentReplies.js)

## Run the checks

Use Node.js 24 LTS, version 24.12 or later, and install the lockfile with `npm ci`. The browser suite uses installed Google Chrome. The rule tests use Java 21 and the Firebase Auth and Firestore emulators. CI supplies those dependencies.

| Command | Evidence |
| --- | --- |
| `npm run lint` | Oxlint checks the repository and treats warnings as failures. |
| `npm run test:coverage` | Node tests exercise profile parsing, city corrections, environmental providers, the request cache, server request validation and AI responses. |
| `npm run benchmark` | Eight fixed smog scenarios compare advice and impact explanations. A ninth check expects three environmental requests for the first plan, zero additional requests on repeat and three after cache expiry. These cases also run in the Node suite. |
| `npm audit --audit-level=high` | Checks the locked dependency tree against published advisories. |
| `npm run build` | Builds the production app. The photo workflow and on-device vision library load on demand. |
| `npm run test:browser` | Tests a device-only production build with synthetic AQI, weather, geocoding and model responses. Covers Guest entry and exit, keyboard navigation, independent user sessions, private report links, AI plan selection and event registration across tabs. |
| `npm run test:rules` | Exercises owner-only report access, public post fields, organizer permissions, simultaneous event registration, last-seat contention and older private records in the emulators. |

For the Chrome suite, build with `VITE_FIREBASE_API_KEY=demo-key` or start from a clean checkout with no Firebase client credentials. Run `npm run build` and then `npm run test:browser`. The tests create a local Vite preview and block external browser traffic except for the configured test fixtures.

**Verified run.** All 73 Node tests, four Chrome tests and ten emulator tests passed. Lint reported zero warnings and zero errors. The dependency audit reported zero known vulnerabilities in the installed tree. The production build succeeded and Vite reported two minified JavaScript chunks over 500 kB. The automated accessibility scans covered sign-in, Chat at 320 pixels, the account menu, a private report and the meetup dialog. They check WCAG 2.0/2.1 A and AA rules supported by axe. Screen-reader usability also benefits from manual testing. [Verification run](https://github.com/surajns0033-collab/ecopulse-ai/actions/runs/46068044074)

## Where to investigate a regression

| Symptom | First checks |
| --- | --- |
| The city, routine or risk level is wrong | Reproduce the turn in `tests/chatPlaces.test.js` and the matching household or school in `tests/submissionScenarios.test.js`. Check the reading's timestamp and the forecast's time zone. |
| Chat explains a different plan or an unrelated detail | The chosen plan supplies its own actions to the AI handler. The Chrome test selects an earlier school plan after creating a neighbourhood plan and checks the single outgoing message, a token-limited response and a provider outage. |
| A private report fails to open | Check both its document ID and its public-facing code under the owner's account. Emulator tests also read these as a second user. Device-only checks include older saved records. |
| Provider requests or load size increase | The benchmark counts environmental requests independently of network latency. The production build lists compressed asset sizes. |
| The keyboard loses focus or text becomes hard to read | Reproduce the screen in Chrome with reduced motion. The suite checks Escape, reverse Tab, focus return and every AQI badge's text contrast. |

The chat router delegates to modules for environmental questions, general replies, civic reports, photos and community actions. Cloud and device report lookup share one service. The server checks request sizes, roles, options and photo signatures before forwarding requests. The Firestore SDK's gRPC dependency is pinned to a patched version, with its compatibility exercised by the emulator suite. [Chat router](../src/agent/agentOrchestrator.js) · [Report storage](../src/services/reportRecords.js) · [Request validation](../server/chatRequest.js)

## Meetup registration

In Events or a Chat event card, **Join event** reserves one place and **Cancel my place** releases it. The Firestore transaction updates the public count and the attendee's private registration together. Anonymous Firebase accounts can join. Publishing a cloud event requires an email or Google account. Device-only builds identify local saves.

The published-event query uses the collection index on `meetups.status` and `meetups.date` in `firestore.indexes.json`.

### Existing Firestore installations

Deploy this revision's Firestore rules and index to the app's Firebase project. A previous installation may contain duplicate private registrations or a count that differs from the number of people. Until reconciliation finishes, those older events display an attendance-update message when someone tries to change their place.

With a short-lived Firestore administrator access token in `GOOGLE_OAUTH_ACCESS_TOKEN`, run `node server/migrateMeetupAttendance.mjs PROJECT_ID` to preview the number of older events and orphaned receipts. Add `--apply` to consolidate each person's records, preserve the earliest timestamp, rebuild the count and enable registration. Each event is committed atomically with preconditions. Running the command again skips completed events. Ambiguous public event codes require owner review. Orphaned receipts are reported and preserved. Keep administrator access on the maintenance machine.
