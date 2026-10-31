"use client";

import { FormEvent, useEffect, useState } from "react";

type Conversation = {
  conversation_id: string;
  other_user_id: string;
  other_display_name: string;
  last_message_at: string;
  last_message: string | null;
  unread_count: number;
};
type Message = { id: string; sender_id: string; body: string; created_at: string };

export default function Messages({ ar, recipientId, recipientName, onClearRecipient }: {
  ar: boolean;
  recipientId: string;
  recipientName: string;
  onClearRecipient: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState("");
  const [pendingRecipientId, setPendingRecipientId] = useState(recipientId);
  const [pendingRecipientName, setPendingRecipientName] = useState(recipientName);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function loadConversations() {
    const data = await request("/api/messages");
    setConversations(data.conversations);
  }

  useEffect(() => { if (recipientId) { setPendingRecipientId(recipientId); setPendingRecipientName(recipientName); setActiveId(""); setMessages([]); } }, [recipientId, recipientName]);
  useEffect(() => { loadConversations().catch(error => setNotice(error.message)); }, []);

  async function openConversation(conversation: Conversation) {
    setBusy(true); setNotice(""); setActiveId(conversation.conversation_id);
    setPendingRecipientId(conversation.other_user_id);
    setPendingRecipientName(conversation.other_display_name);
    try {
      const data = await request(`/api/messages?conversationId=${encodeURIComponent(conversation.conversation_id)}`);
      setMessages(data.messages);
      await request("/api/messages", { method: "POST", body: JSON.stringify({ action: "read", conversationId: conversation.conversation_id }) });
      await loadConversations();
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!pendingRecipientId || !draft.trim()) return;
    setBusy(true); setNotice("");
    try {
      const data = await request("/api/messages", {
        method: "POST",
        body: JSON.stringify({ action: "send", recipientId: pendingRecipientId, body: draft }),
      });
      setDraft("");
      setActiveId(data.conversation_id);
      const history = await request(`/api/messages?conversationId=${encodeURIComponent(data.conversation_id)}`);
      setMessages(history.messages);
      await loadConversations();
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  function startNew() {
    setActiveId("");
    setMessages([]);
    setPendingRecipientId("");
    setPendingRecipientName("");
    onClearRecipient();
  }

  return <>
    <section className="page-heading"><div><div className="eyebrow"><span /> CINEMESH</div><h1>{ar ? "الرسائل" : "Messages"}<span className="purple">.</span></h1><p>{ar ? "محادثاتك الخاصة مع صناع الأفلام." : "Private conversations with other filmmakers."}</p></div><button className="outline-button" onClick={startNew}>{ar ? "العودة إلى الوارد" : "Inbox"}</button></section>
    {notice && <p role="status">{notice}</p>}
    <section className="message-layout">
      <aside className="settings-card message-inbox" aria-label={ar ? "المحادثات" : "Conversations"}>
        <h2>{ar ? "الوارد" : "Inbox"}</h2>
        {conversations.length ? conversations.map(conversation => <button type="button" key={conversation.conversation_id} className={`message-thread ${activeId === conversation.conversation_id ? "active" : ""}`} onClick={() => openConversation(conversation)} disabled={busy}>
          <strong>{conversation.other_display_name}</strong>
          <span>{conversation.last_message || (ar ? "ابدأ المحادثة" : "Start the conversation")}</span>
          {conversation.unread_count > 0 && <b aria-label={ar ? "رسائل غير مقروءة" : "Unread messages"}>{conversation.unread_count}</b>}
        </button>) : <p>{ar ? "لا توجد محادثات بعد." : "No conversations yet."}</p>}
      </aside>
      <div className="settings-card message-panel">
        <h2>{pendingRecipientName || (ar ? "اختر محادثة" : "Select a conversation")}</h2>
        {activeId ? <div className="message-history" aria-live="polite">{messages.map(message => <article key={message.id} className={`message-bubble ${message.sender_id === pendingRecipientId ? "incoming" : "outgoing"}`}><p>{message.body}</p><time>{new Date(message.created_at).toLocaleString(ar ? "ar" : "en")}</time></article>)}</div>
          : pendingRecipientId ? <div className="empty"><p>{ar ? `ابدأ محادثة خاصة مع ${pendingRecipientName}.` : `Start a private conversation with ${pendingRecipientName}.`}</p></div>
          : <div className="empty"><p>{ar ? "اختر محادثة أو ابدأ من صفحة المجتمع." : "Choose a conversation or start one from Community."}</p></div>}
        {pendingRecipientId && <form className="message-composer" onSubmit={send}><label htmlFor="message-draft">{ar ? "رسالتك" : "Your message"}</label><textarea id="message-draft" required maxLength={4000} rows={3} value={draft} onChange={event => setDraft(event.target.value)} /><button className="primary-button" disabled={busy || !draft.trim()}>{ar ? "إرسال" : "Send"}</button></form>}
      </div>
    </section>
  </>;
}
