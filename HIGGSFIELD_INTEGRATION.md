# Higgsfield integration

The provider contract is in `packages/providers`. The mock is explicitly simulated and is suitable only for local development. Both Higgsfield API and MCP implementations fail closed: neither authentication, capability discovery, generation, usage nor balance is implemented. No credits or costs should be inferred. API keys and MCP OAuth are separate connection types and must remain separate.

Before real integration, verify current official provider documentation and terms, implement the documented authentication and operations, encrypt credentials per user, enforce explicit consent and spending limits, and test cancellation, failures and accounting against a real authorized account. OpenHiggsfield was inspected as a separate MIT-licensed project, not as an official Higgsfield backend; no code from it has been copied.
