#!/usr/bin/env node
/**
 * NeuroQuiz sync server – zero dependencies, Node 18+.
 *
 *   SYNC_TOKEN=choose-a-secret PORT=8787 node sync-server/server.mjs
 *
 * Run it on any always-on machine (your Windows PC, a Raspberry Pi, a small
 * VPS). Every device posts its changed rows and receives the rows other
 * devices changed since its last sync. Data is kept in sync-server/data/.
 * It only stores progress/tags/notes – not the books or images.
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.SYNC_TOKEN ?? "";
const DATA_DIR = process.env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "data");
const FILE = join(DATA_DIR, "store.json");
const MAX_BODY = 50 * 1024 * 1024;

mkdirSync(DATA_DIR, { recursive: true });
/** @type {{ seq: number, records: Record<string, {table:string,id:string,updatedAt:number,row?:object,deleted?:boolean,seq:number,device?:string}> }} */
let store = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { seq: 0, records: {} };

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeFileSync(FILE + ".tmp", JSON.stringify(store));
    renameSync(FILE + ".tmp", FILE);
  }, 200);
}

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function merge(changes, device) {
  for (const c of changes) {
    if (!c || typeof c.table !== "string" || typeof c.id !== "string" || typeof c.updatedAt !== "number") continue;
    const key = `${c.table}:${c.id}`;
    const cur = store.records[key];
    if (cur && cur.updatedAt >= c.updatedAt) continue; // last writer wins
    store.seq += 1;
    store.records[key] = { table: c.table, id: c.id, updatedAt: c.updatedAt, row: c.deleted ? undefined : c.row, deleted: !!c.deleted, seq: store.seq, device };
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url ?? "/", "http://x");
  if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, seq: store.seq, records: Object.keys(store.records).length });

  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: "bad token" });

  if (req.method === "POST" && url.pathname === "/sync") {
    try {
      const body = JSON.parse(await readBody(req));
      const since = Number(body.since) || 0;
      const device = String(body.device ?? "device").slice(0, 60);
      const before = store.seq;
      merge(Array.isArray(body.changes) ? body.changes : [], device);
      if (store.seq !== before) save();
      const out = Object.values(store.records)
        .filter((r) => r.seq > since)
        .map(({ table, id, updatedAt, row, deleted }) => ({ table, id, updatedAt, row, deleted }));
      return send(res, 200, { seq: store.seq, changes: out });
    } catch (e) {
      return send(res, 400, { error: String(e?.message ?? e) });
    }
  }
  send(res, 404, { error: "not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`NeuroQuiz sync server on http://0.0.0.0:${PORT} (${TOKEN ? "token required" : "NO TOKEN – set SYNC_TOKEN"})`);
});
