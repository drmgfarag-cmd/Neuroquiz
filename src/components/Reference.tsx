import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { REFERENCE } from "../lib/reference";
import { loadGlobalIndex, loadIndexedRecordBody } from "../lib/global-index";
import type { ContentIndexRecord } from "../lib/types";

/** Searchable reference tables; used as a page and as a drawer during tests. */
export function ReferenceTables({ level = 3 }: { level?: 2 | 3 }) {
  const H = level === 2 ? "h2" : "h3";
  const [q, setQ] = useState("");
  const tables = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return REFERENCE;
    return REFERENCE.map((t) => (t.title.toLowerCase().includes(needle) ? t : { ...t, rows: t.rows.filter((r) => r.join(" ").toLowerCase().includes(needle)) })).filter((t) => t.rows.length);
  }, [q]);
  return (
    <div className="stack">
      <input type="search" aria-label="Filter reference values" placeholder="Filter: sodium, CSF, Hunt, ASIA…" value={q} onChange={(e) => setQ(e.target.value)} />
      {tables.map((t) => (
        <section key={t.id}>
          <H style={{ margin: "10px 0 4px", fontSize: "1.05em" }}>
            {t.title} <span className="muted small">· {t.group}</span>
          </H>
          <div className="table-scroll" tabIndex={0}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t.columns[0]}</th>
                  <th>{t.columns[1]}</th>
                </tr>
              </thead>
              <tbody>
                {t.rows.map(([a, b]) => (
                  <tr key={a}>
                    <td style={{ whiteSpace: "nowrap" }}>{a}</td>
                    <td>{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {t.note && !q && <p className="small muted" style={{ margin: "4px 0 0" }}>{t.note}</p>}
        </section>
      ))}
      {!tables.length && <p className="muted">Nothing matches.</p>}
      <p className="small muted">Adult reference ranges; they vary slightly between laboratories.</p>
    </div>
  );
}

export function ReferenceDrawer({ onClose }: { onClose: () => void }) {
  return (
    <aside className="drawer" role="dialog" aria-label="Reference values">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Reference values</h2>
        <button className="small" onClick={onClose} aria-label="Close reference values">
          ✕ Close
        </button>
      </div>
      <ReferenceTables />
    </aside>
  );
}

function bodyText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const object = value as Record<string, unknown>;
  for (const key of ["text", "body", "content", "description", "discussion", "notes", "answer"]) {
    if (typeof object[key] === "string") return object[key] as string;
  }
  return Object.values(object).filter((item): item is string => typeof item === "string").join("\n\n");
}

/** Searchable reference-textbook sections. Only the selected section body is fetched. */
export function ReferenceTextbook() {
  const [params, setParams] = useSearchParams();
  const [sections, setSections] = useState<ContentIndexRecord[]>([]);
  const [q, setQ] = useState("");
  const [body, setBody] = useState("");
  const selectedId = params.get("item");

  useEffect(() => {
    loadGlobalIndex("references").then(setSections).catch(() => setSections([]));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sections.slice(0, 100);
    return sections.filter((section) => `${section.title} ${section.searchText} ${section.tags.join(" ")}`.toLowerCase().includes(needle)).slice(0, 100);
  }, [q, sections]);
  const selected = sections.find((section) => section.id === selectedId);

  useEffect(() => {
    let live = true;
    if (!selected) {
      setBody("");
      return () => { live = false; };
    }
    loadIndexedRecordBody(selected).then((value) => live && setBody(bodyText(value))).catch(() => live && setBody("Unable to load this local section."));
    return () => { live = false; };
  }, [selected]);

  if (!sections.length) return null;
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Textbook reference</h2>
      <input type="search" aria-label="Search textbook sections" placeholder="Search textbook sections, topics and tags" value={q} onChange={(e) => setQ(e.target.value)} />
      {selected ? (
        <div className="stack">
          <div className="row between"><h3 style={{ margin: 0 }}>{selected.title}</h3><button className="small" onClick={() => setParams({})}>Close</button></div>
          <div className="reading-answer" style={{ whiteSpace: "pre-wrap" }}>{body || "Loading section…"}</div>
        </div>
      ) : (
        <div className="stack">
          {filtered.map((section) => <button key={section.id} className="list-item" style={{ textAlign: "left" }} onClick={() => setParams({ item: section.id })}><strong>{section.title}</strong><span className="small muted">{section.tags.slice(0, 5).join(" · ")}</span></button>)}
          {!filtered.length && <p className="muted">No textbook sections match.</p>}
        </div>
      )}
    </section>
  );
}

export default function ReferencePage() {
  return (
    <div>
      <h1>Reference values</h1>
      <div className="card">
        <ReferenceTables level={2} />
      </div>
      <ReferenceTextbook />
    </div>
  );
}
