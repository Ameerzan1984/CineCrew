"use client";

import { useEffect, useState } from "react";

type Run = {
  id: string;
  status: string;
  stage: string;
  error_code: string | null;
  script_segment: string;
  output: null | { characters: number; locations: number; shots: number; model: string; blueprint: unknown };
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

export default function CineCrewAgentRun({
  filmId,
  ar,
  linked,
  onComplete,
}: {
  filmId: string;
  ar: boolean;
  linked: boolean;
  onComplete: () => void;
}) {
  const [script, setScript] = useState("");
  const [runId, setRunId] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [model, setModel] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const runKey = `cinemesh:agent-run:${filmId}`;

  useEffect(() => {
    request("/api/connections/chatgpt")
      .then((value) => setConnected(!!value.connected && !!value.account?.planUsageEnabled))
      .catch(() => setConnected(false));

    const saved = window.sessionStorage.getItem(runKey);
    if (!saved) return;
    setRunId(saved);
    request(`/api/films/${filmId}/agents/story-editor?run_id=${encodeURIComponent(saved)}`)
      .then((value) => {
        setRun(value);
        if (value.script_segment) setScript((current) => current || value.script_segment);
        if (value.status === "completed") {
          window.sessionStorage.removeItem(runKey);
          setRunId("");
          onComplete();
        }
      })
      .catch(() => {});
  }, [filmId, runKey, onComplete]);

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
    const id = runId || crypto.randomUUID();
    setRunId(id);
    window.sessionStorage.setItem(runKey, id);
    try {
      const result = await request(`/api/films/${filmId}/agents/story-editor`, {
        method: "POST",
        body: JSON.stringify({ run_id: id, script_segment: script, model }),
      });
      setRun(result);
      window.sessionStorage.removeItem(runKey);
      setRunId("");
      onComplete();
    } catch (cause) {
      setError((cause as Error).message);
      try {
        const status = await request(`/api/films/${filmId}/agents/story-editor?run_id=${encodeURIComponent(id)}`);
        setRun(status);
      } catch {
        // Keep the run ID in session storage so the user can retry or restore it.
      }
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
      if (result.status === "completed") {
        window.sessionStorage.removeItem(runKey);
        setRunId("");
        onComplete();
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card cinecrew-agent-run">
      <div className="agent-run-heading">
        <div>
          <h3>{ar ? "وكلاء CineCrew" : "CineCrew agents"}</h3>
          <p>
            {ar
              ? "أرسل مقتطفًا من السيناريو ليبني CineCrew مرجع الفيلم ويحوّل المشهد إلى لقطات محفوظة في FilmDSL."
              : "Send a screenplay excerpt to build a Film Bible and convert the scene into shots saved as FilmDSL."}
          </p>
        </div>
        <span className={`pill ${connected === false ? "muted" : ""}`}>
          {connected === null
            ? ar ? "جارٍ التحقق" : "CHECKING"
            : connected ? ar ? "ChatGPT متصل" : "CHATGPT READY" : ar ? "اربط ChatGPT أولًا" : "CONNECT CHATGPT FIRST"}
        </span>
      </div>

      {!linked && (
        <p className="connection-note">
          {ar ? "اربط هذا الفيلم بمحرك CineCrew من اللوحة أعلاه قبل تشغيل الوكلاء." : "Link this film to CineCrew above before running agents."}
        </p>
      )}
      {connected === false && (
        <p className="connection-note">
          {ar ? "افتح Connections وامنح CineMesh إذن استخدام خطة ChatGPT." : "Open Connections and authorize CineMesh to use your ChatGPT plan."}
        </p>
      )}

      <form className="agent-run-form" onSubmit={runAgent}>
        <label>
          {ar ? "السيناريو أو مشهد قصير" : "Screenplay or short scene"}
          <textarea
            required
            minLength={20}
            maxLength={20000}
            rows={6}
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder={ar ? "اكتب مشهدًا يتضمن وصفًا أو حوارًا..." : "Paste a scene with action and, if relevant, dialogue..."}
            disabled={!linked}
          />
        </label>
        <div className="agent-run-controls">
          <select aria-label={ar ? "النموذج" : "Model"} value={model} onChange={(event) => setModel(event.target.value)} disabled={!linked}>
            <option value="">{ar ? "حمّل النماذج المتاحة" : "Load your available models"}</option>
            {models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button type="button" className="outline-button" disabled={busy || !connected || !linked} onClick={refreshModels}>
            {ar ? "تحديث النماذج" : "Refresh models"}
          </button>
          <button className="primary-button" disabled={busy || !connected || !linked || !model}>
            {busy ? ar ? "جارٍ التشغيل..." : "Running agents..." : ar ? "إنشاء مرجع الفيلم واللقطات" : "Build Film Bible and shots"}
          </button>
        </div>
      </form>

      {run?.status === "completed" && run.output && (
        <div className="agent-run-result" role="status">
          <strong>{ar ? "اكتمل تشغيل CineCrew" : "CineCrew run completed"}</strong>
          <span>{run.output.characters} {ar ? "شخصية" : "characters"} · {run.output.locations} {ar ? "موقع" : "locations"} · {run.output.shots} {ar ? "لقطة" : "shots"}</span>
          <small>{ar ? "النموذج" : "Model"}: {run.output.model}</small>
        </div>
      )}
      {run?.status === "running" && (
        <div className="agent-run-result" role="status">
          <strong>{ar ? "التشغيل محفوظ وقيد التنفيذ" : "Run saved and in progress"}</strong>
          <span>{ar ? "المرحلة الحالية" : "Current stage"}: {run.stage}</span>
          <button type="button" className="outline-button" disabled={busy} onClick={refreshRun}>{ar ? "تحديث الحالة" : "Refresh status"}</button>
        </div>
      )}
      {run?.status === "failed" && (
        <div className="agent-run-result" role="status">
          <strong>{ar ? "توقف التشغيل؛ أعد الإرسال للاستئناف من آخر نقطة محفوظة" : "Run stopped; retry to resume from the last saved checkpoint"}</strong>
          <span>{ar ? "المرحلة" : "Stage"}: {run.stage} · {run.error_code}</span>
        </div>
      )}
      {runId && <button type="button" className="text-button" disabled={busy} onClick={refreshRun}>{ar ? "استعادة حالة التشغيل" : "Restore run status"}</button>}

      <p className="connection-note">
        {ar
          ? "يستهلك هذا التشغيل من استخدام خطة ChatGPT المشتركة. ينشئ أصولًا ولقطات فقط؛ لا يولّد فيديو."
          : "This run uses your shared ChatGPT plan allowance. It builds assets and shots only; it does not generate video."}
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
