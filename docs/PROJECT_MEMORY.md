# ذاكرة مشروع CineMesh

آخر تحديث: 2026-10-31. هذه الصفحة هي نقطة البدء لتلخيص حالة المنتج والتجارب. راجع [المعمارية](../ARCHITECTURE.md)، [خطة التطوير](../DEVELOPMENT_PLAN.md)، [تكامل Higgsfield](../HIGGSFIELD_INTEGRATION.md)، [سجل التجارب](EXPERIMENT_LOG.md)، و[الخطوات التالية](NEXT_STEPS.md) للتفاصيل. قواعد المشروع الأصلية موجودة في [`AGENTS.md`](../AGENTS.md) ويجب الحفاظ عليها.

## ما المنتج الذي نبنيه؟

CineMesh شبكة اجتماعية واستوديو لإنتاج الأفلام بالتعاون. يكتب صاحب الفيلم فكرته؛ يحولها عقل لغوي إلى سيناريو وFilm Bible وشخصيات ومشاهد ولقطات ثابتة الاستمرارية عبر FilmDSL. يساهم كل شخص بلقطات الفيلم مستخدمًا اعتماداته الخاصة لدى مزود التوليد. تحفظ المنصة مساهمة كل شخص وتكلفتها وحالة المهمة، ثم يجمع محرك الرندر اللقطات بالترتيب ويتيح مراجعة الفيلم ونشره.

لا يجوز نقل مفتاح شخص إلى حساب آخر أو الإنفاق من رصيده دون نسب الطلب والموافقة إليه. رصيد Higgsfield MCP بالخطة يختلف عن رصيد Higgsfield API بالدولار.

## حقائق عن المستودع

- المستودع هو `Ameerzan1984/CineCrew`، والفرع المقصود `cinemesh`.
- هذه الجولة بدأت من commit `6e860df` على الفرع `cinemesh`؛ والهدف هو التشغيل والتحقق، لا إعادة تأسيس المنتج.
- الأساس التاريخي لمرحلة CineMesh بدأ من `b3f03bd`. المقصود بذاكرة كل جولة أن تسجل Commit البداية ورأس الفرع الفعلي.
- Pull Request المعروف إلى `main`: [PR #1](https://github.com/Ameerzan1984/CineCrew/pull/1)، لم يدمج تلقائيًا.
- يجب صون CineCrew الأصلي وترخيص Apache-2.0 ونسب المصدر. مكونات CineMesh تجريبية.
- التجارب ووسائطها المحلية موجودة ضمن `data/` و`apps/web/.data/`؛ هذه المسارات مستثناة من Git. لا ترفع الوسائط أو الأسرار أو ملفات `.env`.

## ما ثبت أنه يعمل

1. **تجربة وكيل CineCrew دون توليد:** بُني FilmDSL من مشهدين وشخصية ثابتة، ثم شغّلنا `ProductionOperatorAgent.build_from_blueprint()` الحقيقي لإنتاج مواصفات مهمتين. كانت قصة الاختبار وFilmDSL مدخلات كتبناها يدويًا. لم نشغّل Art Department أو Story Editor أو بقية السلسلة اللغوية في تلك التجربة.
2. **MCP OAuth:** اكتمل تفويض مؤقت واكتُشفت 187 أداة، بينها `generate_video` مع مخطط مدخلات واضح. أعاد فحص السعر 35 رصيدًا للّقطة التجريبية ذات الخمس ثواني. رفض Higgsfield التوليد بسبب شرط الخطة `Requires plus plan or higher`. لم ينشأ فيديو MCP، وألغينا التفويض المؤقت. لم يُحفظ اتصال في CineMesh.
3. **Higgsfield API:** ولّدنا مقطعين حقيقيين من Seedance 2.5، مدة كل منهما نحو 4 ثوانٍ ودقة 480p. جعلنا المقطع الثاني يستخدم الأول مرجعًا بصريًا. محاولة API سابقة فشلت بفحص السلامة؛ ثم أعدنا التجربة بوصف مختلف ونجحت. لا نعرف من بيانات التجربة وحدها إن كانت المحاولة الفاشلة قد فوترت.
4. **FFmpeg:** جُمِع المقطعان الحقيقيان بواسطة `services/render-worker/render.py`. تحقق `ffprobe` من فيديو MP4 مدته 8.192 ثانية، بدقة 854×480، مع صوت AAC. موقع الناتج المحلي: `data/collaboration-simulation/agent-api-test/assembled.mp4`.
5. **اختبارات كود سابقة:** على commit `b3f03bd` اجتازت اختبارات الويب والبناء المذكورة في سجل العمل السابق. هذه ليست اختبارات تشغيل لقاعدة البيانات أو تدفق المستخدمين الفعلي.

تفاصيل أدلة التشغيل ومخرجاته في [سجل التجارب](EXPERIMENT_LOG.md). لا تعرض فيديو المحاكاة المرسوم محليًا في `data/collaboration-simulation/2b0f750c-1317-4fe1-8c25-d73fa8ad8e39/simulation.mp4` وكأنه توليد Higgsfield؛ إنه محاكاة موسومة بوضوح.

## ما لم يثبت بعد

- لم نشغل دورة كاملة من واجهة CineMesh مع PostgreSQL حية: تسجيل مستخدمين، حفظ فيلم، العودة إليه، التعاون، استئناف العمل على جهاز آخر.
- لم نجرّب مساهمين اثنين بحسابي Higgsfield منفصلين. نجاح API الأخير استعمل مفتاح حساب واحد لتوليد اللقطتين.
- لم نشغّل LLM داخل CineCrew في الاختبار الأخير. أنا كتبت الفكرة والوصف هنا؛ الوكيل الذي شغلناه كان Production Operator فقط. لا يوجد ما يثبت أن حساب ChatGPT الحالي متصل بخدمة LLM للمنصة.
- لم نربط عامل التوليد الموزع بطلبات المزود. لم نختبر الميزانية لكل مساهم أو العدالة أو إعادة المحاولة أو دفتر التكلفة الحي.
- لا تزال روابط Higgsfield المؤقتة وسيطًا بين المزود والاختبار. الوسائط المحفوظة محليًا لم تدخل سجل فيلم دائم داخل المنتج.
- لم نختبر أفلامًا طويلة أو مئات اللقطات؛ 60–120 دقيقة هدف مستقبلي فقط.
- محاولة تشغيل PostgreSQL محليًا رُفضت سابقًا تلقائيًا برسالة `blocked by policy`. لم يعمل اختبار PostgreSQL بسبب ذلك. لا تحاول الالتفاف على الرفض؛ أعد تقييم طريقة تشغيل مسموحة ضمن بيئة التطوير.

## الأمان والمال

- أُرسل مفتاح API في المحادثة، واستخدمناه في اختبار محلي مؤقت. لم نضعه في Git أو ملفات المشروع. لا يوجد دليل على تدويره؛ على صاحبه إلغاؤه في لوحة Higgsfield وإنشاء بديل قبل أي تجربة قادمة.
- لا تحفظ أي مفتاح أو رمز OAuth أو رابط جلسة مؤقتة في ملفات Markdown. الاعتمادات يجب أن تبقى في مدير الأسرار أو مخزن مشفر لكل مستخدم.
- لم نتحقق من فاتورة API عقب الاختبار. تسعير الموقع تقديري، ويجب قراءة لوحة الاستخدام بعد التوليد.
- رصيد MCP لا يساوي رصيد API بالدولار؛ لا تنقل الأرقام بينهما.
- تفويض OAuth المؤقت من اختبار MCP أُلغي. حساب API المستخدم في اختبار الفيديو لا يعني اتصالًا محفوظًا في CineMesh.

## أهم الملفات التقنية

- `src/pipeline.py` و`src/agents/`: سلسلة CineCrew اللغوية وأدوارها.
- `src/schemas/blueprint.py`: FilmDSL (`SceneBlueprint`).
- `src/agents/production_operator/`: إعداد مهام التوليد وتجميع CineCrew الأصلي.
- `apps/web/`: Next.js والواجهات وواجهات API.
- `services/film-engine/`: خدمة FastAPI وحالة/لقطات العمل المحلية.
- `packages/database/migrations/`: مخطط PostgreSQL للمنصة.
- `packages/providers/`: عميل Higgsfield API والتحقق من مدخلات Seedance.
- `services/generation-worker/`: أساس جدولة مهام PostgreSQL، غير مربوط بالتوليد المباشر بعد.
- `services/render-worker/`: تجميع FFmpeg المحلي.
- `HIGGSFIELD_INTEGRATION.md`: تفاصيل حدود API وMCP.

## كيف نتابع من هنا؟

ابدأ من [الخطوات التالية](NEXT_STEPS.md)، ونفذ مرحلة واحدة في كل مرة. الخطوة العملية التالية هي تشغيل بيئة اختبار PostgreSQL مسموحة، ثم إثبات الحفظ والصلاحيات لمستخدمين. بعدها اربط مدخل الفكرة بسلسلة CineCrew الفعلية، ثم اربط المهام المحفوظة بعامل API والتخزين الخاص والتجميع. حدّث هذه الذاكرة وسجل التجربة بعد كل دليل جديد، وميّز دائمًا بين `mock`, `offline agent output`, و`real provider output`.


## 2026-10-31 follow-on implementation from base commit b3f03bd (present at commit 6e860df)

- The idea-to-film endpoint now runs a CineMesh screenplay writer followed by the configured CineCrew pipeline: Art Department, Story Editor, Cinematographer, DSL Validator, VO Director, Technical Director, Dailies Reviewer, and Production Operator. The planning path forces reference-image rendering and provider execution off. Each completed stage records its agent name, status, output summary, and resumable checkpoint in the local Film Engine SQLite store; a heartbeat keeps long runs leased. CineMesh account/film data remains PostgreSQL-backed in the web app.
- The UI passes the user's film idea/settings and the selected model through the authenticated web gateway to the per-user ChatGPT plan session. It can display a completed screenplay, Film Bible/Asset Library, FilmDSL, validation/review reports, and VideoJobBatch. The web studio imports the actual VideoJob prompt and duration, bound to the matching FilmDSL shot. This is implemented but has not been run with a real ChatGPT OAuth grant or Responses API call.
- Per-shot Higgsfield API work now asks for an exact USD estimate first and requires an explicit contributor approval plus a ceiling before submission. Quotes are short-lived and bound to user, film, scene, exact prompt, duration, reference shot, and encrypted credential. The estimate endpoint path/shape are not confirmed in current official model references; the adapter fails closed. Provider tests use mocks and are not evidence of a live quote or generation. No paid generation was submitted in this phase.
- Verification for this phase: web TypeScript check passed; web unit tests passed (21); provider tests passed (16); Film Engine tests passed (13); Next.js production build passed. These are local tests/builds. PostgreSQL-backed integration and continuation tests were not run because no disposable PostgreSQL test instance/app URL is configured in this environment.
- The implementation started from `b3f03bd`. The older real two-clip API/FFmpeg experiment remains separate evidence from 2026-10-31; it did not exercise this new CineCrew idea-to-FilmDSL path, the web app, PostgreSQL, a saved user connection, or two users. Do not describe the full end-to-end goal as achieved.

## 2026-10-31 operational verification from commit 6e860df

- Workspace: branch `cinemesh`, remote `origin` is `Ameerzan1984/CineCrew`; Git status was clean before verification. A local ignored `.env` exists and contains private configuration values; no values were read into output. `.env` is not tracked by the checked-out commit. The missing local Higgsfield vault encryption key is now generated into `.env` only; it is not an API credential and was never displayed. Docker, `psql`, `pg_ctl`, and `postgres` are unavailable, ports 5432/3000/8001 are closed, and no disposable test app/database URLs are configured. A previous PostgreSQL startup attempt was rejected by automatic review as `blocked by policy`; do not bypass that restriction.
- `npm run test:unit` in `apps/web`: 27 passed. `npm run lint`: passed. `npm run build`: passed. `packages/providers` tests: 16 passed. The Film Engine test command first failed to import CineCrew's `src` package from its subdirectory; adding `services/film-engine/pytest.ini` with the repository root on pytest's import path fixed the documented command, after which 13 passed (one third-party Starlette deprecation warning).
- PostgreSQL-backed `test:integration` and `test:continuation` were started only far enough to evaluate their safety guards. Both stopped because `CINEMESH_TEST_URL` is unset; the continuation test also needs `CINEMESH_TEST_DATABASE_URL`. No DB was started and no user data was created. CineMesh was not run end-to-end; signup, login, film persistence, cross-session restoration, and two-user permission tests remain unverified.
- Official Sign in with ChatGPT docs confirm the implemented `127.0.0.1` loopback callback, exact `redirect_uri` match between authorization and token exchange, first-registration issued client ID, scopes `offline_access resource.invoke chatgpt.tokens.use.direct`, token/ID-token validation, account-bound reauthorization, resource-aware rotating refresh, account model catalog, and streamed Responses API request with `store:false`. A code issue allowed overriding the configured callback port despite the local server restriction; this round pins it to port 3000 and adds scope refresh validation/tests. No browser consent, live token exchange, model discovery, Responses request, or CineCrew idea-to-FilmDSL run occurred.
- Higgsfield's official API help states that a pre-generation estimate endpoint exists and that API billing uses a separate USD balance from plan/MCP credits. The public TypeScript SDK documents submit/status, but not an estimate method or exact quote REST shape; the Seedance model reference documents the generation endpoint/body and public pricing formula. Therefore the app's `/estimate{modelPath}` plus `usd` assumption is still not live-verified. The adapter accepts only a valid USD amount and fails closed if unavailable; the existing mock estimates do not prove API behavior. No live estimate or generation was requested, and no cost was incurred by this verification.
- Re-run requirements: start an approved, isolated disposable PostgreSQL service and app (the repo's existing Compose stack requires Docker Desktop), set `CINEMESH_TEST_URL` and `CINEMESH_TEST_DATABASE_URL` to that isolated instance, then run the two integration tests. Complete OAuth only after the app is live and the user approves in their browser. Test the exact API estimate endpoint via a newly rotated key entered through Connections before considering any paid submit. Never use the previous chat-pasted key.

## 2026-10-31 follow-on from commit 7f6a7a5 — Discover publishing and CI

- Latest origin head at start: `cinemesh` / `7f6a7a55d00661f5710b4c2ad68a72b277c8945a`, PR #1 open. The release checklist is now [COMPLETION_CHECKLIST.md](COMPLETION_CHECKLIST.md); it records acceptance criteria, implementation state and tests without treating mock output as live proof.
- Discover is now available to visitors without an account. It reads published film records with saved renders from PostgreSQL, shows real metadata/video and supports local text filtering. The owner can publish only after a `film_render` is saved; only that owner can publish or unpublish. The media route allows public reads only for a published film render; unpublishing removes that access. Likes and authenticated comments now work for published films; comment text is hidden and writes are rejected while a film is draft/unpublished. Full Watch details, ratings, replies and moderation remain open.
- Added `apps/web/test/e2e/film-persistence.spec.ts` and Playwright desktop/mobile configuration. It registers a disposable account, creates a film, reloads, reopens it from the DB-backed project list and checks RTL. It was listed as two tests and later passed on desktop/mobile against the hosted CI app and PostgreSQL; no local browser/app/DB run occurred.
- Added `.github/workflows/cinemesh-ci.yml`: temporary PostgreSQL 16, temporary per-job test-only vault/service secrets, migrations, web unit/type/build, provider tests, Film Engine, generation worker, render worker, web DB integration/continuation, and Playwright. No production secrets are needed. The first GitHub run has not happened yet.
- Local validation after this slice: web unit 27/27, TypeScript lint, Next production build, provider 16/16, Film Engine 13/13, generation worker 4 passed/6 PostgreSQL tests skipped, render worker 1/1. Film Engine emitted one third-party Starlette/httpx deprecation warning. `npm run test:e2e -- --list` found desktop/mobile cases. The initial root-level multi-service pytest command failed due service-specific module paths and missing `psycopg`; correct per-service invocation plus ignored local test-environment dependency installation passed/skipped as stated. Do not describe those skipped DB tests as passing.
- No PostgreSQL web integration, real browser session, ChatGPT consent/Responses call, live CineCrew plan, Higgsfield quote, generation, or two-account provider isolation was run. Paid request count: zero. The local `.env` and ignored Python/Node test artifacts are not part of Git.
- Next: push the feature commit, inspect the hosted `CineMesh CI` result, fix any actual failures, and keep PR #1 open. Then perform the required user-consented browser OAuth and live idea-to-FilmDSL run on an approved local/CI DB setup. Do not submit Higgsfield generation until a newly rotated key is saved through Connections, a verified quote and exact job settings are shown, and the user explicitly approves.


## Social actions and CI findings — 2026-10-31

- Discover's published film cards now read real PostgreSQL like counts/current-user state and allow sign-in gated like/unlike plus read/post comments. The API serializes like updates against publish state; unpublishing hides comments and rejects new social writes. No replies, comment editing, moderation or reporting yet.
- The hosted PostgreSQL workflow passed migrations and the auth/collaboration integration. It exposed stale test request shapes and then a missing `DELETE` export in the catch-all Next.js route. These were fixed locally; the latest 27 web unit tests, TypeScript check and production build pass. The updated publication/social integration tests and Playwright desktop/mobile persistence + RTL flow passed in GitHub Actions run 41192626181. The workflow masked ephemeral vault keys and service tokens.
- The CI vault keys and internal engine token are ephemeral test-only values and are masked in workflow logs. No real provider secrets are present in the branch.


## Public filmmaker profiles — 2026-10-31

- Public profiles expose only a user's display name and follower/following counts plus the current viewer's follow state; they never expose email. Their portfolio queries published films only when a saved `film_render` exists, and plays via the public media route. A draft/unpublished film is not listed.
- Discover and Community now link to profiles. Signed-in viewers can follow/unfollow; guests are prompted to sign in. Profile writes use the existing origin-checked Community follow endpoint.
- The integration test covers profile payload privacy, unknown UUID, published-only portfolio, follows, and unpublishing. These profile assertions passed in hosted PostgreSQL CI run 41193243766.


## Watch film details — 2026-10-31

- The public Watch API returns only published film rows with a saved `film_render`, exposing safe film metadata, asset ID, and filmmaker/editor/viewer credits. It reuses existing protected public media and comment/like routes. Draft/unpublished films return 404.
- Discover and profile cards open the Watch surface. It renders the actual stored MP4, synopsis, runtime, language, team credits, likes and comments. Guests may watch/read and are prompted to authenticate before posting. A signed-in member can open their own profile from the top bar; Playwright asserts that a private draft does not enter their public portfolio.
- Profile-only integration assertions passed in CI run 41193243766. Watch API visibility, saved-render and contributor-credit assertions passed in PostgreSQL CI runs 41193901765 and 41193897793. The top-bar profile action was hidden at desktop width; after correcting its CSS class, desktop and mobile E2E passed in CI runs 41194277322 and 41194274151. Local web unit/type/build checks passed.

## 2026-10-31 Higgsfield estimate contract safety correction

Do not treat `POST /estimate{modelPath}` or a JSON `usd` field as a verified Higgsfield contract. Official Help Center material says an estimate capability exists, but the public OpenAPI and JS SDK reviewed here do not define the REST route/response shape for the configured model. `HiggsfieldApiClient.estimate()` therefore fails before network I/O. The film estimate route returns `HIGGSFIELD_PRICE_ESTIMATE_UNVERIFIED` after access checks and creates no quote token. The Studio explains that no request was sent and disables paid generation. Saving the per-user API key remains encrypted and is not evidence of a verified connection or valid quote. Do not make a paid request to discover the quote schema.

The changed provider unit test, PostgreSQL continuation assertions (per-contributor quote ownership and no token), full build, and desktop/mobile E2E passed in GitHub Actions runs 41194987535 and 41194984814 on commit `5602628af7a3580289c55cd440d3595e5d9ed80d`. No live Higgsfield request was made. Local Docker/PostgreSQL, OpenAI OAuth, and provider-key validation remain unavailable/unverified in this environment.

## ChatGPT partial-consent and credential-isolation follow-up (2026-10-31)

- The callback now accepts and stores a valid OpenID identity grant when the account declines optional ChatGPT plan-use permissions. This status is shown as identity connected / plan use unauthorized. Model discovery and agent inference remain disabled until all required plan-use scopes are present.
- If all plan-use scopes are granted, a renewable refresh token is required. Refresh still checks that authorization scopes remain available. Disconnect skips remote revocation when no refresh token exists and always clears the local connection.
- ChatGPT token encryption now requires its dedicated CHATGPT_VAULT_KEY; it no longer falls back to HIGGSFIELD_VAULT_KEY. Added tests for partial grants and per-user vault binding.
- Verification: apps/web unit tests passed 29/29, npm run lint passed, and npm run build passed. The unit tests use a mocked token endpoint and injected identity verifier. Hosted GitHub Actions run 41195739882 passed web units/type/build, provider tests, PostgreSQL migrations, CineCrew/worker/render tests, PostgreSQL auth/film/collaboration/publication integration, and desktop/mobile Playwright checks. No real browser consent, token exchange, model listing, Responses call, or CineCrew run was performed. PostgreSQL/live service testing remains unavailable in this local environment.
## Cross-device CineCrew run index (2026-10-31)

- Added a PostgreSQL registry for CineCrew agent runs, keyed by run ID and linked to the film and initiating user. The web studio now loads saved run history from the server on any browser; browser sessionStorage is no longer the source of truth for run discovery.
- The registry exposes run ID, model, status, stage and creator display name only. It does not expose model access tokens or agent outputs. Film owner/editors may view shared run history; only the creator who authorized the ChatGPT account may resume that run. Pending invitees and viewers cannot discover it.
- Full screenplay/FilmDSL/stage checkpoint outputs are stored by the private Film Engine. It supports SQLite locally and a dedicated PostgreSQL schema for shared deployment. Hosted CI verified import from legacy SQLite and checkpoint availability across two FastAPI lifespans; actual process kill, backup/restore and multi-replica recovery remain unverified.
- Integration coverage verifies PostgreSQL run indexing, pending-invite denial, accepted-editor visibility, creator-only resume permission and explicit missing-checkpoint behavior. The first hosted run exposed that a pending invitee received HTTP 200 from the run-history endpoint. An explicit film-access check now returns 404 before querying runs. The complete hosted CI workflow passed on `7648cffe40a1e176df764fc06a42c51d19358df6` in PR run [41197250541](https://github.com/Ameerzan1984/CineCrew/actions/runs/41197250541) and push run [41197245399](https://github.com/Ameerzan1984/CineCrew/actions/runs/41197245399), including migrations, PostgreSQL integration, worker/render tests, and desktop/mobile Playwright. Local unit tests passed 29/29, TypeScript check and production build passed. No live ChatGPT OAuth/model call or Higgsfield estimate/generation was performed.
- The web agent-run registry remains a lightweight index; the Film Engine owns the full screenplay/FilmDSL/checkpoint data and can now use PostgreSQL. CI verified a legacy import and restart-lifespan recovery, but production backup/restore, OS process termination and paused-worker lease fencing remain to be tested.

## Collaboration notifications (2026-10-31)

- Added migration 012 for durable notifications and an authenticated `/api/notifications` inbox. A collaborator invite/reinvite notifies its recipient; acceptance or decline notifies the inviter. The notification query and mark-read mutation are recipient-scoped, and repeated mark-read / already-pending invite actions are idempotent.
- Added a responsive top-bar inbox with English/Arabic labels, unread count, refresh, mark-read, and a link to pending invitations. No message, email, or provider action is triggered.
- PostgreSQL continuation assertions cover anonymous denial, recipient isolation, invite event, read state, retry idempotency, accepted/declined events, and reissue after revocation. Local web unit tests passed 29/29, TypeScript check/build passed, and integration script syntax plus `git diff --check` passed. The full hosted workflow passed on commit `160fcbf682584ba3e902301b0b69d91d0ee90d0a` in PR run [41197844360](https://github.com/Ameerzan1984/CineCrew/actions/runs/41197844360) and push run [41197840247](https://github.com/Ameerzan1984/CineCrew/actions/runs/41197840247), including migration 012, PostgreSQL notification lifecycle/isolation assertions, desktop/mobile Playwright, and all engine/provider/worker/render suites. Notifications remain limited to film collaboration events; general activity and private messages are not implemented.

## CineCrew interrupted-stage recovery (2026-10-31)

- Stage checkpoint and completion state now commit atomically. When an agent run has had no heartbeat for 15 minutes, a retry reconciles stage markers against saved checkpoints: it marks checkpointed work complete and marks uncheckpointed work `worker_interrupted`, so the existing resume path skips completed stages and retries only unfinished work.
- The deterministic recovery test uses a temporary on-disk SQLite DB, simulates process loss between checkpoint and stage status writes, reinitializes storage against the same file path, and resumes the real coordinator with only pipeline/model boundaries mocked. It proves completed-stage skip and pending-stage retry, not an actual OS process kill or live LLM call.
- Local Film Engine suite passed 14 tests using `.venv/Scripts/python.exe -m pytest -q` (one pre-existing Starlette/httpx deprecation warning). A first run with system Python failed test collection because its environment lacks project dependencies; the project `.venv` run passed. Hosted CI passed on commit `3b23629a76c9b2ae1ab226dfb6f75857fbef7007` in PR run [41198212039](https://github.com/Ameerzan1984/CineCrew/actions/runs/41198212039) and push run [41198207584](https://github.com/Ameerzan1984/CineCrew/actions/runs/41198207584), including the 14-test engine suite and full PostgreSQL/desktop/mobile workflow.
- SQLite remains a per-engine-file store. Durable volume backup/restore, a shared multi-replica checkpoint store, and worker lease coordination remain open.

## Collaboration inbox browser coverage (2026-10-31)

A new Playwright test covers a real PostgreSQL-backed invite notification in the desktop/mobile browser projects: one account is registered through the UI, another account creates a collaborative film and invites it, the recipient reads the notification and accepts, then the owner inbox is checked for the response. All four desktop/mobile browser cases passed with both PostgreSQL integrations on commit `c3a567240d0892b359734fd83fe526778f600485` in PR run [41198676452](https://github.com/Ameerzan1984/CineCrew/actions/runs/41198676452) and push run [41198673016](https://github.com/Ameerzan1984/CineCrew/actions/runs/41198673016). No external provider is called.

## Film Engine PostgreSQL persistence (2026-10-31)

The engine now supports SQLite locally and PostgreSQL in a dedicated `cinemesh_engine` schema. Compose passes the app's PostgreSQL URL to the private engine. A one-time transactional SQLite importer refuses a non-empty target schema. The hosted CI integration test passed on commit `b160c603be93f54f7e353849ab6e0f4547f51b39` in push run [41201209615](https://github.com/Ameerzan1984/CineCrew/actions/runs/41201209615) and PR run [41201213840](https://github.com/Ameerzan1984/CineCrew/actions/runs/41201213840): it imports a legacy film/run/checkpoint, restores the checkpoint across two FastAPI lifespans, and serializes concurrent idempotent film advances. Local SQLite tests remain 14 passed, 1 skipped (the PostgreSQL test, because there is no local database). Existing Compose SQLite volume is retained. Real OS process kill, database backup/restore, lease fencing and multi-replica operations remain open.

## Private messaging and blocks (2026-10-31)

- Migration 013 persists one-to-one conversations, messages, per-user read timestamps, and directed blocks.
- Community can start a private conversation and block/unblock members. Pair-level PostgreSQL advisory locking serializes a block against message writes. Either-direction blocks prevent conversation reads and sends, clear both follow directions, and hide that conversation from inbox listings.
- PostgreSQL integration verifies message delivery, unread/read transitions, denial to a third account, block denial in both directions, follow cleanup and sending after unblock. Playwright checks the user flow on desktop and mobile.
- On commit `b160c603be93f54f7e353849ab6e0f4547f51b39`, the full CI passed in push run [41201209615](https://github.com/Ameerzan1984/CineCrew/actions/runs/41201209615) and PR run [41201213840](https://github.com/Ameerzan1984/CineCrew/actions/runs/41201213840), with six browser cases passing.
- Messages are one-to-one and have no websocket/push delivery. User reports, admin moderation, general activity notifications, account recovery and email verification are still open.

## Reports and audited moderation (2026-10-31)

- Migration 014 stores reports about users and films, an active-report deduplication key, admin actions, and film restriction metadata. Report creation requires a session and same-origin write, rejects self-reports/inaccessible films, and limits each account to ten reports per rolling 24 hours.
- Admin access is a fail-closed exact email allowlist from `CINEMESH_ADMIN_EMAILS`, configured outside source control. The UI can dismiss reports and hide/restore reported films. Each action and optional note is recorded in PostgreSQL in the same transaction as the status change. Film restrictions suppress public Discover/profile/watch/media/comment/like behavior and prevent owners from republishing until a moderator restores the film.
- Reports about users can be dismissed; account suspension, comment removal, job/cost-ledger review, and broader policy tooling are not implemented. The dashboard does not expose account emails.
- Local verification on the current source: 30 unit tests passed; `npm run lint` and `npm run build` passed; Playwright discovers eight desktop/mobile cases. No local PostgreSQL or Docker service is available.
- First hosted run on commit `6aa6606c41c4a21fe3230b7331ef3dc1edf5e3cc` passed migration and PostgreSQL integration but found browser-test synchronization issues. Commit `b93bdae` fixed those; its rerun then exposed a real mobile topbar hit-target overlap because the profile button intercepted Sign out. The moderation implementation is in `84d896dfee608deab3b0dbe37dd1bb1046022bd9`: it constrains the mobile profile action and uses an independent moderator browser session. Hosted push and PR runs [41203366722](https://github.com/Ameerzan1984/CineCrew/actions/runs/41203366722) and [41203371674](https://github.com/Ameerzan1984/CineCrew/actions/runs/41203371674) passed all PostgreSQL checks and eight desktop/mobile browser cases, including sign-out. Documentation-only follow-ups were revalidated in push and PR runs [41203761230](https://github.com/Ameerzan1984/CineCrew/actions/runs/41203761230) and [41203764940](https://github.com/Ameerzan1984/CineCrew/actions/runs/41203764940). Local unit/type/build checks passed; live model and provider operations remain untested.

## Film ratings and written reviews (2026-10-31)

- The current `cinemesh` change adds migration 015 and a Watch-film review workflow: one 1–5 rating and written review per signed-in user and film, with update and delete operations, average/count summary, and public recent reviews.
- Review reads and writes are limited to published films that are not moderator-hidden. Mutations use the current account identity; users can only upsert/delete their own review. Database uniqueness and rating/body constraints are enforced independently of the UI.
- PostgreSQL continuation coverage now tests draft/hidden/unpublished visibility, anonymous denial, invalid inputs, cross-account row ownership, create/update/delete, and aggregate counts. A desktop/mobile Playwright flow seeds an isolated test render, submits a review through the UI, verifies PostgreSQL persistence after reload, edits it, and deletes it.
- Local verification: web unit tests 30/30 pass, TypeScript check passes, Next production build passes, integration script syntax passes, Playwright discovers ten desktop/mobile cases, and `git diff --check` passes. Local PostgreSQL/browser integration was unavailable because PostgreSQL, Docker, and app ports are absent. The first hosted run [41205489857](https://github.com/Ameerzan1984/CineCrew/actions/runs/41205489857) passed migration and PostgreSQL integration but failed only the new E2E selector on both devices; commit `0144fce` fixed the locator and complete CI rerun [41205747829](https://github.com/Ameerzan1984/CineCrew/actions/runs/41205747829) passed.
- No OAuth, LLM, Higgsfield call, or paid generation was used for this feature. Existing provider limitations remain unchanged.


## One-level threaded film comments (2026-10-31)

- Migration 016 adds `comments.parent_comment_id`, a same-film composite foreign key, an index for loading threads, and a database trigger that rejects replies to replies. Deleting a root cascades its replies.
- Authenticated POST accepts an optional `parentCommentId`; the insert only accepts published, non-hidden films and top-level parents on that same film. Returned comment rows include the parent ID. Watch posts replies and both Watch and Discover group them under the root.
- Continuation integration and desktop/mobile E2E coverage verifies authentication, bad/missing/cross-film/nested targets, actual user attribution, PostgreSQL persistence after reload, and cascade deletion. Local unit tests (30/30), lint/typecheck, production build, syntax checks and Playwright discovery pass. Local PostgreSQL-backed integration/browser execution was unavailable because no local database is available. CI run [41206921178](https://github.com/Ameerzan1984/CineCrew/actions/runs/41206921178), retry attempt 2, passed the migration, PostgreSQL continuation and desktop/mobile E2E. The first attempt passed the new reply tests but failed once in the existing mobile message inbox assertion; rerunning that job passed. No paid or live provider request was used.

## Persistent film lists (2026-10-31; hosted CI passed)

Starting from commit `39bfd5138f62cf3b3970cfd3f7df3b08276eb3f4`, Migration 017 adds owner-scoped public/private film lists and ordered list items. Authenticated users can create, edit, delete, and populate their own lists. Public list discovery and detail only expose published, non-hidden films with a stored render; drafts and moderation-hidden titles are omitted. The Watch page can save a published film to an owned list, and Film lists supports Arabic and English.

The PostgreSQL continuation scenario covers authentication, per-owner list isolation, visibility changes, idempotent additions, origin checks, moderation/unpublish filtering, and owner-only mutation. Desktop/mobile Playwright creates a list, saves a published film, and checks the saved item after reload. Locally, all 30 web unit tests, TypeScript, the Next production build, Playwright discovery (12 cases), continuation syntax, and `git diff --check` passed. Hosted push run [41208378509](https://github.com/Ameerzan1984/CineCrew/actions/runs/41208378509) and PR run [41208384064](https://github.com/Ameerzan1984/CineCrew/actions/runs/41208384064) passed Migration 017, PostgreSQL continuation, and desktop/mobile E2E using ephemeral PostgreSQL. The Windows checkout has no Docker or local PostgreSQL client/service.

No LLM, ChatGPT, Higgsfield, or paid media generation was used for this feature. It does not change the status of live model/provider acceptance criteria.

## Saved CineCrew Film Bible and FilmDSL review (2026-10-31; hosted CI passed)

`CineCrewAgentRun` now renders the saved completed run's generated character details, relationships, locations, props and FilmDSL in collapsible review sections. This uses the run output already persisted by the private Film Engine; it does not create sample assets or claim that a new agent run succeeded. Asset editing remains the simpler PostgreSQL Production form and is not yet synchronized back into the canonical Film Engine AssetLibrary.

Both the saved-run GET and new-run POST now recursively remove local path fields and reference-image variation paths before returning data to the browser. A unit test covers path redaction while retaining reviewable data. Local web unit tests (31), TypeScript, production build, Playwright discovery (12), and `git diff --check` pass. Hosted push run [41209272113](https://github.com/Ameerzan1984/CineCrew/actions/runs/41209272113) and PR run [41209276390](https://github.com/Ameerzan1984/CineCrew/actions/runs/41209276390) passed the full workflow including PostgreSQL continuation, Film Engine checks and desktop/mobile E2E. No live ChatGPT/LLM/Higgsfield call or paid generation was made; no actual saved run was loaded in the browser during CI.

## Persistent Film Studio timeline ordering (2026-10-31; hosted CI passed)

Film Studio now has a bilingual responsive scene-order list. The owner can move any scene one place up or down; the production API locks the film, swaps unique scene positions transactionally using a temporary unused integer, and rejects boundary moves and non-owner requests. Shot contributors can still edit their own titles/descriptions, but no longer change their scene positions through the form. Assembly already consumes the persisted order. This is ordering only: audio editing, trims, transitions, subtitles and long-form rendering remain open.

Coverage added to the PostgreSQL continuation test for up/down moves, persisted GET order, boundaries and editor denial. Desktop/mobile Playwright creates two shots, reorders them, reloads the app, and checks the saved order. Local verification passed: 31/31 unit tests, TypeScript, production build, continuation/E2E syntax checks, Playwright discovery (12 cases), and `git diff --check`. Hosted run [41210529706](https://github.com/Ameerzan1984/CineCrew/actions/runs/41210529706) passed the full CI job, including PostgreSQL integration, Film Engine/worker checks, and all desktop/mobile Playwright tests. The local checkout still has no PostgreSQL service or running web app. No OAuth, LLM, Higgsfield, or paid generation request was made.

## ChatGPT OAuth flow review (2026-10-31; real account test still open)

Reviewed the current official [Sign in with ChatGPT open-source flow](https://developers.openai.com/siwc/token-sharing-open-source) and its [registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [account session](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), and [models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) pages. The local CineMesh flow uses the documented loopback callback and repeats the exact redirect URI/resource for code exchange; dynamic registration retains the issued account client ID, requests plan scopes, checks returned scopes, refreshes the renewable token, fetches the per-account model list, and treats only `response.completed` as a successful inference. Connections now shows and clears the callback result (`connected`, `permission`, `denied`, or `failed`) so the return path is understandable.

Local OAuth unit tests cover the protocol branches. The callback status UI passes local TypeScript and production build, but has not run in hosted CI yet. No live user consent, account-specific catalog, or Responses request was performed. This checkout has no running app or PostgreSQL service, and hosted mock DB tests cannot prove a real loopback OAuth/browser exchange. Keep that acceptance item open; do not call successful consent an inference test.
