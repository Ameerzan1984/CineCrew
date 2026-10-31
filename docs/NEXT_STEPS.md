# الخطوات التالية في CineMesh

هذه قائمة تنفيذ مرتبة حسب الاعتماديات. انتقل إلى المرحلة التالية بعد تحقق معايير الحالية. راجع [ذاكرة المشروع](PROJECT_MEMORY.md) قبل البدء وأضف النتائج إلى [سجل التجارب](EXPERIMENT_LOG.md).

## المرحلة 1 — قاعدة البيانات وتعاون مستخدمين

1. شغّل PostgreSQL معزولًا للتطوير والاختبار عبر طريقة مسموحة في بيئة العمل؛ لا ترفع الخدمة الداخلية إلى الإنترنت.
2. طبّق migrations الخاصة بالموقع واختبر التسجيل والجلسات وإنشاء فيلم وحفظه وفتحه لاحقًا من جلسة ثانية.
3. أنشئ مستخدمين تجريبيين منفصلين. أثبت أن المالك يدعو محررًا، وأن لكل مساهمة هوية وحالة، وأن المستخدم لا يقرأ أو يعدل أفلامًا غير مصرح بها.
4. شغّل اختبار الوصول التكاملي على قاعدة disposable وسجّل النتائج. لا تستخدم حسابًا أو بيانات إنتاج.

**معيار الإنجاز:** يتمكن مستخدمان من حفظ الفيلم واستعادته، وتنجح اختبارات التفويض لكل دور، من دون تخزين أساسي في localStorage.

## المرحلة 2 — العقل وسلسلة CineCrew

1. اربط مدخل فكرة الفيلم بتشغيل CineCrew pipeline بالترتيب الموثق في `AGENTS.md`.
2. مرر Film Bible وAsset Library بالمعرّفات الثابتة، ثم سيناريو وفصولًا ومشاهد ولقطات إلى FilmDSL.
3. احفظ كل مرحلة ونسختها وحالتها في سجل دائم؛ دعم الاستكمال من آخر مرحلة بعد إعادة التشغيل.
4. صل مزود LLM عبر إعداد خادمي آمن. لا تدّع أن حساب ChatGPT الشخصي متصل ما لم توجد واجهة مصادق عليها وموثقة لذلك؛ استخدام LLM API منفصل يحتاج مفتاحًا يضبطه المستخدم في السرّيات.
5. أضف صفحة تعرض أثر الوكيل ومخرجاته وأخطاءه، دون تسريب الأسرار.

**معيار الإنجاز:** فكرة واحدة تجتاز السلسلة الفعلية وتنتج FilmDSL صحيحًا وموثقًا مع trace لكل مرحلة، ويمكن استئنافها بعد إيقاف العامل.

## المرحلة 3 — API وتوزيع لقطات بين مساهمين

1. اربط المهام المحفوظة بعامل موثوق يستخدم `packages/providers`; لا تستعمل مسار التشخيص المؤقت في المنتج.
2. اجعل كل مساهم يربط اعتماد Higgsfield API الخاص به، ويتلقى مهامه المخصصة فقط، ويوافق على التكلفة قبل الإرسال.
3. سجل صاحب المهمة وموديلها وتقدير التكلفة وموافقتها ومعرّف المزود وحالاتها ونتيجتها الفعلية.
4. عالج التوقيت الملتبس دون إعادة إرسال آلية. افحص حالة الطلب لدى المزود قبل قرار المستخدم بإعادة المحاولة.
5. اختبر مستخدمين حقيقيين/تجريبيين مع حسابين منفصلين ومهمة لكل مساهم. تحقق من منع الخلط بين المفاتيح والميزانيات.

**معيار الإنجاز:** لكل مساهم ظهور واستخدام رصيده الخاص فقط، مع سجل تدقيق قابل للمراجعة وخيار توقف وإعادة محاولة آمن.

## المرحلة 4 — الاستمرارية والتخزين والتجميع

1. احفظ الفيديوهات في تخزين خاص دائم مرتبط بالفيلم واللقطة، مع صلاحيات تنزيل ومراجعة.
2. مرر مراجع الشخصية أو اللقطة السابقة عند دعم الموديل، ثم اختبر الاستمرارية بصريًا؛ لا تعد المطابقة ضمانًا.
3. اجعل render worker مهمة خلفية قابلة للاستئناف، ووحّد دقة وترميز ومعدل إطارات وصوت المقاطع قبل FFmpeg concat.
4. أضف شاشة المراجعة والملاحظات وإعادة توليد لقطة واحدة وتثبيت نسخة قبل النشر.

**معيار الإنجاز:** يمكن فتح المشروع من جلسة مختلفة، إعادة توليد لقطة واحدة، ثم تصدير فيلم محفوظ صحيح تقنيًا مع سجل نسخ.

## المرحلة 5 — MCP وبقية الاستوديو

1. أبق MCP OAuth مستقلًا عن API. اعرض حالة الاتصال بعد نجاح OAuth وأداة القراءة؛ لا تعرض توليدًا ناجحًا لمجرد نجاح الاتصال.
2. تحقق من مخطط الموديل والرصيد والتكلفة لكل مستخدم قبل تنفيذ طلب MCP. اختبر بحساب مؤهل؛ حساب التجربة السابق رفض التوليد بسبب الخطة.
3. أكمل Discover، Watch، Profiles، Film Studio، Character Manager، Storyboard، Timeline، Audio، Notifications، Admin، moderation، ونشر الفيلم، وكل صفحة مرتبطة ببيانات حقيقية وصلاحيات.

**معيار الإنجاز:** حسابا API وMCP يظلان منفصلين في إعدادات الحساب والتكلفة والوظائف، وكل شاشة تميّز البيانات الحقيقية عن الفارغة.

## المرحلة 6 — قياس فيلم طويل

ابدأ بمشهد قصير؛ قس جودة اللقطات والتكلفة والتخزين والمدة وإعادة المحاولات. زد عدد اللقطات تدريجيًا من مشهد إلى فصل إلى عشرات ثم مئات. اختبر استعادة عامل متوقف وإعادة لقطة واحدة. لا تكتب أن 60–120 دقيقة مدعومة حتى ينجح تصدير اختبار فعلي بهذه المدة.

## سجل التحقق بعد كل مرحلة

اكتب في سجل التجارب: التغييرات، الحسابات/الأدوار الوهمية أو الحقيقية، الاختبارات التي شغلتها، النتيجة، التكلفة المؤكدة أو غير المؤكدة، ومكان الوسائط. حدّث جدول الحالة في ذاكرة المشروع وخطة التطوير. لا تضع API keys أو رموز OAuth أو `.env` في Markdown.


## Immediate verification state (2026-10-31)

### Latest implementation checkpoint (2026-10-31, based on commit 7f6a7a5)

Discover publishing and a GitHub Actions PostgreSQL/Playwright workflow were added after the earlier verification note. Local web unit/type/build and provider/engine/worker tests pass as recorded in `EXPERIMENT_LOG.md`; no local DB was started. The hosted PostgreSQL integration and desktop/mobile Playwright flow later passed in run 41192626181.

1. Push the current `cinemesh` change and inspect the `CineMesh CI` check on PR #1. Fix failures and wait for the workflow to complete before claiming DB-backed publication or E2E acceptance.
2. Once CI passes, run the real ChatGPT sign-in in the locally running app only after the user's browser consent. Verify connection, account model list, a live Responses request, then a real CineCrew idea-to-FilmDSL run. Record failures and prove checkpoint restoration; do not submit a provider job in this step.
3. Connect the user's newly rotated Higgsfield API credential through Connections. Verify the documented estimate contract without submitting generation; if the provider contract remains unverifiable, leave the UI fail-closed and report it.
4. Only after the user reviews exact model, prompt, duration, resolution, audio settings and a verified price may that contributor approve a short paid generation. Persist it, verify public/private media access, and test an explicit unpublish. Obtain approval before each paid job.
5. Continue with the next unchecked product acceptance rows in `COMPLETION_CHECKLIST.md`: social engagement, durable agent checkpoints, provider worker, background rendering, remaining pages and production deployment.

1. On a machine/environment where Docker Desktop is available and permitted, keep the existing local `.env` unchanged and start the existing isolated development stack from the repository root with `docker compose up --build -d`. It binds the web app to loopback and creates a dedicated Compose PostgreSQL volume. Wait for migration and web services to become healthy. Run both integration tests inside the web container with `docker compose exec -e CINEMESH_TEST_URL=http://127.0.0.1:3000 web sh -c 'export CINEMESH_TEST_DATABASE_URL="$DATABASE_URL"; npm run test:integration && npm run test:continuation'` so they reach the private Compose DB. If Docker is unavailable, use an explicitly approved disposable PostgreSQL service; do not install or start a database through a route blocked by environment policy.
2. Complete Sign in with ChatGPT through the official app flow. Confirm OAuth callback, connection state, model discovery, and one real Responses request using the authorized model. Do not substitute mock tests for this evidence.
3. Confirm the exact Higgsfield API estimate path and response with a newly rotated key saved through Connections. Public docs confirm that an estimate endpoint exists, but the public SDK/model API reference does not publish the exact REST schema. The current app expects a provider USD estimate and fails closed if it is absent. Do not substitute CLI/MCP plan credits for the API USD amount or use a paid generation to test pricing.
4. Obtain a newly rotated Higgsfield API key through the Connections UI only. Then request a quote for 2-3 short jobs generated by the real Production Operator VideoJobBatch; each contributor approves their own shot. Do not put the key in source, Git, logs, or project memory.
5. Verify that the jobs use the resolved CineCrew prompts, then save resulting media durably and assemble it with FFmpeg in the CineMesh UI. Record provider IDs, duration, resolution, media sizes, and errors without credentials.
6. Run the two-user PostgreSQL scenario: separate CineMesh accounts, film collaboration, different shot ownership, each user's private provider credential, and per-shot approval. Only then claim cross-user generation works.
7. Before pushing, inspect Git status and staged diff for `.env`, credential material, generated media, `.venv`, or run output. Push `cinemesh` and update PR #1 without merging once the review is clean.


## Latest checkpoint — 2026-10-31

The hosted PostgreSQL CI passes migrations, auth/collaboration/publication/social integration, and desktop/mobile Playwright persistence + RTL checks (run 41192626181). Published Discover supports saved-render playback, search, likes and comments. Public filmmaker profiles and their PostgreSQL privacy/follow assertions passed in CI run 41193243766. The Watch API and credit/visibility assertions passed in runs 41193901765 and 41193897793. A desktop-only hidden profile button was fixed and both desktop/mobile reruns passed in runs 41194277322 and 41194274151. Continue with durable background generation. Live OAuth/model and Higgsfield account checks still need user-authorized browser login and rotated provider credentials; paid generation still requires per-request consent.


### CI follow-up

Run `2673511` passed the earlier database, unit/type/build, provider, engine, scheduler/render, PostgreSQL integration, and desktop/mobile Playwright checks. Profile integration passed in CI run 41193243766. Watch API, visibility and contributor-credit integration passed in CI runs 41193901765 and 41193897793. The desktop profile-button fix, plus mobile, passed in CI runs 41194277322 and 41194274151. Live OAuth and paid provider generation remain unverified.

## Immediate provider-pricing gate (2026-10-31)

1. Keep Higgsfield paid generation disabled. Public official materials confirm estimates generally but do not disclose a verifiable route/response contract for this model.
2. Obtain the current estimate contract from Higgsfield's official docs/support or official SDK. Verify route, request shape, USD currency, adjustments, and whether the value is a quote or only indicative. Do not probe guessed paths.
3. Add a contract test based only on the verified schema. Keep the existing test asserting zero network calls until that evidence exists.
4. Only after exact cost details are shown in the UI may the contributor explicitly approve the one request. Do not claim a provider-enforced spend cap unless documented.
5. After this gate, continue with real ChatGPT OAuth/inference, CineCrew FilmDSL run, disposable PostgreSQL restore/permissions, durable workers/storage, and two-account credential-isolation acceptance.

## Immediate follow-up after the OAuth handling update (2026-10-31)

The previous live-test steps remain open. Run CineMesh and its isolated PostgreSQL service in a permitted local/CI environment, set a dedicated CHATGPT_VAULT_KEY outside Git, and complete Sign in with ChatGPT in the user's browser. Verify the resulting grant, discover models, make one authorized Responses request, and run the idea-to-FilmDSL path. Record actual errors and resumability. Do not submit any Higgsfield generation until the provider's exact USD estimate contract is confirmed and the user approves the displayed job and cost.

The full isolated PostgreSQL and desktop/mobile browser CI workflow passed on code commit 60f8390632aa1527d13a31133895828567645569 in GitHub Actions run 41195739882. It does not substitute for the still-unverified real ChatGPT consent/inference or provider tests.
## Cross-device run index follow-up (2026-10-31)

Migration 011 and the PostgreSQL run-index checks passed in hosted CI on commit `7648cffe40a1e176df764fc06a42c51d19358df6` (PR run [41197250541](https://github.com/Ameerzan1984/CineCrew/actions/runs/41197250541), push run [41197245399](https://github.com/Ameerzan1984/CineCrew/actions/runs/41197245399)). The test verifies owner/editor visibility, creator-only resume, pending-invite denial, no token exposure, and an explicit 410 when the indexed engine checkpoint is missing. The first run caught the pending-invite access bug; the corrected guard passed on the current head.

Stage/checkpoint commits are now atomic, and a stale-running retry reconciles checkpointed stages before resuming. A deterministic local test reopens the same SQLite file and verifies the completed stage is skipped while only the uncheckpointed stage is retried. Next, move full run payload/checkpoint and worker lease state to a shared durable transactional store, then test an actual service process kill/restart and persistent-volume backup/restore. SQLite remains a single-file, single-instance store; this test does not prove multi-replica execution. Live ChatGPT OAuth/inference remains untested.

The collaboration notification inbox is implemented in migration 012 and the web app. Local units, typecheck, build, and continuation-test syntax passed; hosted PostgreSQL and desktop/mobile CI passed in PR run 41197844360 and push run 41197840247. Continue the durable CineCrew checkpoint/worker-recovery slice above. Add a dedicated inbox browser assertion in a later pass; current Playwright coverage does not directly click the notification panel.
