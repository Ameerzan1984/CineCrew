"use client";
import { useEffect, useState } from "react";

type Scene = { id: string; position: number; title: string; description: string; creator_name: string | null; mine: boolean };
type Character = { id: string; name: string; description: string; asset_id: string | null };
type Person = { user_id: string; display_name: string; role: "editor" | "viewer" };
type Data = { role: "owner" | "editor" | "viewer"; scenes: Scene[]; characters: Character[]; collaborators: Person[]; invitations: Person[] };

export default function Production({ filmId, ar }: { filmId: string; ar: boolean }) {
  const [data, setData] = useState<Data>({ role: "viewer", scenes: [], characters: [], collaborators: [], invitations: [] });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
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

  const sceneForm = (scene?: Scene) => {
    const editable = canEdit && (!scene || isOwner || scene.mine);
    if (scene && !editable) return <article className="production-form" key={scene.id}><strong>{scene.position}. {scene.title}</strong><p>{scene.description}</p><small>{ar ? "مساهمة:" : "Contribution by:"} {scene.creator_name || (ar ? "مالك الفيلم" : "Film owner")}</small></article>;
    return <form className="connection-form production-form" key={scene?.id || "new-scene"} onSubmit={e => submit(e, scene ? "update_scene" : "create_scene", scene?.id)}>
      <label>{ar ? "الترتيب" : "Position"}<input type="number" name="position" required min="1" defaultValue={scene?.position ?? (Math.max(0, ...data.scenes.map(x => x.position)) + 1)} /></label>
      <label>{ar ? "عنوان اللقطة" : "Shot title"}<input name="title" required maxLength={160} defaultValue={scene?.title} /></label>
      <label>{ar ? "وصف اللقطة" : "Shot description"}<textarea name="description" maxLength={4000} defaultValue={scene?.description} /></label>
      {scene && <small>{ar ? "مساهمة:" : "Contribution by:"} {scene.creator_name || (ar ? "مالك الفيلم" : "Film owner")}</small>}
      <div><button className="outline-button" disabled={busy}>{scene ? (ar ? "حفظ" : "Save") : (ar ? "إضافة مساهمتي" : "Add my shot contribution")}</button>{scene && <button type="button" className="text-button" disabled={busy} onClick={() => mutate("delete_scene", scene.id)}>{ar ? "حذف" : "Delete"}</button>}</div>
    </form>;
  };

  const characterForm = (person?: Character) => <form className="connection-form production-form" key={person?.id || "new-character"} onSubmit={e => submit(e, person ? "update_character" : "create_character", person?.id)}>
    <label>{ar ? "اسم الشخصية" : "Character name"}<input name="name" required maxLength={160} defaultValue={person?.name} /></label>
    <label>{ar ? "الوصف" : "Description"}<textarea name="description" maxLength={4000} defaultValue={person?.description} /></label>
    <label>Asset ID<input name="asset_id" maxLength={160} defaultValue={person?.asset_id ?? ""} /></label>
    <div><button className="outline-button" disabled={busy}>{person ? (ar ? "حفظ" : "Save") : (ar ? "إضافة شخصية" : "Add character")}</button>{person && <button type="button" className="text-button" disabled={busy} onClick={() => mutate("delete_character", person.id)}>{ar ? "حذف" : "Delete"}</button>}</div>
  </form>;

  return <div className="production-sections">
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
    {!isOwner && <div className="settings-card"><h3>{ar ? "مساهمة جماعية" : "Team production"}</h3><p>{ar ? "أضف وصف لقطتك. لن تُعرض كفيديو مولّد حتى يكتمل ربط Higgsfield والتخزين." : "Add your shot description. It will not appear as generated video until Higgsfield generation and media storage are connected."}</p><span className="pill">{data.role}</span></div>}
    <div className="settings-card"><h3>{ar ? "اللقطات" : "Shot contributions"}</h3><p>{ar ? "الوكيل يقرأ هذه اللقطات المحفوظة ويرتبها ضمن FilmDSL." : "The agent reads these saved shot contributions and connects them in the FilmDSL storyboard."}</p>{data.scenes.map(sceneForm)}{canEdit && sceneForm()}</div>
    <div className="settings-card"><h3>{ar ? "الشخصيات" : "Characters"}</h3><p>{ar ? "يستطيع مالك الفيلم تعديل الشخصيات فقط في هذا الإصدار." : "Only the film owner can edit characters in this version."}</p>{isOwner ? <>{data.characters.map(characterForm)}{characterForm()}</> : data.characters.map(person => <article className="production-form" key={person.id}><strong>{person.name}</strong><p>{person.description}</p></article>)}</div>
    {notice && <p role="alert">{notice}</p>}
  </div>;
}
