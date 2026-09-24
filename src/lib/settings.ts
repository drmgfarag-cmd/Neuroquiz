import { useSyncExternalStore } from "react";
import type { Settings } from "./types";

export const DEFAULT_MODEL = "claude-opus-5";

const KEY = "neuroquiz.settings";

const defaults: Settings = {
  apiKey: "",
  model: DEFAULT_MODEL,
  numericAnswerBase: 1,
  syncUrl: "",
  syncToken: "",
  deviceName: "",
  theme: "system",
  fontScale: 1
};

let current: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable – keep in memory */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current
  );
}
