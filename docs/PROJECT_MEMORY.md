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
- Full screenplay/FilmDSL/stage checkpoint outputs remain in the private Film Engine SQLite store. The PostgreSQL index cannot restore missing engine data, so true restart recovery still requires durable engine storage; multi-replica engine storage is not implemented.
- Integration coverage was added for PostgreSQL run indexing, pending-invite denial, accepted-editor visibility, creator-only resume permission and explicit missing-checkpoint behavior. Local unit/type/build checks pass; the hosted database integration remains to be run for this change.
