"use client";
import { useEffect, useState } from "react";

export default function FilmDSL({ filmId, ar, editable }: { filmId: string; ar: boolean; editable: boolean }) {
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/films/${filmId}/engine/filmdsl`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (response.status === 404) { setResult(""); return; }
        if (!response.ok) throw Error(body.error || "FilmDSL could not be loaded");
        setResult(JSON.stringify(body, null, 2));
      })
      .catch(error => setNotice((error as Error).message));
  }, [filmId]);

  async function submit(event: React.FormEvent<HTMLFormElement>, kind: "filmdsl" | "production-plan") {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setNotice("");
    try {
      const payload = JSON.parse(String(data.get("json") || ""));
      const response = await fetch(`/api/films/${filmId}/engine/${kind}`, { method: kind === "filmdsl" ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Request failed");
      setResult(JSON.stringify(kind === "filmdsl" ? body : body.blueprint, null, 2));
      setNotice(kind === "filmdsl" ? (ar ? "تم التحقق من FilmDSL وحفظه." : "FilmDSL validated and saved.") : (ar ? "حُفظت خطة الوظائف فقط؛ لم يُنشأ أي فيديو." : "Offline job plan saved; no media was generated."));
      form.reset();
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="settings-card film-dsl">
    <h3>FilmDSL &amp; Asset Library</h3>
    <p>{ar ? "مخطط اللقطات الموحد الذي بناه الوكيل من مساهمات الفريق. هذا تخطيط فقط، وليس فيديو مركباً." : "The shared shot plan built by the agent from team contributions. This is a storyboard, not an assembled video."}</p>
    {editable && <div className="production-sections">
      <form className="connection-form" onSubmit={e => submit(e, "filmdsl")}><label>SceneBlueprint JSON<textarea name="json" required rows={7} /></label><button className="outline-button" disabled={busy}>{ar ? "استيراد FilmDSL" : "Import FilmDSL"}</button></form>
      <form className="connection-form" onSubmit={e => submit(e, "production-plan")}><label>AssetLibrary JSON<textarea name="json" required rows={7} /></label><button className="outline-button" disabled={busy}>{ar ? "بناء خطة الوظائف" : "Build job plan"}</button></form>
    </div>}
    {notice && <p role="status">{notice}</p>}
    {result ? <details open><summary>{ar ? "عرض مخطط الفيلم" : "View current FilmDSL"}</summary><pre className="checkpoint-list">{result}</pre></details> : <p>{ar ? "لم يحفظ الوكيل مخططاً لهذا الفيلم بعد." : "The agent has not saved a FilmDSL for this film yet."}</p>}
  </div>;
}
