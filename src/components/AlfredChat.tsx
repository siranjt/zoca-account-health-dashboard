"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "alfred"; text: string };

const CHIPS = [
  "Which 3 accounts need attention most?",
  "Give me a health summary of the book",
  "Compare the two worst accounts",
];

function clean(t: string) {
  return String(t).replace(/\*+/g, "").replace(/^#+\s*/gm, "").replace(/^\s*[-–—]{3,}\s*$/gm, "").trim();
}

const CSS = `
.cave{--cy:#35E0FF;--cy2:#8FF0FF;--bg:#0a1216;--bd:#14343D;--bd2:#1E4E5A;--txt:#D7E7EA;--dim:#5E7A80;--mono:'IBM Plex Mono',ui-monospace,monospace}
.cave-launch{position:fixed;left:18px;bottom:18px;z-index:2147483000;font-family:var(--mono);background:linear-gradient(180deg,rgba(53,224,255,.16),rgba(53,224,255,.04));border:1px solid var(--cy);color:var(--cy2);font-size:12px;font-weight:700;letter-spacing:.12em;padding:10px 16px;border-radius:24px;cursor:pointer;box-shadow:0 8px 26px rgba(0,0,0,.5),0 0 18px rgba(53,224,255,.28)}
.cave-launch:hover{background:rgba(53,224,255,.26);transform:translateY(-2px)}
.cave-chat{position:fixed;top:0;right:0;height:100vh;width:min(420px,94vw);z-index:2147483001;font-family:var(--mono);background:linear-gradient(180deg,rgba(9,19,24,.99),rgba(5,11,14,.99));border-left:1px solid var(--cy);box-shadow:-14px 0 50px rgba(0,0,0,.6);display:flex;flex-direction:column;transform:translateX(102%);transition:transform .32s cubic-bezier(.5,0,.2,1)}
.cave-chat.open{transform:none}
.cave-head{display:flex;align-items:center;gap:10px;padding:16px;border-bottom:1px solid var(--bd)}
.cave-head .t{flex:1}
.cave-title{font-weight:700;font-size:16px;letter-spacing:.12em;color:var(--cy);text-shadow:0 0 16px rgba(53,224,255,.5)}
.cave-sub{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-top:3px}
.cave-head button{background:transparent;border:1px solid var(--bd2);color:var(--dim);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:13px}
.cave-head button:hover{border-color:var(--cy);color:var(--cy)}
.cave-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.cave-msg{max-width:90%;font-size:12.5px;line-height:1.65;padding:9px 13px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}
.cave-msg.user{align-self:flex-end;background:linear-gradient(180deg,rgba(53,224,255,.18),rgba(53,224,255,.08));border:1px solid rgba(53,224,255,.35);color:var(--cy2);border-bottom-right-radius:3px}
.cave-msg.alf{align-self:flex-start;background:rgba(20,52,61,.4);border:1px solid var(--bd);color:var(--txt);border-bottom-left-radius:3px}
.cave-who{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:4px}
.cave-msg.alf .cave-who{color:var(--cy);opacity:.7}
.cave-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:rgba(20,52,61,.4);border:1px solid var(--bd);border-radius:12px}
.cave-typing i{width:6px;height:6px;border-radius:50%;background:var(--cy);animation:cavetd 1.2s infinite}
.cave-typing i:nth-child(2){animation-delay:.18s}.cave-typing i:nth-child(3){animation-delay:.36s}
@keyframes cavetd{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}
.cave-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 8px}
.cave-chip{font-size:10px;color:var(--dim);border:1px solid var(--bd2);border-radius:14px;padding:5px 10px;cursor:pointer;background:transparent}
.cave-chip:hover{border-color:var(--cy);color:var(--cy2);background:rgba(53,224,255,.08)}
.cave-in{display:flex;gap:8px;padding:12px 16px 16px;border-top:1px solid var(--bd)}
.cave-in input{flex:1;background:#0a1216;border:1px solid var(--bd2);border-radius:8px;color:var(--cy2);font-family:var(--mono);font-size:13px;padding:10px 12px;outline:none}
.cave-in input:focus{border-color:var(--cy)}
.cave-in button{background:linear-gradient(180deg,var(--cy2),#1899B4);border:0;color:#03181e;font-size:15px;width:42px;border-radius:8px;cursor:pointer;font-weight:700}
`;

export default function AlfredChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { const s = localStorage.getItem("cave_chat"); if (s) setMsgs(JSON.parse(s)); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("cave_chat", JSON.stringify(msgs.slice(-40))); } catch {}
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [msgs, busy]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const a = document.activeElement as HTMLElement | null;
      if (a && a.tagName === "INPUT") return;
      if (e.key === "c" || e.key === "C") setOpen((o) => !o);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const history = msgs.slice(-6);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q, history }) });
      const d = await r.json();
      setMsgs((m) => [...m, { role: "alfred", text: clean(d.reply || "(no answer, sir)") }]);
    } catch {
      setMsgs((m) => [...m, { role: "alfred", text: "Comms failed, sir — please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cave">
      <style>{CSS}</style>
      <button className="cave-launch" onClick={() => setOpen((o) => !o)}>◤◢ ASK ALFRED</button>
      <div className={"cave-chat" + (open ? " open" : "")}>
        <div className="cave-head">
          <div className="t">
            <div className="cave-title">◤◢ ALFRED</div>
            <div className="cave-sub">{busy ? "reasoning…" : "online · account health analyst"}</div>
          </div>
          <button title="clear" onClick={() => setMsgs([])}>⟲</button>
          <button title="close" onClick={() => setOpen(false)}>✕</button>
        </div>
        <div className="cave-log" ref={logRef}>
          {msgs.length === 0 && (
            <div className="cave-msg alf"><div className="cave-who">Alfred</div>Good evening, sir. Ask me about any account&apos;s health, who needs attention, or how the book is doing — I reason over the live data.</div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={"cave-msg " + (m.role === "user" ? "user" : "alf")}>
              <div className="cave-who">{m.role === "user" ? "You" : "Alfred"}</div>{m.text}
            </div>
          ))}
          {busy && (<div className="cave-typing"><i /><i /><i /></div>)}
        </div>
        {msgs.length === 0 && (
          <div className="cave-chips">{CHIPS.map((c) => (<button key={c} className="cave-chip" onClick={() => send(c)}>{c}</button>))}</div>
        )}
        <div className="cave-in">
          <input value={input} placeholder="Ask about the accounts…" autoComplete="off"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(input); if (e.key === "Escape") setOpen(false); }} />
          <button onClick={() => send(input)}>➤</button>
        </div>
      </div>
    </div>
  );
}
