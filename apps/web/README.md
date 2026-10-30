# CineMesh web workspace

The web app uses PostgreSQL for accounts, sessions, films, scenes, characters, follows, invitations and encrypted provider connections. There is no demo database or browser-storage fallback. Registration and sign-in use scrypt password hashes and server-side sessions, with an HttpOnly, SameSite cookie and seven-day expiry. Owners can invite registered accounts to collaborative films; accepted editors can add and edit their own attributed shot descriptions, while viewers can only read. Credentials stay scoped to the account that connected them. Engine checkpoints are stored by the separate film engine; link operations and checkpoints are server-to-server, with the shared engine token never sent to the browser.

Configure these server environment variables without committing secrets:

- `DATABASE_URL`: PostgreSQL URL for a dedicated CineMesh database.
- `FILM_ENGINE_URL`: private server-to-server film engine URL.
- `FILM_ENGINE_SERVICE_TOKEN`: the strong secret also configured on the engine.
- `APP_ORIGIN`: exact browser origin, such as the scheme and host. Required in production, and must match the configured public HTTPS origin when running behind a reverse proxy. For a local HTTP test, explicitly use a loopback origin such as `http://127.0.0.1:3000`.
- `HIGGSFIELD_VAULT_KEY`: base64-encoded 32-byte key for encrypted Higgsfield API credentials and MCP OAuth tokens. Back this up separately from the database. Changing it without re-encrypting stored records makes those credentials unreadable.
- `CHATGPT_VAULT_KEY`: a separate base64-encoded 32-byte key for per-user ChatGPT OAuth tokens. If omitted, the local adapter can use `HIGGSFIELD_VAULT_KEY`; prefer a dedicated key and keep it outside Git.

```sh
npm install
npm run db:migrate
npm run dev
```

For the local container stack on Windows, run `.\apps\web\scripts\init-local-compose-env.ps1` from the repository root, then `docker compose up --build -d`. The script creates fresh local database, service-authentication, and vault secrets in the Git-ignored `.env` file and never prints their values. The Compose migration service applies database migrations before the web app starts. Docker Desktop must be installed and running.

Production cookies are Secure unless `APP_ORIGIN` explicitly names a loopback HTTP origin. Use HTTPS for non-loopback deployments. Keep the engine private; configure durable storage and backups for both PostgreSQL and the engine's SQLite directory. The engine link creates a separate engine record and cannot commit atomically with PostgreSQL, so a network failure after creation may leave an orphan and requires reconciliation before retrying. Advance requests use idempotency keys; the browser retains an outstanding key in session storage across reloads of the same tab.

For the collaborative shot flow, create a film in collaborative mode, invite a registered account, and have that account accept under Community → Film invitations. Each editor adds their own ordered shot description in the shared studio. Under Connections, each contributor pastes their complete Higgsfield API key into one password field; the server encrypts it for that account. Saving alone does not verify a key. A contributor may then submit a 4-second, 720p, 16:9 Seedance 2.5 shot for a scene they created. This paid request uses that contributor's own Higgsfield API balance; MCP credits are separate. The request and status are stored in PostgreSQL, and the contributor's studio polls the request. If submission times out ambiguously, the job is marked uncertain and is not retried automatically. Check the provider dashboard before confirming that no request exists and starting another.

The owner or an editor can also send the screenplay and saved team contributions to CineCrew; the resulting Film Bible and FilmDSL are persisted by the film engine. Completed Higgsfield API videos appear in the shared studio using the provider's temporary output URL. Permanent media storage, scheduler budget grants/provider worker execution, usage and balance retrieval, final FFmpeg assembly, and published-film playback are not implemented yet. The MCP OAuth path is implemented but still needs the first user's browser consent and end-to-end account verification. See `HIGGSFIELD_INTEGRATION.md` for the current scope and official model/API references.

The optional ChatGPT-plan connection uses OpenAI's current open-source Sign in with ChatGPT flow. It requires a separate user consent for plan usage, makes Responses API calls with `store:false`, and does not access ChatGPT conversation history or use Higgsfield credits. The local development callback is fixed to `http://127.0.0.1:3000/api/connections/chatgpt/callback`; open CineMesh at `http://localhost:3000` or `http://127.0.0.1:3000`. This preview flow is intended for local open-source testing and must not be exposed as a remote or paid integration unless OpenAI approves that use. The first real CineCrew vertical slice runs Art Department and Story Editor, saves a Film Bible/asset library and FilmDSL, and checkpoints the run in the film engine. It does not generate video or submit Higgsfield jobs. ChatGPT plan usage is shared with the account and must be tested explicitly in Connections.

Run `npm run test:unit`, `npm run lint` and `npm run build` for pure unit, TypeScript and production-build checks. For integration tests, start the web app and engine with a **disposable** PostgreSQL database, run migrations, set `HIGGSFIELD_VAULT_KEY`, and set `CINEMESH_TEST_URL` to the app's loopback HTTP origin (including port); then run `npm run test:integration`. The test creates disposable accounts and records and submits only dummy provider credentials. Do not point it at a production database.

This account implementation is a development foundation, not hardened for public deployment. Registration indicates when an email is already registered; email verification and password recovery are not implemented. Login attempts are serialized and limited per email, but a trusted gateway still needs per-source rate limiting and abuse controls to protect registration and prevent targeted account lockouts.
