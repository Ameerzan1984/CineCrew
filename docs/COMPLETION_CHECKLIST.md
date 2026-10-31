# CineMesh product completion checklist

This checklist tracks user-visible acceptance, not whether a route or mock exists. A feature is marked complete only after its acceptance flow has passed against the intended real service. A local unit test or fake provider is evidence for its own narrow behavior only.

## Pages and user journeys

| Area | Acceptance criteria | Current status and evidence |
|---|---|---|
| Landing and account access | A visitor can browse published work, register, sign in, sign out, recover an account, and edit account settings. | Registration, login, logout and server sessions exist. Guest Discover has been added. Recovery, email verification, account settings and live browser acceptance remain open. |
| Discover | Shows only published films with a saved render; search filters real published records; drafts never appear. | Publish/unpublish and DB-backed feed are implemented. Integration assertions are added in `apps/web/test/integration.cjs` and `apps/web/test/continuation.integration.cjs`; PostgreSQL execution is pending CI. |
| Watch film | Plays a durable private render only when public or authorized; displays film details, filmmaker, contributors, ratings, comments, and related work. | Published renders can be streamed anonymously; unpublishing revokes anonymous access. Film details and public playback are partial. Ratings, comments, contributor credits and recommendations remain open. |
| Create Film | Saves a title, premise, language, genre, mode and duration to PostgreSQL and reopens the same film after reload/sign-in. | Web flow and database integration coverage exist. Playwright desktop/mobile persistence coverage was added; CI has not run yet. Local PostgreSQL was unavailable. |
| My Studio | Lists owned and invited films, shows role and status, and restores the selected project from server data. | Film list, roles, invitations and API persistence are implemented. Cross-session database acceptance is pending CI. |
| Film Studio | Edits screenplay, scenes and assets; saves revisions; resumes after service/browser restart; supports undo and targeted regeneration. | Basic film details, scenes, characters, agent result import and saved media exist. Version history, undo, reliable resume across engine restarts and targeted agent stages remain open. |
| Characters | Edits persistent character records and visual references, preserving stable FilmDSL asset IDs. | Basic character CRUD exists. Reference-image management and continuity review remain open. |
| Storyboard | Displays and edits actual planned shots, camera staging, prompts and generation results. | FilmDSL and shot contributions exist. Dedicated editor, revisions, visual references and acceptance checks remain open. |
| Timeline and Audio | Arranges video, dialogue, music, sound effects, subtitles and transitions; exports synchronized output. | Not implemented as a working editor. FFmpeg currently concatenates compatible clips only. |
| AI Director | Shows screenplay and named CineCrew stage outputs, errors, cost/usage, checkpoints and resumption. | Idea-to-CineCrew code path and checkpoint display exist. Real OAuth/Responses and full live stage run are unverified; usage telemetry and per-stage restart controls remain open. |
| Collaborative Production | Invites members, assigns editor/viewer permissions, attributes contributions, and isolates each contributor's credentials and approval. | Invitations, membership authorization, scene claims/contributions and per-user provider vault exist. PostgreSQL integration tests cover two users but have not run in this environment; two real provider accounts have not been tested. |
| Social network | Follows, likes, comments/replies, lists, reviews, search, notifications, messages, block and report all persist and enforce privacy. | Follows and user discovery exist; Discover exposes current like/comment counts. Like/comment mutations, lists, reviews, notifications, messaging, block/report and moderation remain open. |
| Connections | Shows verified ChatGPT, Higgsfield API and MCP status, available models/tools, generation jobs and correctly separated usage. | ChatGPT OAuth/Responses and Higgsfield API/MCP adapters exist. OpenAI OAuth hardening has unit coverage; no live grant, model request, live API estimate or live provider generation has been performed in this stage. |
| Settings | Updates profile, privacy, locale, theme and permissions with server-side validation. | Language toggle exists. Persistent profile/privacy settings and complete dark/light preference coverage remain open. |
| Admin and moderation | Admin roles can inspect users, films, jobs, cost ledger and reports, and take audited actions. | Not implemented. |

## Backend, production, and operations

| Capability | Acceptance criteria | Current status and evidence |
|---|---|---|
| PostgreSQL | Migrations apply on a disposable service; account, film and social writes survive app restart; access isolation passes. | PostgreSQL migrations and guarded integration tests exist. The current environment has no permitted local PostgreSQL/Docker route. A PostgreSQL-backed GitHub Actions workflow has been added; its first hosted run is pending. |
| Authentication and authorization | Password/session handling, CSRF/origin checks, film roles and provider secrets remain isolated across users. | Server-side sessions and route checks exist. Web integration tests cover the main paths; live database execution is pending CI. Account recovery, email verification and trusted-gateway rate limiting remain open. |
| CineCrew planning | Idea → screenplay → all enabled agents → valid FilmDSL and VideoJobBatch; named outputs and checkpoints survive restart. | Workflow is implemented but requires a real authorized model connection and Film Engine. No live idea-to-FilmDSL run has been verified. The engine checkpoint store remains local SQLite. |
| Higgsfield API | A verified estimate is shown before explicit user approval; only the contributor's own credential submits the job; status and actual charge are reconciled. | Provider adapter fails closed, but the exact public USD-estimate route/schema is unverified. No estimate or generation was submitted during this phase. Existing mocks do not establish provider behavior. |
| Higgsfield MCP | Per-user OAuth, tools and generation capability are independently verified; plan credits remain separate from API USD. | Temporary MCP discovery was tested historically. The current saved CineMesh MCP flow has not been proven to submit generation. |
| Distributed generation | Durable queue assigns eligible jobs fairly within consent, capabilities and estimates; retries, cancellation, audit and actual cost are reconciled. | PostgreSQL scheduler primitives and tests exist, but the scheduler is not wired to the web gateway or a provider worker. No live distributed generation claim is made. |
| Storage and rendering | Provider output is durably stored; background render jobs resume; exports support normalized video, audio, subtitles and HLS. | Local media storage, saved-clip routes and short synchronous FFmpeg assembly exist. Background jobs, object storage, normalization, audio/subtitle mix, HLS and long-film tests remain open. |
| Film length | Progressively tested from a short scene through hundreds of shots and 60–120 minute output with cost/storage/recovery evidence. | No feature-length test has run. Do not claim 60–120 minute production support. |
| CI and browser tests | Pull requests run unit, type, build, provider, engine, scheduler, PostgreSQL integration, Playwright desktop/mobile, RTL, media permissions and render tests without production credentials. | `.github/workflows/cinemesh-ci.yml` now provisions an ephemeral PostgreSQL service and test-only vaults; first hosted CI execution is pending. Playwright flow and screenshot artifact capture were added. |
| Deployment and security | Production images, private service networking, TLS, workers, durable storage, backups/restore, monitoring, security headers and audited admin controls are verified. | Development Compose exists. Production deployment and recovery validation remain open. Do not publish publicly or merge until security and operational acceptance is complete. |

## Automated evidence in this checkout

| Command or check | Result in this environment |
|---|---|
| `cd apps/web && npm run test:unit` | Passed: 27 tests. |
| `cd apps/web && npm run lint` | Passed: TypeScript check. |
| `cd apps/web && npm run build` | Passed after adding Discover and publish routes. |
| `cd packages/providers && npm test` | Passed: 16 mocked/offline tests; not evidence of live Higgsfield pricing or generation. |
| Film Engine pytest from its service directory | Previously passed 13 tests. A combined invocation from the repository root failed collection because service-specific import paths were not active; CI runs each Python service from its own directory. |
| Generation worker pytest | Not run successfully in this environment because its isolated Python environment lacks `psycopg` and no PostgreSQL is available. CI installs dependencies and supplies disposable PostgreSQL. |
| PostgreSQL web integration and continuation | Not run: `CINEMESH_TEST_URL` and disposable DB are unavailable locally. New publication assertions await CI. |
| Playwright desktop/mobile | Test and configuration added; no local app/database is running, so browser execution is pending CI. |
| Real ChatGPT OAuth, model discovery, Responses API, and CineCrew model run | Not run in this stage. |
| Live Higgsfield estimate or paid generation | Not run. No paid request was submitted. |

## Working agreement

- Mark a row complete only after its stated acceptance criteria pass and attach the run/PR evidence.
- Keep mocks, offline CineCrew outputs, real language-model output, and provider-generated media clearly distinct.
- Before every paid provider request, show the verified price and settings and obtain that contributor's explicit consent. Never imply a provider-side spending cap unless the provider enforces one.
- Continue with the next open vertical slice after each successful CI run. Keep the project on `cinemesh`, update PR #1 without merging, and preserve CineCrew's Apache-2.0 source and attribution.
