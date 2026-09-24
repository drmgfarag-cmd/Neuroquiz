import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { aiAvailable, aiChat, aiUnavailableReason, describeAiError, type ChatTurn } from "../ai/claude";
import { useOnline } from "../lib/platform";
import { Rich } from "./Rich";

export function AiChat({ context, starters, placeholder }: { context: string; starters: string[]; placeholder?: string }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const online = useOnline();

  if (!aiAvailable())
    return (
      <p className="small muted">
        {aiUnavailableReason()} <Link to="/settings">Settings</Link>
      </p>
    );

  const send = async (text: string) => {
    if (!text.trim() || busy || !online) return;
    const history: ChatTurn[] = [...turns, { role: "user", content: text.trim() }];
    setTurns(history);
    setDraft("");
    setBusy(true);
    setError("");
    setStreaming("");
    abort.current = new AbortController();
    let acc = "";
    try {
      const full = await aiChat(
        context,
        history,
        (d) => {
          acc += d;
          setStreaming(acc);
        },
        abort.current.signal
      );
      setTurns([...history, { role: "assistant", content: full || acc }]);
    } catch (e) {
      setError(describeAiError(e));
      if (acc) setTurns([...history, { role: "assistant", content: acc }]);
    } finally {
      setStreaming("");
      setBusy(false);
    }
  };

  return (
    <div className="chat">
      {turns.map((t, i) => (
        <div key={i} className={`bubble ${t.role}`}>
          {t.role === "assistant" ? <Rich text={t.content} /> : t.content}
        </div>
      ))}
      {busy && <div className="bubble assistant">{streaming ? <Rich text={streaming} /> : <span className="muted">Thinking…</span>}</div>}
      {error && <div className="error small">{error}</div>}
      {!online && <div className="small muted">You're offline – the AI tutor will be available when you reconnect. Everything else keeps working.</div>}
      {!turns.length && (
        <div className="row">
          {starters.map((s) => (
            <button key={s} className="small" disabled={!online} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <textarea
          value={draft}
          placeholder={placeholder ?? "Ask a follow-up…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          style={{ minHeight: 44, flex: 1 }}
        />
        {busy ? (
          <button onClick={() => abort.current?.abort()}>Stop</button>
        ) : (
          <button className="primary" disabled={!draft.trim() || !online} onClick={() => send(draft)}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
