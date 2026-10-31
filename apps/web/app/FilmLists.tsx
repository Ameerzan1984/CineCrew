"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type FilmList = {
  id: string; name: string; description: string; visibility: "public" | "private";
  updated_at: string; item_count: number; owner_id?: string; owner_display_name?: string;
};
type ListedFilm = {
  id: string; title: string; premise: string; genre: string; duration_minutes: number;
  language: string; owner_id: string; owner_display_name: string;
};

export default function FilmLists({ ar, onOpenFilm }: { ar: boolean; onOpenFilm: (filmId: string) => void }) {
  const [lists, setLists] = useState<FilmList[]>([]);
  const [publicLists, setPublicLists] = useState<FilmList[]>([]);
  const [selected, setSelected] = useState<FilmList | null>(null);
  const [items, setItems] = useState<ListedFilm[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVisibility, setEditVisibility] = useState<"public" | "private">("private");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const t = ar ? {
    title: "\u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0623\u0641\u0644\u0627\u0645", intro: "\u0627\u0646\u0638\u0645 \u0627\u0644\u0623\u0641\u0644\u0627\u0645 \u0641\u064a \u0645\u062c\u0645\u0648\u0639\u0627\u062a \u0639\u0627\u0645\u0629 \u0623\u0648 \u062e\u0627\u0635\u0629.",
    mine: "\u0642\u0648\u0627\u0626\u0645\u064a", public: "\u0642\u0648\u0627\u0626\u0645 \u0639\u0627\u0645\u0629", create: "\u0625\u0646\u0634\u0627\u0621 \u0642\u0627\u0626\u0645\u0629", name: "\u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0626\u0645\u0629", description: "\u0648\u0635\u0641 \u0627\u062e\u062a\u064a\u0627\u0631\u064a", private: "\u062e\u0627\u0635\u0629", visibility: "\u0627\u0644\u0638\u0647\u0648\u0631", publicVisibility: "\u0639\u0627\u0645\u0629", save: "\u062d\u0641\u0638", open: "\u0641\u062a\u062d", empty: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0642\u0648\u0627\u0626\u0645 \u0628\u0639\u062f.",
    owner: "\u0628\u0648\u0627\u0633\u0637\u0629", films: "\u0623\u0641\u0644\u0627\u0645", itemsEmpty: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u0641\u0644\u0627\u0645 \u0645\u0646\u0634\u0648\u0631\u0629 \u0641\u064a \u0647\u0630\u0647 \u0627\u0644\u0642\u0627\u0626\u0645\u0629.",
    update: "\u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0642\u0627\u0626\u0645\u0629", remove: "\u0625\u0632\u0627\u0644\u0629", delete: "\u062d\u0630\u0641 \u0627\u0644\u0642\u0627\u0626\u0645\u0629", saved: "\u062a\u0645 \u062d\u0641\u0638 \u0627\u0644\u0642\u0627\u0626\u0645\u0629.", removed: "\u062a\u0645\u062a \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0641\u064a\u0644\u0645.", deleted: "\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0642\u0627\u0626\u0645\u0629.", loading: "\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0645\u064a\u0644\u2026",
  } : {
    title: "Film lists", intro: "Curate films into public collections or private lists.", mine: "My lists", public: "Public lists", create: "Create a list", name: "List name", description: "Optional description", private: "Private", visibility: "Visibility", publicVisibility: "Public", save: "Save", open: "Open", empty: "You have not created any lists yet.",
    owner: "by", films: "films", itemsEmpty: "No published films are visible in this list.", update: "Update list", remove: "Remove", delete: "Delete list", saved: "List saved.", removed: "Film removed.", deleted: "List deleted.", loading: "Loading…",
  };

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(path, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", ...options.headers } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function refresh() {
    const [mine, discover] = await Promise.all([request("/api/lists"), request("/api/lists/public")]);
    setLists(mine.lists); setPublicLists(discover.lists);
  }

  async function openList(id: string) {
    setBusy(true); setNotice("");
    try {
      const data = await request(`/api/lists/${id}`);
      setSelected(data.list); setItems(data.items);
      setEditName(data.list.name); setEditDescription(data.list.description); setEditVisibility(data.list.visibility);
    } catch (cause) { setNotice((cause as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let cancelled = false;
    refresh().catch(cause => { if (!cancelled) setNotice((cause as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const data = await request("/api/lists", { method: "POST", body: JSON.stringify({ name, description, visibility }) });
      setName(""); setDescription(""); await refresh(); await openList(data.list.id); setNotice(t.saved);
    } catch (cause) { setNotice((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function updateList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setNotice("");
    try {
      const data = await request(`/api/lists/${selected.id}`, { method: "PATCH", body: JSON.stringify({ name: editName, description: editDescription, visibility: editVisibility }) });
      setSelected(current => current ? { ...current, ...data.list } : data.list); await refresh(); setNotice(t.saved);
    } catch (cause) { setNotice((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function removeList(id: string) {
    setBusy(true); setNotice("");
    try {
      await request(`/api/lists/${id}`, { method: "DELETE" });
      if (selected?.id === id) { setSelected(null); setItems([]); }
      await refresh(); setNotice(t.deleted);
    } catch (cause) { setNotice((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function removeFilm(filmId: string) {
    if (!selected) return;
    setBusy(true); setNotice("");
    try {
      await request(`/api/lists/${selected.id}/items`, { method: "DELETE", body: JSON.stringify({ filmId }) });
      setItems(current => current.filter(item => item.id !== filmId)); await refresh(); setNotice(t.removed);
    } catch (cause) { setNotice((cause as Error).message); }
    finally { setBusy(false); }
  }

  const isMine = selected ? lists.some(list => list.id === selected.id) : false;

  return <>
    <section className="page-heading"><div><div className="eyebrow"><span /> CINEMESH</div><h1>{t.title}<span className="purple">.</span></h1><p>{t.intro}</p></div></section>
    {notice && <p role="status" className="film-list-notice">{notice}</p>}
    {loading ? <p role="status">{t.loading}</p> : <div className="film-lists-layout">
      <section className="settings-card film-list-create">
        <h2>{t.create}</h2>
        <form onSubmit={event => void createList(event)}>
          <label>{t.name}<input value={name} maxLength={80} required onChange={event => setName(event.target.value)} /></label>
          <label>{t.description}<textarea value={description} maxLength={500} rows={3} onChange={event => setDescription(event.target.value)} /></label>
          <label>{t.visibility}<select value={visibility} onChange={event => setVisibility(event.target.value as "public" | "private")}>
            <option value="private">{t.private}</option><option value="public">{t.publicVisibility}</option>
          </select></label>
          <button className="primary-button" type="submit" disabled={busy || !name.trim()}>{t.create}</button>
        </form>
        <h2>{t.mine}</h2>
        {lists.length ? <div className="film-list-cards">{lists.map(list => <article className={`film-list-card ${selected?.id === list.id ? "active" : ""}`} key={list.id}>
          <button type="button" className="film-list-open" disabled={busy} onClick={() => void openList(list.id)}>
            <strong>{list.name}</strong><span>{list.visibility} · {list.item_count} {t.films}</span>
          </button>
          <button type="button" className="text-button" aria-label={`${t.delete}: ${list.name}`} disabled={busy} onClick={() => void removeList(list.id)}>{t.delete}</button>
        </article>)}</div> : <p>{t.empty}</p>}
      </section>
      <section className="settings-card film-list-detail">
        {selected ? <>
          <div className="film-list-detail-heading"><div><h2>{selected.name}</h2><span className="pill">{selected.visibility}</span></div><small>{selected.owner_display_name && `${t.owner} ${selected.owner_display_name}`}</small></div>
          {isMine && <form className="film-list-edit" onSubmit={event => void updateList(event)}>
            <label>{t.name}<input value={editName} maxLength={80} required onChange={event => setEditName(event.target.value)} /></label>
            <label>{t.description}<textarea value={editDescription} maxLength={500} rows={2} onChange={event => setEditDescription(event.target.value)} /></label>
            <label>{t.visibility}<select value={editVisibility} onChange={event => setEditVisibility(event.target.value as "public" | "private")}>
              <option value="private">{t.private}</option><option value="public">{t.publicVisibility}</option>
            </select></label>
            <button className="outline-button" disabled={busy || !editName.trim()}>{t.update}</button>
          </form>}
          <h3>{items.length} {t.films}</h3>
          {items.length ? <div className="film-list-items">{items.map(film => <article className="film-list-item" key={film.id}>
            <div><button type="button" className="film-list-film-title" onClick={() => onOpenFilm(film.id)}>{film.title}</button><p>{film.genre} · {film.duration_minutes} {ar ? "\u062f\u0642\u064a\u0642\u0629" : "min"}</p></div>
            {isMine && <button type="button" className="text-button" disabled={busy} onClick={() => void removeFilm(film.id)}>{t.remove}</button>}
          </article>)}</div> : <p>{t.itemsEmpty}</p>}
        </> : <div className="empty"><p>{ar ? "\u0627\u062e\u062a\u0631 \u0642\u0627\u0626\u0645\u0629 \u0644\u0639\u0631\u0636 \u0627\u0644\u0623\u0641\u0644\u0627\u0645." : "Choose a list to view its films."}</p></div>}
      </section>
      <section className="settings-card film-list-public">
        <h2>{t.public}</h2>
        {publicLists.length ? <div className="film-list-cards">{publicLists.map(list => <article className="film-list-card" key={list.id}>
          <button type="button" className="film-list-open" disabled={busy} onClick={() => void openList(list.id)}>
            <strong>{list.name}</strong><span>{list.owner_display_name} · {list.item_count} {t.films}</span>
          </button>
        </article>)}</div> : <p>{ar ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u0642\u0648\u0627\u0626\u0645 \u0639\u0627\u0645\u0629 \u0628\u0639\u062f." : "No public lists yet."}</p>}
      </section>
    </div>}
  </>;
}
