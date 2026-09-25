import { useRef, useState } from "react";
import { notify } from "../components/Dialog";
import { Link } from "react-router-dom";
import { runLocalTagging } from "../ai/tagger";
import { collectFiles, executeImport, planImport, type GroupingMode, type ImportPlan, type ImportResult, type SourceFile } from "../import/importer";
import { clearMediaCache } from "../lib/media";
import { updateSettings, useSettings } from "../lib/settings";

export default function ImportPage() {
  const settings = useSettings();
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [mode, setMode] = useState<GroupingMode>("auto");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [over, setOver] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);

  const addFiles = async (list: File[]) => {
    setBusy("Reading files…");
    setResult(null);
    try {
      const got = await collectFiles(list);
      const all = [...files, ...got];
      setFiles(all);
      await replan(all, mode);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const replan = async (fs: SourceFile[], m: GroupingMode, base = settings.numericAnswerBase) => {
    const p = await planImport(fs, m, base);
    setPlan(p);
    setTitles(Object.fromEntries(p.books.map((b) => [b.key, b.title])));
  };

  const loadSample = async () => {
    setBusy("Loading sample…");
    try {
      // served as plain files (not a zip) so every host can deliver them
      const names = ["01-vascular.json", "02-oncology-trauma.json", "03-spine-functional.json", "04-question-types.json", "fig_cow.svg", "fig_edh.svg"];
      const files = await Promise.all(
        names.map(async (n) => {
          const res = await fetch(`./sample/${n}`);
          if (!res.ok) throw new Error(`Could not load sample file ${n}`);
          const type = n.endsWith(".svg") ? "image/svg+xml" : "application/json";
          return new File([await res.blob()], n, { type });
        })
      );
      await addFiles(files);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const doImport = async () => {
    if (!plan) return;
    const p: ImportPlan = { ...plan, books: plan.books.map((b) => ({ ...b, title: titles[b.key]?.trim() || b.title })) };
    setBusy("Importing…");
    try {
      const r = await executeImport(p, setBusy);
      clearMediaCache();
      setBusy("Tagging with offline keyword tagger…");
      await runLocalTagging(["question", "flashcard", "case"], null, "untagged");
      setResult(r);
      setFiles([]);
      setPlan(null);
    } catch (e) {
      notify(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  const counts = (b: ImportPlan["books"][number]) =>
    b.sources.reduce(
      (a, s) => {
        s.parsed.chapters.forEach((c) => {
          a.ch++;
          a.q += c.questions.length;
          a.f += c.flashcards.length;
          a.c += c.cases.length;
          a.clinical += c.cases.filter((x) => x.kind !== "qa").length;
          a.qa += c.cases.filter((x) => x.kind === "qa").reduce((n, x) => n + x.stages.length, 0);
        });
        return a;
      },
      { ch: 0, q: 0, f: 0, c: 0, clinical: 0, qa: 0 }
    );

  return (
    <div>
      <h1>Import books</h1>
      <div className="card stack">
        <p className="muted small" style={{ margin: 0 }}>
          Select JSON files and their image files (or a whole folder, a ZIP, or every numbered ZIP part together). A book can be one JSON file or one JSON per chapter; images are matched to the JSON by file name. Short-answer books with <code>qa_pairs</code> appear in Cases & Q&A with answers hidden until reveal.
        </p>
        <div
          className={`dropzone ${over ? "over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <div className="row" style={{ justifyContent: "center" }}>
            <label className="btn primary">
              Choose files / ZIP
              <input type="file" multiple hidden onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))} />
            </label>
            <label className="btn">
              Choose folder
              <input
                ref={(el) => {
                  folderRef.current = el;
                  el?.setAttribute("webkitdirectory", "");
                }}
                type="file"
                multiple
                hidden
                onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
              />
            </label>
            <button onClick={loadSample}>Load sample book</button>
          </div>
          <div className="muted small" style={{ marginTop: 8 }}>
            …or drag & drop here. On Android, pick a ZIP, all its .001/.002/… parts together, or multi-select JSON + images.
          </div>
        </div>

        <div className="row">
          <label className="field">
            Grouping
            <select
              value={mode}
              onChange={(e) => {
                const m = e.target.value as GroupingMode;
                setMode(m);
                if (files.length) replan(files, m);
              }}
            >
              <option value="auto">Auto (by book title in JSON, else by folder)</option>
              <option value="single">All selected files are chapters of ONE book</option>
              <option value="per-file">Each JSON file is a separate book</option>
            </select>
          </label>
          <label className="field">
            Numeric answers (e.g. "answer": 2) mean
            <select
              value={settings.numericAnswerBase}
              onChange={(e) => {
                const base = Number(e.target.value) as 0 | 1;
                updateSettings({ numericAnswerBase: base });
                if (files.length) replan(files, mode, base);
              }}
            >
              <option value={1}>1 = first option (1-based)</option>
              <option value={0}>0 = first option (0-based)</option>
            </select>
          </label>
        </div>
        {busy && <div className="muted">{busy}</div>}
      </div>

      {plan && (
        <div className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>Preview</h2>
            <span className="muted small">
              {files.filter((f) => /\.json$/i.test(f.path)).length} JSON · {plan.images.length} images
            </span>
          </div>
          {plan.errors.map((e) => (
            <div key={e} className="error small">
              {e}
            </div>
          ))}
          {plan.books.map((b) => {
            const c = counts(b);
            const warnings = b.sources.flatMap((s) => s.parsed.warnings);
            return (
              <div className="list-item" key={b.key}>
                <div style={{ flex: 1 }} className="stack">
                  <label className="field">
                    Book title
                    <input type="text" value={titles[b.key] ?? ""} onChange={(e) => setTitles({ ...titles, [b.key]: e.target.value })} />
                  </label>
                  <div className="small">
                    {b.sources.length} file(s) · {c.ch} chapters · <strong>{c.q}</strong> test questions · {c.qa} short answers · {c.f} flashcards · {c.clinical} clinical cases · {b.images.length} images
                  </div>
                  <details>
                    <summary className="small clickable">Chapters & files</summary>
                    {b.sources.map((s) => (
                      <div key={s.path} className="small">
                        <code>{s.path}</code>: {s.parsed.chapters.map((ch) => `${ch.title} (${ch.questions.length}q)`).join(", ") || "nothing recognised"}
                      </div>
                    ))}
                  </details>
                  {warnings.length > 0 && (
                    <details>
                      <summary className="small clickable" style={{ color: "var(--warn)" }}>
                        {warnings.length} warning(s)
                      </summary>
                      <div className="small muted" style={{ maxHeight: 200, overflow: "auto" }}>
                        {warnings.slice(0, 300).map((w, i) => (
                          <div key={i}>{w}</div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" disabled={!!busy || !plan.books.length} onClick={doImport}>
              Import {plan.books.length} book(s)
            </button>
            <button
              onClick={() => {
                setFiles([]);
                setPlan(null);
              }}
            >
              Clear
            </button>
            <span className="muted small">Re-importing a book with the same title replaces its content but keeps your progress and tags.</span>
          </div>
        </div>
      )}

      {result && (
        <div className="card">
          <h2 style={{ marginTop: 0 }} className="success">
            Import complete
          </h2>
          <p>
            {result.books} book(s), {result.chapters} sections, {result.questions} test questions, {result.shortAnswers} short answers, {result.flashcards} flashcards, {result.clinicalCases} clinical cases, {result.images} images.
          </p>
          {!!result.remapped && <p className="small">{result.remapped} question(s) changed in the source; your progress on them was kept.</p>}
          <p className="small muted">Questions were given quick offline topic tags. For accurate context-aware categorisation run AI tagging.</p>
          {result.missingImages.length > 0 && (
            <details>
              <summary className="clickable" style={{ color: "var(--warn)" }}>
                {result.missingImages.length} referenced image(s) not found
              </summary>
              <div className="small muted" style={{ maxHeight: 200, overflow: "auto" }}>
                {result.missingImages.map((m) => (
                  <div key={m}>{m}</div>
                ))}
              </div>
              <p className="small">Import the missing images again together with the same book title – they will attach automatically.</p>
            </details>
          )}
          {([
            ["Unresolved answer keys (excluded from scored tests)", result.unscorable],
            ["Images not linked to a question", result.unreferencedImages],
            ["Question/answer image role conflicts", result.conflictingImageRoles],
            ["Questions without a source explanation", result.noExplanation],
            ["Source extraction warnings", result.warnings]
          ] as [string, string[]][]).filter(([, items]) => items.length).map(([label, items]) => (
            <details key={label}>
              <summary className="clickable" style={{ color: "var(--warn)" }}>{items.length} {label.toLowerCase()}</summary>
              <div className="small muted" style={{ maxHeight: 200, overflow: "auto" }}>
                {items.map((item, i) => <div key={`${item}-${i}`}>{item}</div>)}
              </div>
            </details>
          ))}
          <div className="row">
            <Link className="btn primary" to="/tagging">
              Run AI tagging
            </Link>
            <Link className="btn" to="/library">
              Open library
            </Link>
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Supported JSON</h2>
        <p className="small muted">Field names are flexible (question/stem/text, options/choices, answer/correct_answer, explanation/rationale, images/figures…). Examples:</p>
        <pre className="small" tabIndex={0} style={{ overflow: "auto", background: "var(--surface-2)", padding: 10, borderRadius: 8 }}>{`{
  "book": "Neurosurgery Review",
  "chapters": [{
    "title": "Vascular",
    "questions": [{
      "id": 12,
      "question": "Most common site of ... See figure.",
      "images": ["fig_12.png"],
      "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
      "answer": "C",
      "explanation": "... ![](table_3.png)",
      "explanation_images": [{"file": "fig_12b.jpg", "caption": "Angiogram"}]
    }],
    "flashcards": [{"front": "...", "back": "..."}],
    "cases": [{"title": "...", "presentation": "...",
               "stages": [{"content": "...", "question": "...", "answer": "..."}],
               "discussion": "..."}]
  }]
}`}</pre>
      </div>
    </div>
  );
}
