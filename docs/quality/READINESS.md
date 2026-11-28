# EcoPulse AI readiness review

**Verified on 28 November 2026.** The feature branch is `air-quality-updates`. All 14 checks in the submission benchmark passed on implementation commit `d1070dd9e5e30a3709603ec2ad70acdaf478705e`. Standalone Node test discovery also passed. [Latest branch checks](https://github.com/surajns0033-collab/ecopulse-ai/actions/workflows/verify.yml?query=branch%3Aair-quality-updates) · [Tested commit](https://github.com/surajns0033-collab/ecopulse-ai/commit/d1070dd9e5e30a3709603ec2ad70acdaf478705e) · [CI run](https://github.com/surajns0033-collab/ecopulse-ai/actions/runs/46150391538) · [Full command output](https://github.com/surajns0033-collab/ecopulse-ai/commit/d1070dd9e5e30a3709603ec2ad70acdaf478705e/checks/140995531585/logs)

## Official starting point

The last competition result supplied by the project owner was **95.19/100** on Attempt 2. The portal did not identify the graded commit. The internal benchmark reports pass, fail or blocked for engineering checks. [Baseline audit](BASELINE.md)

| Priority | Criterion | Last official score |
| --- | --- | ---: |
| P0 · high impact | Code Quality | 86 |
| P0 · high impact | Problem Statement Alignment | 99 |
| P1 · medium impact | Security | 98 |
| P1 · medium impact | Efficiency | 100 |
| P2 · low impact | Testing | 94 |
| P2 · low impact | Accessibility | 96 |

## Measurements

| Measurement | Baseline on `b2e0a9b` | Candidate on `d1070dd` |
| --- | ---: | ---: |
| Primary lint warnings / errors | 0 / 0 | 0 / 0 |
| Source-wide function complexity / length findings | 25 / 20 | 10 / 13 |
| Total maintainability findings | 45 | 23 |
| Modules within the file limit / largest physical line count | 175 / 149 | 209 / 148 |
| Broad unit coverage, lines / branches / functions | 86.80% / 79.18% / 87.79% | 91.04% / 83.86% / 93.12% |
| Named critical coverage, lines / branches / functions | No corresponding baseline gate | 98.93% / 91.57% / 96.70% |
| Browser/build checks / Firestore emulator tests | 8 / 10 | 14 / 13 |
| Largest emitted JavaScript file | 474,640 bytes | 477,071 bytes |
| JavaScript loaded on device-only Guest Chat entry | 436,343 bytes | 437,897 bytes |
| Vite production build, one runner sample | 611 ms | 627 ms |
| First plan / repeat / first plan after cache expiry | 3 / 0 / 3 additional requests | 3 / 0 / 3 additional requests |

JavaScript grew by 2,431 bytes for the largest file and 1,554 bytes for Guest startup. The two independent 500,000-byte ceilings leave 22,929 and 62,103 bytes of headroom respectively. The measured build emitted `collections-B3P3NR5V.js` as its largest JavaScript asset. Browser networking confirmed that Guest entry skips vision weights and WebAssembly. The photo test ran the actual on-demand WASM runtime against a small deterministic test model. [Baseline log](https://github.com/surajns0033-collab/ecopulse-ai/commit/b2e0a9b533bef2e537c411afef6f2b3152865c59/checks/140960909839/logs) · [Candidate measurements](https://github.com/surajns0033-collab/ecopulse-ai/commit/d1070dd9e5e30a3709603ec2ad70acdaf478705e/checks/140995531585/logs)

The broad unit numbers cover modules exercised by the unit coverage run. The critical gate measures 24 named modules together against floors of 90% lines, 90% branches and 95% functions. The suites cover different paths and their percentages have different denominators. The standalone run and the critical run execute many of the same tests. [Coverage paths](../../tests/criticalCoverage.mjs) · [Benchmark configuration](../../tests/submissionBenchmark.mjs)

## Audit findings and verified changes

The initial audit records severity, evaluator impact, functions, code evidence and regression risk for all 17 findings. The corresponding branch changes are listed below. [Full audit](BASELINE.md)

| ID | Initial finding | Change and verification |
| --- | --- | --- |
| CQ-01 | Repeated intent decisions, false substring matches and an overloaded general-chat handler | The orchestrator carries the classification for the current message. A resumed message is classified separately. Intent, keyword recognition, place resolution and reply context now have separate responsibilities. The general handler is below both source inventory limits. English, Hindi and Hinglish route controls passed. |
| CQ-02 | A device or rejected write could look like an account save | Device and account drafts return their actual save destination. Rejected writes reach the caller. Tests verify both destinations and storage failures. Chrome reads the edited draft back from device storage. |
| CQ-03 | Strict typing stopped at the request boundary and unused direct packages remained | Strict checks now include spelling, household profiles, Firebase settings, image dimensions, model objects and photo/event previews. The unused `@google/generative-ai`, `axios` and `uuid` direct dependencies were removed. Server-side Gemini requests use the existing HTTP adapter. `image-size` supplies shared format and dimension checks. |
| CQ-04 | Photo work and downstream requests lost cancellation | Chat carries its signal through place lookup, the model proxy, vision and OCR. Cancelled operations discard late results. Shared runtime initialization and a running model kernel may finish independently. The composer now retains a note and its attachment while the image is being prepared. |
| PA-01 | A family request lost details after the first child mention | The plan retains the asthma and bus-to-school details in the same sentence. Tests cover household facts and corrections while geocoding the original place text. |
| PA-02 | A requested school or commuter forecast could show a current reading instead | Hourly responses select available slots for the requested local date and period and label them as forecast U.S. AQI. School guidance includes indoor alternatives. Commuter guidance explains the difference between roadside exposure and emissions. |
| PA-03 | A household without a hood received instructions to use one | Household parsing preserves an explicitly absent vented hood. The plan offers applicable cooking actions. Both a regression and a targeted mutation test exercise this decision. |
| PA-04 | Station scale, source time and pollutant units could be lost | Current answers distinguish a station report from a model estimate. WAQI sub-indices stay out of concentration fields. Station time requires an offset or UTC marker. Old weather and AQI are excluded from current advice. The CPCB request links to the official portal and explains the missing calculation inputs. |
| PA-05 | Missing photo confidence could be converted into apparent certainty | Cloud and on-device results have explicit uncertainty paths. Unknown categories and low or missing confidence invite a user observation. Search drops malformed citations. Chat validates a generated event’s field types, date, seats and category before offering a publish action. |
| PA-06 | An old page of meetups could hide upcoming results for a city | Chat filters published date and category at the database, checks venue and pages until it has enough matches or exhausts the query. An emulator test places the matching event beyond the first page. Calendar dates and attendance controls are shared across cards. |
| S-01 | Partial Firebase settings could initialize a different default project | Cloud mode requires a complete registered web configuration, with checks on sender, app and auth domain. A fresh session offers Guest or sign-in. Device-only Guest handles missing settings and the tested anonymous-auth outages. |
| S-02 | Several owner-scoped records had overly broad write shapes | Firestore checks supported fields, types, ownership, protected creation data and organizer transitions. It retains the atomic attendee receipt and public count. Emulator tests cover cross-user access, capacity, simultaneous joins and retried cancellation. |
| S-03 | A deployment-wide per-client quota was unverified | The audit identified Vercel’s route-scoped Firewall rate limiting. Production had zero custom rules at inspection. The app’s per-provider cooldowns and request deadlines serve a different purpose. Deployment-wide quota activation and independent verification remain open. |
| S-04 | An unreadable photo could be forwarded unchanged | Browser intake checks size and dimensions, decodes, rescales and re-encodes the pixels. Unreadable files show an accessible error. The server independently checks the request, image signature and dimensions. |
| EF-01 | Concurrent readers could duplicate environmental requests | Matching requests share one in-flight read. Cancelling one subscriber leaves the others active. The last cancellation stops the underlying fetch. Cache expiry and concurrent abort/retry tests passed. |
| T-01 | Standalone test discovery and critical-domain floors had no comparable evidence | CI now runs standalone tests, broad unit coverage, a named critical group and three targeted mutation checks. Pushes and pull requests run the same verification workflow. |
| A-01 | Low contrast and draft focus behavior needed verification | Report/draft controls use tested contrast. The draft preview can receive keyboard focus and scroll. Chrome checks dialog and account-menu focus return, keyboard navigation, 320-pixel layout and applicable axe WCAG 2.0–2.2 A/AA rules. |

## Challenge journeys exercised

| Journey | Evidence |
| --- | --- |
| Family | A user supplies a city and a cooking or commute profile. Tests verify tailored actions and a direct impact for each. Chrome selects an earlier plan, inspects the explanation request and recovers its saved impacts when the provider is unavailable or truncates its reply. [Household tests](../../tests/plannerLanguage.test.js) · [Plan explanation](../../tests/planExplanation.browser.mjs) |
| School | Chrome follows Guest entry through a Delhi school plan and stale-data recovery. Forecast tests cross local midnight and check morning-only slots and indoor assembly advice. [School journey](../../tests/guestPlan.browser.mjs) · [Hourly tests](../../tests/requestedForecast.test.js) |
| Commuter and spelling | Chrome enters `mera smgo plan banao in Delhi, India. I cycle to work.` and `air polution forcast in Delhi, India tommorow morning`. It also types `Dehli`, checks the proposed city, replies `haan` and reads the Delhi answer. Original messages remain visible. Unit cases include a delivery rider, unrelated words such as `garage`, and a misspelled complaint followed by `Draft email`. [Chrome typing test](../../tests/chatSpelling.browser.mjs) · [Intent cases](../../tests/multilingualIntents.test.js) |
| Civic report | Chrome tests photo intake and uncertainty. Report editing verifies that replacing a location clears the old coordinates. Saved records reopen for their owner. Another device session cannot open the same record. [Vision](../../tests/vision.browser.mjs) · [Report review and ownership](../../tests/reportPrivacy.browser.mjs) |
| Complaint email | A fixture photo and the user’s original note reach an editable draft. Chrome checks the Gmail confirmation, cancels it, edits the draft, saves and reads it back. An ordinary street complaint does not acquire a forest CC. The app prepares drafts and the user controls external sending. [Photo-to-draft journey](../../tests/draftReview.browser.mjs) · [Contact tests](../../tests/civicReports.test.js) |
| Community | The Guest public channel, event creation form, cross-tab registration, final-seat contention, cancellation and private registrations were exercised. Chat discovery and authenticated writes were verified in the demo Firebase emulators. [Community and event browser tests](../../tests/meetups.browser.mjs) · [Concurrency](../../tests/meetupRules.emulator.mjs) · [Schemas and paged discovery](../../tests/firestoreSchemas.emulator.mjs) |

A Chrome regression also caught the AQI **Health Tips** shortcut treating words in its own prompt as a city. It now retains the previous city, gives advice from the verified reading and asks for a fresh reading when needed. [Failing run](https://github.com/surajns0033-collab/ecopulse-ai/actions/runs/46148978170) · [Passing regression](https://github.com/surajns0033-collab/ecopulse-ai/actions/runs/46149231053)

## Commands and exit status

The GitHub Actions runner used Ubuntu 26.04.1, Node 24.22.3, npm 11.19.1 and Temurin Java 21.0.13+2. Playwright launched the installed Chrome browser. The browser version is absent from the job log. The workflow records successful shell steps. The benchmark prints each child command’s numeric exit code. [Workflow](../../.github/workflows/verify.yml) · [Runner log](https://github.com/surajns0033-collab/ecopulse-ai/commit/d1070dd9e5e30a3709603ec2ad70acdaf478705e/checks/140995531585/logs)

| Command or test process | Exit | Actual result |
| --- | ---: | --- |
| `npm ci` | 0 | Added 192 packages and audited 193 installed packages. |
| `npm run lint` | 0 | 0 warnings, 0 errors. |
| `npm run typecheck` | 0 | Strict TypeScript and checked JavaScript contracts compiled. |
| `npm test` | 0 | 163 passed, zero skipped or cancelled. |
| `npm run benchmark` | 0 | 20 scenario, routing and request-count tests passed. |
| `npm run quality:modules` | 0 | 209 modules, largest 148 physical lines. |
| `npm run quality:inventory` | 0 | 23 reported findings. The configured maximum is 23. |
| `npm run build` | 0 | Vite produced the production bundle. |
| `npm audit --audit-level=moderate` | 0 | 0 known dependency vulnerabilities reported. |
| `node --test tests/clientEnvironment.test.js` | 0 | 1 browser-credential isolation check passed using synthetic keys. |
| Node unit coverage process assembled by `tests/submissionBenchmark.mjs` | 0 | 142 unit tests passed under the broad coverage floors. |
| `npm run coverage:critical` | 0 | All three coverage floors passed on the named set. |
| `node tests/mutationChecks.mjs` | 0 | All 3 mutations were detected by their named assertions. |
| `node --test tests/vision.browser.mjs` | 0 | 2 bundle and on-demand vision checks passed. |
| `node --test tests/cleanAir.browser.mjs tests/meetups.browser.mjs` | 0 | 12 Chrome workflow and accessibility checks passed. |
| `npm run test:rules` | 0 | 13 tests passed in Auth and Firestore emulators on `demo-ecopulse`. |
| `npm run benchmark:submission` | 0 | All 14 checks passed, covering all six internal criteria. |

The npm install printed lifecycle-script policy notices for `@firebase/util`, `onnxruntime-node`, `protobufjs` and `tesseract.js`. The lockfile advisory check passed independently. Console output includes expected errors from denial and outage fixtures. [Complete output](https://github.com/surajns0033-collab/ecopulse-ai/commit/d1070dd9e5e30a3709603ec2ad70acdaf478705e/checks/140995531585/logs)

## Deployment readiness, open risks and unverified behavior

- **Branch delivery.** The production build and both serverless API entry points passed on this branch. The default branch still pointed to `b2e0a9b533bef2e537c411afef6f2b3152865c59` during verification. Production promotion, Firestore rules/index deployment and competition submission require separate owner action. The existing live URL has not been verified as serving this candidate. [Branch comparison](https://github.com/surajns0033-collab/ecopulse-ai/compare/b2e0a9b533bef2e537c411afef6f2b3152865c59...d1070dd9e5e30a3709603ec2ad70acdaf478705e)
- **Production controls.** A shared API quota should be checked on an authorized non-production target, including normal Guest requests and the user-visible response at the limit. The built-in platform option avoids adding a database or an external paid limiter to the browser or application. Provider credentials stayed server-side in the build check. Device-only storage still allows model-powered turns to send the question or prepared photo to the configured proxy. [Vercel Firewall](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- **External behavior.** Environmental, geocoding and AI responses in the regression suite were fixtures. Real-time upstream availability, provider quotas and photo-classification accuracy on labelled real incidents remain unmeasured for the candidate. Live Firebase rules and production Google/email sign-in were not exercised by the emulator run. [Test setup](../../tests/browserSupport.mjs) · [Firebase configuration](../../FIREBASE_SETUP.md)
- **Accessibility.** The keyboard and axe results cover the tested Chrome states. Manual OS screen-reader operation and native browser zoom at 200% and 400% remain unverified. The 320-pixel viewport check gives independent reflow evidence.
- **Maintainability.** The 23 remaining inventory warnings concern function complexity or counted lines. Some apply to the same function. Repository-wide coverage still has gaps, and critical coverage is an aggregate. CI now fails above the measured warning count. [Inventory annotations](https://github.com/surajns0033-collab/ecopulse-ai/actions/runs/46150391538)
- **Working environment.** The Windows helper could not launch a process during the audit and no local repository checkout was attached. Implementation and verification used the feature branch and a clean Actions checkout. Any uncommitted work on another computer was outside this review. [Environment evidence](BASELINE.md)

<details>
<summary>Remaining function inventory</summary>

| File | Function | Measured finding |
| --- | --- | --- |
| [src/components/chat/InlineCards.jsx#L15](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/components/chat/InlineCards.jsx#L15) | `InlineCards` | Length 63 |
| [server/aiCore.js#L51](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/server/aiCore.js#L51) | `aiHandler` | Complexity 16 |
| [src/components/chat/MessageBubble.jsx#L8](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/components/chat/MessageBubble.jsx#L8) | `MessageBubble` | Complexity 18 |
| [src/pages/MeetupsPage.jsx#L14](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/pages/MeetupsPage.jsx#L14) | `MeetupsPage` | Length 77 |
| [src/components/chat/Header.jsx#L16](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/components/chat/Header.jsx#L16) | `AccountMenu` | Length 61 |
| [src/pages/LandingPage.jsx#L4](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/pages/LandingPage.jsx#L4) | `LandingPage` | Length 103 |
| [src/components/chat/ChatInput.jsx#L4](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/components/chat/ChatInput.jsx#L4) | `ChatInput` | Length 69 |
| [src/pages/useMeetupListing.js#L17](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/pages/useMeetupListing.js#L17) | `useMeetupListing` | Length 79 |
| [src/components/chat/useChatComposer.js#L4](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/components/chat/useChatComposer.js#L4) | `useChatComposer` | Length 68 |
| [src/pages/MeetupDialog.jsx#L16](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/pages/MeetupDialog.jsx#L16) | `MeetupDialog` | Length 81 |
| [src/components/chat/EmailPreviewCard.jsx#L5](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/components/chat/EmailPreviewCard.jsx#L5) | `EmailPreviewCard` | Complexity 16 |
| [src/components/chat/EmailPreviewCard.jsx#L5](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/components/chat/EmailPreviewCard.jsx#L5) | `EmailPreviewCard` | Length 63 |
| [src/pages/ReportDetailPage.jsx#L12](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/pages/ReportDetailPage.jsx#L12) | `ReportDetailPage` | Complexity 19 |
| [src/pages/ReportDetailPage.jsx#L12](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/pages/ReportDetailPage.jsx#L12) | `ReportDetailPage` | Length 111 |
| [src/pages/useCommunityFeed.js#L8](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/pages/useCommunityFeed.js#L8) | `useCommunityFeed` | Length 109 |
| [src/agent/chatPlaces.js#L57](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/agent/chatPlaces.js#L57) | `resolveChatPlace` | Complexity 16 |
| [src/services/meetupAttendance.js#L53](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/services/meetupAttendance.js#L53) | `updatePlace` | Complexity 16 |
| [src/contexts/AuthProvider.jsx#L9](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/contexts/AuthProvider.jsx#L9) | `AuthProvider` | Length 93 |
| [src/components/chat/chatActions.js#L54](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/components/chat/chatActions.js#L54) | `handlePlanOrPhoto` | Complexity 17 |
| [src/components/chat/chatActions.js#L75](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/components/chat/chatActions.js#L75) | `dispatchChatAction` | Complexity 16 |
| [src/pages/CommunityPage.jsx#L10](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/pages/CommunityPage.jsx#L10) | `CommunityPage` | Length 110 |
| [src/agent/weatherReplies.js#L4](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/agent/weatherReplies.js#L4) | `getWeatherPrecautions` | Complexity 18 |
| [src/services/aiClient.js#L60](https://github.com/surajns0033-collab/ecopulse-ai/blob/d1070dd9e5e30a3709603ec2ad70acdaf478705e/src/services/aiClient.js#L60) | `requestAI` | Complexity 16 |

</details>

## Exact files changed

The tested comparison contains 120 paths (85 modified and 35 added). The report adds its own path below. The GitHub diff path set matched the changes between the two recursive Git trees. All 228 tracked source and configuration texts checked against the candidate matched their Git blobs. The four remaining tracked assets or license files retained their baseline hashes. A static scan resolved the relative module imports across 135 application, server and API modules and found no import cycle. [Full implementation diff](https://github.com/surajns0033-collab/ecopulse-ai/compare/b2e0a9b533bef2e537c411afef6f2b3152865c59...d1070dd9e5e30a3709603ec2ad70acdaf478705e)

<details>
<summary>121 paths including this report (A added, M modified)</summary>

```text
M  .github/workflows/verify.yml
M  docs/quality-verification.md
A  docs/quality/BASELINE.md
A  docs/quality/READINESS.md
M  FIREBASE_SETUP.md
M  firestore.indexes.json
M  firestore.rules
M  package-lock.json
M  package.json
M  README.md
M  server/chatRequest.js
M  src/agent/agentOrchestrator.js
M  src/agent/chatAnswers.js
A  src/agent/chatLanguage.js
M  src/agent/chatPlaces.js
M  src/agent/citySnapshot.js
M  src/agent/civicEmail.js
M  src/agent/civicIssues.js
M  src/agent/civicReportDetails.js
M  src/agent/communityReplies.js
M  src/agent/environmentReplies.js
M  src/agent/fallbackBrain.js
M  src/agent/fallbackContacts.js
M  src/agent/healthReplies.js
M  src/agent/intentEngine.js
A  src/agent/intentKeywords.js
M  src/agent/intentPatterns.js
A  src/agent/localizedIntents.js
M  src/agent/photoFinding.js
M  src/agent/photoReports.js
M  src/agent/placeContext.js
M  src/agent/placeNames.js
M  src/agent/placeTopics.js
A  src/agent/replyContext.js
A  src/agent/requestedForecast.js
M  src/agent/smogAdvice.js
M  src/agent/smogForecast.js
M  src/agent/smogPlan.js
M  src/agent/smogProfile.js
M  src/components/chat/AirQualityCard.jsx
M  src/components/chat/cardControls.css
M  src/components/chat/chatActions.js
M  src/components/chat/ChatInput.jsx
M  src/components/chat/chatRecords.js
M  src/components/chat/CommunityCards.jsx
M  src/components/chat/composer.css
M  src/components/chat/EmailPreviewCard.jsx
A  src/components/chat/EmailRecipients.jsx
M  src/components/chat/MeetupCards.jsx
M  src/components/chat/ReportPreviewCard.jsx
M  src/components/chat/useChatComposer.js
A  src/components/chat/useComposerPhoto.js
A  src/components/meetups/AttendanceButton.jsx
M  src/components/meetups/EventCard.jsx
M  src/contexts/AuthProvider.jsx
A  src/contexts/deviceSession.js
M  src/firebase/collections.js
M  src/firebase/config.js
M  src/firebase/firestoreClient.js
A  src/firebase/settings.js
M  src/pages/CommunityPage.jsx
M  src/pages/LandingPage.jsx
M  src/pages/useChatSession.js
M  src/pages/useMeetupListing.js
M  src/services/agentTools.js
M  src/services/aiClient.js
M  src/services/airQuality.js
A  src/services/composerPhoto.js
A  src/services/emailDrafts.js
M  src/services/environmentalData.js
M  src/services/environmentCache.js
A  src/services/firestoreDiscovery.js
M  src/services/geminiService.js
A  src/services/geocodingResults.js
A  src/services/imageDimensions.js
M  src/services/imageOcr.js
M  src/services/meetupAttendance.js
A  src/services/meetupDiscovery.js
A  src/services/meetupDraft.js
M  src/services/meetups.js
M  src/services/modelJson.js
M  src/services/onDeviceVision.js
A  src/services/photoAssessment.js
M  src/services/placeLookup.js
M  src/services/placeMatching.js
A  src/services/sceneAssessment.js
M  src/services/toolStorage.js
M  src/services/verifiedRecipient.js
M  src/services/weatherData.js
M  tests/browserSupport.mjs
M  tests/chatImages.test.js
M  tests/chatPlaces.test.js
M  tests/chatResponse.test.js
A  tests/chatSpelling.browser.mjs
M  tests/civicReports.test.js
M  tests/cleanAir.browser.mjs
M  tests/cleanAirFixtures.mjs
A  tests/criticalCoverage.mjs
A  tests/deviceServices.test.js
A  tests/deviceSession.test.js
A  tests/draftReview.browser.mjs
M  tests/environmentalData.test.js
M  tests/environmentSources.test.js
M  tests/firestoreRules.emulator.mjs
A  tests/firestoreSchemas.emulator.mjs
M  tests/forecastAdvice.test.js
M  tests/guestPlan.browser.mjs
A  tests/inputRecovery.browser.mjs
A  tests/meetupDraft.test.js
M  tests/meetups.browser.mjs
A  tests/multilingualIntents.test.js
A  tests/mutationChecks.mjs
A  tests/photoAssessment.test.js
A  tests/photoFixtures.mjs
M  tests/placeLookup.test.js
A  tests/plannerLanguage.test.js
A  tests/requestedForecast.test.js
A  tests/requestSharing.test.js
M  tests/serverlessPackage.test.js
M  tests/submissionBenchmark.mjs
M  tests/submissionScenarios.test.js
```

</details>
