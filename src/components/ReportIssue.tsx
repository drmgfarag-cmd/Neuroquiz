import { useEffect, useState } from "react";
import { setIssue } from "../lib/quiz";

/** "Report a problem" for a question: saved with your progress and listed in the Library. */
export function ReportIssue({ questionId, issue }: { questionId: string; issue?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(issue ?? "");
  useEffect(() => setDraft(issue ?? ""), [issue, questionId]);
  if (!open)
    return (
      <button className={`small ${issue ? "active" : ""}`} onClick={() => setOpen(true)} title={issue ? `Reported: ${issue}` : "Wrong answer, garbled text, missing image…"}>
        {issue ? "Problem reported ✎" : "Report a problem"}
      </button>
    );
  return (
    <div className="stack" style={{ width: "100%" }}>
      <label className="field" htmlFor={`issue-${questionId}`}>
        What is wrong with this question?
      </label>
      <textarea
        id={`issue-${questionId}`}
        value={draft}
        autoFocus
        placeholder="e.g. answer key should be C · option D text is cut off · figure missing"
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="row">
        <button
          className="small primary"
          disabled={!draft.trim()}
          onClick={async () => {
            await setIssue(questionId, draft);
            setOpen(false);
          }}
        >
          Save report
        </button>
        {issue && (
          <button
            className="small"
            onClick={async () => {
              await setIssue(questionId, "");
              setOpen(false);
            }}
          >
            Mark as resolved
          </button>
        )}
        <button className="small ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
