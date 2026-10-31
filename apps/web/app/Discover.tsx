"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type PublishedFilm = {
  id: string;
  owner_id: string;
  title: string;
  premise: string;
  genre: string;
  duration_minutes: number;
  language: "ar" | "en";
  owner_display_name: string;
  media_asset_id: string;
  media_size_bytes: string | number;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
  published_at: string;
};

type FilmComment = { id: string; body: string; created_at: string; author_display_name: string };

export default function Discover({ ar, onSignIn, onOpenProfile }: { ar: boolean; onSignIn: () => void; onOpenProfile: (userId: string) => void }) {
  const [films, setFilms] = useState<PublishedFilm[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comments, setComments] = useState<Record<string, FilmComment[]>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [socialMessages, setSocialMessages] = useState<Record<string, string>>({});
  const [busyFilms, setBusyFilms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discover", { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Discover is unavailable");
        return data as { films: PublishedFilm[] };
      })
      .then(data => { if (!cancelled) setFilms(data.films); })
      .catch(cause => { if (!cancelled) setError((cause as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const visibleFilms = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(ar ? "ar" : "en");
    if (!normalized) return films;
    return films.filter(film => [film.title, film.premise, film.genre, film.owner_display_name]
      .some(value => value.toLocaleLowerCase(ar ? "ar" : "en").includes(normalized)));
  }, [ar, films, query]);

  function setMessage(filmId: string, message: string) {
    setSocialMessages(current => ({ ...current, [filmId]: message }));
  }

  async function toggleLike(film: PublishedFilm) {
    setBusyFilms(current => ({ ...current, [film.id]: true }));
    setMessage(film.id, "");
    try {
      const response = await fetch(`/api/films/${film.id}/likes`, { method: film.liked_by_me ? "DELETE" : "POST" });
      const result = await response.json();
      if (response.status === 401) { setMessage(film.id, ar ? "\u0633\u062c\u0651\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0644\u0644\u0625\u0639\u062c\u0627\u0628 \u0628\u0647\u0630\u0627 \u0627\u0644\u0641\u064a\u0644\u0645." : "Sign in to like this film."); return; }
      if (!response.ok) throw new Error(result.error || "Likes are unavailable");
      setFilms(current => current.map(item => item.id === film.id ? { ...item, likes_count: result.likes_count, liked_by_me: result.liked_by_me } : item));
    } catch (cause) { setMessage(film.id, (cause as Error).message); }
    finally { setBusyFilms(current => ({ ...current, [film.id]: false })); }
  }

  async function toggleComments(filmId: string) {
    const shouldOpen = !expandedComments[filmId];
    setExpandedComments(current => ({ ...current, [filmId]: shouldOpen }));
    setMessage(filmId, "");
    if (!shouldOpen || comments[filmId]) return;
    setBusyFilms(current => ({ ...current, [filmId]: true }));
    try {
      const response = await fetch(`/api/films/${filmId}/comments`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Comments are unavailable");
      setComments(current => ({ ...current, [filmId]: result.comments }));
    } catch (cause) { setMessage(filmId, (cause as Error).message); }
    finally { setBusyFilms(current => ({ ...current, [filmId]: false })); }
  }

  async function addComment(filmId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = commentDrafts[filmId]?.trim();
    if (!draft) return;
    setBusyFilms(current => ({ ...current, [filmId]: true }));
    setMessage(filmId, "");
    try {
      const response = await fetch(`/api/films/${filmId}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft }),
      });
      const result = await response.json();
      if (response.status === 401) { setMessage(filmId, ar ? "\u0633\u062c\u0651\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0644\u0625\u0636\u0627\u0641\u0629 \u062a\u0639\u0644\u064a\u0642." : "Sign in to add a comment."); return; }
      if (!response.ok) throw new Error(result.error || "Could not add comment");
      setComments(current => ({ ...current, [filmId]: [...(current[filmId] || []), result.comment] }));
      setFilms(current => current.map(item => item.id === filmId ? { ...item, comments_count: item.comments_count + 1 } : item));
      setCommentDrafts(current => ({ ...current, [filmId]: "" }));
    } catch (cause) { setMessage(filmId, (cause as Error).message); }
    finally { setBusyFilms(current => ({ ...current, [filmId]: false })); }
  }

  return <section aria-label={ar ? "\u0627\u0644\u0623\u0641\u0644\u0627\u0645 \u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0629" : "Published films"}>
    <label className="discover-search">
      <span>{ar ? "\u0627\u0628\u062d\u062b \u0641\u064a \u0627\u0644\u0623\u0641\u0644\u0627\u0645 \u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0629" : "Search published films"}</span>
      <input type="search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} />
    </label>
    {loading && <p role="status">{ar ? "\u062c\u0627\u0631\u064d \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0623\u0641\u0644\u0627\u0645\u2026" : "Loading published films\u2026"}</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && visibleFilms.length === 0 && <div className="empty">
      <p>{films.length === 0
        ? (ar ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u0641\u0644\u0627\u0645 \u0645\u0646\u0634\u0648\u0631\u0629 \u0628\u0639\u062f." : "No films have been published yet.")
        : (ar ? "\u0644\u0627 \u062a\u0637\u0627\u0628\u0642 \u0623\u0641\u0644\u0627\u0645 \u0645\u0646\u0634\u0648\u0631\u0629 \u0628\u062d\u062b\u0643." : "No published films match your search.")}</p>
    </div>}
    {!!visibleFilms.length && <div className="discover-film-grid">
      {visibleFilms.map(film => <article className="discover-film-card" key={film.id}>
        <video controls playsInline preload="metadata" src={`/api/media/${film.media_asset_id}`}
          aria-label={ar ? `\u0645\u0634\u0627\u0647\u062f\u0629 ${film.title}` : `Watch ${film.title}`} />
        <div className="discover-film-copy">
          <h2>{film.title}</h2>
          <p>{film.premise}</p>
          <div className="discover-film-meta">
            <span>{film.genre}</span><span>{film.duration_minutes} {ar ? "\u062f\u0642\u064a\u0642\u0629" : "min"}</span>
          </div>
          <button type="button" className="discover-author" onClick={() => onOpenProfile(film.owner_id)}>{ar ? "\u0625\u062e\u0631\u0627\u062c" : "By"} {film.owner_display_name}</button>
          <div className="discover-social-actions">
            <button type="button" aria-pressed={film.liked_by_me} disabled={busyFilms[film.id]} onClick={() => void toggleLike(film)}>
              {film.liked_by_me ? "♥" : "♡"} {film.likes_count} {ar ? "\u0625\u0639\u062c\u0627\u0628" : "Like"}
            </button>
            <button type="button" aria-expanded={!!expandedComments[film.id]} onClick={() => void toggleComments(film.id)}>
              {film.comments_count} {ar ? "\u0627\u0644\u062a\u0639\u0644\u064a\u0642\u0627\u062a" : "Comments"}
            </button>
          </div>
          {socialMessages[film.id] && <p className="discover-social-message" role="status">
            {socialMessages[film.id]} {socialMessages[film.id].includes("Sign in") || socialMessages[film.id].includes("\u0633\u062c\u0651\u0644")
              ? <button type="button" onClick={onSignIn}>{ar ? "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644" : "Sign in"}</button> : null}
          </p>}
          {expandedComments[film.id] && <div className="discover-comments">
            {(comments[film.id] || []).map(comment => <div className="discover-comment" key={comment.id}>
              <strong>{comment.author_display_name}</strong><p>{comment.body}</p>
            </div>)}
            {!busyFilms[film.id] && comments[film.id]?.length === 0 && <small>{ar ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0639\u0644\u064a\u0642\u0627\u062a \u0628\u0639\u062f." : "No comments yet."}</small>}
            <form onSubmit={event => void addComment(film.id, event)}>
              <input value={commentDrafts[film.id] || ""} maxLength={2000} onChange={event => setCommentDrafts(current => ({ ...current, [film.id]: event.target.value }))}
                placeholder={ar ? "\u0623\u0636\u0641 \u062a\u0639\u0644\u064a\u0642\u0627\u064b..." : "Add a comment\u2026"} aria-label={ar ? "\u0623\u0636\u0641 \u062a\u0639\u0644\u064a\u0642\u0627\u064b" : "Add a comment"} />
              <button type="submit" disabled={busyFilms[film.id] || !(commentDrafts[film.id] || "").trim()}>{ar ? "\u0625\u0631\u0633\u0627\u0644" : "Post"}</button>
            </form>
          </div>}
        </div>
      </article>)}
    </div>}
  </section>;
}
