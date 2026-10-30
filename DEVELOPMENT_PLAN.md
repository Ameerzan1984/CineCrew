# Development plan

The current branch contains PostgreSQL-backed user sessions and shared film records, accepted editor/viewer roles, attributed scene contributions, a CineCrew story-editor/FilmDSL workflow, and a first per-contributor Higgsfield generation path for a documented Seedance 2.5 shot. Each user keeps a separate encrypted API key and can submit only their own scene; the generated output URL is still temporary. This is a working vertical slice, not the complete requested platform.

Remaining work:

1. Finish social and moderation workflows. In-app invitations, editor/viewer roles, attributed contributions and the two-user access-boundary integration test are implemented; the database-backed integration test still needs to run on a disposable PostgreSQL service.
2. Connect real CineCrew generative agents to durable, resumable production jobs, Film Bible and versioned continuity; eliminate unsafe truncation for long projects.
3. Expand the first Higgsfield API adapter beyond the documented Seedance 2.5 text-to-video path; add verified price estimates, full supported-model discovery, persistent media storage and cost-aware consent. The per-user MCP OAuth PKCE path and read-only tools verification are implemented, but the user's first browser authorization and real account test remain. Add MCP balance/usage display without mixing plan credits with API USD balance.
4. Integrate the PostgreSQL scheduler into authorized collaboration and real provider execution, with contributor budgets, fair-share dispatch, per-user credentials, rate limiting, uncertain-request reconciliation and cost ledger. The app currently submits only a contributor's own shot directly; the scheduler foundation is not connected to it.
5. Add private media storage, robust FFmpeg rendering, audio, subtitles, review, and explicit publishing. The app currently previews temporary Higgsfield URLs and does not assemble clips; test real playback and exports.
6. Finish Arabic/English coverage, accessibility and responsive review; harden authentication, rate limiting, observability, backups, secrets, migrations and deployment.
7. Test increasing film lengths and actual continuity, cost and failure recovery before claiming 60–120 minute support.
