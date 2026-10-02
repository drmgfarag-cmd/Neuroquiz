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
  choices?: { label: string; value: string; danger?: boolean }[];
  resolveChoice?: (value: string | null) => void;
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

/** Present several mutually exclusive choices; Escape leaves the action unchanged. */
export function choose(message: string, choices: { label: string; value: string; danger?: boolean }[]): Promise<string | null> {
  return new Promise((resolve) => open({ message, choices, resolveChoice: resolve, resolve: () => undefined }));
}

export function DialogHost() {
  const [items, setItems] = useState<Request[]>([]);
  const okRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
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
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close(false);
        return;
      }
      if (e.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        ) ?? []);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [cur]);
  if (!cur) return null;
  function close(ok: boolean) {
    if (cur.choices) cur.resolveChoice?.(null);
    else cur.resolve(ok);
    setItems((s) => s.slice(1));
  }
  function pick(value: string) {
    cur.resolveChoice?.(value);
    setItems((s) => s.slice(1));
  }
  return (
    <div className="dialog-backdrop" onClick={() => close(false)}>
      <div ref={dialogRef} className="card dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-msg" onClick={(e) => e.stopPropagation()}>
        <h2 id="dialog-title" className="sr-only">NeuroQuiz confirmation</h2>
        <p id="dialog-msg">{cur.message}</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {cur.choices ? <>
            <button ref={okRef} onClick={() => close(false)}>Keep studying</button>
            {cur.choices.map((c) => <button key={c.value} className={c.danger ? "danger" : "primary"} onClick={() => pick(c.value)}>{c.label}</button>)}
          </> : <>
            {!cur.single && <button onClick={() => close(false)}>Cancel</button>}
            <button ref={okRef} className={cur.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {cur.single ? "OK" : cur.confirmLabel ?? "OK"}
            </button>
          </>}
        </div>
      </div>
    </div>
  );
}
