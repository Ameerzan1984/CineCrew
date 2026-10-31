"use client";

import { useEffect, useState } from "react";

type Stage = { stage: string; agent: string; status: string; error_code: string | null };
type SavedRun = { id: string; model: string; status: string; stage: string; error_code: string | null; created_at: string; updated_at: string; created_by_name: string; can_resume: boolean };
type Run = {
  id: string;
  status: string;
  stage: string;
  error_code: string | null;
  script_segment: string;
  stages?: Stage[];
  output: null | {
    characters: number;
    locations: number;
    shots: number;
    video_job_count: number;
    model: string;
    screenplay: { title: string; logline: string; screenplay: string };
    blueprint: unknown;
    video_jobs: null | { jobs: Array<{ job_id: string | null; shot_id: string; prompt: string; duration: number; width: number; height: number; model: string | null }>; estimated_duration: number };
    provider_submission: { submitted: boolean; reason: string };
  };
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Agent request failed");
  return data;
}

async function savedAgentRuns(filmId: string): Promise<SavedRun[]> {
  const result = await request(`/api/films/${filmId}/agents/story-editor/runs`);
  return Array.isArray(result.runs) ? result.runs : [];
}

export default function CineCrewAgentRun({
  filmId,
  ar,
  linked,
  canRunAgents,
  canImportShots,
  onComplete,
}: {
  filmId: string;
  ar: boolean;
  linked: boolean;
  canRunAgents: boolean;
  canImportShots: boolean;
  onComplete: () => void;
}) {
  const [idea, setIdea] = useState("");
  const [runId, setRunId] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [model, setModel] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [savedRuns, setSavedRuns] = useState<SavedRun[]>([]);

  useEffect(() => {
    request("/api/connections/chatgpt")
      .then((value) => setConnected(!!value.connected && !!value.account?.planUsageEnabled))
      .catch(() => setConnected(false));

    savedAgentRuns(filmId).then(async (runs) => {
      setSavedRuns(runs);
      const resume = runs.find((item) => item.can_resume && (item.status === "running" || item.status === "failed"))
        ?? runs.find((item) => item.can_resume) ?? runs[0];
      if (!resume) return;
      if (resume.can_resume) setModel(resume.model);
      try {
        const value = await request(`/api/films/${filmId}/agents/story-editor?run_id=${encodeURIComponent(resume.id)}`);
        setRun(value);
        if (value.script_segment) setIdea((current) => current || value.script_segment);
        setRunId(resume.can_resume && (value.status === "running" || value.status === "failed") ? resume.id : "");
      } catch (cause) {
        setError((cause as Error).message);
        setRunId(resume.id);
      }
    }).catch(() => {});
  }, [filmId]);

  async function refreshModels() {
    setBusy(true);
    setError("");
    try {
      const value = await request("/api/connections/chatgpt", {
        method: "POST",
        body: JSON.stringify({ action: "models" }),
      });
      setModels(value.models);
      if (value.models[0]) setModel((current) => current || value.models[0].id);
      if (!value.models.length) setError(ar ? "لا توجد نماذج متاحة لهذا الحساب." : "No models are available for this account.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runAgent(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const id = runId && (run?.status === "running" || run?.status === "failed") ? runId : crypto.randomUUID();
    setRunId(id);
    try {
      const result = await request(`/api/films/${filmId}/agents/story-editor`, {
        method: "POST",
        body: JSON.stringify({ run_id: id, film_idea: idea, model }),
      });
      setRun(result);
      setRunId(result.status === "running" || result.status === "failed" ? id : "");
      try { setSavedRuns(await savedAgentRuns(filmId)); } catch { /* run index can be refreshed on the next load */ }
      onComplete();
    } catch (cause) {
      setError((cause as Error).message);
      setRunId(id);
      try {
        const status = await request(`/api/films/${filmId}/agents/story-editor?run_id=${encodeURIComponent(id)}`);
        setRun(status);
      } catch {
        // The run ID is registered in PostgreSQL before the engine call, so another device can restore it.
      }
      try { setSavedRuns(await savedAgentRuns(filmId)); } catch { /* retain the current run view */ }
    } finally {
      setBusy(false);
    }
  }

  async function refreshRun() {
    if (!runId) return;
    setBusy(true);
    setError("");
    try {
      const result = await request(`/api/films/${filmId}/agents/story-editor?run_id=${encodeURIComponent(runId)}`);
      setRun(result);
      setRunId(result.status === "running" || result.status === "failed" ? runId : "");
      try { setSavedRuns(await savedAgentRuns(filmId)); } catch { /* current status is already displayed */ }
      if (result.status === "completed") {
        onComplete();
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function importShots() {
    if (!run || run.status !== "completed") return;
    setBusy(true); setError(""); setImportNotice("");
    try {
      const result = await request(`/api/films/${filmId}/agents/story-editor/import`, {
        method: "POST", body: JSON.stringify({ run_id: run.id }),
      });
      setImportNotice(result.alreadyImported
        ? (ar ? "لقطات هذا التشغيل أضيفت إلى الاستوديو سابقًا." : "Shots from this run were already added.")
        : (ar ? `أُضيفت ${result.imported} لقطات إلى الاستوديو ليعمل عليها المساهمون.` : `Added ${result.imported} shots to the studio for contributors to claim.`));
      onComplete();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function selectSavedRun(id: string) {
    if (!id) { setRun(null); setRunId(""); return; }
    setBusy(true); setError("");
    try {
      const result = await request(`/api/films/${filmId}/agents/story-editor?run_id=${encodeURIComponent(id)}`);
      setRun(result);
      if (result.script_segment) setIdea(result.script_segment);
      const saved = savedRuns.find((item) => item.id === id);
      if (saved?.can_resume) setModel(saved.model);
      setRunId(saved?.can_resume && (result.status === "running" || result.status === "failed") ? id : "");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function updateIdea(value: string) {
    setIdea(value);
    setRun(null);
    setRunId("");
  }

  const stages = run?.stages ?? [];
  return (
    <section className="settings-card cinecrew-agent-run">
      <div className="agent-run-heading">
        <div>
          <h3>{ar ? "وكلاء CineCrew" : "CineCrew agents"}</h3>
          <p>
            {ar
              ? "أدخل فكرة الفيلم. يكتب وكيل السيناريو المسودة ثم يشغّل CineCrew مراحل بناء الأصول وFilmDSL ومهام الفيديو."
              : "Enter a film idea. The screenplay agent writes a draft, then CineCrew builds the Asset Library, FilmDSL, and video job plan."}
          </p>
        </div>
        <span className={`pill ${connected === false ? "muted" : ""}`}>
          {connected === null
            ? ar ? "جارٍ التحقق من الاتصال" : "CHECKING"
            : connected ? ar ? "ChatGPT متصل" : "CHATGPT READY" : ar ? "اربط ChatGPT أولًا" : "CONNECT CHATGPT FIRST"}
        </span>
      </div>

      {!linked && <p className="connection-note">{ar ? "اربط الفيلم بمحرك CineCrew قبل تشغيل الوكلاء." : "Link this film to CineCrew above before running agents."}</p>}
      {connected === false && <p className="connection-note">{ar ? "افتح Connections ووافق على استخدام خطة ChatGPT." : "Open Connections and authorize CineMesh to use your ChatGPT plan."}</p>}
      {!canRunAgents && <p className="connection-note">{ar ? "صلاحية المشاهدة لا تسمح بتشغيل وكلاء الفيلم." : "Viewer access does not allow running film agents."}</p>}

      {savedRuns.length > 0 && <label className="agent-run-history">
        {ar ? "تشغيلات CineCrew المحفوظة لهذا الفيلم" : "Saved CineCrew runs for this film"}
        <select aria-label={ar ? "التشغيلات المحفوظة" : "Saved agent runs"} value={run?.id || ""} disabled={busy} onChange={(event) => void selectSavedRun(event.target.value)}>
          <option value="">{ar ? "اختر تشغيلًا محفوظًا" : "Choose a saved run"}</option>
          {savedRuns.map((item) => <option key={item.id} value={item.id}>{item.status} · {item.created_by_name} · {item.stage} · {item.model} · {new Date(item.updated_at).toLocaleString()}</option>)}
        </select>
      </label>}

      <form className="agent-run-form" onSubmit={runAgent}>
        <label>
          {ar ? "فكرة الفيلم" : "Film idea"}
          <textarea
            required minLength={20} maxLength={20000} rows={6} value={idea}
            onChange={(event) => updateIdea(event.target.value)}
            placeholder={ar ? "اكتب الفكرة والشخصيات والصراع والنهاية التي تتخيلها..." : "Describe the premise, characters, conflict, and ending you have in mind..."}
            disabled={!linked || !canRunAgents || busy}
          />
        </label>
        <div className="agent-run-controls">
          <select aria-label={ar ? "النموذج" : "Model"} value={model} onChange={(event) => setModel(event.target.value)} disabled={!linked || !canRunAgents}>
            <option value="">{ar ? "حمّل النماذج المتاحة" : "Load your available models"}</option>
            {model && !models.some((item) => item.id === model) && <option value={model}>{ar ? `النموذج المحفوظ: ${model}` : `Saved model: ${model}`}</option>}
            {models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button type="button" className="outline-button" disabled={busy || !connected || !linked || !canRunAgents} onClick={refreshModels}>
            {ar ? "تحديث النماذج" : "Refresh models"}
          </button>
          <button className="primary-button" disabled={busy || !connected || !linked || !canRunAgents || !model}>
            {busy ? ar ? "الوكلاء يعملون..." : "Running agents..." : ar ? "اكتب السيناريو وشغّل CineCrew" : "Write screenplay and run CineCrew"}
          </button>
        </div>
      </form>

      {run?.status === "completed" && run.output && (
        <div className="agent-run-result" role="status">
          <strong>{ar ? "اكتمل تشغيل الوكلاء" : "CineCrew run completed"}</strong>
          <span>{run.output.characters} {ar ? "شخصية" : "characters"} · {run.output.locations} {ar ? "مواقع" : "locations"} · {run.output.shots} {ar ? "لقطات" : "shots"} · {run.output.video_job_count} {ar ? "مهام فيديو مخططة" : "video jobs planned"}</span>
          <small>{ar ? "النموذج" : "Model"}: {run.output.model}</small>
          <small>{ar ? "لم يُرسل أي طلب مدفوع إلى مزود فيديو." : "No paid video generation request was submitted."}</small>
          <details>
            <summary>{ar ? `مسودة السيناريو: ${run.output.screenplay.title}` : `Screenplay draft: ${run.output.screenplay.title}`}</summary>
            <p>{run.output.screenplay.logline}</p>
            <pre>{run.output.screenplay.screenplay}</pre>
          </details>
          {run.output.video_jobs && <details>
            <summary>{ar ? `خطة مهام الفيديو (${run.output.video_jobs.jobs.length}) · ${run.output.video_jobs.estimated_duration} ثانية` : `Video job plan (${run.output.video_jobs.jobs.length}) · ${run.output.video_jobs.estimated_duration}s`}</summary>
            {run.output.video_jobs.jobs.map((job) => <article className="production-form" key={job.job_id || job.shot_id}>
              <strong>{job.shot_id} · {job.duration}s · {job.width}×{job.height}</strong>
              <p>{job.prompt}</p>
            </article>)}
          </details>}
          {stages.length > 0 && <ul>{stages.map((item) => <li key={item.stage}>{item.agent}: {item.status}</li>)}</ul>}
          {canImportShots && <button type="button" className="outline-button" disabled={busy} onClick={importShots}>{ar ? "أضف لقطات الوكلاء إلى الاستوديو" : "Add agent shots to studio"}</button>}
          {importNotice && <small>{importNotice}</small>}
        </div>
      )}
      {run?.status === "running" && (
        <div className="agent-run-result" role="status">
          <strong>{ar ? "التشغيل محفوظ ويمكن استئنافه" : "Run saved and resumable"}</strong>
          <span>{ar ? "المرحلة الحالية" : "Current stage"}: {run.stage}</span>
          <button type="button" className="outline-button" disabled={busy} onClick={refreshRun}>{ar ? "تحديث الحالة" : "Refresh status"}</button>
        </div>
      )}
      {run?.status === "failed" && (
        <div className="agent-run-result" role="status">
          <strong>{ar ? "توقفت المرحلة؛ أعد المحاولة للاستئناف من آخر حفظ" : "Run stopped; retry to resume from the last saved checkpoint"}</strong>
          <span>{ar ? "المرحلة" : "Stage"}: {run.stage} · {run.error_code}</span>
        </div>
      )}
      {runId && <button type="button" className="text-button" disabled={busy} onClick={refreshRun}>{ar ? "استعادة حالة التشغيل" : "Restore run status"}</button>}

      <p className="connection-note">
        {ar
          ? "تُحفظ قائمة التشغيلات مع الفيلم ويمكن فتحها من جهاز آخر. تعتمد استعادة نقاط الحفظ الكاملة على استمرار قاعدة محرك الفيلم. التوليد المدفوع معطل حتى التحقق من تسعير Higgsfield."
          : "Run history is stored with this film and can be restored on another device. Checkpoints still depend on the Film Engine database being available. Paid generation remains disabled until Higgsfield pricing is verified."}
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
