# Development plan

Current deliverable: preserve and fork CineCrew; provide a cinematic local web experience, a local film-service foundation, simulated provider contract, and a small FFmpeg assembly tool. These are not the complete platform requested.

Remaining work, in dependency order:

1. Real identity, authorization, PostgreSQL schema/migrations, private object storage and secure deployment.
2. Persisted social, search, watch, moderation, messaging and notifications with two-user isolation tests.
3. Connect the web studio to a versioned film API and CineCrew FilmDSL; support real agent execution, durable checkpoints, continuity and asset manifests.
4. Implement documented Higgsfield API/MCP operations with per-user secrets, consent, budgets and accurate accounting; test with authorized credentials.
5. Build durable idempotent queues, fair contributor scheduling, retries, cancellation, withdrawal and cost ledger.
6. Build safe media processing, timeline/audio/subtitles, HLS and explicit publishing. Test actual renders and playback.
7. Complete Arabic RTL, light theme, accessibility, responsive and end-to-end testing; deploy with monitoring, backup, privacy, security review and operational runbooks.
8. Validate long-form films against real provider limits, continuity, runtime and cost before making quality or duration claims.
