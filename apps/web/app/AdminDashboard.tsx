"use client";

import { useEffect, useState } from "react";

type Action = { id: string; action: "dismiss" | "hide_film" | "restore_film"; note: string; created_at: string; actor_display_name: string };
type Report = { id: string; reporter_display_name: string; target_type: "user" | "film"; target_name: string | null; category: string; details: string; status: string; created_at: string; film_status: string | null; film_hidden: boolean; actions: Action[] };
const labels = { harassment: "Harassment", spam: "Spam", copyright: "Copyright", inappropriate: "Inappropriate content", other: "Other" };

export default function AdminDashboard({ ar }: { ar: boolean }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState("open");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    const response = await fetch(`/api/admin/reports?status=${filter}&limit=100`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Moderation queue is unavailable");
    setReports(data.reports);
  }
  useEffect(() => { load().catch(error => setNotice((error as Error).message)); }, [filter]);

  async function act(report: Report, action: "dismiss" | "hide_film" | "restore_film") {
    setBusy(report.id); setNotice("");
    try {
      const response = await fetch("/api/admin/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId: report.id, action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Moderation action failed");
      await load();
      setNotice(ar ? "تم حفظ إجراء الإشراف في سجل التدقيق." : "Moderation action recorded in the audit log.");
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(""); }
  }

  return <>
    <section className="page-heading"><div><div className="eyebrow"><span /> CINEMESH</div><h1>{ar ? "لوحة الإشراف" : "Admin moderation"}<span className="purple">.</span></h1><p>{ar ? "راجع البلاغات واتخذ إجراءات موثقة." : "Review user reports and take audited actions."}</p></div>
      <select className="outline-button" aria-label={ar ? "حالة البلاغات" : "Report status"} value={filter} onChange={event => setFilter(event.target.value)}><option value="open">{ar ? "المفتوحة" : "Open"}</option><option value="reviewed">{ar ? "قيد المراجعة" : "Reviewed"}</option><option value="dismissed">{ar ? "المرفوضة" : "Dismissed"}</option><option value="actioned">{ar ? "تم اتخاذ إجراء" : "Actioned"}</option><option value="all">{ar ? "الكل" : "All reports"}</option></select>
    </section>
    {notice && <p role="status">{notice}</p>}
    {reports.length ? <div className="moderation-list">{reports.map(report => <article className="settings-card moderation-card" key={report.id}>
      <div className="moderation-heading"><div><span className="pill">{report.status}</span><span className="pill">{report.target_type}</span><span className="pill">{labels[report.category as keyof typeof labels] || report.category}</span></div><time>{new Date(report.created_at).toLocaleString(ar ? "ar" : "en")}</time></div>
      <h2>{report.target_name || (ar ? "عنصر محذوف" : "Deleted target")}</h2>
      <p>{ar ? "المبلّغ" : "Reported by"}: {report.reporter_display_name}</p>
      {report.details && <blockquote>{report.details}</blockquote>}
      <div className="moderation-actions">
        {report.target_type === "film" && report.film_hidden
          ? <button className="outline-button" disabled={!!busy} onClick={() => void act(report, "restore_film")}>{ar ? "استعادة ظهور الفيلم" : "Restore film"}</button>
          : report.target_type === "film" && ["open", "reviewed"].includes(report.status)
            ? <button className="outline-button" disabled={!!busy} onClick={() => void act(report, "hide_film")}>{ar ? "إخفاء الفيلم" : "Hide film"}</button>
            : null}
        {["open", "reviewed"].includes(report.status) && <button className="text-button" disabled={!!busy} onClick={() => void act(report, "dismiss")}>{ar ? "رفض البلاغ" : "Dismiss report"}</button>}
      </div>
      {!!report.actions.length && <details className="moderation-audit"><summary>{ar ? "سجل التدقيق" : "Audit history"}</summary>{report.actions.map(action => <p key={action.id}>{action.action.replaceAll("_", " ")} · {action.actor_display_name} · {new Date(action.created_at).toLocaleString(ar ? "ar" : "en")}{action.note ? ` — ${action.note}` : ""}</p>)}</details>}
    </article>)}</div> : <div className="empty"><p>{ar ? "لا توجد بلاغات في هذه القائمة." : "No reports in this queue."}</p></div>}
  </>;
}
