import { useMemo, useState } from "react";
import { REFERENCE } from "../lib/reference";

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

export default function ReferencePage() {
  return (
    <div>
      <h1>Reference values</h1>
      <div className="card">
        <ReferenceTables level={2} />
      </div>
    </div>
  );
}
