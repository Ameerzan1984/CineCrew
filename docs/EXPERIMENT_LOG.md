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
