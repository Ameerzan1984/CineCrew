# Higgsfield integration

Reviewed against Higgsfield's current API and MCP OAuth metadata on 2026-10-30. The app now supports one real API generation path for a contributor's own saved shot and a per-user MCP OAuth connection, but this is not yet the complete multi-user worker and film-rendering pipeline.

## Working API path

- Each user pastes the complete `KEY_ID:KEY_SECRET` value into one password field in Connections. The server parses it, encrypts it with AES-256-GCM, and binds the ciphertext to that user's ID. It is never returned to the browser.
- The API key is not verified on save. A successful authenticated generation submission verifies that key for the selected model. The Connections page labels Seedance 2.5 as documented; each user's account access is confirmed only by their own successful request.
- An editor can submit a generation only for a scene they created and only using their own saved credentials. The owner cannot spend a collaborator's key on their behalf. The first enabled model is Seedance 2.5 text-to-video, using a 4-second, 720p, 16:9 MP4 request with audio.
- Each scene request is stored in PostgreSQL with its contributor, model, status and Higgsfield request ID. Its owner polls the provider; the rest of the film team can see the stored status. A request with an ambiguous timeout is marked `uncertain`; the app does not retry it automatically. The contributor must check the Higgsfield dashboard before resolving it and starting another request.
- Completed results currently keep the provider's temporary video URL. The app does not yet download the clip into permanent storage, join clips with FFmpeg, or produce a final watchable film. Do not treat provider URLs as durable media.

The [Seedance 2.5 API reference](https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference) documents the endpoint, request parameters and 4–30 second duration range. The app intentionally starts at 4 seconds and 720p for a short first shot; it does not estimate the price before submission. The [Higgsfield quick start](https://open.higgsfield.ai/quick-start) requires the full copied key in one field, says saving alone must not be treated as a successful connection, and warns against blind retries after an ambiguous timeout.

API requests spend from the contributor's separate Higgsfield API USD balance. MCP plan credits are separate. This integration does not retrieve account balance or usage; users can check those in the Higgsfield API dashboard. See the [Higgsfield API account and billing guide](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api).

## MCP

The Connections page can initiate a per-user MCP OAuth connection. Higgsfield's protected-resource metadata advertises `https://clerk.higgsfield.ai` as its authorization server, and the server metadata currently supports authorization-code PKCE (`S256`), public clients, and dynamic registration. The official MCP endpoint is `https://mcp.higgsfield.ai/mcp`. On Connect, CineMesh registers or reuses a user-scoped OAuth client, uses a one-time state and encrypted PKCE verifier, and redirects the user to Higgsfield to authorize. The callback exchanges the code, stores access/refresh tokens encrypted for that CineMesh user, and verifies them with MCP `initialize` and `tools/list`. Token refresh is limited to the OAuth endpoint plus the same read-only MCP verification.

The app does not mark MCP connected until the OAuth callback and tool-list request succeed. Connecting does not generate media. Any future MCP generation must be explicitly started by the user and will use Higgsfield plan credits; those credits are separate from the API's USD balance. MCP balance/usage reads are not yet surfaced in CineMesh. The API key flow remains independent and uses API USD credits only. See Higgsfield's [MCP overview](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp), [agent setup guide](https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-ai-agent), and [API billing guide](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api).

The code and unit tests validate OAuth metadata, PKCE, client registration, token exchange/refresh, encrypted user scoping, and the read-only verification path. No Higgsfield account has authorized CineMesh through this app yet; the first end-to-end OAuth run requires the user to click Connect in Connections and approve the Higgsfield consent screen.

## Remaining work

This slice does not yet connect the distributed scheduler's budget grants to a trusted Higgsfield worker, download provider media to private durable storage, provide usage/cost reconciliation, or assemble a final film with FFmpeg. The existing render tooling needs local compatible clips and is not invoked by the web application. A paid two-user integration test, permanent storage, media access controls, assembly, and playback remain unverified. Tests in this repository use mocked provider responses and do not spend credits.
