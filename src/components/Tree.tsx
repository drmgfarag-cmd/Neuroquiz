import { useState, type ReactNode } from "react";

/** Expandable row whose label can hold a checkbox or buttons (a <summary> can't hold interactive content). */
export function TreeNode({ label, name, children }: { label: ReactNode; name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tree-node">
      <div className="tree-row">
        <button type="button" className="caret" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${name}`} onClick={() => setOpen(!open)}>
          ▸
        </button>
        {label}
      </div>
      {open && <div className="children">{children}</div>}
    </div>
  );
}
