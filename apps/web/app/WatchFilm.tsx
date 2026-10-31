"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import ReportForm from "./ReportForm";

type WatchFilmData = {
  id: string; owner_id: string; title: string; premise: string; genre: string;
  duration_minutes: number; language: "ar" | "en"; owner_display_name: string;
  media_asset_id: string; likes_count: number; comments_count: number; liked_by_me: boolean;
};
type Credit = { user_id: string; display_name: string; role: string };
type Comment = { id: string; body: string; created_at: string; author_display_name: string };

export default function WatchFilm({ filmId, ar, canReport, onBack, onProfile, onSignIn }: {
  filmId: string;
  ar: boolean;
  canReport: boolean;
  onBack: () => void;
  onProfile: (userId: string) => void;
  onSignIn: () => void;
}) {
  const [film, setFilm] = useState<WatchFilmData | null>(null);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setFilm(null); setCredits([]); setComments([]); setError(""); setLoading(true);
    Promise.all([
      fetch(`/api/watch/${filmId}`, { cache: "no-store" }),
      fetch(`/api/films/${filmId}/comments`, { cache: "no-store" }),
    ]).then(async ([filmResponse, commentsResponse]) => {
      const filmData = await filmResponse.json();
      if (!filmResponse.ok) throw new Error(filmData.error || "Film is unavailable");
      const commentsData = commentsResponse.ok ? await commentsResponse.json() : { comments: [] };
      if (!cancelled) { setFilm(filmData.film); setCredits(filmData.contributors); setComments(commentsData.comments); }
    }).catch(cause => { if (!cancelled) setError((cause as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filmId]);

  async function toggleLike() {
    if (!film) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/films/${film.id}/likes`, { method: film.liked_by_me ? "DELETE" : "POST" });
      const data = await response.json();
      if (response.status === 401) { setError(ar ? "\u0633\u062c\u0651\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0644\u0644\u0625\u0639\u062c\u0627\u0628." : "Sign in to like this film."); return; }
      if (!response.ok) throw new Error(data.error || "Could not update like");
      setFilm(current => current ? { ...current, likes_count: data.likes_count, liked_by_me: data.liked_by_me } : current);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!film || !draft.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/films/${film.id}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft }),
      });
      const data = await response.json();
      if (response.status === 401) { setError(ar ? "\u0633\u062c\u0651\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0644\u0643\u062a\u0627\u0628\u0629 \u062a\u0639\u0644\u064a\u0642." : "Sign in to comment."); return; }
      if (!response.ok) throw new Error(data.error || "Could not add comment");
      setComments(current => [...current, data.comment]);
      setFilm(current => current ? { ...current, comments_count: current.comments_count + 1 } : current);
      setDraft("");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="watch-film-page" aria-label={ar ? "\u0645\u0634\u0627\u0647\u062f\u0629 \u0627\u0644\u0641\u064a\u0644\u0645" : "Watch film"}>
    <button className="back-link" onClick={onBack}>{ar ? "\u0639\u0648\u062f\u0629" : "Back"}</button>
    {loading && <p role="status">{ar ? "\u062c\u0627\u0631\u064d \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0641\u064a\u0644\u0645\u2026" : "Loading film\u2026"}</p>}
    {error && <p role="alert">{error} {error.includes("Sign in") || error.includes("\u0633\u062c\u0651\u0644")
      ? <button className="text-button" onClick={onSignIn}>{ar ? "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644" : "Sign in"}</button> : null}</p>}
    {film && <>
      <video className="watch-player" controls playsInline preload="metadata" src={`/api/media/${film.media_asset_id}`} aria-label={`${ar ? "\u0645\u0634\u0627\u0647\u062f\u0629" : "Watch"} ${film.title}`} />
      <header className="watch-heading"><div><div className="eyebrow"><span/> CINEMESH PREMIERE</div><h1>{film.title}<span className="purple">.</span></h1>
        <div className="discover-film-meta"><span>{film.genre}</span><span>{film.duration_minutes} {ar ? "\u062f\u0642\u064a\u0642\u0629" : "min"}</span><span>{film.language.toUpperCase()}</span></div></div>
        <button className="discover-author" onClick={() => onProfile(film.owner_id)}>{ar ? "\u0627\u0644\u0645\u062e\u0631\u062c" : "Directed by"} {film.owner_display_name}</button>
      </header>
      <div className="watch-details-grid">
        <section className="settings-card"><h2>{ar ? "\u0646\u0628\u0630\u0629 \u0639\u0646 \u0627\u0644\u0641\u064a\u0644\u0645" : "About this film"}</h2><p>{film.premise}</p>
          <h3>{ar ? "\u0641\u0631\u064a\u0642 \u0627\u0644\u0639\u0645\u0644" : "Film credits"}</h3>
          <div className="watch-credits">{credits.map(credit => <div key={credit.user_id}>
            <button className="discover-author" onClick={() => onProfile(credit.user_id)}>{credit.display_name}</button>
            <small>{credit.role === "director" ? (ar ? "\u0645\u062e\u0631\u062c" : "Director") : credit.role}</small>
          </div>)}</div>
        </section>
        <aside className="settings-card watch-social"><h2>{ar ? "\u0627\u0644\u0646\u0642\u0627\u0634" : "Join the conversation"}</h2>
          {canReport && <ReportForm targetType="film" targetId={film.id} ar={ar} />}
          <button type="button" className="watch-like" aria-pressed={film.liked_by_me} disabled={busy} onClick={() => void toggleLike()}>
            {film.liked_by_me ? "♥" : "♡"} {film.likes_count} {ar ? "\u0625\u0639\u062c\u0627\u0628" : "likes"}
          </button>
          <div className="watch-comments">{comments.map(comment => <article key={comment.id}>
            <strong>{comment.author_display_name}</strong><p>{comment.body}</p>
          </article>)}{comments.length === 0 && <small>{ar ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0639\u0644\u064a\u0642\u0627\u062a \u0628\u0639\u062f." : "No comments yet."}</small>}</div>
          <form onSubmit={event => void addComment(event)}><textarea value={draft} maxLength={2000} rows={3} onChange={event => setDraft(event.target.value)} placeholder={ar ? "\u0627\u0643\u062a\u0628 \u062a\u0639\u0644\u064a\u0642\u0627\u064b..." : "Write a comment…"} aria-label={ar ? "\u0627\u0643\u062a\u0628 \u062a\u0639\u0644\u064a\u0642\u0627\u064b" : "Write a comment"} />
            <button className="primary-button" type="submit" disabled={busy || !draft.trim()}>{ar ? "\u0646\u0634\u0631" : "Post comment"}</button></form>
        </aside>
      </div>
    </>}
  </section>;
}
