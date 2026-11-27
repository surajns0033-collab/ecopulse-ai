# Verifying EcoPulse AI

EcoPulse helps families, schools and neighbourhoods make daily choices during winter smog. A confirmed city, the source time of the air reading and the user's stated routine determine the plan. [Urban Air Quality Assistant brief](https://promptwars.in/promptwarsVirtual.html)

## Try the household and school flows

Open the live app in a fresh browser session, select **Continue as Guest**, and enter either request.

> Make a smog action plan for Navi Mumbai, Maharashtra, India. I drive to work, cook with gas, and have a child.

> Make a smog plan for our school in Delhi, India.

The household plan connects commute and cooking choices to their effects. The school plan addresses outdoor assembly, exercise and idling at pickup. The default source provides modeled U.S. AQI. The plan shows its source time in UTC and searches the next 24 hours for a lower-exposure window between 06:00 and 18:00 local time. It labels missing or stale readings and gives a warning if the lowest daytime forecast still poses a risk.

Select **Explain these choices with AI** on either plan. The server-side AI proxy receives that plan's recommendations, their recorded impacts and the question. Each button remains attached to its original plan after another conversation turn. When the model is unavailable or reaches its output limit, Chat shows the recorded impacts. The live school example uses a short model prompt that asks for one exposure choice and one emissions choice. [Plan builder](../src/agent/smogPlan.js) · [AI explanation handler](../src/agent/environmentReplies.js)

## Submission benchmark

Run `npm ci` followed by `npm run benchmark:submission`. Each push and pull request runs the same command. GitHub Actions publishes a six-row summary, and each check prints its measurements in the log. If the production build fails, the two checks that need the build are marked blocked. Independent checks continue. A failed or blocked check makes the command exit unsuccessfully.

| Criterion | Impact | What the benchmark verifies |
| --- | --- | --- |
| Code Quality | High | Repository-wide lint passes with zero warnings. In the Chat coordinator, intent engine and smog modules, Oxlint limits each function to complexity 15 and 60 lines after excluding comments and blank lines. |
| Security | Medium | The dependency audit fails on moderate or higher advisories. A production Vite configuration test uses synthetic credentials to verify that AI keys stay out of browser settings. Firebase emulator tests check record ownership, public fields and registration permissions. |
| Efficiency | Medium | Each production JavaScript file and device-only Guest Chat startup must fit 500,000 bytes. The plan cache must make three environmental requests initially, zero more on repeat, and three more after expiry. |
| Testing | Low | Node tracks application and server modules exercised by the unit suite. Its minimum coverage is 80% lines, 75% branches and 85% functions. The runner executes unit, scenario, browser and rule tests separately. |
| Accessibility | Low | Chrome checks keyboard navigation, a single Tab stop and arrow keys in the shortcuts toolbar, focus return, a 320-pixel viewport, and automated WCAG A/AA rules across five interfaces. |
| Problem Statement Alignment | High | Fixed inputs test personalised travel, indoor air and school or community guidance. Two scenarios begin with a natural Chat request and verify the resulting advice for the stated location and household. The browser also exercises a selected plan's AI explanation and its offline fallback. |

The function limits and coverage floors are project regression thresholds. The challenge platform assigns its own score. The earlier coordinator measured 71 for cyclomatic complexity and 111 lines under the same lint settings. The intent detector measured 41 and 155 lines. Its work is now divided between explicit requests and keyword matching. The coordinator delegates city selection, photos and reply dispatch. [Coordinator baseline](https://github.com/surajns0033-collab/ecopulse-ai/actions/runs/46080141024) · [Intent baseline](https://github.com/surajns0033-collab/ecopulse-ai/actions/runs/46079336789)

## Run individual checks

Use Node.js 24 LTS, version 24.12 or later, and install the lockfile with `npm ci`. The browser suite uses installed Google Chrome. The rule tests use Java 21 and the Firebase Auth and Firestore emulators. CI supplies those dependencies.

| Command | Evidence |
| --- | --- |
| `npm run benchmark:submission` | Runs the complete benchmark and prints evidence for all six criteria. |
| `npm run lint` | Oxlint checks the repository and treats warnings as failures. |
| `npm run test:coverage` | Node tests exercise profile parsing, city corrections, environmental providers, the request cache, server request validation and AI responses. |
| `npm run benchmark` | Eleven fixed scenarios compare plans and their explanations. They include natural-language requests, a metro commuter who rules out a car, and a side-by-side check for a family with children. A separate cache test expects three environmental requests for the first plan, zero additional requests on repeat and three after cache expiry. These cases also run in the Node suite. |
| `npm audit --audit-level=moderate` | Checks the locked dependency tree against published advisories. |
| `npm run build` | Builds the production app. The Chat engine loads on the first request, and the on-device vision library loads when cloud photo analysis fails. |
| `npm run test:browser` | Tests a device-only production build with synthetic AQI, weather, geocoding and model responses. Covers Guest entry and exit, keyboard navigation, independent user sessions, private report links, AI plan selection and event registration across tabs. It also enforces production bundle budgets and exercises local photo inference. |
| `npm run test:rules` | Exercises owner-only report access, public post fields, organizer permissions, simultaneous event registration, last-seat contention and older private records in the emulators. |

For the Chrome suite, build with `VITE_FIREBASE_API_KEY=demo-key` or start from a clean checkout with no Firebase client credentials. Run `npm run build` and then `npm run test:browser`. The tests create a local Vite preview and block external browser traffic except for the configured test fixtures.

The recorded run passed 71 unit tests, one browser-configuration test, 12 smog benchmark checks, six browser/build checks, and ten Firebase rule tests. In the unit suite, exercised application and server modules reached 81.79% line, 76.92% branch and 86.38% function coverage. The dependency audit reported zero known vulnerabilities and lint reported zero errors and warnings. The accessibility suite applies the WCAG 2.0/2.1 A and AA rules supported by axe to sign-in, Chat at 320 pixels, the account menu, private report details and the meetup dialog. [Verified benchmark](https://github.com/surajns0033-collab/ecopulse-ai/actions/runs/46081062379)

### Chat startup and photo fallback

| Production-build measurement | Result |
| --- | ---: |
| Largest minified JavaScript file | 474,709 bytes |
| JavaScript loaded on device-only Guest Chat entry | 434,432 bytes |
| On-demand WebAssembly binary for photo inference | 14.26 MB |

The first two measurements use uncompressed bytes. CI checks both against 500,000 bytes. Vite's default warning threshold stays enabled. Guest Chat entry loads neither the classifier nor its model weights.

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

The published-event query uses the collection index on `meetups.status` and `meetups.date` in `firestore.indexes.json`.

### Existing Firestore installations

Deploy this revision's Firestore rules and index to the app's Firebase project. A previous installation may contain duplicate private registrations or a count that differs from the number of people. Until reconciliation finishes, those older events display an attendance-update message when someone tries to change their place.

With a short-lived Firestore administrator access token in `GOOGLE_OAUTH_ACCESS_TOKEN`, run `node server/migrateMeetupAttendance.mjs PROJECT_ID` to preview the number of older events and orphaned receipts. Add `--apply` to consolidate each person's records, preserve the earliest timestamp, rebuild the count and enable registration. Each event is committed atomically with preconditions. Running the command again skips completed events. Ambiguous public event codes require owner review. Orphaned receipts are reported and preserved. Keep administrator access on the maintenance machine.
