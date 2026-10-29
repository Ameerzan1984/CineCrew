"use client";
import { useEffect, useState } from "react";
type Status = { api: { configured: boolean; verified: boolean; verifiedAt: string | null }; mcp: { available: boolean; reason: string }; models: unknown[]; jobs: unknown[]; usage: unknown; balance: unknown };
async function call(method: string, payload?: unknown) {
 const r = await fetch("/api/connections", { method, headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined, cache: "no-store" });
 const data = await r.json(); if (!r.ok) throw new Error(data.error || "Connection request failed"); return data;
}
export default function Connections({ ar }: { ar: boolean }) {
 const [status,setStatus] = useState<Status|null>(null), [notice,setNotice]=useState(""), [busy,setBusy]=useState(false);
 async function refresh() { setStatus(await call("GET")); }
 useEffect(()=>{ refresh().catch(e=>setNotice(e.message)); },[]);
 async function submit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); const form=event.currentTarget, fields=new FormData(form);
  setBusy(true); setNotice("");
  try { await call("POST",{action:"save",keyId:fields.get("keyId"),keySecret:fields.get("keySecret")}); form.reset(); await refresh(); setNotice(ar ? "تم حفظ بيانات الاعتماد مشفرة. لم يتم التحقق من الاتصال بعد." : "Credentials saved encrypted. The connection has not been verified yet."); } catch(e) { setNotice((e as Error).message); } finally { setBusy(false); }
 }
 async function verify(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); const form=event.currentTarget, fields=new FormData(form); setBusy(true); setNotice("");
  try { await call("POST",{action:"verify",requestId:fields.get("requestId")}); form.reset(); await refresh(); } catch(e) { setNotice((e as Error).message); } finally { setBusy(false); }
 }
 async function disconnect() { setBusy(true); try { await call("POST",{action:"disconnect"}); await refresh(); } catch(e) { setNotice((e as Error).message); } finally { setBusy(false); } }
 return <div className="settings-grid"><div className="settings-card"><h3>Higgsfield API</h3><p>{ar ? "يُخزّن المفتاح مشفرًا على الخادم. حفظ المفتاح لا يعني نجاح الاتصال." : "Keys are encrypted on the server. Saving them does not verify the connection."}</p><p><span className="pill">{status?.api.verified ? (ar ? "تم التحقق" : "LAST VERIFIED") : status?.api.configured ? (ar ? "محفوظ، لم يُتحقق منه" : "SAVED, UNVERIFIED") : (ar ? "غير متصل" : "NOT CONNECTED")}</span> {status?.api.verifiedAt && <small>{ar ? "آخر تحقق: " : "Last verified: "}{new Date(status.api.verifiedAt).toLocaleString()}</small>}</p><form className="connection-form" onSubmit={submit}><label>Key ID<input name="keyId" type="password" autoComplete="off" required/></label><label>Key Secret<input name="keySecret" type="password" autoComplete="off" required/></label><button className="primary-button" disabled={busy}>{ar ? "حفظ المفتاح" : "Connect Higgsfield via API key"}</button></form>{status?.api.configured && <><form className="connection-form" onSubmit={verify}><label>{ar ? "معرّف طلب Higgsfield موجود للتحقق" : "Existing Higgsfield request ID for verification"}<input name="requestId" required autoComplete="off"/></label><button className="outline-button" disabled={busy}>{ar ? "تحقق من الاتصال" : "Verify connection"}</button></form><button className="text-button" disabled={busy} onClick={disconnect}>{ar ? "إزالة بيانات الاعتماد" : "Remove credentials"}</button></>}{notice && <p role="status">{notice}</p>}</div><div className="settings-card"><h3>Connect Higgsfield via MCP</h3><p>{status?.mcp.reason || (ar ? "غير متاح حاليًا" : "Unavailable")}</p><p>{ar ? "رصيد MCP منفصل عن رصيد API." : "MCP credits are separate from API credits."}</p></div><div className="settings-card"><h3>{ar ? "النماذج المتاحة" : "Available models"}</h3><p>{ar ? "لا تتوفر قائمة نماذج متحققة حاليًا." : "No verified model catalog is available."}</p><h3>{ar ? "مهام التوليد" : "Generation jobs"}</h3><p>{ar ? "تكامل المهام غير متاح." : "Job integration unavailable."}</p><h3>{ar ? "الاستخدام والرصيد" : "Usage and credits"}</h3><p>{ar ? "البيانات غير متاحة." : "Data unavailable."}</p></div></div>;
}
