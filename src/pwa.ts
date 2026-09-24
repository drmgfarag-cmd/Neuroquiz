/**
 * Service-worker registration for the installable web app. The worker
 * precaches the whole app (and the sample book) so it starts with no network.
 * Not used inside the Android (Capacitor) or Windows (Electron) shells, which
 * load the app from local files anyway.
 */
import { canUseServiceWorker, webPreview } from "./lib/platform";

type PwaEvent = "offline-ready" | "update";
let listener: ((e: PwaEvent) => void) | null = null;
let pending: PwaEvent | null = null;
let update: ((reload?: boolean) => Promise<void>) | null = null;

function emit(e: PwaEvent) {
  if (listener) listener(e);
  else pending = e;
}

export function onPwaEvent(cb: (e: PwaEvent) => void): () => void {
  listener = cb;
  if (pending) cb(pending);
  pending = null;
  return () => {
    listener = null;
  };
}

/** Activate a waiting version. Deliberately user-triggered so a running exam is never reloaded. */
export function applyPwaUpdate(): void {
  update?.(true);
}

export async function registerPwa(): Promise<void> {
  // the embedded web preview host doesn't allow service workers
  if (!canUseServiceWorker() || import.meta.env.DEV || webPreview) return;
  const { registerSW } = await import("virtual:pwa-register");
  update = registerSW({
    immediate: true,
    onNeedRefresh: () => emit("update"),
    onOfflineReady: () => emit("offline-ready")
  });
}
