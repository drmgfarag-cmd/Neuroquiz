import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, getMeta } from "../lib/db";
import { DEFAULT_MODEL, updateSettings, useSettings } from "../lib/settings";
import { isNative, saveFile } from "../lib/platform";
import { exportBackup, importBackup, syncWithServer } from "../lib/sync";

const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 (default, most accurate)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (cheaper for bulk tagging)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (cheapest, fastest)" }
];


export default function SettingsPage() {
  const s = useSettings();
  const [showKey, setShowKey] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [storage, setStorage] = useState("");
  const lastSync = useLiveQuery(() => getMeta<number>("sync.lastAt", 0));

  useEffect(() => {
    Promise.all([navigator.storage?.estimate?.(), navigator.storage?.persisted?.()]).then(([e, persisted]) => {
      if (!e) return;
      setStorage(
        `${((e.usage ?? 0) / 1e6).toFixed(1)} MB used of ~${((e.quota ?? 0) / 1e9).toFixed(1)} GB available · ` +
          (persisted || isNative() ? "protected from automatic clean-up" : "not yet protected – install the app (Add to Home screen / Install) so the browser keeps your library")
      );
    });
  }, []);

  return (
    <div>
      <h1>Settings</h1>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>AI (Claude)</h3>
        <label className="field">
          Anthropic API key
          <div className="row">
            <input type={showKey ? "text" : "password"} value={s.apiKey} onChange={(e) => updateSettings({ apiKey: e.target.value })} placeholder="sk-ant-…" style={{ flex: 1, minWidth: 220 }} autoComplete="off" />
            <button className="small" onClick={() => setShowKey(!showKey)}>
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          Stored only on this device (not synced). Get a key at console.anthropic.com. Used for tagging, smart search, flashcard & case generation and the AI tutor.
        </p>
        <label className="field">
          Model
          <select value={MODELS.some((m) => m.id === s.model) ? s.model : "custom"} onChange={(e) => e.target.value !== "custom" && updateSettings({ model: e.target.value })}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
        </label>
        <input type="text" value={s.model} onChange={(e) => updateSettings({ model: e.target.value.trim() || DEFAULT_MODEL })} />
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Sync between devices (Windows ⇄ Android)</h3>
        <p className="small muted" style={{ margin: 0 }}>
          Progress, flags, notes, tags, test history and your own/AI flashcards & cases sync. Books and images do not – import them on each device (a ZIP makes this easy).
        </p>
        <label className="field">
          This device's name
          <input type="text" value={s.deviceName} onChange={(e) => updateSettings({ deviceName: e.target.value })} placeholder="e.g. Laptop, Phone" />
        </label>
        <label className="field">
          Sync server URL
          <input type="url" value={s.syncUrl} onChange={(e) => updateSettings({ syncUrl: e.target.value.trim() })} placeholder="http://192.168.1.20:8787" />
        </label>
        <label className="field">
          Sync token
          <input type="password" value={s.syncToken} onChange={(e) => updateSettings({ syncToken: e.target.value })} autoComplete="off" />
        </label>
        <div className="row">
          <button
            className="primary"
            disabled={!s.syncUrl}
            onClick={async () => {
              setSyncMsg("Syncing…");
              try {
                const r = await syncWithServer();
                setSyncMsg(`Sent ${r.pushed}, received ${r.pulled}, updated ${r.applied} locally.`);
              } catch (e) {
                setSyncMsg((e as Error).message);
              }
            }}
          >
            Sync now
          </button>
          <span className="small muted">{syncMsg || (lastSync ? `Last sync ${new Date(lastSync).toLocaleString()}` : "Never synced")}</span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Auto-sync runs on start, every 5 minutes and when the app is reopened. Run the server with <code>npm run sync-server</code> (see README).
        </p>
        <hr style={{ margin: "4px 0" }} />
        <div className="row">
          <button onClick={async () => saveFile(await exportBackup(), `neuroquiz-progress-${new Date().toISOString().slice(0, 10)}.json`)}>Export progress file</button>
          <label className="btn">
            Merge progress file
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const n = await importBackup(f);
                  setSyncMsg(`Merged – ${n} rows updated.`);
                } catch (err) {
                  setSyncMsg((err as Error).message);
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          No server? Export on one device, move the file via Google Drive / OneDrive / USB and merge it on the other. Merging is safe in both directions (newest change wins).
        </p>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Appearance</h3>
        <div className="row">
          <label className="field">
            Theme
            <select value={s.theme} onChange={(e) => updateSettings({ theme: e.target.value as typeof s.theme })}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="field">
            Text size
            <select value={s.fontScale} onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })}>
              <option value={0.9}>Small</option>
              <option value={1}>Normal</option>
              <option value={1.12}>Large</option>
              <option value={1.25}>Extra large</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Storage</h3>
        <div className="small muted">{storage}</div>
        <div className="row">
          <button
            className="danger"
            onClick={async () => {
              if (!confirm("Erase ALL progress, tags and history on this device? Books stay.")) return;
              await Promise.all([db.questionStates.clear(), db.cardStates.clear(), db.sessions.clear(), db.annotations.clear(), db.tombstones.clear(), db.meta.clear()]);
            }}
          >
            Reset progress
          </button>
          <button
            className="danger"
            onClick={async () => {
              if (!confirm("Delete EVERYTHING on this device (books, images, progress)?")) return;
              await db.delete();
              location.reload();
            }}
          >
            Delete all data
          </button>
        </div>
      </div>
    </div>
  );
}
