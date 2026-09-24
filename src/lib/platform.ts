import { Capacitor } from "@capacitor/core";
import { useSyncExternalStore } from "react";

export const isNative = (): boolean => Capacitor.isNativePlatform();

/** Electron shell serves the app from app://, Capacitor from https://localhost. */
export const canUseServiceWorker = (): boolean =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator && /^https?:$/.test(location.protocol) && !isNative();

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Live connectivity status (AI features and sync need a connection). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Ask the browser not to evict the library when storage runs low. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Save/export a file. Desktop & browsers download it; on Android (where
 * downloads from the WebView don't work) it is written to the app cache and
 * handed to the share sheet so it can go to Drive, Files, WhatsApp, etc.
 */
export async function saveFile(blob: Blob, name: string): Promise<void> {
  if (isNative()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const res = await Filesystem.writeFile({ path: name, data: await blobToBase64(blob), directory: Directory.Cache });
    await Share.share({ title: name, files: [res.uri] });
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Android hardware back: close the image viewer, then go back, then exit. */
export async function installBackButton(closeOverlay: () => boolean): Promise<void> {
  if (!isNative()) return;
  const { App } = await import("@capacitor/app");
  await App.addListener("backButton", ({ canGoBack }) => {
    if (closeOverlay()) return;
    if (canGoBack && location.hash !== "#/" && location.hash !== "") history.back();
    else App.exitApp();
  });
}
