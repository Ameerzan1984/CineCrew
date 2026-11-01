"use client";

import { useEffect, useState } from "react";

type Connection = { configured: boolean; verifiedAt: string | null; vaultReady: boolean };

async function request(method: string, payload?: unknown) {
  const response = await fetch("/api/connections/llm", { method, headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined, cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Language provider request failed");
  return result;
}

export default function OpenAIConnection({ ar }: { ar: boolean }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() { setConnection(await request("GET")); }
  useEffect(() => { refresh().catch(() => setNotice("Language provider settings unavailable")); }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setNotice("");
    try {
      await request("POST", { action: "save", apiKey: new FormData(form).get("apiKey") });
      form.reset(); await refresh();
      setNotice(ar ? "حُفظ المفتاح مشفرًا. اكتشاف النماذج يتحقق من الاتصال." : "Key saved encrypted. Discover models to verify the connection.");
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function models() {
    setBusy(true); setNotice("");
    try {
      const result = await request("POST", { action: "models" });
      await refresh();
      setNotice(ar ? `أعاد الحساب ${result.models.length} نموذجًا. اختر نموذجًا في استوديو الفيلم.` : `The account returned ${result.models.length} models. Choose one in Film Studio.`);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setNotice("");
    try { await request("POST", { action: "disconnect" }); await refresh(); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }

  return <div className="settings-card"><h3>OpenAI API</h3>
    <p>{ar ? "اربط مفتاح API الخاص بك لاستخدامه مع CineCrew. رسوم API منفصلة عن اشتراك ChatGPT." : "Connect your own API key for CineCrew. API billing is separate from your ChatGPT subscription."}</p>
    {!connection?.vaultReady && <p className="connection-note">{ar ? "يجب ضبط LLM_VAULT_KEY على الخادم لتشفير المفاتيح." : "Configure LLM_VAULT_KEY on the server to encrypt credentials."}</p>}
    <p><span className="pill">{connection?.verifiedAt ? (ar ? "تم اكتشاف النماذج" : "MODEL CATALOG VERIFIED") : connection?.configured ? (ar ? "المفتاح محفوظ، غير متحقق" : "SAVED, NOT VERIFIED") : (ar ? "غير متصل" : "NOT CONNECTED")}</span></p>
    <form className="connection-form" onSubmit={save}>
      <label>{ar ? "مفتاح OpenAI API" : "OpenAI API key"}<input name="apiKey" type="password" autoComplete="off" minLength={16} maxLength={512} required /></label>
      <button className="primary-button" disabled={busy || !connection?.vaultReady}>{ar ? "حفظ المفتاح" : "Save key"}</button>
    </form>
    {connection?.configured && <><button className="outline-button" disabled={busy} onClick={models}>{ar ? "اكتشاف النماذج" : "Discover models"}</button><button className="text-button" disabled={busy} onClick={disconnect}>{ar ? "إزالة المفتاح" : "Remove key"}</button></>}
    <p className="connection-note">{ar ? "قائمة النماذج لا تضمن دعم JSON أو الرؤية. تشغيل الوكلاء قد يستهلك رصيد API ويتطلب موافقتك." : "The catalog does not verify JSON or vision support. Running agents can incur API charges and requires your approval."}</p>
    {notice && <p role="status">{notice}</p>}
  </div>;
}
