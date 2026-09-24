import { useLiveQuery } from "dexie-react-hooks";
import { AiSettings } from "../components/AiSettings";
import { ask } from "../components/Dialog";
import { useEffect, useState } from "react";
import { db, getMeta } from "../lib/db";
import { updateSettings, useSettings } from "../lib/settings";
import { isNative, saveFile } from "../lib/platform";
import { exportBackup, importBackup, syncWithServer } from "../lib/sync";




export default function SettingsPage() {
  const s = useSettings();
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

      <AiSettings />

      <div className="card stack">
        <h2 className="card-title" style={{ margin: 0 }}>Sync between devices (Windows ⇄ Android)</h2>
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
        <h2 className="card-title" style={{ margin: 0 }}>Appearance</h2>
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
        <h2 className="card-title" style={{ margin: 0 }}>Spaced repetition</h2>
        <label className="field">
          Scheduler for flashcards and question revision
          <select value={s.scheduler ?? "fsrs"} onChange={(e) => updateSettings({ scheduler: e.target.value as "fsrs" | "sm2" })}>
            <option value="fsrs">FSRS-5 (recommended – fewer reviews for the same retention)</option>
            <option value="sm2">SM-2 (classic Anki)</option>
          </select>
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          FSRS models how well you remember each item and schedules it when your recall drops to 90%. Switching keeps your existing schedule; items move over at their next review.
        </p>
      </div>

      <div className="card stack">
        <h2 className="card-title" style={{ margin: 0 }}>Storage</h2>
        <div className="small muted">{storage}</div>
        <div className="row">
          <button
            className="danger"
            onClick={async () => {
              if (!(await ask("Erase all progress, tags and history on this device? Your books stay.", { confirmLabel: "Erase progress", danger: true }))) return;
              await Promise.all([db.questionStates.clear(), db.cardStates.clear(), db.sessions.clear(), db.annotations.clear(), db.tombstones.clear(), db.meta.clear()]);
            }}
          >
            Reset progress
          </button>
          <button
            className="danger"
            onClick={async () => {
              if (!(await ask("Delete everything on this device: books, images and progress?", { confirmLabel: "Delete everything", danger: true }))) return;
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
