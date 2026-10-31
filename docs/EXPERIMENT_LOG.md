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

**Local checks:** The web unit suite passed 29/29, `npm run build` passed, and `npm run lint` passed after running it separately from the build. A first parallel lint/build attempt raced while Next.js regenerated `.next/types` and failed with TS6053 missing generated type files; the sequential rerun passed. PostgreSQL and the local app are unavailable in this environment, so the Playwright flow is awaiting hosted CI. No ChatGPT/Higgsfield requests or paid generation were made.

**Hosted recovery result:** The immediately preceding code commit `3b23629a76c9b2ae1ab226dfb6f75857fbef7007` passed the complete PostgreSQL and desktop/mobile Playwright workflow in PR run [41198212039](https://github.com/Ameerzan1984/CineCrew/actions/runs/41198212039) and push run [41198207584](https://github.com/Ameerzan1984/CineCrew/actions/runs/41198207584). The new inbox-specific browser scenario is not included in those earlier runs; its result will be recorded after the current commit's CI completes.
