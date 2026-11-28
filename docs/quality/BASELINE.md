# EcoPulse AI · Challenge 6 baseline and remediation plan

Audit date 28 November 2026. This record captures the pre-implementation audit. The comparison point is GitHub `main` at `b2e0a9b533bef2e537c411afef6f2b3152865c59`. The requested remote branch `rank1/weighted-optimization` did not exist when the audit began or at the final reference check. The checked-in application, configuration, deployment and competition entry were untouched. [Pinned repository](https://github.com/surajns0033-collab/ecopulse-ai/tree/b2e0a9b533bef2e537c411afef6f2b3152865c59)

## Official starting point

The user supplied these results for Attempt 2. The official overall score was **95.19/100**. The portal did not identify its evaluated commit. The fresh GitHub benchmark measures engineering behavior independently.

| Priority | Criterion | Evaluator impact | Last official score |
| --- | --- | --- | ---: |
| P0 | Code Quality | High | 86 |
| P0 | Problem Statement Alignment | High | 99 |
| P1 | Security | Medium | 98 |
| P1 | Efficiency | Medium | 100 |
| P2 | Testing | Low | 94 |
| P2 | Accessibility | Low | 96 |

## Source and environment

- Compared all **197 tracked blobs** in the downloaded archive with the Git object hashes on the pinned tree. Inspected implementation and configuration across `src`, `server`, `api`, tests, docs, the manifest and lockfile, Firebase rules/indexes/config, Vite, Vercel, README and GitHub Actions. A static relative-import scan of 116 first-party application/server/API modules found 254 edges and no cycle in the resolved graph. This scan includes literal dynamic imports. It does not establish reachability of every function.
- The lockfile is version 3 with 290 package records including the root. The resolved URLs inspected pointed to the npm registry. The root requires Node `^24.12.0`. The fresh run used Ubuntu 26.04.1 LTS, Node 24.22.3, npm 11.19.1 and Temurin Java 21.0.13+2. Chrome was available to the runner and the browser checks executed. The CI log does not give a Chrome binary version.
- The supplied Windows working directory was `C:\Windows\System32`. No repository worktree was attached to this task. The local `git status --short --branch`, Git-root and runtime probes, temporary checkout and guarded npm command sequence could not start. The Windows helper returned `Failed to create unified exec process: helper_unknown_error: setup refresh had errors`, before any child-process exit code. Local checked-out branch, HEAD, uncommitted user work, Node, Chrome and Java availability therefore remain **BLOCKED / unknown**. The remote snapshot cannot establish whether the user has uncommitted work.
- Started the existing, non-deploying `Verify EcoPulse` workflow. GitHub recorded a fresh `workflow_dispatch` at the pinned SHA. It installed dependencies, built the app and ran the suites, including Chrome and the Firebase Auth/Firestore emulators. The runner uses a demo Firebase project. [Fresh run](https://github.com/surajns0033-collab/ecopulse-ai/actions/runs/46139115010) · [Raw command output](https://github.com/surajns0033-collab/ecopulse-ai/commit/b2e0a9b533bef2e537c411afef6f2b3152865c59/checks/140960909839/logs) · [Workflow](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/.github/workflows/verify.yml)
- For routing evidence, executed the unchanged ES modules from that archive in Chrome at an isolated test origin with external requests blocked. No test supplied a live environmental value or called an AI provider. Checked the public production asset for the client project ID, Vercel configuration names and the Firewall rules overview without revealing secret values. A separate read-only 320 px production check used an existing Guest session.

## Command baseline

Exit codes below refer to the fresh CI run. The benchmark records PASS only when the child process returns code 0. GitHub also records successful install and workflow steps. The direct Windows attempt did not launch. A dash means there was no process exit code. [Raw log](https://github.com/surajns0033-collab/ecopulse-ai/commit/b2e0a9b533bef2e537c411afef6f2b3152865c59/checks/140960909839/logs) · [Benchmark runner](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/tests/submissionBenchmark.mjs#L50)

| Requested command | Exit | Result | Actual observation |
| --- | ---: | --- | --- |
| `npm ci` | 0 | PASS in CI | Added 215 packages and audited 216. npm warned that four install scripts lacked an explicit allowScripts policy. |
| `npm run lint` | 0 | PASS in CI | 0 warnings, 0 errors under the primary lint configuration. |
| `npm run typecheck` | 0 | PASS in CI | Strict TypeScript check of the JS request validator and its TS contract. |
| `npm test` | — | **BLOCKED as a standalone command** | Windows process creation failed. CI explicitly invokes selected suites with Node and the benchmark script. It does not invoke the package's standalone `node --test` discovery command. |
| `npm run benchmark` | 0 | PASS in CI | 20 scenario/routing tests passed. |
| `npm run quality:modules` | 0 | PASS in CI | 175 modules checked. Largest was `src/services/agentTools.js` at 149 physical lines. |
| `npm run quality:inventory` | 0 | PASS at its ceiling | 45 findings, comprising 25 complexity warnings and 20 function-length warnings. 0 errors. |
| `npm run build` | 0 | PASS in CI | Vite production build completed in 611 ms on this runner. |
| `npm run benchmark:submission` | 0 | PASS in CI | All six internal criteria passed. 127 individual tests passed with zero failures, skips or cancellations in the six Node test groups. |
| `npm audit --audit-level=moderate` | 0 | PASS in CI | npm reported 0 known dependency vulnerabilities. |

The measured test groups were **1** client-environment check, **88** unit/regression checks with coverage, **20** scenario checks, **2** bundle/vision checks, **6** other browser checks and **10** Firestore rule checks. The browser command groups used `node --test tests/vision.browser.mjs` and `node --test tests/cleanAir.browser.mjs tests/meetups.browser.mjs`. `npm run test:rules` started both emulators and returned code 0. These counts include fixture-backed tests and should not be interpreted as successful production writes or live provider responses. [Test runner](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/tests/submissionBenchmark.mjs#L17)

The four install-script notices named the Firebase utility package, ONNX Runtime Node, protobufjs and Tesseract. A previously recorded run on the same SHA also logged toolchain deprecation messages during the emulator CLI installation. These are separate from the lockfile advisory result and from the 45 source warnings. [Earlier run](https://github.com/surajns0033-collab/ecopulse-ai/actions/runs/46086308983)

### Existing performance and coverage

| Measurement | Fresh result | Existing gate or scope |
| --- | ---: | --- |
| Largest production JS asset | 474,640 bytes | 500,000 uncompressed bytes maximum |
| Guest Chat startup JS | 436,343 bytes | 500,000 uncompressed bytes maximum |
| Unit coverage of exercised source, lines / branches / functions | 86.80% / 79.18% / 87.79% | 80% / 75% / 85% current floors |
| `airQuality.js`, lines / branches / functions | 96.30% / 76.92% / 90.91% | Critical domain logic |
| `intentEngine.js`, lines / branches / functions | 100% / 82.72% / 100% | Intent decisions |
| `smogPlan.js`, lines / branches / functions | 100% / 82.61% / 100% | Personalized plan |
| `geminiService.js`, lines / branches / functions | 45.45% / 86.96% / 20.00% | Chat and photo adaptation |
| `chatRequest.js`, lines / branches / functions | 100% / 96.30% / 100% | Request boundary |

The largest asset has 25,360 bytes of headroom and Guest Chat has 63,657. Cached environmental results use a three-minute TTL and a 128-entry cap. The browser suite verified model loading on the photo fallback path. Coverage above applies to the source loaded by the unit coverage process. Browser and emulator checks were run separately. [Measurements](https://github.com/surajns0033-collab/ecopulse-ai/commit/b2e0a9b533bef2e537c411afef6f2b3152865c59/checks/140960909839/logs)

## Prioritized findings

### CQ-01 · handleGeneralQuestion

**Code Quality** · Evaluator impact **High** · Severity **High**

One function decides small talk and web intent, fetches a snapshot, prepares authority contacts, builds prompts, calls a provider and chooses recovery. The inventory measures complexity 38 and 89 counted lines. resolveChatPlace measures 32. routePlaceRequest classifies at placeContext.js:87 and answerTurn classifies again at agentOrchestrator.js:97. Keyword matching uses substring includes in intentEngine.js:89. The isolated detector classified “Can I repair a chair?” as GET_AIR_QUALITY. Specific routes can correct a detector result. [src/agent/chatAnswers.js#L11](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/chatAnswers.js#L11)

**Proposed fix.** Capture the route, the message it applies to and its entities once per turn. Separate conversational classification, evidence lookup and reply rendering at their existing boundaries. Keep pending-city and explicit correction precedence.

**Regression risk and required verification.** High. Resumed turns may use a different message. Pin current behavior for city confirmation, corrections, a photo location independent of the chat city, grounded search, complaint emails and ordinary chat before moving dispatch.

### CQ-02 · saveEmailDraft

**Code Quality** · Evaluator impact **High** · Severity **High**

The confirmation always says “Draft saved to your account”. agentTools.js:57 returns only draftId for both cloud and local storage. toolStorage.js:14 catches local-storage write errors, and firestoreOrLocal at line 30 falls back on any Firestore error. A device-only draft or a failed write can therefore receive an account-success message. createCommunityPost and deleteCommunityPost also use this helper. [src/components/chat/chatRecords.js#L40](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/chatRecords.js#L40)

**Proposed fix.** Give persistence results an explicit cloud/device destination. Report a write error if storage rejected it. Apply local fallback only to intended offline conditions, preserve prior device drafts, and keep the external email action separate.

**Regression risk and required verification.** Medium. Test successful cloud save, explicit device save, quota/unavailable storage and rejected cloud writes. Verify subject/body/recipient survive editing, and opening Gmail still requires confirmation.

### CQ-03 · typecheck and direct dependencies

**Code Quality** · Evaluator impact **High** · Severity **Medium**

Strict checking currently targets server/chatValidation.js and server/chatSchema.ts. Application boundaries such as profile, AQI provenance, intent result and photo certainty are outside it. The first-party scan found no explicit TS any or suppression in these sources. axios, @google/generative-ai and uuid are declared direct runtime dependencies with no matching imports in source, tests, scripts or Vite configuration. The actual Gemini integration uses fetch. [package.json#L20](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/package.json#L20)

**Proposed fix.** Introduce checkJs or strict JSDoc contracts first for domain and provider results, then compile their immediate callers. Confirm the installation and packaging graph before removing unused direct declarations. Keep SDKs needed transitively.

**Regression risk and required verification.** Medium. Require clean install and strict compilation, a packaged serverless smoke test and the same build, browser and bundle checks. Preserve runtime JS entry points.

### CQ-04 · photoReply and handleImageAnalysis

**Code Quality / Efficiency** · Evaluator impact **High / Medium** · Severity **Medium**

The chat request supplies an AbortSignal. photoReply uses it for the location lookup, then calls handleImageAnalysis without it. photoReports.js:21, agentTools.js:45 and geminiService.js:63 continue without the caller signal. A cancelled UI turn can still finish a provider request or start a local model download. useChatActivity ignores late UI results but does not stop this work. [src/agent/agentOrchestrator.js#L67](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/agentOrchestrator.js#L67)

**Proposed fix.** Carry the caller signal through photo analysis and JSON helpers. Check cancellation before fallback, OCR, new downloads and state changes. Where a running inference cannot be interrupted, discard its result and avoid later work.

**Regression risk and required verification.** Medium. Cancel a pending cloud photo task, cancel during fallback and retry. Assert one live request per attempt and that cancellation cannot start local inference. Check that another consumer of a shared model still works.

### PA-01 · requestDetails and routeSmogPlan

**Problem Statement Alignment** · Evaluator impact **High** · Severity **High**

In a browser running the unchanged modules, “Create a smog plan for my child who has asthma and takes the bus to school” forwarded only “my child”. parseSmogProfile on the full sentence recognized children, heart/lung sensitivity, public transport and school. On the forwarded text, it recognized only children. [src/agent/placeContext.js#L22](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/placeContext.js#L22)

**Proposed fix.** Preserve the stated personal details in the request clause while keeping the requested city and the subject of each detail distinct. Ask for missing details only when needed.

**Regression risk and required verification.** Medium. Add a chat-level regression for this exact sentence, English/Hindi/Hinglish variants, negation, a corrected city and two family members with different routines. Assert the resulting plan uses the correct transport and sensitivities.

### PA-02 · handleAirQuality and school/commute routing

**Problem Statement Alignment** · Evaluator impact **High** · Severity **High**

“What is the AQI forecast in Delhi tomorrow morning?” produced GET_AIR_QUALITY and a forecast flag. The handler only calls getCurrentAirQuality and says it could not verify the requested time even when the hourly service exists. A Hindi school-assembly question and its Hinglish equivalent took the general path. A delivery rider asking how to reduce emissions took the current AQI path. A cyclist asking how to reduce exposure took general chat. [src/agent/environmentReplies.js#L32](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/environmentReplies.js#L32)

**Proposed fix.** Recognize the activity and requested time before deciding which evidence to fetch. Reuse the hourly service and forecast time zone. Select only a covered interval or explain its absence. Preserve ordinary current-AQI requests and distinguish exposure from emissions in the answer.

**Regression risk and required verification.** High. Exercise ordinary school, outdoor-shift and commuter questions in all three languages, local midnight and missing hours. Assert the data source, timestamp, advice and request counts. A forecast outside the available horizon must stay unavailable.

### PA-03 · cookingAdvice

**Problem Statement Alignment** · Evaluator impact **High** · Severity **High**

The unchanged planner advised “Use an exhaust hood that vents outdoors” in response to “I cook on a gas stove and have no exhaust hood.” parseSmogProfile carries the fuel but has no hood-availability field. The observation used no AQI, forecast or weather reading. [src/agent/smogAdvice.js#L47](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/smogAdvice.js#L47)

**Proposed fix.** Represent explicit equipment availability or make the advice conditional. Provide feasible source-reduction steps with ventilation guidance appropriate to outdoor conditions. Keep the stated fuel and avoid unsupported numerical savings.

**Regression risk and required verification.** Low to medium. Verify gas with/without a vented hood, electric, unspecified equipment and no fresh outdoor reading. Check the plan text and its AI explanation use the same choices.

### PA-04 · stationReading, modeledReading and forecast provenance

**Problem Statement Alignment** · Evaluator impact **High** · Severity **Medium**

The modeled adapter records U.S. AQI, its source type and source time. The optional station adapter omits scale and sourceType and links the global map. currentReading (smogForecast.js:15) and AQICard (AirQualityCard.jsx:60) still use category thresholds. weatherData.js:49 accepts station weather with no age check and smogPlan.js:31 can use its wind value to explain current conditions. The waste fallback at environmentReplies.js:98 also asserts that composting cuts half of this user’s daily waste without evidence. [src/services/airQuality.js#L3](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/airQuality.js#L3)

**Proposed fix.** Carry verified scale, station/source, timestamp and data kind through to every card and response. Qualify an unspecified scale and exclude stale wind from current guidance. Remove the unsupported numerical impact. Keep forecast, pollutant concentration and station sub-index values distinct. Display CPCB-method AQI as unavailable for these inputs.

**Regression risk and required verification.** Medium. Exercise measured, modeled, forecast, stale, future, missing and zero-valued observations. Check timezone boundaries and a station without a verified scale. No CPCB calculation without the required observations, averaging windows, completeness and authoritative breakpoints.

### PA-05 · analyzeEnvironmentalImage and photoFinding

**Problem Statement Alignment / Code Quality** · Evaluator impact **High** · Severity **High**

The cloud normalizer accepts any nonempty description, assigns missing confidence 0.6 and supplies a default moderate severity. Only the on-device path explicitly returns uncertain. photoReports.js:34 checks that flag before photoFinding builds a complaint draft. CommunityCards.jsx:55 displays the score as a percentage even though onDeviceVision.js:104 describes it as uncalibrated. A review prompt exists, but the draft can already imply certainty the provider never supplied. [src/services/geminiService.js#L76](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/geminiService.js#L76)

**Proposed fix.** Use an explicit observed/uncertain/unavailable result for both paths. Keep user notes distinct from visible observations. Preserve a qualitative uncertainty label and ask for confirmation before using uncertain claims in a draft.

**Regression risk and required verification.** Medium. Add progression tests for missing confidence, ambiguous photos, text-only signs, invalid output and an unavailable provider. Cover edit, cancel, review and save without changing local CLIP fallback.

### PA-06 · publishedMeetups, getNearbyMeetups and handleFindEvents

**Problem Statement Alignment** · Evaluator impact **High** · Severity **Medium**

The cloud query sorts all published events ascending and takes the first page before chat discards past dates or filters the category. handleFindEvents at communityReplies.js:5 receives the city but does not use it for selection. An old first page can make an upcoming matching event disappear. [src/services/meetups.js#L11](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/meetups.js#L11)

**Proposed fix.** Apply the supported upcoming-date constraint before the limit and define city/category filtering based on available event fields. Compare dates in the intended local calendar. Retain a clearly identified broader listing where venue matching is uncertain.

**Regression risk and required verification.** Medium. Test more past events than the page limit followed by an upcoming local one, alternate date representations and a venue without an explicit city. Verify index requirements and preserve atomic RSVP behavior.

### S-01 · isFirebaseConfigured and AuthProvider.signInWithGoogle

**Security** · Evaluator impact **Medium** · Severity **High**

A non-placeholder API key alone enables Firebase. Other missing fields silently fall back to echopulse-ai and placeholder identifiers, while .firebaserc and Vercel OAuth rewrites specify ecopulse-ai-5e86e. The current production bundle contains the intended project ID. In device mode AuthProvider.jsx:80 also creates a local non-anonymous identity with a Google label without a Google sign-in. [src/firebase/config.js#L5](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/firebase/config.js#L5)

**Proposed fix.** Validate the complete supported public Firebase configuration together. Explicitly enter device-only Guest mode when unavailable. Reserve authenticated provider labels for real provider results. Preserve the deployed custom auth domain and existing project data.

**Regression risk and required verification.** High. Test complete, partial, missing and mismatched configurations, device Guest after refresh, cloud Guest, and real Google/email redirects in an approved non-production environment. Do not change production configuration during this audit.

### S-02 · environmentalReports, emailDrafts, organizerEdit and isPrivateActivity

**Security** · Evaluator impact **Medium** · Severity **High**

Ownership is enforced and tested. Report, draft and private activity writes are otherwise largely unrestricted. Private emulator fixtures even accept an owner plus a note alone. Public posts do not validate tags or createdAt types. Organizer updates protect the counter/version/ID but have no complete field or status-transition schema. The private RSVP receipt and counter already have coupled transaction rules. [firestore.rules#L44](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/firestore.rules#L44)

**Proposed fix.** Use collection-specific validators for supported schemas, bounds, owner and creation-field immutability, timestamps and lifecycle transitions. Preserve legacy reads/updates deliberately. Keep the existing receipt/counter transaction and capacity checks.

**Regression risk and required verification.** High. Inventory real writer shapes and legacy records first. Extend the local emulator tests for ownership, malformed fields, organizer edits, last-place contention, duplicate join/cancel and migration. Validate new timestamps against the actual writer behavior before tightening the rules.

### S-03 · makeAiHandler and server-side usage controls

**Security** · Evaluator impact **Medium** · Severity **High**

The handler validates incoming bodies and deadlines. Its provider cooldowns are process-local. No durable per-client quota was found in the application. The project’s Vercel Firewall configuration displayed “No Custom Rules Yet”. Platform DDoS protections may still apply. Vite’s envPrefix and the credential-isolation test keep model/search secrets out of browser code. [server/aiCore.js#L49](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/server/aiCore.js#L49)

**Proposed fix.** Design a route-scoped rate limit that works across instances. Vercel documents fixed-window WAF rate limiting for all plans. Confirm the plan’s usage/pricing and Guest behavior, then verify the policy on a non-production target before suggesting any production change. Keep a user-visible retry response.

**Regression risk and required verification.** Medium. Verify permitted requests, shared-network fairness, bounded retries and normal Guest flow with synthetic account-free requests in a controlled test. Keep Firebase and third-party quotas distinct. Production firewall activation is a separate change.

### S-04 · handleImageFile and readChatRequest

**Security / Efficiency** · Evaluator impact **Medium** · Severity **Medium**

The composer reads the entire file before a size or pixel check. For decodable photos it resizes to 1,280 pixels and re-encodes JPEG. On decode failure it stores the original bytes and MIME for transmission, so original metadata can survive. chatRequest.js:36 verifies signatures and size but does not enforce dimensions. These are control gaps observed in the source. The audit used no live photo upload. [src/components/chat/useChatComposer.js#L72](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/useChatComposer.js#L72)

**Proposed fix.** Check compressed size and supported dimensions before expensive work, keep metadata removal on the upload path and provide a clear retry for unsupported files. Preserve supported HEIC/HEIF behavior only with a bounded decoder or a clear alternative.

**Regression risk and required verification.** Medium. Test ordinary JPEG/PNG/WebP, metadata-bearing images, supported/unsupported HEIC, malformed headers, large dimensions and reselect/cancel in a controlled fixture. Verify on-device fallback and the existing byte ceiling.

### EF-01 · getAirQuality, getAirQualityForecast and getWeather

**Efficiency** · Evaluator impact **Medium** · Severity **Medium**

The three-minute, 128-entry coordinate cache stores completed successful results. Concurrent misses can issue duplicate requests before the value is stored. The current bundle and Guest startup both pass their limits. Cancellation can become incorrect if two UI requests share an in-flight fetch. [src/services/airQuality.js#L47](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/airQuality.js#L47)

**Proposed fix.** First measure two overlapping requests for the same rounded coordinates in a focused test. If duplication is confirmed, share in-flight work with independent consumer cancellation, remove failures and preserve TTL/LRU semantics.

**Regression risk and required verification.** Medium. Check concurrent and sequential requests, one/all callers aborting, recovery after failure, eviction and both 500,000-byte gates. Keep model loading lazy; justify any added bytes.

### T-01 · unit coverage configuration and scenario coverage

**Testing** · Evaluator impact **Low** · Severity **Medium**

Fresh CI reported 86.80% lines, 79.18% branches and 87.79% functions on modules exercised by its unit suite. geminiService.js had 45.45/86.96/20.00 and airQuality.js had 96.30/76.92/90.91. Browser and emulator success do not add to these figures. Tests with supported scenarios missed the natural-language failures reproduced here. [tests/submissionBenchmark.mjs#L24](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/tests/submissionBenchmark.mjs#L24)

**Proposed fix.** Start with failing behavior tests for the P0 findings. Track a named critical module set including unexercised modules and report it separately from aggregate coverage. Keep the current floors. Consider targeted mutation checks after branch cases exist.

**Regression risk and required verification.** Low. Run the standalone npm test entry and the full benchmark independently after a working checkout is attached. Aim for 90/90/95 on critical logic and record actual values and exclusions.

### A-01 · EmailPreviewCard and auditAccessibility

**Accessibility** · Evaluator impact **Low** · Severity **Medium**

The 10-pixel disclaimer uses #9ca3af on the white card, a calculated 2.54:1 contrast ratio. ReportPreviewCard.jsx:45 uses #16a34a for normal-size text on white, 3.30:1. Both fall short of the 4.5:1 normal-text target. tests/browserSupport.mjs:21 selects WCAG 2.0/2.1 A/AA tags. Real browser zoom and assistive-technology announcements are outside that result. [src/components/chat/EmailPreviewCard.jsx#L87](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/EmailPreviewCard.jsx#L87)

**Proposed fix.** Reuse accessible text colors and add 2.2 rules supported by the installed axe version. Exercise the report/email previews, keyboard focus restoration and validation errors. Run a separate manual screen-reader and true browser-zoom pass.

**Regression risk and required verification.** Low. Recalculate contrast on the actual background, verify expected keyboard order, 320 px, 200%/400% zoom and reduced motion. Retain the existing design and accessible status feedback.

## Journey evidence and remaining verification

| Journey | Verified baseline | Still to verify or fix |
| --- | --- | --- |
| A · Family | CI exercised city selection, a school/sensitive household plan, and AI explanation success/failure branches with controlled inputs. The independent routing check retained only “my child” from a sentence that also specified asthma and bus travel. | Multi-detail and corrected family profiles end to end. Compare the supplied choices and explanation. |
| B · School | School-plan scenarios already use fresh/stale AQI and a daylight forecast window. In ordinary forecast wording the handler calls only the current-reading service. A Hindi and a Hinglish school question selected general chat. | A local-time-specific answer in all three languages, including an unavailable hour, without a forecast/current mix-up. |
| C · Commuter | The benchmark exercises emissions and exposure guidance, including a scooter delivery shift. The independent cyclist query went to general chat and a scooter question about emissions went to current AQI. | Reach the right plan from a normal sentence and preserve travel mode, constraints and direct impacts. |
| D · Civic photo | CI verified lazy local inference, report editing, confirmation and owner-only reopening. Both cloud-photo normalization and the UI percentage were traced in source. | Carry uncertainty through cloud and local output, handle a cancelled task and check edit/cancel before saving. |
| E · Complaint email | The code preserves the user's observations and leaves unknown details blank. Draft subject/body are editable. Gmail Compose requires an explicit additional confirmation. No send integration is claimed. | Give device/cloud/error saves different statuses. Test requested recipient/CC and unknown jurisdiction. No email was sent in this audit. |
| F · Community | Emulator tests covered owner isolation, concurrent joins, the final seat, duplicate join/cancel, legacy records and counters. Chrome exercised attendance across tabs and refresh. | Fix upcoming/local discovery and exercise organizer status transitions separately from attendee RSVP cancellation. |

## Platform and accessibility evidence

The production Firebase client asset contains `ecopulse-ai-5e86e`. It agrees with the checked-in Firebase CLI alias and the Vercel OAuth rewrites. Vercel listed all six public Firebase configuration names, including production entries. The auth-domain override supports the deployed host. The hard-coded fallback in the source is a defect for partial configuration. This audit found no evidence that current production uses the unrelated fallback project. Firebase rules were verified in the emulator for this SHA. The exact rules currently deployed to the cloud were not read back. [Firebase config](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/firebase/config.js#L5) · [Vercel rewrites](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/vercel.json#L8)

Vercel's project firewall showed zero custom rules. Its platform documentation supports a fixed-window, path-scoped rate limit and describes the included keys, plan limits and usage pricing. A verification or pricing review on an authorized non-production target is needed before enabling a production policy. The abuse-control assessment used the source and the configuration screen. [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)

Chrome/axe and keyboard flows passed under the repository's current rule selection. The production Guest Chat page at a 320 px viewport had a 320 px document width with reduced motion requested. The browser protocol rejected a separate fresh browser context in this session (`Target.createBrowserContext: Not allowed`), so fresh sign-in coverage came from the CI browser fixtures. Screen-reader behavior and true browser zoom at 200% and 400% remain unverified. The source color ratios in A-01 are independent of the current axe pass. [Browser test setup](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/tests/browserSupport.mjs#L8)

## Implementation plan for approval

1. Recheck remote and local branch state and isolate the worktree. Create or safely reuse `rank1/weighted-optimization` only after the audit is approved. Record any user changes first.
2. Establish failing regressions for the observed routing, profile loss, no-hood advice, uncertainty and persistence cases. Cover general chat and pending city corrections. Keep all working tests and existing thresholds.
3. Refactor the routing and reply boundaries against those tests. Extend strict types where data changes shape, then fix high-impact domain behavior and remove confirmed unused direct packages. Run the full verification workflow after the P0 stage.
4. Validate Firebase configuration and distinct device/cloud persistence results. Prepare schema changes against existing writers and legacy fixtures. Preserve the joint attendance transaction. Review the deployment-native quota option without changing production.
5. Address cancellation and duplicate requests only with measured regressions. Repeat the byte measurements and protect lazy vision and Guest startup. Check default `npm test`, critical-module coverage, WCAG 2.2 checks, focus and manual assistive-technology gaps.
6. Review the complete branch diff. Write `docs/quality/FINAL-100-READINESS.md` with the exact changed files, tests, before/after measurements and unresolved risks only after implementation. Stop before merge, production deployment, release publication or competition submission unless explicitly authorized.

## Inventory annotations

The fresh run passed exactly at the configured ceiling. Each row gives one source warning. A function may have both warnings. The first implementation work should follow product impact and regression evidence. [Inventory rules](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/tests/maintainability.oxlintrc.json) · [Fresh command log](https://github.com/surajns0033-collab/ecopulse-ai/commit/b2e0a9b533bef2e537c411afef6f2b3152865c59/checks/140960909839/logs)

| Function location | Finding |
| --- | --- |
| [server/aiCore.js#L51](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/server/aiCore.js#L51) | async function `aiHandler` has a complexity of 16. Maximum allowed is 15. |
| [server/chatRequest.js#L53](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/server/chatRequest.js#L53) | async function `readChatRequest` has a complexity of 23. Maximum allowed is 15. |
| [src/agent/chatAnswers.js#L11](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/chatAnswers.js#L11) | The async function `handleGeneralQuestion` has too many lines (89). Maximum allowed is 60. |
| [src/agent/chatAnswers.js#L11](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/chatAnswers.js#L11) | async function `handleGeneralQuestion` has a complexity of 38. Maximum allowed is 15. |
| [src/agent/chatPlaces.js#L32](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/chatPlaces.js#L32) | async function `resolveChatPlace` has a complexity of 32. Maximum allowed is 15. |
| [src/agent/fallbackBrain.js#L9](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/fallbackBrain.js#L9) | function `buildFallbackReply` has a complexity of 20. Maximum allowed is 15. |
| [src/agent/fallbackContacts.js#L7](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/fallbackContacts.js#L7) | function `contactLines` has a complexity of 32. Maximum allowed is 15. |
| [src/agent/healthReplies.js#L16](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/healthReplies.js#L16) | async function `handleHealthTips` has a complexity of 18. Maximum allowed is 15. |
| [src/agent/photoFinding.js#L6](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/photoFinding.js#L6) | The async function `photoFinding` has too many lines (85). Maximum allowed is 60. |
| [src/agent/photoFinding.js#L6](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/photoFinding.js#L6) | async function `photoFinding` has a complexity of 32. Maximum allowed is 15. |
| [src/agent/photoReports.js#L21](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/photoReports.js#L21) | The async function `handleImageAnalysis` has too many lines (62). Maximum allowed is 60. |
| [src/agent/photoReports.js#L21](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/photoReports.js#L21) | async function `handleImageAnalysis` has a complexity of 16. Maximum allowed is 15. |
| [src/agent/weatherReplies.js#L4](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/agent/weatherReplies.js#L4) | function `getWeatherPrecautions` has a complexity of 18. Maximum allowed is 15. |
| [src/components/chat/ChatInput.jsx#L4](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/ChatInput.jsx#L4) | The function `ChatInput` has too many lines (66). Maximum allowed is 60. |
| [src/components/chat/EmailPreviewCard.jsx#L4](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/EmailPreviewCard.jsx#L4) | The function `EmailPreviewCard` has too many lines (116). Maximum allowed is 60. |
| [src/components/chat/EmailPreviewCard.jsx#L4](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/EmailPreviewCard.jsx#L4) | function `EmailPreviewCard` has a complexity of 22. Maximum allowed is 15. |
| [src/components/chat/Header.jsx#L16](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/Header.jsx#L16) | The function `AccountMenu` has too many lines (61). Maximum allowed is 60. |
| [src/components/chat/InlineCards.jsx#L15](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/InlineCards.jsx#L15) | The function `InlineCards` has too many lines (63). Maximum allowed is 60. |
| [src/components/chat/MeetupCards.jsx#L45](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/MeetupCards.jsx#L45) | function has a complexity of 23. Maximum allowed is 15. |
| [src/components/chat/MeetupCards.jsx#L9](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/MeetupCards.jsx#L9) | The function `MeetupListCard` has too many lines (70). Maximum allowed is 60. |
| [src/components/chat/MessageBubble.jsx#L8](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/MessageBubble.jsx#L8) | function `MessageBubble` has a complexity of 18. Maximum allowed is 15. |
| [src/components/chat/chatActions.js#L54](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/chatActions.js#L54) | function `handlePlanOrPhoto` has a complexity of 17. Maximum allowed is 15. |
| [src/components/chat/chatActions.js#L75](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/chatActions.js#L75) | function `dispatchChatAction` has a complexity of 16. Maximum allowed is 15. |
| [src/components/chat/useChatComposer.js#L3](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/chat/useChatComposer.js#L3) | The function `useChatComposer` has too many lines (106). Maximum allowed is 60. |
| [src/components/meetups/EventCard.jsx#L6](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/meetups/EventCard.jsx#L6) | The function `EventCard` has too many lines (85). Maximum allowed is 60. |
| [src/components/meetups/EventCard.jsx#L6](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/components/meetups/EventCard.jsx#L6) | function `EventCard` has a complexity of 21. Maximum allowed is 15. |
| [src/contexts/AuthProvider.jsx#L23](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/contexts/AuthProvider.jsx#L23) | The function `AuthProvider` has too many lines (99). Maximum allowed is 60. |
| [src/pages/CommunityPage.jsx#L10](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/pages/CommunityPage.jsx#L10) | The function `CommunityPage` has too many lines (117). Maximum allowed is 60. |
| [src/pages/LandingPage.jsx#L4](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/pages/LandingPage.jsx#L4) | The function `LandingPage` has too many lines (103). Maximum allowed is 60. |
| [src/pages/MeetupDialog.jsx#L16](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/pages/MeetupDialog.jsx#L16) | The function `MeetupDialog` has too many lines (81). Maximum allowed is 60. |
| [src/pages/MeetupsPage.jsx#L14](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/pages/MeetupsPage.jsx#L14) | The function `MeetupsPage` has too many lines (77). Maximum allowed is 60. |
| [src/pages/ReportDetailPage.jsx#L12](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/pages/ReportDetailPage.jsx#L12) | The function `ReportDetailPage` has too many lines (111). Maximum allowed is 60. |
| [src/pages/ReportDetailPage.jsx#L12](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/pages/ReportDetailPage.jsx#L12) | function `ReportDetailPage` has a complexity of 19. Maximum allowed is 15. |
| [src/pages/useCommunityFeed.js#L8](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/pages/useCommunityFeed.js#L8) | The function `useCommunityFeed` has too many lines (109). Maximum allowed is 60. |
| [src/pages/useMeetupListing.js#L16](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/pages/useMeetupListing.js#L16) | The function `useMeetupListing` has too many lines (79). Maximum allowed is 60. |
| [src/services/aiClient.js#L47](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/aiClient.js#L47) | async function `requestAI` has a complexity of 29. Maximum allowed is 15. |
| [src/services/geminiService.js#L14](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/geminiService.js#L14) | async function `getChatResponse` has a complexity of 23. Maximum allowed is 15. |
| [src/services/meetupAttendance.js#L14](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/meetupAttendance.js#L14) | async function `saveMeetupAttendance` has a complexity of 16. Maximum allowed is 15. |
| [src/services/meetupAttendance.js#L47](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/meetupAttendance.js#L47) | function `updatePlace` has a complexity of 18. Maximum allowed is 15. |
| [src/services/onDeviceVision.js#L26](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/onDeviceVision.js#L26) | The async function `analyzeImageOnDevice` has too many lines (93). Maximum allowed is 60. |
| [src/services/onDeviceVision.js#L26](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/onDeviceVision.js#L26) | async function `analyzeImageOnDevice` has a complexity of 36. Maximum allowed is 15. |
| [src/services/placeLookup.js#L14](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/placeLookup.js#L14) | async function `lookupPlace` has a complexity of 27. Maximum allowed is 15. |
| [src/services/placeLookup.js#L69](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/placeLookup.js#L69) | async function `getDevicePlace` has a complexity of 27. Maximum allowed is 15. |
| [src/services/verifiedRecipient.js#L8](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/verifiedRecipient.js#L8) | The async function `findVerifiedRecipient` has too many lines (101). Maximum allowed is 60. |
| [src/services/verifiedRecipient.js#L8](https://github.com/surajns0033-collab/ecopulse-ai/blob/b2e0a9b533bef2e537c411afef6f2b3152865c59/src/services/verifiedRecipient.js#L8) | async function `findVerifiedRecipient` has a complexity of 25. Maximum allowed is 15. |
