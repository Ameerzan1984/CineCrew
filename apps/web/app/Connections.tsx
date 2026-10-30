"use client";
import { useEffect, useState } from "react";

type Status = { api: { configured: boolean; verified: boolean; verifiedAt: string | null }; mcp: { available: boolean; connected: boolean; verifiedAt: string | null; tools: Array<{ name: string; description: string | null }>; reason: string }; models: Array<{ id: string; name: string; documented: boolean }>; jobs: Array<{ id: string; model_path: string; status: string; created_at: string; updated_at: string; scene_title: string }>; usage: unknown; balance: unknown };
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
 useEffect(()=>{ const result=new URLSearchParams(window.location.search).get("higgsfield_mcp"); if(result){setNotice(result==="connected"?(ar?"تم ربط Higgsfield MCP والتحقق منه بطلب قراءة الأدوات.":"Higgsfield MCP connected and verified with a read-only tools request."):(ar?"لم يكتمل اتصال Higgsfield MCP. أعد المحاولة وتأكد من إتمام التفويض.":"Higgsfield MCP could not be connected. Try again and complete the authorization step.")); const url=new URL(window.location.href); url.searchParams.delete("higgsfield_mcp"); window.history.replaceState({},"",url.toString());} refresh().catch(e=>setNotice(e.message)); refreshChatGPT().catch(e=>setChatGPTNotice(e.message)); },[]);
 async function submit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); const form=event.currentTarget, fields=new FormData(form); setBusy(true); setNotice("");
  try { await call("POST",{action:"save",apiKey:fields.get("apiKey")}); form.reset(); await refresh(); setNotice(ar ? "تم حفظ مفتاح API مشفرًا. سيتحقق الاتصال عند أول طلب حقيقي." : "API key saved encrypted. A real provider request will verify it; saving alone does not verify access."); } catch(e) { setNotice((e as Error).message); } finally { setBusy(false); }
 }
 async function disconnectHiggsfield() { setBusy(true); try { await call("POST",{action:"disconnect"}); await refresh(); } catch(e) { setNotice((e as Error).message); } finally { setBusy(false); } }
 async function connectHiggsfieldMcp() {
  setBusy(true); setNotice("");
  try { const response=await fetch("/api/connections/higgsfield-mcp/authorize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"connect"}),cache:"no-store"}); const data=await response.json(); if(!response.ok) throw new Error(data.error||"MCP authorization could not start"); window.location.assign(data.authorizationUrl); }
  catch(e) { setNotice((e as Error).message); setBusy(false); }
 }
 async function disconnectHiggsfieldMcp() {
  setBusy(true); setNotice("");
  try { const response=await fetch("/api/connections/higgsfield-mcp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"disconnect"}),cache:"no-store"}); const data=await response.json(); if(!response.ok) throw new Error(data.error||"MCP disconnect failed"); await refresh(); setNotice(data.remotelyRevoked?(ar?"تم فصل MCP وإلغاء جلسة OAuth لدى Higgsfield.":"MCP disconnected and the OAuth session was revoked at Higgsfield."):(ar?"أزيل اتصال MCP من CineMesh. قد تحتاج إلى إلغاء التفويض من إعدادات Higgsfield أيضًا.":"MCP was removed from CineMesh. You may also revoke the authorization in Higgsfield settings.")); }
  catch(e) { setNotice((e as Error).message); } finally { setBusy(false); }
 }
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
  <div className="settings-card"><h3>Higgsfield API</h3><p>{ar ? "كل مساهم يربط حساب API الخاص به. ألصق المفتاح كاملًا كما نسخته؛ يُشفّر على الخادم ولا يُعاد للمتصفح. الحفظ وحده لا يبدأ التوليد." : "Each film contributor connects their own API account. Paste the complete key copied from Higgsfield in one field. It is encrypted on the server and never returned to the browser. Saving does not start generation."}</p><p><span className="pill">{status?.api.verified ? (ar ? "تم التحقق بطلب فعلي" : "VERIFIED BY A REAL REQUEST") : status?.api.configured ? (ar ? "المفتاح محفوظ، غير متحقق" : "API KEY SAVED, NOT VERIFIED") : (ar ? "غير متصل" : "NOT CONNECTED")}</span> {status?.api.verifiedAt && <small>{ar ? "آخر تحقق: " : "Last verified: "}{new Date(status.api.verifiedAt).toLocaleString()}</small>}</p><form className="connection-form" onSubmit={submit}><label>{ar ? "مفتاح Higgsfield كاملًا" : "Complete Higgsfield API key"}<input name="apiKey" type="password" autoComplete="off" required placeholder="Paste the full key as copied"/></label><button className="primary-button" disabled={busy}>{ar ? "حفظ مفتاح API" : "Save API key"}</button></form>{status?.api.configured && <button className="text-button" disabled={busy} onClick={disconnectHiggsfield}>{ar ? "إزالة مفتاح API" : "Remove API key"}</button>}{notice && <p role="status">{notice}</p>}</div>

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

  <div className="settings-card"><h3>Connect Higgsfield via MCP</h3><p>{status?.mcp.reason || (ar ? "يتطلب التفويض بحساب Higgsfield الخاص بك." : "Authorize your own Higgsfield account to connect.")}</p><p><span className="pill">{status?.mcp.connected ? (ar ? "متصل ومتحقق" : "CONNECTED AND VERIFIED") : (ar ? "غير متصل" : "NOT CONNECTED")}</span> {status?.mcp.verifiedAt && <small>{ar ? "آخر تحقق: " : "Verified: "}{new Date(status.mcp.verifiedAt).toLocaleString()}</small>}</p>{status?.mcp.connected ? <><p>{ar ? "أدوات MCP المتاحة لهذا الحساب:" : "Tools available to this account through MCP:"} {status.mcp.tools.length}</p><ul>{status.mcp.tools.slice(0,8).map(tool=><li key={tool.name}>{tool.name}</li>)}</ul><button className="text-button" disabled={busy} onClick={disconnectHiggsfieldMcp}>{ar ? "فصل حساب MCP" : "Disconnect MCP account"}</button></> : <button className="primary-button" disabled={busy} onClick={connectHiggsfieldMcp}>{ar ? "ربط Higgsfield عبر MCP" : "Connect Higgsfield via MCP"}</button>}<p className="connection-note">{ar ? "كل عملية MCP تستخدم أرصدة خطة Higgsfield. هذا رصيد منفصل عن رصيد API بالدولار؛ لن يبدأ الربط عملية توليد." : "MCP uses Higgsfield plan credits, separate from the API dollar balance. Connecting only checks MCP tools; it does not start a generation."}</p></div>
  <div className="settings-card"><h3>{ar ? "النماذج المتاحة" : "Available models"}</h3>{status?.models.map(item=><p key={item.id}>{item.name} <small>{item.documented ? (ar ? "موثق رسميًا؛ يتحقق الوصول للحساب عند أول توليد." : "Documented by Higgsfield; account access is checked on first generation.") : ""}</small></p>)}<h3>{ar ? "مهام التوليد" : "Generation jobs"}</h3>{status?.jobs.length ? status.jobs.map(job=><p key={job.id}>{job.scene_title} · {job.status}</p>) : <p>{ar ? "لا توجد مهام توليد لهذا الحساب بعد." : "No generation jobs for this account yet."}</p>}<h3>{ar ? "الاستخدام والأرصدة" : "Usage and credits"}</h3><p>{ar ? "الرصيد غير متاح عبر الاتصال الحالي. راجع لوحة Higgsfield API؛ رصيد MCP منفصل." : "API balance and usage are not available from the current connection. Check the separate Higgsfield API dashboard; MCP plan credits are separate."}</p></div>
 </div>;
}
