"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bot, ChevronDown, Menu, Plus, Send, Settings2, Sparkles, X } from "lucide-react";

type Model = { id: string; name: string; provider?: string };
type Message = { role: "user" | "assistant"; content: string };
const starterMessages: Message[] = [{ role: "assistant", content: "Halo, saya Maru AI. Pilih model lalu kirim pesan untuk mulai." }];

export default function HomePage() {
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState(true);

  useEffect(() => {
    fetch("/api/models").then(r => r.json()).then(data => {
      const list = Array.isArray(data.models) ? data.models : [];
      setModels(list);
      if (list[0]) setModel(list[0].id);
    }).catch(() => setModels([]));
  }, []);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model || undefined, messages: nextMessages }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
      setMessages(current => [...current, { role: "assistant", content: data.message?.content || "Model tidak mengembalikan jawaban." }]);
    } catch (error) {
      setMessages(current => [...current, { role: "assistant", content: error instanceof Error ? error.message : "Terjadi kesalahan." }]);
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <aside className={sidebar ? "sidebar open" : "sidebar"}>
      <div className="brand"><div className="brand-mark"><Sparkles size={18}/></div><div><strong>Maru AI</strong><span>AI Workspace</span></div><button className="icon-button mobile-only" onClick={() => setSidebar(false)} aria-label="Tutup menu"><X size={18}/></button></div>
      <button className="new-chat" onClick={() => setMessages(starterMessages)}><Plus size={17}/> Chat baru</button>
      <div className="nav-section"><span>Workspace</span><button className="nav-item active"><Bot size={17}/> Percakapan</button><button className="nav-item"><Settings2 size={17}/> Pengaturan</button></div>
      <div className="sidebar-footer"><span>Terhubung ke</span><strong>MAX Router</strong><small>{process.env.NEXT_PUBLIC_MAX_ROUTER_URL || "Router API"}</small></div>
    </aside>
    <section className="content">
      <header className="topbar"><button className="icon-button" onClick={() => setSidebar(v => !v)} aria-label="Menu"><Menu size={20}/></button><div className="model-picker"><select value={model} onChange={e => setModel(e.target.value)} aria-label="Pilih model">{models.length === 0 && <option value="">Model otomatis</option>}{models.map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select><ChevronDown size={15}/></div><div className="status"><span/> Online</div></header>
      <div className="chat"><div className="message-list">{messages.map((message,index) => <article key={index} className={message.role === "user" ? "message user" : "message assistant"}><div className="avatar">{message.role === "assistant" ? <Sparkles size={16}/> : "Kamu"}</div><div className="bubble">{message.content}</div></article>)}{busy && <article className="message assistant"><div className="avatar"><Sparkles size={16}/></div><div className="bubble typing">Maru sedang berpikir...</div></article>}</div></div>
      <form className="composer-wrap" onSubmit={sendMessage}><div className="composer"><textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Tulis pesan untuk Maru AI..." rows={1} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}/><button className="send" disabled={busy || !input.trim()} aria-label="Kirim"><Send size={18}/></button></div><p>Maru AI dapat membuat kesalahan. Periksa jawaban penting.</p></form>
    </section>
  </main>;
}