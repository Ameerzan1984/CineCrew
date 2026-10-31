import { strict as assert } from "node:assert";
import { test } from "node:test";
import { decryptChatGPTSecret, encryptChatGPTSecret } from "../lib/chatgpt-vault.ts";

test("ChatGPT credentials require a dedicated vault key and stay user-bound", () => {
  const chatGPTKey = process.env.CHATGPT_VAULT_KEY;
  const higgsfieldKey = process.env.HIGGSFIELD_VAULT_KEY;
  try {
    delete process.env.CHATGPT_VAULT_KEY;
    process.env.HIGGSFIELD_VAULT_KEY = Buffer.alloc(32, 7).toString("base64");
    assert.throws(() => encryptChatGPTSecret("user-one", { access_token: "identity" }), /CHATGPT_VAULT_KEY/);

    process.env.CHATGPT_VAULT_KEY = Buffer.alloc(32, 8).toString("base64");
    const encrypted = encryptChatGPTSecret("user-one", { access_token: "identity" });
    assert.deepEqual(decryptChatGPTSecret("user-one", encrypted), { access_token: "identity" });
    assert.throws(() => decryptChatGPTSecret("user-two", encrypted));
  } finally {
    if (chatGPTKey === undefined) delete process.env.CHATGPT_VAULT_KEY;
    else process.env.CHATGPT_VAULT_KEY = chatGPTKey;
    if (higgsfieldKey === undefined) delete process.env.HIGGSFIELD_VAULT_KEY;
    else process.env.HIGGSFIELD_VAULT_KEY = higgsfieldKey;
  }
});
