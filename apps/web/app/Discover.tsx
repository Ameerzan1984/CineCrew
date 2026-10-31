"use client";

import { useEffect, useMemo, useState } from "react";

type PublishedFilm = {
  id: string;
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

export default function Discover({ ar }: { ar: boolean }) {
  const [films, setFilms] = useState<PublishedFilm[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return <section aria-label={ar ? "الأفلام المنشورة" : "Published films"}>
    <label className="discover-search">
      <span>{ar ? "ابحث في الأفلام المنشورة" : "Search published films"}</span>
      <input type="search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} />
    </label>
    {loading && <p role="status">{ar ? "جارٍ تحميل الأفلام…" : "Loading published films…"}</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && visibleFilms.length === 0 && <div className="empty">
      <p>{films.length === 0
        ? (ar ? "لا توجد أفلام منشورة بعد." : "No films have been published yet.")
        : (ar ? "لا تطابق أفلام منشورة بحثك." : "No published films match your search.")}</p>
    </div>}
    {!!visibleFilms.length && <div className="discover-film-grid">
      {visibleFilms.map(film => <article className="discover-film-card" key={film.id}>
        <video controls playsInline preload="metadata" src={`/api/media/${film.media_asset_id}`}
          aria-label={ar ? `مشاهدة ${film.title}` : `Watch ${film.title}`} />
        <div className="discover-film-copy">
          <h2>{film.title}</h2>
          <p>{film.premise}</p>
          <div className="discover-film-meta">
            <span>{film.genre}</span><span>{film.duration_minutes} {ar ? "دقيقة" : "min"}</span>
          </div>
          <small>{ar ? "إخراج" : "By"} {film.owner_display_name}</small>
          <small>{film.likes_count} {ar ? "إعجاب" : "likes"} · {film.comments_count} {ar ? "تعليق" : "comments"}</small>
        </div>
      </article>)}
    </div>}
  </section>;
}
