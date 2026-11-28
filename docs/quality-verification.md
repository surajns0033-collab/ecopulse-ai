# Verifying EcoPulse AI

EcoPulse helps families, schools and neighbourhoods make daily choices during winter smog. A confirmed city, the source time of the air reading and the user's stated routine determine the plan. [Urban Air Quality Assistant brief](https://promptwars.in/promptwarsVirtual.html)

## Try the daily planning flows

For the feature-branch checks, open a freshly built copy in a new browser session, select **Continue as Guest** and ask a question in your own words.

> How can I reduce my smog exposure during a delivery shift in Nagpur, India? I work outdoors and ride a scooter.

> I live in Ahmedabad, India. We cook with gas and have no purifier. How can we keep our kitchen air cleaner during smog?

> How can our housing society cut emissions during winter smog in Lucknow, India?

The delivery plan covers breaks during an outdoor shift. The kitchen plan respects the household’s equipment. The housing plan addresses idling and garden-waste burning. A current AQI answer identifies the station or model, scale and source time. The plan searches the next 24 hours for a lower-exposure window between 06:00 and 18:00 local time. A separate forecast question uses the requested local date or part of day. Stale and missing observations lead to an unavailable reading.

Select **Explain these choices with AI** on a plan. The server-side AI proxy receives that plan's recommendations, their recorded impacts and the question. Each button remains attached to its original plan after another conversation turn. When the model is unavailable or reaches its output limit, Chat shows the recorded impacts. The explanation requests one exposure choice and one emissions choice. [Plan builder](../src/agent/smogPlan.js) · [AI explanation handler](../src/agent/environmentReplies.js)

## Submission benchmark

Run `npm ci` followed by `npm run benchmark:submission`. Each push and pull request runs the same command. GitHub Actions publishes a six-row summary, and each check prints its measurements in the log. If the production build fails, the two checks that need the build are marked blocked. Independent checks continue. A failed or blocked check makes the command exit unsuccessfully.

| Criterion | Impact | What the benchmark verifies |
| --- | --- | --- |
| Code Quality | High | Oxlint treats primary lint warnings as errors. Each code, test and CSS module must have fewer than 150 physical lines. The core lint rules cap complexity at 15 and function length at 60 counted lines. The source-wide inventory also examines UI code. Its ceiling is 23 findings. Strict TypeScript covers the chat request, household and spelling logic, Firebase configuration, image checks and AI draft boundaries. |
| Security | Medium | The dependency audit fails on moderate or higher advisories. A production Vite configuration test uses synthetic credentials to verify that AI keys stay out of browser settings. Firebase emulator tests check record ownership, public fields and registration permissions. |
| Efficiency | Medium | Each production JavaScript file and device-only Guest Chat startup must fit 500,000 bytes. The plan cache must make three environmental requests initially, zero more on repeat, and three more after expiry. |
| Testing | Low | CI runs standalone Node test discovery. The unit coverage floors are 80% lines, 75% branches and 85% functions across exercised source. A named critical set has aggregate floors of 90%, 90% and 95%. Three mutation checks also require specific behavior tests to fail when the code is deliberately changed in a temporary copy. |
| Accessibility | Low | Chrome checks keyboard shortcuts, dialog focus and return, 320-pixel reflow, reduced-motion settings and axe’s WCAG 2.0–2.2 A/AA rules in the exercised states. It covers sign-in, Chat, AQI, drafts, reports, the public feed, navigation and meetup creation. Native screen-reader and full browser-zoom checks are tracked separately. |
| Problem Statement Alignment | High | Family, school, commuter and community scenarios check household details, stated equipment, source times and the difference between exposure and emissions. Chrome types misspelled English and Hinglish questions and exercises local-hour forecasts, original message text, reviewed photo drafts and event registration. |

The competition platform assigns the official score. These project thresholds detect code regressions. A full run prints its exit codes, byte counts, test totals, coverage and the remaining function warnings. The historical audit and branch report give the baseline and candidate measurements. [Baseline](quality/BASELINE.md) · [Readiness report](quality/READINESS.md)

## Run individual checks

Use Node.js 24 LTS, version 24.12 or later, and install the lockfile with `npm ci`. The browser suite uses installed Google Chrome. The rule tests use Java 21 and the Firebase Auth and Firestore emulators. CI supplies those dependencies.

| Command | Evidence |
| --- | --- |
| `npm run benchmark:submission` | Runs the complete benchmark and prints evidence for all six criteria. |
| `npm run lint` | Oxlint checks the repository and treats warnings as failures. |
| `npm run quality:modules` | Counts physical lines in all first-party source, tests, configuration code and styles. |
| `npm run quality:inventory` | Lists long or complex functions in `src`, `server` and `api`. CI fails above 23. Each annotation identifies the file and function. |
| `npm run typecheck` | Checks the API and application boundaries listed in `package.json` with `--strict --checkJs --noEmit`. |
| `npm test` | Runs the standalone Node test discovery entry point, including synthetic provider failures and chat regressions. |
| `npm run test:coverage` | Prints coverage from the standalone Node suite. The full benchmark runs a separate unit coverage group so scenario and browser results remain identifiable. |
| `npm run coverage:critical` | Checks the explicit paths in `tests/criticalCoverage.mjs` together. Browser rendering, operating-system speech output and deployed cloud behavior need separate verification. |
| `node tests/mutationChecks.mjs` | Tests reject a wrong forecast day, reversed exhaust-hood guidance and an unsafe relaxation of photo confidence. |
| `npm run benchmark` | Eighteen scenarios check the advice and its direct impacts. Route controls cover definitions, readings and news. The cache test expects three environmental requests initially, zero additional requests on repeat and three more after expiry. |
| `npm audit --audit-level=moderate` | Checks the locked dependency tree against published advisories. |
| `npm run build` | Builds the production app. The Chat engine loads on the first request, and the on-device vision library loads when cloud photo analysis fails. |
| `npm run test:browser` | Tests a device-only production build with synthetic AQI, weather, geocoding and model responses. Covers Guest entry and exit, keyboard navigation, independent user sessions, private report links, AI plan selection and event registration across tabs. It also enforces production bundle budgets and exercises local photo inference. |
| `npm run test:rules` | Exercises owner-only report access, public post fields, organizer permissions, simultaneous event registration, last-seat contention and older private records in the emulators. |

For the Chrome suite, build with `VITE_FIREBASE_API_KEY=demo-key` or start from a clean checkout with no Firebase client credentials. Run `npm run build` and then `npm run test:browser`. The tests create a local Vite preview and block external browser traffic except for the configured test fixtures.

### Chat startup and photo fallback

The bundle regression measures uncompressed bytes for the largest emitted JavaScript file and total JavaScript requested at device-only Guest Chat entry. Each must stay within 500,000 bytes. It also checks that Guest entry fetches neither the classifier weights nor WebAssembly. [Bundle and browser check](../tests/vision.browser.mjs) · [Recorded measurements](quality/READINESS.md)

The photo regression uploads a synthetic image through Chat and simulates a cloud outage. Chrome executes the same WebAssembly runtime the app serves, using a small test model whose labels tie. The expected result asks the user to describe the image. This checks the fallback and its handling of uncertainty. Evaluating accuracy on real pollution photos requires labeled examples. The first use of the production fallback also fetches approximately 154 MB of quantized model weights, which the browser can cache for later photos. [Browser test](../tests/vision.browser.mjs) · [Production checkpoint](https://huggingface.co/Xenova/clip-vit-base-patch32/tree/main/onnx)

## Where to investigate a regression

| Symptom | First checks |
| --- | --- |
| The city, routine or risk level is wrong | Reproduce the turn in `tests/chatPlaces.test.js` and the matching household or school in `tests/submissionScenarios.test.js`. Check the reading's timestamp and the forecast's time zone. |
| Chat explains a different plan or an unrelated detail | The chosen plan supplies its own actions to the AI handler. The Chrome test selects an earlier school plan after creating a neighbourhood plan and checks the single outgoing message, a token-limited response and a provider outage. |
| A private report fails to open | Check both its document ID and its public-facing code under the owner's account. Emulator tests also read these as a second user. Device-only checks include older saved records. |
| Provider requests or load size increase | The benchmark counts environmental requests independently of network latency. The Chrome suite measures Guest Chat startup and the largest emitted JavaScript file. Its photo test records which assets load after upload. |
| The keyboard loses focus or text becomes hard to read | Reproduce the screen in Chrome with reduced motion. The suite checks Escape, reverse Tab, focus return and every AQI badge's text contrast. |

The chat router delegates to modules for environmental questions, general replies, civic reports, photos and community actions. Cloud and device report lookup share one service. The server checks request sizes, roles, options and photo signatures before forwarding requests. The Firestore SDK's gRPC dependency is pinned to a patched version, with its compatibility exercised by the emulator suite. [Chat router](../src/agent/agentOrchestrator.js) · [Report storage](../src/services/reportRecords.js) · [Request validation](../server/chatRequest.js)

## Meetup registration

In Events or a Chat event card, **Join event** reserves one place and **Cancel my place** releases it. The Firestore transaction updates the public count and the attendee's private registration together. Anonymous Firebase accounts can join. Publishing a cloud event requires an email or Google account. Device-only builds identify local saves.

Date-ordered discovery uses the indexes on published status and date, with an additional index for category-filtered results. Chat checks each page for a matching venue before reaching its result limit. [Index definitions](../firestore.indexes.json)

### Existing Firestore installations

Deploy this revision's Firestore rules and index to the app's Firebase project. A previous installation may contain duplicate private registrations or a count that differs from the number of people. Until reconciliation finishes, those older events display an attendance-update message when someone tries to change their place.

With a short-lived Firestore administrator access token in `GOOGLE_OAUTH_ACCESS_TOKEN`, run `node server/migrateMeetupAttendance.mjs PROJECT_ID` to preview the number of older events and orphaned receipts. Add `--apply` to consolidate each person's records, preserve the earliest timestamp, rebuild the count and enable registration. Each event is committed atomically with preconditions. Running the command again skips completed events. Ambiguous public event codes require owner review. Orphaned receipts are reported and preserved. Keep administrator access on the maintenance machine.
