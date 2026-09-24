/**
 * In-app replacements for alert()/confirm(). Native dialogs look foreign on
 * Android/Windows and are silently skipped in some embedded web views.
 */
import { useEffect, useRef, useState } from "react";

interface Request {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** notify() has only an OK button */
  single?: boolean;
  resolve: (ok: boolean) => void;
}

let push: ((r: Request) => void) | null = null;
const queue: Request[] = [];

function open(r: Request) {
  if (push) push(r);
  else queue.push(r);
}

/** Ask the user to confirm; resolves true on confirm, false on cancel. */
export function ask(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => open({ message, ...opts, resolve }));
}

/** Show a message with an OK button. */
export function notify(message: string): Promise<void> {
  return new Promise((resolve) => open({ message, single: true, resolve: () => resolve() }));
}

export function DialogHost() {
  const [items, setItems] = useState<Request[]>([]);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    push = (r) => setItems((s) => [...s, r]);
    if (queue.length) setItems(queue.splice(0));
    return () => {
      push = null;
    };
  }, []);
  const cur = items[0];
  useEffect(() => {
    if (!cur) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  if (!cur) return null;
  function close(ok: boolean) {
    cur.resolve(ok);
    setItems((s) => s.slice(1));
  }
  return (
    <div className="dialog-backdrop" onClick={() => close(false)}>
      <div className="card dialog" role="alertdialog" aria-modal="true" aria-describedby="dialog-msg" onClick={(e) => e.stopPropagation()}>
        <p id="dialog-msg">{cur.message}</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {!cur.single && <button onClick={() => close(false)}>Cancel</button>}
          <button ref={okRef} className={cur.danger ? "danger" : "primary"} onClick={() => close(true)}>
            {cur.single ? "OK" : cur.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
