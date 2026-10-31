"use client";
import { useEffect, useState } from "react";

type Person = { id: string; display_name: string; following: boolean; followers: number; blocked_by_me: boolean; blocked_you: boolean };
type Invitation = { film_id: string; title: string; genre: string; role: "editor" | "viewer"; invited_by_name: string };

export default function Community({ ar, onFilmListChange, onProfile, onOpenMessages }: { ar: boolean; onFilmListChange: () => Promise<void>; onProfile: (userId: string) => void; onOpenMessages: (userId: string, displayName: string) => void }) {
  const [users, setUsers] = useState<Person[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(q: string) {
    const response = await fetch(`/api/community?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Request failed");
    setUsers(data.users);
  }
  async function loadInvitations() {
    const response = await fetch("/api/collaboration/invitations", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Request failed");
    setInvitations(data.invitations);
  }
  useEffect(() => { load("").catch(e => setNotice(e.message)); }, []);
  useEffect(() => { loadInvitations().catch(e => setNotice(e.message)); }, []);

  async function toggle(person: Person) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: person.following ? "unfollow" : "follow", userId: person.id }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Request failed");
      await load(query);
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }

  async function toggleBlock(person: Person) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: person.blocked_by_me ? "unblock" : "block", userId: person.id }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Request failed");
      await load(query);
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }

  async function respond(invitation: Invitation, action: "accept" | "decline") {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/collaboration/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filmId: invitation.film_id, action }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Request failed");
      await loadInvitations();
      if (action === "accept") await onFilmListChange();
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }

  return <>
    <section className="page-heading"><div><div className="eyebrow"><span /> CINEMESH</div><h1>{ar ? "المجتمع" : "Community"}<span className="purple">.</span></h1><p>{ar ? "تعاون مع صناع أفلام آخرين وشارك قصتك." : "Find filmmakers, follow their work and make films together."}</p></div></section>
    <section className="settings-card"><h3>{ar ? "دعوات الأفلام" : "Film invitations"}</h3>
      {invitations.length ? invitations.map(invitation => <div className="community-list" key={invitation.film_id}>
        <div><strong>{invitation.title}</strong><p>{ar ? `دعوة من ${invitation.invited_by_name} بدور ${invitation.role}` : `Invited by ${invitation.invited_by_name} as ${invitation.role}`}</p></div>
        <button className="primary-button" disabled={busy} onClick={() => respond(invitation, "accept")}>{ar ? "قبول" : "Accept"}</button>
        <button className="text-button" disabled={busy} onClick={() => respond(invitation, "decline")}>{ar ? "رفض" : "Decline"}</button>
      </div>) : <p>{ar ? "لا توجد دعوات معلقة." : "No pending invitations."}</p>}
    </section>
    <form className="community-search" onSubmit={e => { e.preventDefault(); load(query).catch(e => setNotice(e.message)); }}>
      <input aria-label={ar ? "ابحث عن صناع الأفلام" : "Search members"} maxLength={100} value={query} onChange={e => setQuery(e.target.value)} placeholder={ar ? "ابحث عن صناع الأفلام" : "Search by name"} />
      <button className="outline-button">{ar ? "بحث" : "Search"}</button>
    </form>
    {notice && <p role="status">{notice}</p>}
    {users.length ? <div className="community-list">{users.map(person => <div className="settings-card member" key={person.id}>
      <div><strong>{person.display_name}</strong><p>{person.followers} {ar ? "متابعون" : "followers"}</p><button type="button" className="text-button" onClick={() => onProfile(person.id)}>{ar ? "\u0639\u0631\u0636 \u0627\u0644\u0645\u0644\u0641" : "View profile"}</button></div>
+      <div className="member-actions">
        <button type="button" className="outline-button" disabled={busy || person.blocked_by_me || person.blocked_you} onClick={() => onOpenMessages(person.id, person.display_name)}>{ar ? "رسالة" : "Message"}</button>
        <button type="button" className="text-button" disabled={busy} onClick={() => toggleBlock(person)}>{person.blocked_by_me ? (ar ? "إلغاء الحظر" : "Unblock") : (ar ? "حظر" : "Block")}</button>
        {person.blocked_you && <small>{ar ? "حظرك هذا المستخدم" : "This member blocked you."}</small>}
      </div>
      <button className="outline-button" disabled={busy || person.blocked_by_me || person.blocked_you} onClick={() => toggle(person)}>{person.following ? (ar ? "إلغاء المتابعة" : "Unfollow") : (ar ? "متابعة" : "Follow")}</button>
    </div>)}</div> : <div className="empty"><p>{ar ? "لم يتم العثور على صناع أفلام." : "No members found."}</p></div>}
  </>;
}
