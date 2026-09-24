/**
 * Small markdown → HTML renderer for question text, plus an allow-list
 * sanitizer so HTML tables coming from extracted books render safely.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "sub", "sup", "small", "mark", "code", "pre", "blockquote",
  "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "span", "div", "img", "a", "figure", "figcaption", "del", "s"
]);
const ALLOWED_ATTR = new Set(["colspan", "rowspan", "alt", "title", "href", "data-file", "align"]);

const RAW_TAG = new RegExp(`<\\/?(?:${Array.from(ALLOWED_TAGS).join("|")})\\b[^<>]*\\/?>`, "gi");

function escapeHtml(s: string): string {
  return s.replace(/&(?!#?\w+;)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape everything except allowed raw HTML tags (sanitized afterwards). */
function escapeKeepingTags(s: string): string {
  let out = "";
  let last = 0;
  for (const m of s.matchAll(RAW_TAG)) {
    out += escapeHtml(s.slice(last, m.index)) + m[0];
    last = m.index! + m[0].length;
  }
  return out + escapeHtml(s.slice(last));
}

function inline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g, (_m, alt: string, src: string) => `<img data-file="${src.replace(/"/g, "&quot;")}" alt="${alt}">`)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/\^([^^\s]+)\^/g, "<sup>$1</sup>")
    .replace(/~([^~\s]+)~/g, "<sub>$1</sub>");
}

function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

function renderTable(lines: string[]): string {
  const rows = lines.filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l));
  const hasHeader = lines.length > 1 && /^\s*\|?\s*:?-{2,}/.test(lines[1]);
  const head = hasHeader ? rows.shift()! : null;
  let html = "<table>";
  if (head) html += `<thead><tr>${splitRow(head).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
  html += `<tbody>${rows.map((r) => `<tr>${splitRow(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  return html;
}

export function markdownToHtml(src: string): string {
  if (!src) return "";
  const text = escapeKeepingTags(src.replace(/\r\n?/g, "\n"));
  // Already HTML-heavy (e.g. extracted tables) → keep line structure lightly.
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) block.push(lines[i++]);
      out.push(renderTable(block));
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = Math.min(6, h[1].length + 2);
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items[items.length - 1] += " " + lines[i++].trim();
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (/^\s*&gt;\s?/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) block.push(lines[i++].replace(/^\s*&gt;\s?/, ""));
      out.push(`<blockquote>${inline(block.join("<br>"))}</blockquote>`);
      continue;
    }
    if (/^\s*<(table|ul|ol|div|figure|pre)\b/i.test(line)) {
      // raw html block: pass through until blank line
      const block: string[] = [];
      while (i < lines.length && lines[i].trim()) block.push(lines[i++]);
      out.push(block.join("\n"));
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*\|.*\|\s*$/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join("<br>"))}</p>`);
  }
  return out.join("\n");
}

/** DOM allow-list sanitizer (browser only). */
export function sanitize(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement;
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        if (tag === "script" || tag === "style" || tag === "iframe" || tag === "object") child.remove();
        else {
          walk(child);
          child.replaceWith(...Array.from(child.childNodes));
        }
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const n = attr.name.toLowerCase();
        if (!ALLOWED_ATTR.has(n) && !(tag === "img" && n === "src")) child.removeAttribute(attr.name);
        else if (n === "href" && !/^https?:/i.test(attr.value)) child.removeAttribute(attr.name);
      }
      if (tag === "img" && child.hasAttribute("src") && !child.hasAttribute("data-file")) {
        child.setAttribute("data-file", child.getAttribute("src")!);
        child.removeAttribute("src");
      }
      if (tag === "a") {
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener noreferrer");
      }
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

export function renderRich(src: string): string {
  return sanitize(markdownToHtml(src));
}

/** Plain-text preview for lists and snippets. */
export function plain(src: string, max = 200): string {
  const t = src
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_`#|>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
