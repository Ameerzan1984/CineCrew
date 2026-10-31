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

The hosted PostgreSQL CI now passes migrations, auth/collaboration/publication/social integration, and desktop/mobile Playwright persistence + RTL checks (run 41192626181). Published Discover supports saved-render playback, search, likes and comments. Continue with user profiles and Watch-film details, then durable background generation; live OAuth/model and Higgsfield account checks still need official browser authorization and approved credentials, and paid generation still requires per-request consent.


### CI follow-up

Run `2673511` passed database migrations, web unit/type/build, provider, CineCrew engine, scheduling/render checks, both PostgreSQL integration scripts, and Playwright persistence/RTL tests on desktop and mobile. Continue with profile and Watch-film details. Live OAuth and paid provider generation remain unverified.
