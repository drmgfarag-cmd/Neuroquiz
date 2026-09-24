/**
 * Keeps progress, tags, notes and AI-generated content in step between
 * devices (e.g. Windows laptop + Android phone).
 *
 * Two transports:
 *  1. A tiny self-hosted sync server (sync-server/server.mjs) – automatic.
 *  2. A backup file you move via Drive/OneDrive/USB – manual merge.
 *
 * Every synced row carries `updatedAt`; merges are last-writer-wins per row,
 * deletions travel as tombstones.
 */
import { db, getMeta, setMeta, SYNC_KEY, SYNC_TABLES, type SyncTable, type Tombstone } from "./db";
import { getSettings } from "./settings";

export interface SyncRecord {
  table: SyncTable;
  id: string;
  updatedAt: number;
  row?: Record<string, unknown>;
  deleted?: boolean;
}

function rowTime(row: Record<string, unknown>): number {
  return typeof row.updatedAt === "number" ? row.updatedAt : typeof row.createdAt === "number" ? row.createdAt : 0;
}

export async function collectChanges(sinceLocal: number): Promise<SyncRecord[]> {
  const out: SyncRecord[] = [];
  for (const table of SYNC_TABLES) {
    const key = SYNC_KEY[table];
    const rows = (await db.table(table).toArray()) as Record<string, unknown>[];
    for (const row of rows) {
      const t = rowTime(row);
      if (t > sinceLocal) out.push({ table, id: String(row[key]), updatedAt: t, row });
    }
  }
  const tombs = await db.tombstones.where("updatedAt").above(sinceLocal).toArray();
  for (const t of tombs) out.push({ table: t.table, id: t.id, updatedAt: t.updatedAt, deleted: true });
  return out;
}

/** Merge remote records; returns how many rows changed locally. */
export async function applyChanges(records: SyncRecord[]): Promise<number> {
  let changed = 0;
  const tables = SYNC_TABLES.map((t) => db.table(t));
  await db.transaction("rw", [...tables, db.tombstones], async () => {
    for (const r of records) {
      if (!SYNC_TABLES.includes(r.table)) continue;
      const table = db.table(r.table);
      const local = (await table.get(r.id)) as Record<string, unknown> | undefined;
      const localTime = local ? rowTime(local) : -1;
      if (r.deleted) {
        if (local && localTime <= r.updatedAt) {
          await table.delete(r.id);
          changed++;
        }
        const tomb: Tombstone = { key: `${r.table}:${r.id}`, table: r.table, id: r.id, updatedAt: r.updatedAt };
        await db.tombstones.put(tomb);
      } else if (r.row && r.updatedAt > localTime) {
        const tomb = await db.tombstones.get(`${r.table}:${r.id}`);
        if (tomb && tomb.updatedAt >= r.updatedAt) continue;
        await table.put(r.row);
        changed++;
      }
    }
  });
  return changed;
}

export interface SyncOutcome {
  pushed: number;
  pulled: number;
  applied: number;
  at: number;
}

export async function syncWithServer(): Promise<SyncOutcome> {
  const { syncUrl, syncToken, deviceName } = getSettings();
  if (!syncUrl) throw new Error("Set a sync server URL in Settings first.");
  const lastPush = await getMeta<number>("sync.lastPushLocal", 0);
  const lastSeq = await getMeta<number>("sync.lastSeq", 0);
  const startedAt = Date.now();
  const changes = await collectChanges(lastPush);

  const res = await fetch(`${syncUrl.replace(/\/+$/, "")}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(syncToken ? { Authorization: `Bearer ${syncToken}` } : {}) },
    body: JSON.stringify({ since: lastSeq, device: deviceName || "device", changes })
  });
  if (!res.ok) throw new Error(`Sync server replied ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { seq: number; changes: SyncRecord[] };
  const applied = await applyChanges(data.changes);
  // rows written by the merge carry remote timestamps (≤ startedAt) so they
  // are not echoed back on the next push
  await setMeta("sync.lastPushLocal", startedAt);
  await setMeta("sync.lastSeq", data.seq);
  await setMeta("sync.lastAt", Date.now());
  return { pushed: changes.length, pulled: data.changes.length, applied, at: Date.now() };
}

export async function exportBackup(): Promise<Blob> {
  const records = await collectChanges(-1);
  const payload = { format: "neuroquiz-backup", version: 1, exportedAt: Date.now(), device: getSettings().deviceName, records };
  return new Blob([JSON.stringify(payload)], { type: "application/json" });
}

export async function importBackup(file: Blob): Promise<number> {
  const data = JSON.parse(await file.text());
  if (data?.format !== "neuroquiz-backup" || !Array.isArray(data.records)) throw new Error("Not a NeuroQuiz backup file.");
  return applyChanges(data.records as SyncRecord[]);
}
