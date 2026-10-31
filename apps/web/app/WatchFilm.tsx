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
type Review = { id: string; rating: number; body: string; created_at: string; updated_at: string; author_display_name: string; is_own: boolean };
type ReviewSummary = { average_rating: number; review_count: number };

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
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary>({ average_rating: 0, review_count: 0 });
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [draft, setDraft] = useState("");
  const [reviewDraft, setReviewDraft] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewMessage, setReviewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setFilm(null); setCredits([]); setComments([]); setReviews([]); setMyReview(null); setReviewSummary({ average_rating: 0, review_count: 0 });
    setDraft(""); setReviewDraft(""); setReviewRating(5); setReviewMessage(""); setError(""); setLoading(true);
    Promise.all([
      fetch(`/api/watch/${filmId}`, { cache: "no-store" }),
      fetch(`/api/films/${filmId}/comments`, { cache: "no-store" }),
      fetch(`/api/films/${filmId}/reviews`, { cache: "no-store" }),
    ]).then(async ([filmResponse, commentsResponse, reviewsResponse]) => {
      const filmData = await filmResponse.json();
      if (!filmResponse.ok) throw new Error(filmData.error || "Film is unavailable");
      const commentsData = commentsResponse.ok ? await commentsResponse.json() : { comments: [] };
      const reviewsData = await reviewsResponse.json();
      if (!reviewsResponse.ok) throw new Error(reviewsData.error || "Reviews are unavailable");
      if (!cancelled) {
        setFilm(filmData.film); setCredits(filmData.contributors); setComments(commentsData.comments);
        setReviews(reviewsData.reviews); setReviewSummary(reviewsData.summary); setMyReview(reviewsData.my_review);
        setReviewDraft(reviewsData.my_review?.body ?? ""); setReviewRating(reviewsData.my_review?.rating ?? 5);
      }
    }).catch(cause => { if (!cancelled) setError((cause as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filmId]);

  async function toggleLike() {
    if (!film) return;
    setBusy(true); setError(""); setReviewMessage("");
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

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!film || !reviewDraft.trim()) return;
    setBusy(true); setError(""); setReviewMessage("");
    try {
      const response = await fetch(`/api/films/${film.id}/reviews`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: reviewRating, body: reviewDraft }),
      });
      const data = await response.json();
      if (response.status === 401) { setError(ar ? "سجّل الدخول لكتابة مراجعة." : "Sign in to leave a review."); return; }
      if (!response.ok) throw new Error(data.error || "Could not save review");
      setMyReview(data.review);
      setReviews(current => [data.review, ...current.filter(review => !review.is_own)]);
      setReviewSummary(data.summary);
      setReviewMessage(ar ? "تم حفظ مراجعتك." : "Your review is saved.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function deleteReview() {
    if (!film || !myReview) return;
    setBusy(true); setError(""); setReviewMessage("");
    try {
      const response = await fetch(`/api/films/${film.id}/reviews`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete review");
      setReviews(current => current.filter(review => !review.is_own));
      setReviewSummary(data.summary); setMyReview(null); setReviewDraft(""); setReviewRating(5);
      setReviewMessage(ar ? "تم حذف مراجعتك." : "Your review was deleted.");
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
          <section className="watch-reviews" aria-label={ar ? "مراجعات الفيلم" : "Film reviews"}>
            <h3>{ar ? "تقييمات ومراجعات" : "Ratings & reviews"}</h3>
            <div className="watch-review-summary" aria-label={ar ? "متوسط تقييم الفيلم" : "Film rating summary"}>
              <strong>{Number(reviewSummary.average_rating).toFixed(1)}</strong>
              <span aria-hidden="true">{"★".repeat(Math.round(Number(reviewSummary.average_rating)))}{"☆".repeat(5 - Math.round(Number(reviewSummary.average_rating)))}</span>
              <small>{reviewSummary.review_count} {ar ? "مراجعة" : "reviews"}</small>
            </div>
            {canReport ? <form className="watch-review-form" onSubmit={event => void saveReview(event)}>
              <fieldset disabled={busy}>
                <legend>{ar ? "تقييمك" : "Your rating"}</legend>
                <div role="group" aria-label={ar ? "اختر تقييمًا من نجمة إلى خمس نجوم" : "Choose a one to five star rating"} className="watch-review-stars">
                  {[1, 2, 3, 4, 5].map(value => <button key={value} type="button" aria-label={`${ar ? "تقييم" : "Rate"} ${value} ${ar ? "من 5" : value === 1 ? "star" : "stars"}`} aria-pressed={reviewRating === value} onClick={() => setReviewRating(value)}>{value <= reviewRating ? "★" : "☆"}</button>)}
                </div>
              </fieldset>
              <label htmlFor="film-review-body">{myReview ? (ar ? "عدّل مراجعتك" : "Edit your review") : (ar ? "اكتب مراجعتك" : "Write a review")}</label>
              <textarea id="film-review-body" value={reviewDraft} maxLength={4000} rows={4} onChange={event => setReviewDraft(event.target.value)} placeholder={ar ? "ما رأيك في الفيلم؟" : "What did you think of the film?"} />
              <div className="watch-review-actions">
                <button className="primary-button" type="submit" disabled={busy || !reviewDraft.trim()}>{myReview ? (ar ? "تحديث المراجعة" : "Update review") : (ar ? "نشر المراجعة" : "Publish review")}</button>
                {myReview && <button className="text-button" type="button" disabled={busy} onClick={() => void deleteReview()}>{ar ? "حذف" : "Delete review"}</button>}
              </div>
              {reviewMessage && <p role="status" className="watch-review-message">{reviewMessage}</p>}
            </form> : <button type="button" className="text-button" onClick={onSignIn}>{ar ? "سجّل الدخول لكتابة مراجعة" : "Sign in to write a review"}</button>}
            <div className="watch-review-list">
              {reviews.map(review => <article key={review.id} className="watch-review">
                <div><strong>{review.is_own ? (ar ? "مراجعتك" : "Your review") : review.author_display_name}</strong><span aria-label={`${review.rating} / 5`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></div>
                <p>{review.body}</p>
              </article>)}
              {reviews.length === 0 && <small>{ar ? "لا توجد مراجعات بعد." : "No reviews yet."}</small>}
            </div>
          </section>
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
