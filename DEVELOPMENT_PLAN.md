# Development plan

The current branch contains PostgreSQL-backed user sessions and owner-scoped film records, a trusted-gateway link to the film engine, CineCrew offline job planning, encrypted Higgsfield API credentials and a documented REST client, plus standalone PostgreSQL scheduling primitives. This is not the complete requested platform.

Remaining work:

1. Implement and validate all social, collaborative and moderation workflows, including role-aware access and two-user tests beyond owner isolation.
2. Connect real CineCrew generative agents to durable, resumable production jobs, Film Bible and versioned continuity; eliminate unsafe truncation for long projects.
3. Wire documented Higgsfield operations to consent, spending limits, persistent handles and safe media storage; test a short real generation with authorized credentials. Verify standalone MCP OAuth registration before enabling it.
4. Integrate the tested scheduler into authorized collaboration and real provider execution, with rate limiting, cost reconciliation and withdrawal.
5. Implement media storage, editing, audio, subtitles, HLS, review and explicit publishing; test real playback and exports.
6. Finish Arabic/English coverage, accessibility and responsive review; harden authentication, rate limiting, observability, backups, secrets, migrations and deployment.
7. Test increasing film lengths and actual continuity, cost and failure recovery before claiming 60–120 minute support.
