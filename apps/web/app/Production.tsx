"use client";
import { useEffect, useState } from "react";

type Scene = { id: string; position: number; title: string; description: string; agent_job_id: string | null; agent_prompt: string | null; agent_planned_duration_seconds: number | null; agent_generation_duration_seconds: number | null; creator_name: string | null; mine: boolean; claimable: boolean };
type Character = { id: string; name: string; description: string; asset_id: string | null };
type Person = { user_id: string; display_name: string; role: "editor" | "viewer" };
type Generation = { id: string; scene_id: string; scene_title: string; contributor_id: string; contributor_name: string; mine: boolean; model_path: string; prompt: string; duration_seconds: number; status: string; provider_request_id: string | null; estimated_usd: number | string | null; approved_max_usd: number | string | null; video_url: string | null; video_expires_at: string | null; media_asset_id: string | null; media_size_bytes: string | number | null; reference_generation_job_id: string | null; last_error_code: string | null; created_at: string; updated_at: string };
type FilmRender = { id: string; size_bytes: string | number; created_at: string; created_by: string };
type Data = { role: "owner" | "editor" | "viewer"; scenes: Scene[]; characters: Character[]; generations: Generation[]; renders: FilmRender[]; collaborators: Person[]; invitations: Person[] };
type CostQuote = { quoteToken: string; estimatedUsd: number; currency: "USD"; modelPath: string; prompt: string; durationSeconds: number; plannedDurationSeconds: number; resolution: string; audio: boolean; expiresAt: string };
type PendingGeneration = { scene: Scene; continuation?: Generation; requestKey: string };

export default function Production({ filmId, ar, status, onPublicationChange }: { filmId: string; ar: boolean; status: "draft" | "published"; onPublicationChange: (status: "draft" | "published") => void }) {
  const [data, setData] = useState<Data>({ role: "viewer", scenes: [], characters: [], generations: [], renders: [], collaborators: [], invitations: [] });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState<PendingGeneration | null>(null);
  const [quote, setQuote] = useState<CostQuote | null>(null);
  const [spendCeiling, setSpendCeiling] = useState("");
  const [explicitApproval, setExplicitApproval] = useState(false);
  const isOwner = data.role === "owner";
  const canEdit = isOwner || data.role === "editor";

  async function request(url: string, method = "GET", body?: unknown) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Request failed");
    return result;
  }
  async function refresh() { setData(await request(`/api/films/${filmId}/production`)); }
  useEffect(() => { refresh().catch(e => setNotice(e.message)); }, [filmId]);
  useEffect(() => {
    const timer = window.setInterval(() => { void refresh().catch(() => undefined); }, 8000);
    return () => window.clearInterval(timer);
  }, [filmId]);

  async function storeCompletedClip(job: Generation) {
    if (!job.mine || job.status !== "completed" || !job.video_url || job.media_asset_id) return;
    try {
      await request(`/api/films/${filmId}/generations/${job.id}/media`, "POST", {});
      await refresh();
    } catch {
      setNotice(ar ? "اكتمل التوليد، لكن حفظ الفيديو لم ينجح. استخدم زر حفظ الفيديو للمحاولة مرة أخرى." : "Generation completed, but the clip could not be saved. Use Save clip to retry.");
    }
  }

  async function refreshGeneration(job: Generation) {
    const result = await request(`/api/films/${filmId}/generations/${job.id}`);
    setData(current => ({ ...current, generations: current.generations.map(item => item.id === job.id ? result : item) }));
    await storeCompletedClip(result);
  }

  async function saveClip(job: Generation) {
    setBusy(true); setNotice("");
    try {
      await request(`/api/films/${filmId}/generations/${job.id}/media`, "POST", {});
      await refresh();
      setNotice(ar ? "تم حفظ اللقطة على خادم CineMesh." : "Shot saved to CineMesh storage.");
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }

  async function assembleFilm() {
    const generationIds = data.scenes.flatMap(scene => {
      const latest = data.generations.filter(job => job.scene_id === scene.id && job.status === "completed" && job.media_asset_id)
        .sort((a,b) => b.created_at.localeCompare(a.created_at))[0];
      return latest ? [latest.id] : [];
    });
    if (generationIds.length < 2) { setNotice(ar ? "احفظ لقطتين مكتملتين على الأقل قبل التجميع." : "Save at least two completed shots before assembly."); return; }
    setBusy(true); setNotice("");
    try {
      await request(`/api/films/${filmId}/renders`, "POST", { generationIds });
      await refresh();
      setNotice(ar ? "اكتمل تجميع اللقطات في فيديو CineMesh." : "The saved shots were assembled into a CineMesh film video.");
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const active = data.generations.filter(job => job.mine && job.provider_request_id && ["queued", "in_progress"].includes(job.status));
    if (!active.length) return;
    const timer = window.setInterval(() => {
      for (const job of active) void refreshGeneration(job).catch(e => setNotice((e as Error).message));
    }, 8000);
    return () => window.clearInterval(timer);
  }, [data.generations, filmId]);

  async function generate(scene: Scene, continuation?: Generation) {
    setBusy(true); setNotice("");
    try {
      const pending = { scene, continuation, requestKey: crypto.randomUUID() };
      const result = await request(`/api/films/${filmId}/generations/estimate`, "POST", { sceneId: scene.id, requestKey: pending.requestKey, ...(continuation ? { referenceGenerationId: continuation.id } : {}) });
      setPendingGeneration(pending);
      setQuote(result);
      setSpendCeiling(Number(result.estimatedUsd).toFixed(4));
      setExplicitApproval(false);
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }

  async function approveAndGenerate() {
    if (!pendingGeneration || !quote || !explicitApproval) return;
    const cap = Number(spendCeiling);
    if (!Number.isFinite(cap) || cap <= 0 || cap > 10 || cap < quote.estimatedUsd) {
      setNotice(ar ? "يجب أن يكون سقفك بالدولار مساويًا للتقدير أو أعلى، وألا يتجاوز 10 دولارات." : "Your USD ceiling must be at least the estimate and no more than $10.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const result = await request(`/api/films/${filmId}/generations`, "POST", {
        sceneId: pendingGeneration.scene.id,
        requestKey: pendingGeneration.requestKey,
        quoteToken: quote.quoteToken,
        maxCostUsd: cap,
        ...(pendingGeneration.continuation ? { referenceGenerationId: pendingGeneration.continuation.id } : {}),
      });
      setData(current => ({ ...current, generations: [result, ...current.generations.filter(item => item.id !== result.id)] }));
      setNotice(ar ? `أُرسلت اللقطة. التقدير ${quote.estimatedUsd.toFixed(4)} دولار، وسقف موافقتك ${cap.toFixed(4)} دولار.` : `Shot submitted. Estimate $${quote.estimatedUsd.toFixed(4)}; approved estimate ceiling $${cap.toFixed(4)}.`);
      setPendingGeneration(null); setQuote(null); setExplicitApproval(false);
      await storeCompletedClip(result);
    } catch (e) { setNotice((e as Error).message); await refresh().catch(() => undefined); }
    finally { setBusy(false); }
  }

  async function resolveUncertain(job: Generation) {
    setBusy(true); setNotice("");
    try {
      await request(`/api/films/${filmId}/generations/${job.id}`, "POST", { action: "confirm_not_submitted" });
      await refresh(); setNotice(ar ? "تأكدت من لوحة Higgsfield وأغلقت الطلب الملتبس." : "Uncertain job closed after you confirmed that it is absent from Higgsfield.");
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>, action: string, id?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form).entries());
    setBusy(true); setNotice("");
    try {
      const result = await request(`/api/films/${filmId}/production`, "POST", { action, id, ...fields, ...(Object.hasOwn(fields, "asset_id") ? { asset_id: fields.asset_id || null } : {}), ...(fields.position ? { position: Number(fields.position) } : {}) });
      setData(result);
      if (!id) form.reset();
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }

  async function mutate(action: string, id: string) {
    setBusy(true); setNotice("");
    try {
      if (action === "remove_collaborator") {
        await request(`/api/films/${filmId}/collaborators`, "POST", { action: "remove", userId: id });
        await refresh();
      } else setData(await request(`/api/films/${filmId}/production`, "POST", { action, id }));
    }
    catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    setBusy(true); setNotice("");
    try {
      await request(`/api/films/${filmId}/collaborators`, "POST", { action: "invite", email: values.email, role: values.role });
      form.reset(); await refresh(); setNotice(ar ? "تم إرسال الدعوة إلى صندوق دعوات المستخدم داخل CineMesh." : "Invitation added to the member's CineMesh inbox.");
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }

  const generationPanel = (scene: Scene) => {
    const jobs = data.generations.filter(job => job.scene_id === scene.id);
    const earlierScenes = data.scenes.filter(previous => previous.position < scene.position).sort((a,b) => b.position - a.position);
    const continuation = earlierScenes.flatMap(previous => data.generations.filter(job => job.scene_id === previous.id && job.status === "completed" && job.video_url)
      .sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,1))[0];
    return <div className="generation-jobs">{jobs.map(job => <article className="production-form" key={job.id}>
      <strong>{job.contributor_name} · {job.duration_seconds}s · {job.status}</strong>
      {job.video_url && job.status === "completed" && <video controls playsInline preload="metadata" src={job.media_asset_id ? `/api/media/${job.media_asset_id}` : job.video_url} />}
      {job.reference_generation_job_id && <small>{ar ? "استُخدم الفيديو السابق كمرجع؛ تُحسب التكلفة من رصيد API للمساهم الذي أنشأ هذه اللقطة." : "Uses the prior shot as a reference; this contributor's own API balance pays for the generation."}</small>}
      {job.estimated_usd !== null && <small>{ar ? `تقدير API: $${Number(job.estimated_usd).toFixed(4)} · سقف الموافقة: $${Number(job.approved_max_usd).toFixed(4)}` : `API estimate: $${Number(job.estimated_usd).toFixed(4)} · approved ceiling: $${Number(job.approved_max_usd).toFixed(4)}`}</small>}
      {job.status === "completed" && !job.media_asset_id && job.video_url && canEdit && <button type="button" className="outline-button" disabled={busy} onClick={() => saveClip(job)}>{ar ? "حفظ الفيديو في CineMesh" : "Save clip to CineMesh"}</button>}
      {job.media_asset_id && <small>{ar ? `نسخة محفوظة على المنصة · ${(Number(job.media_size_bytes) / 1048576).toFixed(1)} م.ب` : `Stored in CineMesh · ${(Number(job.media_size_bytes) / 1048576).toFixed(1)} MiB`}</small>}
      {job.video_expires_at && <small>{ar ? "ينتهي رابط المزود: " : "Provider URL expires: "}{new Date(job.video_expires_at).toLocaleString()}</small>}
      {job.status === "uncertain" && job.mine && <><p>{ar ? "تحقق من لوحة Higgsfield قبل إعادة المحاولة لتجنب طلب أو خصم مكرر." : "Check your Higgsfield dashboard before retrying so you do not accidentally submit or pay twice."}</p><button type="button" className="outline-button" disabled={busy} onClick={() => resolveUncertain(job)}>{ar ? "تحققت ولم أجد الطلب" : "I checked; no request exists"}</button></>}
      {job.mine && job.provider_request_id && ["queued", "in_progress"].includes(job.status) && <button type="button" className="outline-button" disabled={busy} onClick={() => refreshGeneration(job).catch(e => setNotice((e as Error).message))}>{ar ? "تحديث الحالة" : "Refresh status"}</button>}
    </article>)}
    {scene.mine && canEdit && <button type="button" className="primary-button" disabled={busy || !scene.description.trim() || jobs.some(job => ["submitting", "uncertain", "queued", "in_progress"].includes(job.status))} onClick={() => generate(scene,continuation)}>{continuation ? (ar ? `احصل على تقدير ثم أكّد التكملة · ${continuation.scene_title}` : `Estimate, then approve continuation from “${continuation.scene_title}”`) : (ar ? "احصل على تقدير قبل توليد ٤ ثوانٍ" : "Get a price estimate before generating 4 seconds")}</button>}
    </div>;
  };

  const sceneForm = (scene?: Scene) => {
    const editable = canEdit && (!scene || isOwner || scene.mine);
    if (scene?.claimable) return <article className="production-form" key={scene.id}><strong>{scene.position}. {scene.title}</strong><p>{scene.description}</p><small>{ar ? "لقطة خططها وكيل CineCrew ولم يخترها مساهم بعد." : "Planned by CineCrew; waiting for a contributor."}</small>{canEdit && <button type="button" className="outline-button" disabled={busy} onClick={() => mutate("claim_scene",scene.id)}>{ar ? "اختر هذه اللقطة لمساهمتي" : "Claim this shot"}</button>}</article>;
    if (scene && !editable) return <article className="production-form" key={scene.id}><strong>{scene.position}. {scene.title}</strong><p>{scene.description}</p><small>{ar ? "مساهمة:" : "Contribution by:"} {scene.creator_name || (ar ? "مالك الفيلم" : "Film owner")}</small>{generationPanel(scene)}</article>;
    return <div className="shot-block" key={scene?.id || "new-scene"}><form className="connection-form production-form" onSubmit={e => submit(e, scene ? "update_scene" : "create_scene", scene?.id)}>
      <label>{ar ? "الترتيب" : "Position"}<input type="number" name="position" required min="1" defaultValue={scene?.position ?? (Math.max(0, ...data.scenes.map(x => x.position)) + 1)} /></label>
      <label>{ar ? "عنوان اللقطة" : "Shot title"}<input name="title" required maxLength={160} defaultValue={scene?.title} /></label>
      <label>{ar ? "وصف اللقطة" : "Shot description"}<textarea name="description" maxLength={4000} defaultValue={scene?.description} /></label>
      {scene && <small>{ar ? "مساهمة:" : "Contribution by:"} {scene.creator_name || (ar ? "مالك الفيلم" : "Film owner")}</small>}
      <div><button className="outline-button" disabled={busy}>{scene ? (ar ? "حفظ" : "Save") : (ar ? "إضافة مساهمتي" : "Add my shot contribution")}</button>{scene && <button type="button" className="text-button" disabled={busy} onClick={() => mutate("delete_scene", scene.id)}>{ar ? "حذف" : "Delete"}</button>}</div>
    </form>{scene && generationPanel(scene)}</div>;
  };

  const characterForm = (person?: Character) => <form className="connection-form production-form" key={person?.id || "new-character"} onSubmit={e => submit(e, person ? "update_character" : "create_character", person?.id)}>
    <label>{ar ? "اسم الشخصية" : "Character name"}<input name="name" required maxLength={160} defaultValue={person?.name} /></label>
    <label>{ar ? "الوصف" : "Description"}<textarea name="description" maxLength={4000} defaultValue={person?.description} /></label>
    <label>Asset ID<input name="asset_id" maxLength={160} defaultValue={person?.asset_id ?? ""} /></label>
    <div><button className="outline-button" disabled={busy}>{person ? (ar ? "حفظ" : "Save") : (ar ? "إضافة شخصية" : "Add character")}</button>{person && <button type="button" className="text-button" disabled={busy} onClick={() => mutate("delete_character", person.id)}>{ar ? "حذف" : "Delete"}</button>}</div>
  </form>;

  return <>
  <div className="production-sections">
    <div className="settings-card" role="status">
      <h3>{ar ? "حسابات المساهمين في Higgsfield" : "Contributors’ Higgsfield accounts"}</h3>
      <p>{ar ? "يمكن لكل مساهم محاولة ربط حسابه من الاتصالات عبر MCP. ربط الحساب وتوليد فيديو منه داخل CineMesh لم يُختبرا مع مستخدمين حقيقيين بعد. زر التوليد عبر API أدناه مسار منفصل يتطلب مفتاح API ورصيد API خاصين بالمساهم." : "Each contributor can connect their own account through MCP in Connections. Account linking and generation through it have not yet been verified with real CineMesh users. The API generation button below is a separate path requiring that contributor’s API key and API balance."}</p>
    </div>
    <div className="settings-card">
      <h3>{ar ? "نسخ الفيلم المجمعة" : "Assembled films"}</h3>
      {canEdit && <button type="button" className="primary-button" disabled={busy || data.generations.filter(job => job.status === "completed" && job.media_asset_id).length < 2} onClick={assembleFilm}>{ar ? "اجمع اللقطات المحفوظة بـFFmpeg" : "Assemble saved shots with FFmpeg"}</button>}
      {canEdit && <small>{ar ? "يختار أحدث لقطة محفوظة لكل مشهد، ويرتبها حسب ترتيب المشاهد. هذا الإصدار مخصص للتجارب القصيرة." : "Uses the latest saved clip per scene, in scene order. This version is for short test films."}</small>}
      {isOwner && <div className="publish-controls">
        <button type="button" className="outline-button" disabled={busy || (status === "draft" && data.renders.length === 0)} onClick={async () => {
          setBusy(true); setNotice("");
          try {
            const action = status === "published" ? "unpublish" : "publish";
            const result = await request(`/api/films/${filmId}/publish`, "POST", { action }) as { status: "draft" | "published" };
            onPublicationChange(result.status);
            setNotice(result.status === "published"
              ? (ar ? "أصبح الفيلم منشورًا في صفحة اكتشف." : "Film published to Discover.")
              : (ar ? "أُعيد الفيلم إلى المسودات." : "Film returned to drafts."));
          } catch (error) { setNotice((error as Error).message); }
          finally { setBusy(false); }
        }}>{status === "published" ? (ar ? "إلغاء النشر" : "Unpublish film") : (ar ? "نشر الفيلم" : "Publish film")}</button>
        {status === "draft" && data.renders.length === 0 && <small>{ar ? "اجمع نسخة فيديو محفوظة قبل نشر الفيلم." : "Assemble and save a film render before publishing."}</small>}
      </div>}
      {data.renders.map(render => <article className="production-form" key={render.id}><strong>{ar ? "فيلم مجمع" : "Assembled film"}</strong><video controls playsInline preload="metadata" src={`/api/media/${render.id}`} /><small>{ar ? `${(Number(render.size_bytes) / 1048576).toFixed(1)} م.ب · ${new Date(render.created_at).toLocaleString()}` : `${(Number(render.size_bytes) / 1048576).toFixed(1)} MiB · ${new Date(render.created_at).toLocaleString()}`}</small></article>)}
    </div>
    {isOwner && <div className="settings-card">
      <h3>{ar ? "المتعاونون" : "Collaborators"}</h3>
      <p>{ar ? "كل مساهم يضيف وصف لقطته بحسابه. ستصل المساهمات المحفوظة إلى الوكيل عند بناء Film Bible وFilmDSL." : "Each member adds a shot contribution under their own account. Saved contributions are included when the agent builds the Film Bible and FilmDSL."}</p>
      <form className="connection-form production-form" onSubmit={invite}>
        <label>{ar ? "بريد حساب CineMesh" : "CineMesh account email"}<input type="email" name="email" required autoComplete="off" /></label>
        <label>{ar ? "الصلاحية" : "Role"}<select name="role"><option value="editor">{ar ? "مساهم لقطات" : "Shot contributor"}</option><option value="viewer">{ar ? "مشاهد" : "Viewer"}</option></select></label>
        <button className="outline-button" disabled={busy}>{ar ? "دعوة" : "Invite"}</button>
      </form>
      {data.collaborators.map(person => <div className="community-list" key={person.user_id}><strong>{person.display_name}</strong><span className="pill">{person.role}</span><button className="text-button" disabled={busy} onClick={() => mutate("remove_collaborator", person.user_id)}>{ar ? "إزالة" : "Remove"}</button></div>)}
      {data.invitations.map(person => <p key={person.user_id}>{person.display_name} · {ar ? "بانتظار القبول" : "Invitation pending"}</p>)}
    </div>}
    {!isOwner && <div className="settings-card"><h3>{ar ? "مساهمة جماعية" : "Team production"}</h3><p>{ar ? "أضف وصف لقطتك، ثم ولّدها بمفتاحك. تُخصم تكلفة التوليد من رصيد API الشخصي ولا تستخدم رصيد MCP." : "Add your shot description, then generate it with your own API key. A live request is charged to your personal Higgsfield API balance; it does not use MCP credits."}</p><span className="pill">{data.role}</span></div>}
    <div className="settings-card"><h3>{ar ? "اللقطات" : "Shot contributions"}</h3><p>{ar ? "يضيف كل مساهم وصف لقطته ويولدها بحساب API الخاص به. بعد اكتمال اللقطة، احفظها على خادم CineMesh ثم اجمع اللقطات المحفوظة حسب ترتيب المشاهد." : "Each contributor creates a shot with their own Higgsfield API account. Save completed clips to this CineMesh server, then assemble them in scene order. API dollars and MCP plan credits are separate."}</p>{data.scenes.map(sceneForm)}{canEdit && sceneForm()}</div>
    <div className="settings-card"><h3>{ar ? "الشخصيات" : "Characters"}</h3><p>{ar ? "يستطيع مالك الفيلم تعديل الشخصيات فقط في هذا الإصدار." : "Only the film owner can edit characters in this version."}</p>{isOwner ? <>{data.characters.map(characterForm)}{characterForm()}</> : data.characters.map(person => <article className="production-form" key={person.id}><strong>{person.name}</strong><p>{person.description}</p></article>)}</div>
    {notice && <p role="alert">{notice}</p>}
  </div>
  {pendingGeneration && quote && <div className="modal-backdrop" role="presentation">
    <section className="modal generation-approval" role="dialog" aria-modal="true" aria-labelledby="generation-approval-title">
      <div className="modal-body">
        <h2 id="generation-approval-title">{ar ? "مراجعة تكلفة اللقطة" : "Review shot cost"}</h2>
        <p><strong>{pendingGeneration.scene.title}</strong> · {quote.durationSeconds}s · {quote.resolution} · {quote.audio ? (ar ? "مع صوت" : "with audio") : (ar ? "بلا صوت" : "silent")}</p>
        <details><summary>{ar ? "عرض الـ Prompt السينمائي الذي سيُرسل" : "Review the cinematic prompt to be sent"}</summary><pre className="generation-prompt-preview">{quote.prompt}</pre></details>
        {quote.plannedDurationSeconds !== quote.durationSeconds && <p>{ar ? `مدة خطة CineCrew ${quote.plannedDurationSeconds} ثانية؛ مدة Higgsfield المستخدمة ${quote.durationSeconds} ثوانٍ حسب حدود النموذج.` : `CineCrew planned ${quote.plannedDurationSeconds}s; this Higgsfield model request uses ${quote.durationSeconds}s.`}</p>}
        {pendingGeneration.continuation && <p>{ar ? "سيستخدم المقطع السابق كمرجع، ويظهر سعر هذا الطلب وحده." : "The previous clip is a visual reference. This price is for this request only."}</p>}
        <p className="generation-quote-price">${quote.estimatedUsd.toFixed(4)} USD</p>
        <small>{ar ? "هذا سقف للتقدير الذي توافق عليه، وليس حدًا للفوترة تفرضه Higgsfield؛ قد تختلف الرسوم الفعلية." : "This caps the estimate you approve, not provider billing; actual Higgsfield charges may differ."}</small>
        <label>{ar ? "أعلى تقدير أوافق عليه لهذا الطلب (USD)" : "Maximum estimate I approve for this request (USD)"}
          <input type="number" min={quote.estimatedUsd} max="10" step="0.0001" value={spendCeiling} onChange={event => setSpendCeiling(event.target.value)} />
        </label>
        <label className="generation-approval-check"><input type="checkbox" checked={explicitApproval} onChange={event => setExplicitApproval(event.target.checked)} />
          {ar ? "أوافق على إرسال طلب Higgsfield واحد بهذا التقدير وبحد أقصى المبلغ أعلاه من رصيد API الخاص بي." : "I approve one Higgsfield request at this estimate, at the approved estimate ceiling above, charged to my own API balance."}
        </label>
        <p className="connection-note">{ar ? "صلاحية عرض السعر ٥ دقائق. لا تُرسل أي لقطة إلى Higgsfield قبل التأكيد." : "This quote expires in 5 minutes. No video request is sent until you confirm."}</p>
        <div className="modal-actions">
          <button type="button" className="primary-button" disabled={busy || !explicitApproval || Number(spendCeiling) < quote.estimatedUsd || Number(spendCeiling) > 10} onClick={() => void approveAndGenerate()}>{busy ? (ar ? "جارٍ الإرسال..." : "Submitting...") : (ar ? "أوافق وأرسل طلب التوليد" : "Approve and submit generation")}</button>
          <button type="button" className="outline-button" disabled={busy} onClick={() => { setPendingGeneration(null); setQuote(null); setExplicitApproval(false); }}>{ar ? "إلغاء" : "Cancel"}</button>
        </div>
      </div>
    </section>
  </div>}
  </>;
}
