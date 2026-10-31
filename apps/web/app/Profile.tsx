"use client";

import { useEffect, useState } from "react";

type ProfileData = { id: string; display_name: string; followers: number; following_count: number; following: boolean };
type Film = { id: string; title: string; premise: string; genre: string; duration_minutes: number; media_asset_id: string; likes_count: number; comments_count: number };

export default function Profile({ userId, viewerId, ar, onBack, onSignIn, onOpenFilm }: {
  userId: string;
  viewerId?: string;
  ar: boolean;
  onBack: () => void;
  onSignIn: () => void;
  onOpenFilm: (filmId: string) => void;
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [films, setFilms] = useState<Film[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setNotice(""); setProfile(null); setFilms([]);
    fetch(`/api/profiles/${userId}`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Profile is unavailable");
        return data as { profile: ProfileData; films: Film[] };
      })
      .then(data => { if (!cancelled) { setProfile(data.profile); setFilms(data.films); } })
      .catch(error => { if (!cancelled) setNotice((error as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  async function toggleFollow() {
    if (!profile) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/community", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: profile.following ? "unfollow" : "follow", userId: profile.id }),
      });
      const data = await response.json();
      if (response.status === 401) { setNotice(ar ? "\u0633\u062c\u0651\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0647\u0630\u0627 \u0627\u0644\u0645\u062e\u0631\u062c." : "Sign in to follow this filmmaker."); return; }
      if (!response.ok) throw new Error(data.error || "Could not update follow");
      const refreshed = await fetch(`/api/profiles/${profile.id}`, { cache: "no-store" });
      const refreshedData = await refreshed.json();
      if (!refreshed.ok) throw new Error(refreshedData.error || "Could not refresh profile");
      setProfile(refreshedData.profile as ProfileData);
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="public-profile" aria-label={ar ? "\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a" : "Filmmaker profile"}>
    <button className="back-link" onClick={onBack}>{ar ? "\u0631\u062c\u0648\u0639" : "Back"}</button>
    {loading && <p role="status">{ar ? "\u062c\u0627\u0631\u064d \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0645\u0644\u0641\u2026" : "Loading profile\u2026"}</p>}
    {notice && <p role="status">{notice} {notice.includes("Sign in") || notice.includes("\u0633\u062c\u0651\u0644")
      ? <button type="button" className="text-button" onClick={onSignIn}>{ar ? "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644" : "Sign in"}</button> : null}</p>}
    {!loading && profile && <>
      <header className="profile-heading settings-card">
        <div className="profile-avatar" aria-hidden="true">{profile.display_name.trim().slice(0, 1).toLocaleUpperCase()}</div>
        <div className="profile-identity"><div className="eyebrow"><span/> CINEMESH FILMMAKER</div><h1>{profile.display_name}<span className="purple">.</span></h1>
          <p>{profile.followers} {ar ? "\u0645\u062a\u0627\u0628\u0639" : "followers"} · {profile.following_count} {ar ? "\u0645\u062a\u0627\u0628\u0639\u0629" : "following"}</p></div>
        {viewerId !== profile.id && <button className="primary-button" disabled={busy} aria-pressed={profile.following} onClick={() => void toggleFollow()}>
          {profile.following ? (ar ? "\u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629" : "Following · Unfollow") : (ar ? "\u0645\u062a\u0627\u0628\u0639\u0629" : "Follow")}
        </button>}
      </header>
      <div className="profile-films-heading"><div><div className="eyebrow"><span/> PORTFOLIO</div><h2>{ar ? "\u0623\u0641\u0644\u0627\u0645 \u0645\u0646\u0634\u0648\u0631\u0629" : "Published films"}</h2></div></div>
      {films.length ? <div className="discover-film-grid">{films.map(film => <article className="discover-film-card" key={film.id}>
        <video controls playsInline preload="metadata" src={`/api/media/${film.media_asset_id}`} aria-label={`${ar ? "\u0645\u0634\u0627\u0647\u062f\u0629" : "Watch"} ${film.title}`} />
        <div className="discover-film-copy"><h3>{film.title}</h3><p>{film.premise}</p>
          <div className="discover-film-meta"><span>{film.genre}</span><span>{film.duration_minutes} {ar ? "\u062f\u0642\u064a\u0642\u0629" : "min"}</span></div>
          <small>{film.likes_count} {ar ? "\u0625\u0639\u062c\u0627\u0628" : "likes"} · {film.comments_count} {ar ? "\u062a\u0639\u0644\u064a\u0642" : "comments"}</small>
          <button type="button" className="discover-watch-button" onClick={() => onOpenFilm(film.id)}>{ar ? "\u0645\u0634\u0627\u0647\u062f\u0629 \u0627\u0644\u0641\u064a\u0644\u0645" : "Watch film"}</button>
        </div>
      </article>)}</div> : <div className="empty"><p>{ar ? "\u0644\u0645 \u064a\u0646\u0634\u0631 \u0647\u0630\u0627 \u0627\u0644\u0645\u062e\u0631\u062c \u0623\u0641\u0644\u0627\u0645\u0627\u064b \u0628\u0639\u062f." : "This filmmaker has not published any films yet."}</p></div>}
    </>}
  </section>;
}
