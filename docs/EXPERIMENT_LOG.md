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
