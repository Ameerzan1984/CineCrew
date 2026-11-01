"use client";

import { useEffect, useState } from "react";
import type { SchedulerProgress as Counts } from "../lib/scheduler-progress";

const labels: Array<[keyof Counts, string, string]> = [
  ["queued", "Queued", "في الانتظار"], ["running", "Running", "قيد التنفيذ"],
  ["uncertain", "Needs reconciliation", "تحتاج إلى التحقق"], ["completed", "Completed", "مكتملة"], ["failed", "Failed", "فشلت"],
];

export default function SchedulerProgress({ filmId, ar }: { filmId: string; ar: boolean }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch(`/api/films/${filmId}/scheduler`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json() as { progress: Counts };
        if (active) { setCounts(data.progress); setState("ready"); }
      } catch {
        if (active && !controller.signal.aborted) { setCounts(null); setState("unavailable"); }
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [filmId]);
  return <section className="settings-card" aria-label={ar ? "تقدم جدولة الإنتاج" : "Production scheduler progress"}>
    <h3>{ar ? "تقدم جدولة الإنتاج" : "Production scheduler progress"}</h3>
    {state === "loading" && <p role="status">{ar ? "جارٍ تحميل حالة الجدولة…" : "Loading scheduler progress…"}</p>}
    {state === "unavailable" && <p role="status">{ar ? "خدمة الجدولة غير مهيأة أو غير متاحة." : "Scheduler service is not configured or unavailable."}</p>}
    {state === "ready" && counts && <><ul>{labels.map(([key, en, arabic]) => <li key={key}>{ar ? arabic : en}: {counts[key]}</li>)}</ul>
      <p className="connection-note">{ar ? "هذه حالة الجدولة فقط؛ ربط التوليد بالمزود والتخزين لم يكتمل بعد." : "Scheduler status only; provider dispatch and storage are not connected yet."}</p></>}
  </section>;
}
