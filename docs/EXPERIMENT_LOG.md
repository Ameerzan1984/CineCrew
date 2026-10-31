# سجل تجارب CineMesh

لا تسجل مفاتيح أو رموزًا أو بيانات اعتماد في هذا الملف. ميّز بين خرج محاكاة محلية وخرج مزود حقيقي.

## 2026-10-31 — لقطتان API حقيقيتان مع مرجع واستيراد إلى FFmpeg

**الهدف:** التحقق من المسار الأساسي: فكرة ← خطة لقطات CineCrew ← توليد لقطات Higgsfield ← متابعة بصرية ← FFmpeg.

**ما نُفّذ:** كتب مساعد Codex مشهدًا هادئًا لمسافر بالغ يصل إلى مكتبة ساحلية. خُصص FilmDSL من لقطتين، وشُغّل `ProductionOperatorAgent.build_from_blueprint()` من CineCrew الأصلي لبناء مهمتي `VideoJob`. لم نستدع نموذج LLM أثناء هذه الخطوة؛ نص الفكرة وFilmDSL كُتبا يدويًا. أُرسلت اللقطة الأولى إلى Seedance 2.5 Text-to-Video عبر `HiggsfieldApiClient`. بعد اكتمالها استعملنا رابطها كـ`video_urls` للّقطة الثانية عبر Seedance 2.5 Reference-to-Video. نُزّل الناتجان محليًا وجُمعا باستخدام `services/render-worker/render.py`.

**النتيجة:** نجح التوليدان؛ كل مقطع نحو 4.064 ثانية، والناتج 8.192 ثانية، MP4/H.264 بدقة 854×480 وصوت AAC. عُرضت إطارات قرب الوصلة وتظهر الشخصية والملابس والموقع متناسقة بصريًا بين اللقطتين. هذه استمرارية جيدة في هذا المثال القصير وليست ضمانًا عامًا لهوية الشخصيات.

**ملفات محلية مستثناة من Git:**

- خطة FilmDSL ومهمتا الوكيل: `data/collaboration-simulation/agent-api-test/cinecrew-plan.json`.
- المقطع الأول: `data/collaboration-simulation/agent-api-test/shot-01.mp4`.
- المقطع الثاني: `data/collaboration-simulation/agent-api-test/shot-02.mp4`.
- الناتج المجموع: `data/collaboration-simulation/agent-api-test/assembled.mp4`.

**الاعتمادات والتكلفة:** أدخل صاحب الحساب مفتاح API في نموذج محلي مؤقت. لم يُحفظ المفتاح في ملف أو Git، لكن المفتاح نفسه سبق أن ظهر في المحادثة؛ يجب تدويره. فشلت محاولة توليد أولى برسالة أن النتيجة حجبتها مراجعة سلامة المحتوى؛ غيّرنا الوصف إلى مشهد ساحلي هادئ ونجحت المحاولة اللاحقة. لا نملك قراءة لوحة الفوترة لتأكيد خصم أي من المحاولتين أو قيمتهما. لا تعتبر سعر الموقع أو التقدير دليلًا على التكلفة الفعلية.

**ما لا تثبته التجربة:** لا واجهة CineMesh، لا PostgreSQL، لا اتصال LLM، لا مستخدم ثانٍ، لا حساب مزود ثانٍ، ولا تخزين دائم أو نشر. استعمل التوليدان حساب API واحدًا. يجب إجراء تجربة مستخدمين منفصلة لاختبار فكرة الموارد الشخصية.

## 2026-10-30 — تفويض MCP واكتشاف الأدوات

**الهدف:** معرفة ما إذا كان يمكن لـHiggsfield MCP أن يولّد لقطة عبر حساب المستخدم.

**ما تحقق:** نجاح تدفق OAuth/PKCE المؤقت وتعداد 187 أداة. ظهر مخطط `generate_video` وفيه حقول مثل `model`, `prompt`, `duration`, `medias`, `get_cost`. فحص تكلفة بلا توليد أعاد 35 رصيدًا للمدة والموديل المحددين.

**النتيجة:** رفض Higgsfield بدء التوليد بالخطأ `Requires plus plan or higher`. لم تُنشأ مهمة فيديو. أُلغيت صلاحية OAuth المؤقتة بعد الاختبار، ولم تحفظ CineMesh هذا الربط. شرط الخطة رُصد على الحساب الذي اختُبر فقط.

## 2026-10-31 — تمييز المحاكاة عن التوليد الحقيقي

**محاكاة محلية:** استعمل اختبار سابق حسابين وهميين ووسيط MCP وهميًا ورسومًا متحركة مصطنعة، مع وسم داخل الفيديو `SIMULATION - MOCK MCP / NOT HIGGSFIELD`. الناتج `data/collaboration-simulation/2b0f750c-1317-4fe1-8c25-d73fa8ad8e39/simulation.mp4` مدته 6 ثوانٍ. الغرض اختبار تدفق التجميع فقط، وليس إثبات اتصال المزود أو حسابين حقيقيين.

**قاعدة توثيق:** لا تخلط هذه المحاكاة بالفيلم الحقيقي ذي 8.192 ثانية أعلاه. كل تجربة مستقبلية يجب أن تذكر صراحةً مصدر الخطة، الوكيل، المزود، عدد الحسابات، المدة، حالة المهمة، مكان الملف، نتيجة التحقق، والتكلفة المؤكدة أو المجهولة.


## 2026-10-31 - CineCrew-driven idea-to-FilmDSL implementation (local tests only)

**Implemented:** Added a structured screenplay-writing stage and connected it to the existing configured CineCrew FilmDSL stages. The Film Engine records per-stage agent/status/checkpoint data and can restore typed screenplay, Asset Library, blueprint, reports, and VideoJobBatch results. The web studio now imports each actual Production Operator VideoJob prompt and duration against its FilmDSL shot. Planning forcibly disables reference-image rendering and provider execution. Higgsfield API submission is gated behind a signed short-lived quote, an explicit contributor approval, and a maximum-cost field.

**Tests/build:** Web TypeScript check passed; 21 web unit tests passed; 16 provider tests passed; 13 Film Engine tests passed; Next.js production build passed. The Higgsfield estimate tests mock the response. No real ChatGPT OAuth/Responses request, live Higgsfield estimate, or paid generation occurred during this phase. No PostgreSQL integration test ran because the environment has no configured disposable database/app URL. No production DB was started.

**Limits:** Higgsfield's estimate route and exact response schema remain unverified against a live account and are not documented in the current official model API reference consulted for this work; the UI blocks generation when it cannot obtain a valid USD quote. The previous 2-clip API/FFmpeg result is separate and does not verify this CineCrew pipeline. The idea-to-film result remains unverified with real OAuth and PostgreSQL.

## 2026-10-31 — Operational checks from commit 6e860df

**Environment:** Checked out `cinemesh` at `6e860df`. `origin` points to `Ameerzan1984/CineCrew`. The working tree was clean before verification. An ignored local `.env` contains private values; only presence flags were checked, never values. The file is not tracked. No Docker/PostgreSQL executables are installed and local ports 5432, 3000 and 8001 are closed. No test app URL or disposable DB URL is configured. A previous local PostgreSQL startup was rejected by automatic review as `blocked by policy`; no alternative startup method was attempted.

**Tests actually run:** Web unit tests 27/27 passed; Web TypeScript check passed; Next.js production build passed; provider tests 16/16 passed. Film Engine tests initially failed collection because the repository's CineCrew `src` module was not on Python's import path when invoked from the service directory. After adding a pytest import-path configuration, `python -m pytest -q` passed 13 tests with one Starlette deprecation warning. Web database integration and continuation tests were run through their safety checks and stopped because `CINEMESH_TEST_URL` is absent. No database or application integration transaction ran.

**Official documentation review:** OpenAI SIWC specifies a `127.0.0.1` loopback callback, byte-for-byte callback URI match on authorization/exchange, fresh state/nonce/PKCE, dynamic client registration and retaining the issued ID, plan scopes `offline_access resource.invoke chatgpt.tokens.use.direct`, validating token scopes and ID-token identity, rotating refresh tokens with the same `resource`, serializing refreshes, `/v1/models` with `visibility=list`, and `/v1/responses` using `store:false` and `stream:true` until `response.completed`. Code had accepted a `CHATGPT_REDIRECT_URI` on an arbitrary port even though the local app accepts return origin only at port 3000. It now rejects any redirect other than the exact local callback and adds unit coverage for redirect/scopes/refresh behavior. This code change does not prove a live OAuth grant.

Higgsfield's official API help confirms a pre-request estimate capability and separate USD API balance versus MCP/plan credits. The official TypeScript SDK documents generation lifecycle methods but no public estimate method or exact quote schema. Its Seedance 2.5 reference documents the generation endpoint and request body; the model overview publishes an indicative price formula before discounts. The current app adapter still tries `POST /estimate{modelPath}` and accepts only `usd`; that candidate REST contract has not been verified with an API account. It fails closed without a numeric USD quote. Official CLI plan-credit estimates were not treated as API USD prices. No Higgsfield estimate, paid generation, or charge occurred during this round.

**Current outcome:** Local code quality checks pass, but no real sign-in, PostgreSQL persistence/restore, real ChatGPT inference, live CineCrew plan, API quote, video render, media storage, or two-user account isolation was exercised. The app must not be called end-to-end ready based on these unit tests.

## 2026-10-31 — Published Discover slice and PostgreSQL/Playwright CI

**Starting point:** Branch `cinemesh` at `7f6a7a55d00661f5710b4c2ad68a72b277c8945a`, the head of open PR #1. The local tree was clean at the start of this follow-on. No provider credentials were read or used.

**Implemented:** Added a public Discover feed that queries only published films with saved render assets; owner-only publish/unpublish with a saved-render requirement; and anonymous access to published film-render media that is revoked when unpublished. Added a search field and responsive video cards with real database metadata. Drafts remain private. Added DB integration assertions for draft visibility, owner-only publishing, render eligibility, public playback, and unpublish revocation. Added a Playwright flow for registration, film save/reload/restore, desktop/mobile viewports, and RTL screenshots. Added `.github/workflows/cinemesh-ci.yml` with ephemeral PostgreSQL, isolated temporary secrets, web/scheduler migrations, provider and Python service tests, web/engine startup, guarded DB integration, and Playwright artifact collection. Added `docs/COMPLETION_CHECKLIST.md` with acceptance criteria and evidence states.

**Tests actually run locally:** `apps/web npm run test:unit` passed 27; `npm run lint` passed; `npm run build` passed and listed the new `/api/discover` and `/api/films/[id]/publish` routes. `npm run test:e2e -- --list` discovered the two desktop/mobile cases but did not launch a browser. Provider tests passed 16/16. Film Engine passed 13/13 with a Starlette/httpx deprecation warning. Generation worker passed 4 unit tests and skipped 6 PostgreSQL-dependent cases because no DB is configured. Render worker passed 1 FFmpeg test. An initial combined pytest invocation from the repository root failed service module imports and lacked `psycopg`; rerunning from each service directory with the existing ignored Film Engine venv and generation-worker requirements fixed the local import/dependency issue. The CI workflow uses each service directory and installs requirements.

**Not run:** The new integration assertions were not executed because this environment has no permitted PostgreSQL/Docker route or running web/engine services. No live Playwright browser flow ran. The GitHub workflow has been authored but its hosted run is pending push. No real ChatGPT OAuth, model discovery, Responses request, CineCrew live plan, Higgsfield estimate, or paid generation occurred. No costs were incurred.

**Limits:** Discover streams only assembled `film_render` assets and does not yet provide ratings, comments or likes. Publishing currently means listing a saved assembled MP4; it is not a moderation/review workflow. Long-film renders, background workers, social interactions, feature-length reliability and production deployment remain open per `docs/COMPLETION_CHECKLIST.md`.


## 2026-10-31 - Hosted CI fixes and published-film social actions

**Hosted CI evidence:** On commit `5235512`, PostgreSQL migrations, web unit/type/build checks, provider tests and Film Engine/generation/render worker tests passed. The first auth/collaboration integration run failed because its assertion assumed a stable scene array order; the test now looks up the edited scene by ID. On commit `a8b8a42`, the auth/collaboration integration passed; continuation then found its old request fixture omitted the now-required quote approval fields. The fixture has been updated with a deliberately invalid token, which should reach only the ownership/reference guards and cannot submit a provider job. The latest change has a green hosted PostgreSQL and Playwright run (see run 41192626181). CI-generated vault keys and service tokens are now explicitly masked in job logs.

**Implemented in the current working change:** Discover cards now support real per-user like/unlike actions and reading/posting comments. Writes require a signed-in session and the target film must be published. The comment feed is public only while published; drafts and unpublished films return an empty comment list, reject writes and cannot be liked. The owner/editor test flow covers two accounts, idempotency, unpublishing and revocation.

**Local checks:** Web unit tests passed (27/27), TypeScript check passed, production build passed, both integration scripts passed Node syntax checks, and `git diff --check` passed. The PostgreSQL-backed assertions were not run locally; no local database is available. GitHub Actions run 41192626181 executed both integration scripts against its isolated ephemeral PostgreSQL service and passed the publication/social assertions. No live ChatGPT or Higgsfield request or paid generation occurred; no provider cost was incurred.

**Latest run (`04e0fbd`):** Web unit/type/build, provider, migration, and Python service steps passed. The auth/collaboration integration passed. The continuation test found that the catch-all Next.js route implemented the unlike handler but did not export `DELETE`, so the test received a non-JSON 405 response. The route now exports `DELETE`, and the integration helper reports HTTP status/body on non-JSON failures. Local unit/type/build checks passed again after the fix. The corrected social-flow PostgreSQL test passed in [CineMesh CI run 41192626181](https://github.com/Ameerzan1984/CineCrew/actions/runs/41192626181): both guarded integration scripts, desktop/mobile Playwright persistence + RTL, and artifact upload succeeded. Vault/service secrets were masked. No real provider request or cost occurred.


## 2026-10-31 - Public filmmaker profiles

**Implemented:** Added public `GET /api/profiles/:id` with only display name, follower/following counts, viewer follow state, and films that are both published and backed by a saved render. Added profile pages with video portfolio and follow/unfollow UI; Discover filmmaker links and Community directory links open profiles. Public profile responses do not include email. Unpublishing removes a film from the profile portfolio.

**Coverage added:** The disposable PostgreSQL continuation scenario checks public profile shape, email exclusion, published portfolio membership, unknown profiles, sign-in required for following, follow counts/state, and portfolio removal after unpublish. Local 27-test web unit suite, TypeScript check, Next.js production build, Node syntax checks, and `git diff --check` passed with this slice. The hosted profile-specific PostgreSQL assertions have not run yet.


## 2026-10-31 - Watch film details

**Implemented:** Added public `GET /api/watch/:id`, available only while a film is published with a saved render. It returns film metadata, current like state/count, filmmaker, contributor credits and media reference without exposing account email. Discover and profile portfolios now open an independent Watch page with player, premise, runtime, credits, likes and comments. Guests can play and read; like/comment mutations prompt sign-in. Publishing status remains enforced by the existing media and social routes.

**Coverage added:** The disposable PostgreSQL integration scenario checks draft/unpublished Watch 404s, saved render metadata, and owner/editor credits. Playwright opens a member's own public profile and confirms their unpublished draft does not appear. Local unit tests passed 27/27, TypeScript check passed, production build completed, and integration/E2E scripts parse. The first hosted push and PR runs passed migrations, app build, provider/engine/render tests, and PostgreSQL integration. Mobile E2E passed; desktop E2E failed because the profile button inherited a mobile-only hidden class. That class is fixed and the hosted rerun is pending. No paid provider request was made.

## 2026-10-31 - Watch CI follow-up

Runs 41193901765 and 41193897793 passed unit/type/build, provider, migration, CineCrew engine/scheduler/render, and PostgreSQL auth/film/collaboration/publication tests, including the new Watch visibility and credit assertions. Mobile Playwright passed. Desktop Playwright timed out on the new `My profile` button because it was hidden at desktop width; the button now uses a visible class. The fix passed both subsequent CI runs 41194277322 and 41194274151, including desktop and mobile Playwright. Local unit tests passed 27/27, TypeScript and production build passed again. No paid generation or real provider request was made.

## 2026-10-31 - Fail-closed Higgsfield pricing

**Change:** Removed the speculative `POST /estimate{modelPath}` plus `usd` assumption. The API estimate adapter now fails before network I/O, the authenticated film estimate route returns `HIGGSFIELD_PRICE_ESTIMATE_UNVERIFIED` without reading/decrypting a credential or minting a quote, and the Film Studio displays the limitation and disables the generation action. The Connections page explains that saving an API key does not verify the price contract.

**Evidence:** Unit coverage asserts the estimate method makes zero provider requests and leaves connection verification false. The PostgreSQL continuation scenario checks that another contributor cannot request a quote, and that an authorized contributor receives no quote token while the contract is unavailable. The complete PostgreSQL-backed workflow, including desktop/mobile E2E, passed GitHub Actions runs [41194987535](https://github.com/Ameerzan1984/CineCrew/actions/runs/41194987535) and [41194984814](https://github.com/Ameerzan1984/CineCrew/actions/runs/41194984814). No live Higgsfield request or generation was made. Official documentation and SDK references reviewed: [API help](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api), [official API docs](https://docs.higgsfield.ai/docs/openapi.json), [official JS SDK](https://github.com/higgsfield-ai/higgsfield-js), and [Seedance 2.5 API reference](https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference). Those sources do not specify the exact USD estimate REST route/response contract.

**Limits:** No exact quote is available, so paid generation remains blocked. Existing generation approvals cannot be created through the current UI or quote route. A quote ceiling must not be represented as a guaranteed provider billing cap unless Higgsfield explicitly guarantees it.

## 2026-10-31 ChatGPT OAuth partial-consent and vault isolation

- Changed the ChatGPT callback to retain a verified OpenID identity when plan-use scopes are declined. The app reports this limited state and offers reauthorization. It does not expose models or enable agent requests until the full offline_access, resource.invoke, and chatgpt.tokens.use.direct grant is present.
- Plan-use authorization without a renewable refresh token is rejected. Token refresh checks required scopes. Disconnect revokes remotely only when a refresh token exists, then removes the local credential record.
- Removed the encryption-key fallback from CHATGPT_VAULT_KEY to the unrelated Higgsfield vault key. Added coverage for dedicated-key requirement and user-bound ciphertext.
- Tests: web unit tests 29/29 passed; TypeScript check (npm run lint) passed; Next.js production build passed. These tests mock the token exchange and identity verifier; they do not establish live OAuth or inference.
- Hosted verification: GitHub Actions run [41195739882](https://github.com/Ameerzan1984/CineCrew/actions/runs/41195739882) passed on code commit 60f8390632aa1527d13a31133895828567645569. This run passed web units/type/build, provider tests, PostgreSQL migrations, CineCrew/worker/render tests, PostgreSQL auth/film/collaboration/publication integration, and desktop/mobile Playwright persistence/RTL checks.
- No live OAuth consent, OpenAI model discovery, Responses API call, DB-backed local session, CineCrew plan, Higgsfield estimate, or paid generation was run. Local Docker/PostgreSQL is unavailable here. No provider generation was submitted.
## 2026-10-31 Cross-device CineCrew run discovery and resume

- Added migration 011 with a PostgreSQL registry linking each CineCrew run to one film, the creating contributor and selected ChatGPT model. Status/stage are synchronized from the trusted Film Engine response.
- Added an authorized run-history endpoint and UI picker. Opening a film on a different browser queries PostgreSQL, selects an active/failed run from this user's account when possible, and retrieves its actual output/checkpoints from the private engine. Other film editors can review the history, but the original creator alone may retry/resume with their own ChatGPT connection.
- Replaced browser sessionStorage run discovery with the server-side index. The app returns a specific unavailable-checkpoint error if the index exists but the engine cannot find the saved run; it does not claim the PostgreSQL metadata is the full output.
- Integration tests cover pending invite denial, accepted editor run visibility, creator-only resume capability, provider-token non-disclosure and lost engine checkpoint reporting. This path has not been exercised with a live ChatGPT run.
- Local web unit/type/build checks passed. The PostgreSQL integration is unavailable locally; paid Higgsfield generation remains disabled.

**Hosted result and access-control fix:** The first CI attempt on the run-index change failed because a pending invitee received `200` from run history. The endpoint now checks membership before returning any rows and returns `404` to pending invitees. The complete hosted workflow passed on commit `7648cffe40a1e176df764fc06a42c51d19358df6` in PR run [41197250541](https://github.com/Ameerzan1984/CineCrew/actions/runs/41197250541) and push run [41197245399](https://github.com/Ameerzan1984/CineCrew/actions/runs/41197245399). It applied PostgreSQL migrations, ran web/provider/engine/scheduler/render suites, exercised the two-user continuation tests, and passed desktop/mobile Playwright persistence/RTL checks. Local web unit tests passed 29/29, TypeScript check and Next.js build passed. This does not verify a live ChatGPT OAuth/model call, a real Film Engine LLM run, or a Higgsfield request. No paid generation was submitted.

## 2026-10-31 - Collaboration notifications inbox

**Change:** Added migration 012 and recipient-bound notifications for film invitation, invitation accepted, and invitation declined events. The inbox API lists only the signed-in recipient's events and marks only their own event as read. The current app header exposes an English/Arabic inbox with unread count and real actions to refresh, mark read, and open invitations. Pending-invitation retries do not create duplicate notifications; successful response events are written in the same transaction as the invitation state change.

**Checks:** `npm run test:unit` passed 29/29; `npm run lint` passed; `npm run build` passed and emitted `/api/notifications`; `node --check test/continuation.integration.cjs` and `git diff --check` passed. The full hosted workflow passed on commit `160fcbf682584ba3e902301b0b69d91d0ee90d0a` in PR run [41197844360](https://github.com/Ameerzan1984/CineCrew/actions/runs/41197844360) and push run [41197840247](https://github.com/Ameerzan1984/CineCrew/actions/runs/41197840247), including migration 012, the PostgreSQL two-user notification assertions, and desktop/mobile Playwright. No credentials or provider calls were used.

**Scope:** These are only collaboration lifecycle notifications. There is no general activity feed, push/email delivery, chat or message system yet.

## 2026-10-31 - CineCrew interrupted-stage checkpoint recovery

**Change:** CineCrew stage completion and checkpoint output now commit in one SQLite transaction. A stale run (no heartbeat for 15 minutes) reconciles running stage records with their checkpoint: it restores checkpointed work to completed and marks a stage without a checkpoint as `worker_interrupted` so a retry can safely resume.

**Test:** A deterministic test writes to a temporary on-disk SQLite database, leaves the Art Department checkpoint persisted while its stage marker remains running (the crash window), leaves the next stage uncheckpointed, ages the run, calls `init_db()` on the same file path, and resumes through `run_cinecrew_agents` with pipeline/model boundaries mocked. It confirms only the uncheckpointed stage is retried. It does not kill a service process, run an LLM, or prove shared storage.

**Result:** The Film Engine test suite passed 14/14 using `.venv/Scripts/python.exe -m pytest -q` from `services/film-engine` (one existing Starlette/httpx deprecation warning). The initial system-Python attempt failed collection because the global interpreter does not have the engine test dependencies; rerunning with the repository `.venv` passed. Hosted CI has not yet run this code. SQLite volume backup/restore and multi-replica coordination remain open.

## 2026-10-31 - Collaboration inbox browser flow

**Change:** Added a desktop/mobile Playwright scenario that registers a recipient in the browser, creates a separate owner account through the authenticated API, invites the recipient to a collaborative film, reads and marks the real notification, accepts the invitation through the Community UI, and verifies the owner receives the acceptance event. It uses disposable database identities and does not invoke an external provider.

**Local checks:** The web unit suite passed 29/29, `npm run build` passed, and `npm run lint` passed after running it separately from the build. A first parallel lint/build attempt raced while Next.js regenerated `.next/types` and failed with TS6053 missing generated type files; the sequential rerun passed. `npm run test:e2e -- --list` discovered four desktop/mobile cases; no local browser/database run was possible because PostgreSQL and the app are unavailable here. No ChatGPT/Higgsfield requests or paid generation were made.

**Hosted result:** Commit `c3a567240d0892b359734fd83fe526778f600485` passed the complete workflow in PR run [41198676452](https://github.com/Ameerzan1984/CineCrew/actions/runs/41198676452) and push run [41198673016](https://github.com/Ameerzan1984/CineCrew/actions/runs/41198673016). Both PostgreSQL integrations and all four Playwright desktop/mobile cases passed, including the new inbox flow. The Film Engine, generation scheduler, and render suites also passed. No live ChatGPT OAuth/model request, Higgsfield estimate, or paid generation was run.

## 2026-10-31 - PostgreSQL persistence for Film Engine checkpoints

**Change:** Added an optional PostgreSQL backend for the private Film Engine. It stores project records, FilmDSL, production plans, CineCrew run outputs, and per-stage checkpoints in the dedicated `cinemesh_engine` schema. SQLite remains the local default; configuring a PostgreSQL URL fails closed if that database is unavailable. Film and run claims use PostgreSQL advisory transaction locks; the existing stage checkpoint and completion record remain one transaction. Compose now points the engine at its existing CineMesh PostgreSQL database without sharing the web application's schema. Added a one-time transactional SQLite importer that refuses to write into a non-empty target.

**Coverage added:** The hosted engine test creates a legacy SQLite file with a run/checkpoint, creates a disposable PostgreSQL schema, imports the existing rows, starts the FastAPI app in two separate lifespans and verifies the checkpoint is available after the second startup, then issues four concurrent idempotent advances and expects one checkpoint. It also asserts that a second import is rejected. The test cleans up its generated schema. The complete run passed on commit `b160c603be93f54f7e353849ab6e0f4547f51b39` in push run [41201209615](https://github.com/Ameerzan1984/CineCrew/actions/runs/41201209615) and PR run [41201213840](https://github.com/Ameerzan1984/CineCrew/actions/runs/41201213840); the Film Engine suite reported 15 passed. Local PostgreSQL/Docker is unavailable, so the PostgreSQL branch was not run locally.

**Local checks:** Film Engine suite passed 14 SQLite tests; the new PostgreSQL case skipped because no `CINEMESH_TEST_ENGINE_DATABASE_URL` is configured. One existing Starlette/httpx deprecation warning remains. No real LLM, OAuth, provider, or paid generation was invoked.

**Limits:** This proves checkpoint persistence across separate FastAPI lifespans, not an OS process kill, PostgreSQL backup/restore, production multi-replica behavior, or fencing of a worker paused beyond its lease. The SQLite volume is preserved; the import command is opt-in and requires a stopped engine plus an empty PostgreSQL engine schema.

## 2026-10-31 - Private messaging and user blocks

**Change:** Migration 013 adds one-to-one conversations, persisted direct messages, read timestamps and directed user blocks. The Community page can open a private conversation or block/unblock a member. Pair locks serialize a send against a block; either user's block prevents both parties from reading or sending in that conversation. Blocking removes both follow directions. The inbox and messages are scoped to the authenticated participant.

**Checks:** Local `npm run test:unit` passed 29/29; `npm run build`, `npm run lint`, and `git diff --check` passed. PostgreSQL-backed Community integration now verifies two-account message delivery/read state, a third user's denial, CSRF checks, block and unblock behavior, and follow cleanup. Desktop/mobile Playwright verifies a message sent from Community appears for the recipient with unread count 1. Full CI passed on commit `b160c603be93f54f7e353849ab6e0f4547f51b39` in push run [41201209615](https://github.com/Ameerzan1984/CineCrew/actions/runs/41201209615) and PR run [41201213840](https://github.com/Ameerzan1984/CineCrew/actions/runs/41201213840), including both PostgreSQL integration scripts and all six desktop/mobile E2E cases.

**Limits:** Messages are one-to-one and refresh on navigation; there is no websocket/push delivery, group chat, report intake, or admin moderation yet. No live LLM or Higgsfield request was made.

## 2026-10-31 - Report intake and audited moderation

**Change:** Migration 014 adds user/film reports, active-report deduplication, per-account 24-hour submission limits, admin audit events, and film visibility restriction columns. The Community and Watch pages can submit reports. The responsive Admin view is shown only to exact allowlisted account emails from `CINEMESH_ADMIN_EMAILS`; its API supports report dismissal and film hide/restore. Hide/restore actions, report status, and the audit event commit together. Public feed/profile/watch/media/comment/like routes honor restrictions, and owners cannot republish until restore.

**Local checks:** 30 web unit tests passed; TypeScript and Next production build passed; `git diff --check` and integration-script syntax checks passed. Playwright discovered eight desktop/mobile tests. This Windows environment has no local PostgreSQL service, `psql`, or Docker command, so the PostgreSQL-backed integration and browser flows require hosted CI.

**Hosted results:** On `6aa6606c41c4a21fe3230b7331ef3dc1edf5e3cc`, migration and both PostgreSQL integrations passed. Playwright found synchronization issues in desktop admin navigation and the mobile message recipient-session assertion; commit `b93bdae` corrected those. Its rerun exposed a separate real mobile UI defect: the profile button overlapped the Sign out button's hit target. The trace confirmed the profile control intercepted clicks. Commit `84d896dfee608deab3b0dbe37dd1bb1046022bd9` constrains the profile width, tests the moderator in a separate session, and adds an actual sign-out assertion. Hosted push and PR runs [41203366722](https://github.com/Ameerzan1984/CineCrew/actions/runs/41203366722) and [41203371674](https://github.com/Ameerzan1984/CineCrew/actions/runs/41203371674) passed PostgreSQL and all eight desktop/mobile E2E cases.

**Verification limits:** Local PostgreSQL/browser integration was unavailable; GitHub Actions used ephemeral PostgreSQL and Chromium. The green workflow exercises application tests and does not prove live ChatGPT OAuth, model inference, Higgsfield pricing, or paid generation. No model request, Higgsfield request, or paid generation was made.

## Film ratings and written reviews — local verification (2026-10-31)

**Change:** Added migration 015 with one constrained review row per `(film_id, author_id)`. The authenticated API exposes aggregate and recent reviews only while a film is published and not moderator-hidden; each account can upsert or delete only its own review. The Watch page adds accessible 1–5 star controls, a written review, average/count, and edit/delete actions in Arabic and English. No provider calls are involved.

**Coverage added:** The PostgreSQL continuation scenario checks unpublished and moderated visibility, anonymous write denial, input validation, one-row-per-user updates, owner isolation, delete behavior and aggregate changes. A desktop/mobile Playwright scenario registers a disposable account, seeds an isolated render fixture in the disposable DB/storage, publishes through the app, writes/edits/deletes through Watch UI, reloads between actions, and confirms persisted PostgreSQL state.

**Local results:** `npm run test:unit` passed 30/30; `npm run lint` passed; `npm run build` passed; `node --check test/continuation.integration.cjs` passed; Playwright discovered ten desktop/mobile cases; `git diff --check` passed. The review PostgreSQL integration and browser run were not executed locally: no PostgreSQL, Docker, app process, or database test URL is available. The first hosted run [41205489857](https://github.com/Ameerzan1984/CineCrew/actions/runs/41205489857) applied migration 015 and passed PostgreSQL integration, but review E2E used the wrong Discover card class and failed on desktop/mobile. Commit `0144fce` changed the locator to `.discover-film-card`; full CI rerun [41205747829](https://github.com/Ameerzan1984/CineCrew/actions/runs/41205747829) passed. The ignored `.env` was not read or staged; it remains untracked. No OAuth, LLM, Higgsfield, or paid generation request was made.


## One-level threaded film comments (2026-10-31)

**Implementation:** Migration 016 adds a same-film self-reference and a trigger that only permits replies to top-level comments. Reply targets are checked against the published, non-hidden film and current authenticated session; missing, cross-film and nested targets fail closed. Watch supports posting a reply, and Watch/Discover display replies under their parent. Deleting a root comment cascades its replies.

**Coverage:** The PostgreSQL continuation scenario verifies unauthenticated and malformed writes, valid root/reply attribution, rejection of nested/cross-film targets, database trigger enforcement, persisted parent IDs, deletion cascade and visibility after unpublishing. Desktop/mobile Playwright creates a comment and reply, verifies database ownership/parent links, reloads and confirms the thread remains visible.

**Local verification:** Web unit tests 30/30 passed; TypeScript/lint and Next production build passed; continuation and E2E scripts parse; Playwright discovers ten desktop/mobile scenarios. PostgreSQL integration and browser flows could not run locally because this machine has no PostgreSQL, Docker or configured test database. Hosted CI run [41206921178](https://github.com/Ameerzan1984/CineCrew/actions/runs/41206921178) applied migration 016 and passed PostgreSQL continuation, including trigger enforcement. The initial full run passed both threaded-comment browser cases but failed once in the existing mobile private-message inbox assertion (9/10 E2E); retry attempt 2 passed the complete workflow. No OAuth, LLM, Higgsfield or paid generation request was made.

## 2026-10-31 — Persistent public and private film lists (local and hosted verification)

From branch `cinemesh` at base `39bfd5138f62cf3b3970cfd3f7df3b08276eb3f4`, added Migration 017, owner-authorized CRUD, public list discovery/detail, and Watch-to-list saving. Public list responses filter out draft, moderator-hidden, or unrendered films. The PostgreSQL continuation test covers list ownership, visibility, duplicate adds, same-origin writes, and publication/moderation filtering; a new Playwright scenario covers create/save/reload on desktop and mobile.

**Local results:** 30/30 web unit tests passed; `npm run lint`, `npm run build`, `node --check test/continuation.integration.cjs`, `npx playwright test --list` (12 tests), and `git diff --check` passed. There is no Docker executable, `psql`/`pg_isready`, or configured local disposable PostgreSQL service in this Windows environment.

**Hosted results:** Push run [41208378509](https://github.com/Ameerzan1984/CineCrew/actions/runs/41208378509) and PR run [41208384064](https://github.com/Ameerzan1984/CineCrew/actions/runs/41208384064) succeeded. CI applied Migration 017, passed PostgreSQL continuation and the desktop/mobile Playwright suite, and used an ephemeral PostgreSQL service. No ChatGPT, LLM, MCP, Higgsfield, or paid generation calls were made.

## 2026-10-31 — Review saved CineCrew Film Bible and FilmDSL (local verification)

Completed agent runs now display their persisted character/personality/relationship data, locations, props, and FilmDSL in the Film Studio result. The UI renders a selected set of library fields and does not display reference image/audio local paths. At the Next.js boundary, both GET and POST agent-run responses recursively remove filesystem path fields and reference variation paths; one new unit test verifies redaction and preserved display data.

**Local results:** 31/31 web unit tests passed; `npm run lint`, `npm run build`, Playwright discovery (12 desktop/mobile cases), `git diff --check`, and continuation-script syntax check passed.

**Hosted results:** Push run [41209272113](https://github.com/Ameerzan1984/CineCrew/actions/runs/41209272113) and PR run [41209276390](https://github.com/Ameerzan1984/CineCrew/actions/runs/41209276390) passed PostgreSQL continuation, Film Engine checks, and desktop/mobile E2E. The browser workflow did not authorize ChatGPT or load a real saved model run. No real LLM or paid provider request was submitted.

## 2026-10-31 — Persistent Film Studio scene ordering

**Change:** Added an owner-only `move_scene` action to the authenticated production API. It serializes against film mutations, locks the ordered scenes, swaps adjacent positions through a free temporary integer to satisfy the existing unique `(film_id, position)` constraint, and commits the move atomically. The Film Studio adds an Arabic/English responsive Timeline list, disables moves at the ends, and removes manual position editing from contribution forms. Editors can still edit their own shot text but cannot reorder the global timeline. FFmpeg assembly already follows scene position.

**Coverage added:** The PostgreSQL continuation scenario tests up, down, persisted order, boundary rejection and editor permission denial. Desktop/mobile Playwright creates two owned shots, moves one, reloads, and checks persisted order.

**Local results:** `npm run test:unit` passed 31/31; `npm run lint` and `npm run build` passed; integration and E2E files passed `node --check`; Playwright discovers 12 desktop/mobile cases; `git diff --check` passed. The new DB-backed continuation and browser flows did not run locally because this Windows environment has no PostgreSQL service or app process.

**Hosted results:** CI run [41210529706](https://github.com/Ameerzan1984/CineCrew/actions/runs/41210529706) passed the PostgreSQL continuation and all desktop/mobile Playwright tests. No live ChatGPT/LLM/Higgsfield request or paid generation was made.

## 2026-10-31 — Official Sign in with ChatGPT flow comparison

Reviewed OpenAI's current official [open-source OAuth flow](https://developers.openai.com/siwc/token-sharing-open-source), [registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [sessions and refresh](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), and [models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) pages. The implementation matches documented dynamic registration, `ext_agent_host_id`, issued client ID retention, scope validation, identical loopback callback/resource during token exchange, refresh, `/v1/models` account catalog, and `/v1/responses` streaming through `response.completed`. The Connections UI now reports callback outcomes and strips the one-time result from the URL.

This was a code/documentation review only. Existing OAuth unit tests are mocked. The local app and PostgreSQL service are not running, so browser approval, actual account model discovery and a Responses request remain untested. No client/user tokens were read or sent, and no LLM or paid provider request was made.

## 2026-10-31 - Persistent public filmmaker bio and browser synchronization fix

**Change:** Migration 018 adds a public 500-character filmmaker bio. The profile page lets only the signed-in profile owner edit it; the API enforces authentication, owner identity, same-origin requests, input length, trimming and database persistence. Public profile responses still omit email. The desktop/mobile Playwright flow saves a bio and reloads the profile to verify it persists. The scene-creation E2E helper now waits for each successful POST and updated timeline count before creating the next shot.

**Local results:** 31/31 web unit tests passed; `npm run lint`, `npm run build`, continuation-script syntax, Playwright discovery (12 cases), and `git diff --check` passed. This machine has no Docker, PostgreSQL client/service, or running CineMesh app, so Migration 018 and the PostgreSQL/browser scenario were not run locally.

**Hosted results:** Push run [41211956913](https://github.com/Ameerzan1984/CineCrew/actions/runs/41211956913) and PR run [41211961861](https://github.com/Ameerzan1984/CineCrew/actions/runs/41211961861) passed Migration 018, PostgreSQL integration and all 12 desktop/mobile Playwright cases. The prior run on `f305db9` failed only because the scene-order test submitted shot two before shot one had completed; the test now waits for each successful response and persisted item count. No ChatGPT, LLM, Higgsfield or paid generation call was made.
