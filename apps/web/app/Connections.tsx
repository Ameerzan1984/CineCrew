"use client";
import { useEffect, useState } from "react";

type Status = { api: { configured: boolean; verified: boolean; verifiedAt: string | null }; mcp: { available: boolean; reason: string }; models: unknown[]; jobs: unknown[]; usage: unknown; balance: unknown };
type ChatGPTStatus = { vaultReady: boolean; connected: boolean; account: null | { email: string | null; name: string | null; planUsageEnabled: boolean; lastInferenceAt: string | null; connectedAt: string }; usageUrl: string };

async function call(method: string, payload?: unknown) {
 const response = await fetch("/api/connections", { method, headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined, cache: "no-store" });
 const data = await response.json(); if (!response.ok) throw new Error(data.error || "Connection request failed"); return data;
}
async function callChatGPT(payload?: unknown) {
 const response = await fetch("/api/connections/chatgpt", { method: payload ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined, cache: "no-store" });
 const data = await response.json(); if (!response.ok) throw new Error(data.error || "ChatGPT request failed"); return data;
}

export default function Connections({ ar }: { ar: boolean }) {
 const [status,setStatus] = useState<Status|null>(null), [chatgpt,setChatGPT] = useState<ChatGPTStatus|null>(null);
 const [notice,setNotice]=useState(""), [chatGPTNotice,setChatGPTNotice]=useState(""), [busy,setBusy]=useState(false), [models,setModels]=useState<Array<{id:string;name:string}>>([]), [model,setModel]=useState("");
 async function refresh() { setStatus(await call("GET")); }
 async function refreshChatGPT() { setChatGPT(await callChatGPT()); }
 useEffect(()=>{ refresh().catch(e=>setNotice(e.message)); refreshChatGPT().catch(e=>setChatGPTNotice(e.message)); },[]);
 async function submit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); const form=event.currentTarget, fields=new FormData(form); setBusy(true); setNotice("");
  try { await call("POST",{action:"save",keyId:fields.get("keyId"),keySecret:fields.get("keySecret")}); form.reset(); await refresh(); setNotice(ar ? "تم حفظ بيانات الاعتماد مشفرة. لم يتم التحقق من الاتصال بعد." : "Credentials saved encrypted. The connection has not been verified yet."); } catch(e) { setNotice((e as Error).message); } finally { setBusy(false); }
 }
 async function verify(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); const form=event.currentTarget, fields=new FormData(form); setBusy(true); setNotice("");
  try { await call("POST",{action:"verify",requestId:fields.get("requestId")}); form.reset(); await refresh(); } catch(e) { setNotice((e as Error).message); } finally { setBusy(false); }
 }
 async function disconnectHiggsfield() { setBusy(true); try { await call("POST",{action:"disconnect"}); await refresh(); } catch(e) { setNotice((e as Error).message); } finally { setBusy(false); } }
 async function connectChatGPT() {
  setBusy(true); setChatGPTNotice("");
  try { const result = await callChatGPT({action:"connect"}); window.location.assign(result.authorizationUrl); }
  catch(e) { setChatGPTNotice((e as Error).message); setBusy(false); }
 }
 async function loadModels() {
  setBusy(true); setChatGPTNotice("");
  try { const result = await callChatGPT({action:"models"}); setModels(result.models); if (!model && result.models[0]) setModel(result.models[0].id); if (!result.models.length) setChatGPTNotice(ar ? "لم يعرض الحساب نماذج متاحة." : "This account did not return any available models."); }
  catch(e) { setChatGPTNotice((e as Error).message); } finally { setBusy(false); }
 }
 async function verifyChatGPT() {
  setBusy(true); setChatGPTNotice("");
  try { if (!models.length) { const result = await callChatGPT({action:"models"}); setModels(result.models); if (!model && result.models[0]) setModel(result.models[0].id); const chosen = model || result.models[0]?.id; if (!chosen) throw new Error("No models are available for this ChatGPT account"); const tested = await callChatGPT({action:"test",model:chosen}); setChatGPTNotice(tested.response); await refreshChatGPT(); return; } const tested = await callChatGPT({action:"test",model}); setChatGPTNotice(tested.response); await refreshChatGPT(); }
  catch(e) { setChatGPTNotice((e as Error).message); } finally { setBusy(false); }
 }
 async function disconnectChatGPT() {
  setBusy(true); setChatGPTNotice("");
  try { const result = await callChatGPT({action:"disconnect"}); setModels([]); setModel(""); await refreshChatGPT(); setChatGPTNotice(result.remotelyRevoked ? (ar ? "تم قطع اتصال ChatGPT وإلغاء الجلسة." : "ChatGPT was disconnected and its renewable session was revoked.") : (ar ? "حُذفت بيانات الاتصال محليًا؛ تعذر تأكيد الإلغاء لدى OpenAI. يمكنك إدارة الوصول من إعدادات ChatGPT." : "Local credentials were removed; OpenAI could not confirm revocation. You can manage access in ChatGPT settings.")); }
  catch(e) { setChatGPTNotice((e as Error).message); } finally { setBusy(false); }
 }

 return <div className="settings-grid">
  <div className="settings-card"><h3>Higgsfield API</h3><p>{ar ? "تُشفّر المفاتيح على الخادم. حفظ المفتاح لا يعني نجاح الاتصال." : "Each collaborator connects their own API account. Keys stay private to that member and are encrypted on the server. Saving them does not verify credentials; live video generation is not enabled yet."}</p><p><span className="pill">{status?.api.verified ? (ar ? "تم التحقق" : "LAST VERIFIED") : status?.api.configured ? (ar ? "محفوظ، غير متحقق" : "SAVED, UNVERIFIED") : (ar ? "غير متصل" : "NOT CONNECTED")}</span> {status?.api.verifiedAt && <small>{ar ? "آخر تحقق: " : "Last verified: "}{new Date(status.api.verifiedAt).toLocaleString()}</small>}</p><form className="connection-form" onSubmit={submit}><label>Key ID<input name="keyId" type="password" autoComplete="off" required/></label><label>Key Secret<input name="keySecret" type="password" autoComplete="off" required/></label><button className="primary-button" disabled={busy}>{ar ? "ربط Higgsfield بمفتاح API" : "Connect Higgsfield via API key"}</button></form>{status?.api.configured && <><form className="connection-form" onSubmit={verify}><label>{ar ? "رقم طلب Higgsfield سابق للتحقق" : "Existing Higgsfield request ID for verification"}<input name="requestId" required autoComplete="off"/></label><button className="outline-button" disabled={busy}>{ar ? "تحقق من الاتصال" : "Verify connection"}</button></form><button className="text-button" disabled={busy} onClick={disconnectHiggsfield}>{ar ? "إزالة بيانات الاعتماد" : "Remove credentials"}</button></>}{notice && <p role="status">{notice}</p>}</div>

  <div className="settings-card"><h3>ChatGPT plan</h3>
   <p>{ar ? "اربط حساب ChatGPT لتشغيل وكلاء CineCrew. سيطلب التطبيق موافقتك على استخدام الخطة، ولا يصل إلى محادثاتك." : "Connect your ChatGPT account to run CineCrew agents. You will separately approve plan usage; this does not give CineMesh access to your ChatGPT conversations."}</p>
   {!chatgpt?.vaultReady && <p className="connection-note" role="status">{ar ? "يلزم مفتاح تشفير محلي محفوظ في CHATGPT_VAULT_KEY قبل ربط الحساب." : "Set a local CHATGPT_VAULT_KEY before connecting. It encrypts the account tokens at rest."}</p>}
   {chatgpt?.connected ? <><p><span className="pill">{chatgpt.account?.planUsageEnabled ? (ar ? "مفوّض لاستخدام خطة ChatGPT" : "CHATGPT PLAN AUTHORIZED") : (ar ? "خطة ChatGPT غير مفوضة" : "PLAN USAGE NOT AUTHORIZED")}</span></p>{(chatgpt.account?.name || chatgpt.account?.email) && <p>{chatgpt.account.name || chatgpt.account.email}</p>}{chatgpt.account?.lastInferenceAt && <p>{ar ? "آخر طلب مكتمل: " : "Last completed request: "}{new Date(chatgpt.account.lastInferenceAt).toLocaleString()}</p>}
    <div className="connection-form"><label>{ar ? "النماذج المتاحة" : "Available models"}<select value={model} onChange={e=>setModel(e.target.value)}><option value="">{ar ? "حدّث قائمة النماذج" : "Load model catalog"}</option>{models.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="outline-button" disabled={busy} onClick={loadModels}>{ar ? "تحديث النماذج" : "Refresh available models"}</button><button className="primary-button" disabled={busy || !chatgpt.account?.planUsageEnabled} onClick={verifyChatGPT}>{ar ? "اختبر طلبًا فعليًا" : "Test a real ChatGPT request"}</button></div>
    <button className="text-button" disabled={busy} onClick={disconnectChatGPT}>{ar ? "قطع اتصال ChatGPT" : "Disconnect ChatGPT"}</button>
   </> : <button className="primary-button" disabled={busy || !chatgpt?.vaultReady} onClick={connectChatGPT}>{ar ? "المتابعة باستخدام ChatGPT" : "Continue with ChatGPT"}</button>}
   <p className="connection-note">{ar ? "استخدام الخطة يخضع لأهلية الحساب وحدوده المشتركة. رصيد ChatGPT منفصل عن رصيد Higgsfield API." : "Plan access depends on account eligibility and shared usage limits. ChatGPT plan usage is separate from Higgsfield API credits."} <a href={chatgpt?.usageUrl || "https://chatgpt.com/settings/usage"} target="_blank" rel="noreferrer">{ar ? "إدارة الاستخدام" : "Manage usage"}</a></p>
   {chatGPTNotice && <p role="status">{chatGPTNotice}</p>}
  </div>

  <div className="settings-card"><h3>Connect Higgsfield via MCP</h3><p>{status?.mcp.reason || (ar ? "غير متاح" : "Unavailable")}</p><p>{ar ? "أرصدة MCP منفصلة عن أرصدة API." : "MCP credits are separate from API credits."}</p></div>
  <div className="settings-card"><h3>{ar ? "النماذج المتاحة" : "Available models"}</h3><p>{ar ? "يظهر كتالوج النماذج بعد التحقق الفعلي من بيانات المزود." : "Provider models appear after the connection is verified."}</p><h3>{ar ? "مهام التوليد" : "Generation jobs"}</h3><p>{ar ? "لا توجد مهام توليد مرتبطة بعد." : "No generation jobs are connected yet."}</p><h3>{ar ? "الاستخدام والأرصدة" : "Usage and credits"}</h3><p>{ar ? "لا يعرض المزود حاليًا رصيدًا متاحًا من هذا الاتصال." : "No credit balance is available from this connection."}</p></div>
 </div>;
}
