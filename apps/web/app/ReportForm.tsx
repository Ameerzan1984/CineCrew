"use client";

import { FormEvent, useState } from "react";

type Category = "harassment" | "spam" | "copyright" | "inappropriate" | "other";

export default function ReportForm({ targetType, targetId, ar }: { targetType: "user" | "film"; targetId: string; ar: boolean }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("other");
  const [details, setDetails] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType, targetId, category, details }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not submit report");
      setNotice(ar ? "تم إرسال البلاغ للمراجعة." : "Report submitted for review.");
      setDetails(""); setOpen(false);
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="report-control"><details open={open} onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
    <summary>{ar ? "إبلاغ" : "Report"}</summary>
    <form className="report-form" onSubmit={event => void submit(event)}>
      <label>{ar ? "سبب البلاغ" : "Reason"}
        <select value={category} onChange={event => setCategory(event.target.value as Category)}>
          <option value="harassment">{ar ? "مضايقة أو إساءة" : "Harassment"}</option>
          <option value="spam">{ar ? "رسائل مزعجة" : "Spam"}</option>
          <option value="copyright">{ar ? "حقوق النشر" : "Copyright"}</option>
          <option value="inappropriate">{ar ? "محتوى غير ملائم" : "Inappropriate content"}</option>
          <option value="other">{ar ? "سبب آخر" : "Other"}</option>
        </select>
      </label>
      <label>{ar ? "تفاصيل اختيارية" : "Optional details"}
        <textarea value={details} maxLength={2000} rows={3} onChange={event => setDetails(event.target.value)} />
      </label>
      <div className="report-actions"><button type="submit" className="outline-button" disabled={busy}>{ar ? "إرسال البلاغ" : "Submit report"}</button><button type="button" className="text-button" onClick={() => setOpen(false)}>{ar ? "إلغاء" : "Cancel"}</button></div>
    </form>
  </details>{notice && <small role="status">{notice}</small>}</div>;
}
