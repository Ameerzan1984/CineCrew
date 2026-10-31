"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Check, RefreshCw, Users } from "lucide-react";

type Notification = {
  id: string;
  notification_type: "film_invitation" | "invitation_accepted" | "invitation_declined";
  role: "editor" | "viewer";
  created_at: string;
  read_at: string | null;
  film_id: string;
  film_title: string;
  actor_display_name: string | null;
};

type Props = { ar: boolean; onOpenInvitations: () => void };

export default function NotificationInbox({ ar, onOpenInvitations }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const t = ar
    ? { title: "الإشعارات", button: "فتح الإشعارات", loading: "جارٍ تحميل الإشعارات…", empty: "لا توجد إشعارات بعد.", refresh: "تحديث", read: "تحديد كمقروء", invitations: "عرض الدعوات", error: "تعذر تحميل الإشعارات.", invited: "دعاك", accepted: "قبل دعوتك", declined: "رفض دعوتك", as: "بدور", editor: "محرر", viewer: "مشاهد", by: "مستخدم" }
    : { title: "Notifications", button: "Open notifications", loading: "Loading notifications…", empty: "No notifications yet.", refresh: "Refresh", read: "Mark as read", invitations: "View invitations", error: "Notifications could not be loaded.", invited: "invited you", accepted: "accepted your invitation", declined: "declined your invitation", as: "as", editor: "editor", viewer: "viewer", by: "A user" };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.error);
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [t.error]);

  useEffect(() => { void load(); }, [load]);

  async function markRead(id: string) {
    if (marking === id || notifications.find(item => item.id === id)?.read_at) return;
    setError("");
    setMarking(id);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", notificationId: id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.error);
      setNotifications(items => items.map(item => item.id === id ? { ...item, read_at: data.read_at } : item));
      setUnreadCount(data.unread_count);
    } catch {
      setError(t.error);
    } finally { setMarking(null); }
  }

  function description(item: Notification) {
    const actor = item.actor_display_name || t.by;
    const status = item.notification_type === "film_invitation" ? t.invited : item.notification_type === "invitation_accepted" ? t.accepted : t.declined;
    const role = item.role === "editor" ? t.editor : t.viewer;
    if (item.notification_type === "film_invitation") return `${actor} ${status} ${t.as} ${role} · ${item.film_title}`;
    return `${actor} ${status} · ${item.film_title}`;
  }

  return <div className="notification-inbox">
    <button type="button" className="outline-button notification-trigger" aria-label={t.button} aria-expanded={open} aria-controls="notification-panel" onClick={() => { const next = !open; setOpen(next); if (next) void load(); }}>
      <Bell size={16}/><span>{ar ? "الإشعارات" : "Notifications"}</span>{unreadCount > 0 && <span className="notification-count" aria-label={ar ? `${unreadCount} غير مقروء` : `${unreadCount} unread`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <section className="notification-panel" id="notification-panel" aria-label={t.title}>
      <div className="notification-panel-header"><h2>{t.title}</h2><button type="button" className="text-button" onClick={() => void load()}><RefreshCw size={14}/>{t.refresh}</button></div>
      {error && <p className="notification-error" role="alert">{error}</p>}
      {loading ? <p className="notification-empty" role="status">{t.loading}</p> : notifications.length === 0 ? <p className="notification-empty">{t.empty}</p> : <ul className="notification-list">
        {notifications.map(item => <li className={`notification-item ${item.read_at ? "read" : "unread"}`} key={item.id}>
          <span className="notification-icon"><Users size={16}/></span>
          <div className="notification-copy"><strong>{item.film_title}</strong><p>{description(item)}</p><time dateTime={item.created_at}>{new Intl.DateTimeFormat(ar ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time>
            <div className="notification-actions">
              {item.notification_type === "film_invitation" && <button type="button" className="text-button" onClick={() => { setOpen(false); onOpenInvitations(); }}>{t.invitations}</button>}
              {!item.read_at && <button type="button" className="text-button" disabled={marking === item.id} onClick={() => void markRead(item.id)}><Check size={13}/>{t.read}</button>}
            </div>
          </div>
        </li>)}
      </ul>}
    </section>}
  </div>;
}
