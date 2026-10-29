# CineMesh web workspace

The web app uses PostgreSQL for accounts, sessions, owned films, scenes, characters, follows and encrypted provider connections. There is no demo database or browser-storage fallback. Registration and sign-in use scrypt password hashes and server-side sessions, with an HttpOnly, SameSite cookie and seven-day expiry. Film and production operations are restricted to the owner. Engine checkpoints are stored by the separate film engine; link operations and checkpoints are server-to-server, with the shared engine token never sent to the browser.

Configure these server environment variables without committing secrets:

- `DATABASE_URL`: PostgreSQL URL for a dedicated CineMesh database.
- `FILM_ENGINE_URL`: private server-to-server film engine URL.
- `FILM_ENGINE_SERVICE_TOKEN`: the strong secret also configured on the engine.
- `APP_ORIGIN`: exact browser origin, such as the scheme and host. Required in production, and must match the configured public HTTPS origin when running behind a reverse proxy. For a local HTTP test, explicitly use a loopback origin such as `http://127.0.0.1:3000`.
- `HIGGSFIELD_VAULT_KEY`: base64-encoded 32-byte key for encrypted API credentials. Back this up separately from the database. Changing it without re-encrypting stored records makes those credentials unreadable.

```sh
npm install
npm run db:migrate
npm run dev
```

Production cookies are Secure unless `APP_ORIGIN` explicitly names a loopback HTTP origin. Use HTTPS for non-loopback deployments. Keep the engine private; configure durable storage and backups for both PostgreSQL and the engine's SQLite directory. The engine link creates a separate engine record and cannot commit atomically with PostgreSQL, so a network failure after creation may leave an orphan and requires reconciliation before retrying. Advance requests use idempotency keys; the browser retains an outstanding key in session storage across reloads of the same tab.

Higgsfield API credentials are encrypted and saving them does not verify the connection. Verification requires a successful status lookup for an existing API request ID; the UI displays the last verification time. Standalone MCP OAuth registration has not been verified. The adapter does not yet supply a generation queue, model catalog, or credits. Engine planning stages are simulated and do not produce video; imported FilmDSL and an Asset Library can build an offline job plan. Film publication, watch playback, comments, likes, and generation workflows are not yet implemented.

Run `npm run build` and `npm run lint` for production build and TypeScript checks. For integration tests, start the web app and engine with a **disposable** PostgreSQL database, run migrations, set `HIGGSFIELD_VAULT_KEY`, and set `CINEMESH_TEST_URL` to the app's loopback HTTP origin (including port); then run `npm run test:integration`. The test creates disposable accounts and records and submits only dummy provider credentials. Do not point it at a production database.

This account implementation is a development foundation, not hardened for public deployment. Registration indicates when an email is already registered; email verification and password recovery are not implemented. Login attempts are serialized and limited per email, but a trusted gateway still needs per-source rate limiting and abuse controls to protect registration and prevent targeted account lockouts.
