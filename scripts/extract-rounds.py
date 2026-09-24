#!/usr/bin/env python3
"""Extract the user-supplied Neurosurgery Rounds 2e PDF to a NeuroQuiz ZIP.

Usage: python scripts/extract-rounds.py source.pdf output.zip
The source PDF is not copied into the bundle. Questions, cases and figures are
selected from printed typography and explicit figure references; an audit JSON
inside the ZIP reports anything requiring a source check.
"""
import argparse
import collections
import io
import json
import re
import zipfile

import fitz

FIG = re.compile(r"\bFigs?\.\s*(\d+)\.(\d+)(?:\s*[A-Za-z])?", re.I)
QSTART = re.compile(r"^(\d{1,4})\.\s+(.+)")
CASE = re.compile(r"^■\s*Case\s+(\d+)(\s+Answer)?\b", re.I)
CHAPTER = re.compile(r"^([1-9])\s+([A-Z][^\n]+)$")
TITLE = "Neurosurgery Rounds: Questions and Answers, 2nd Edition"


def clean(text):
    """Join page-wrapped prose while retaining the book's paragraphs and lists."""
    text = text.replace("\u00ad", "").replace("\ufffd", "")
    text = re.sub(r"(?<=\w)-\n(?=\w)", "", text)
    text = re.sub(r"(?<!\n)\n(?!\n)", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def lines(page):
    result = []
    for block in page.get_text("dict")["blocks"]:
        if "lines" not in block:
            continue
        for line in block["lines"]:
            spans = line["spans"]
            if not spans:
                continue
            text = "".join(s["text"] for s in spans).strip()
            if not text:
                continue
            x0, y0, x1, y1 = line["bbox"]
            if y0 < 35 or y1 > 481:
                continue
            font = spans[0]["font"]
            result.append({"text": text, "font": font, "size": spans[0]["size"], "rect": (x0, y0, x1, y1)})
    result.sort(key=lambda v: (round(v["rect"][1] / 2) * 2, v["rect"][0]))
    merged = []
    for row in result:
        if merged:
            last = merged[-1]
            gap = row["rect"][0] - last["rect"][2]
            if ("Gulliver" in row["font"] and row["font"] == last["font"] and
                    abs(row["rect"][1] - last["rect"][1]) < 1 and -1 <= gap < 38):
                last["text"] += " " + row["text"]
                last["rect"] = (last["rect"][0], last["rect"][1], row["rect"][2], max(last["rect"][3], row["rect"][3]))
                continue
        merged.append(row)
    return merged


def refs(text):
    return [f"{m[1]}.{m[2]}" for m in FIG.finditer(text)]


def extract(doc):
    chapters = collections.OrderedDict()
    captions = {}
    issues = []
    chapter = subsection = section = ""
    active = None
    mode = ""
    reference_section = False

    def save():
        nonlocal active
        if not active:
            return
        if active["kind"] == "qa":
            q, a = clean("\n".join(active["question"])), clean("\n".join(active["answer"]))
            if q and a:
                chapters.setdefault(active["chapter"], {"title": active["chapter"], "qa_pairs": [], "cases": []})["qa_pairs"].append({
                    "number": str(active["number"]), "question": q, "answer": a,
                    "source_page": active["page"]
                })
            else:
                issues.append(f"PDF p{active['page']}: Q{active['number']} lacks question or answer")
        else:
            pres, answer = clean("\n".join(active["presentation"])), clean("\n".join(active["answer"]))
            if pres and answer:
                chapters.setdefault(active["chapter"], {"title": active["chapter"], "qa_pairs": [], "cases": []})["cases"].append({
                    "title": f"Case {active['number']}", "presentation": pres,
                    "stages": [{"title": "Book answer", "question": "Consider the case questions above.", "answer": answer}],
                    "source_page": active["page"]
                })
            else:
                issues.append(f"PDF p{active['page']}: Case {active['number']} lacks presentation or answer")
        active = None

    for page_no, page in enumerate(doc, 1):
        if page_no < 11 or page_no > 475:
            continue
        rows = lines(page)
        for i, row in enumerate(rows):
            t, f, size = row["text"], row["font"], row["size"]
            argo = "Argo" in f
            body = "Gulliver" in f and size >= 6.8
            # The running page headings and repeated publisher footer aren't content.
            if t.startswith("Shaya et al.,") or t.startswith("copyright ©") or "Usage subject to terms" in t:
                continue
            if argo and re.match(r"^(?:\d+\s+Neurosurgery Rounds|(?:\d+\s+)?[A-Za-z][^:]{0,40}:\s+[A-Za-z].*\d+)$", t) and row["rect"][1] < 59 and size <= 7.2:
                continue
            cm = CHAPTER.match(t) if argo and "Bold" in f and size >= 12 and row["rect"][1] < 95 else None
            if cm:
                save()
                chapter, subsection, section = cm[1] + " " + cm[2], "", ""
                reference_section = False
                continue
            if not chapter or reference_section:
                continue
            if argo and "Bold" in f and t.lstrip("■ ").lower() == "references":
                save()
                reference_section = True
                continue
            # Captions use Argo and begin with a printed figure identifier.
            fig = FIG.match(t) if argo and ("Medium" in f or "Bold" in f) else None
            if fig:
                key = f"{fig[1]}.{fig[2]}"
                if key not in captions:
                    following = [t]
                    last_bottom = row["rect"][3]
                    for next_row in rows[i + 1:i + 9]:
                        if "Argo" not in next_row["font"] or next_row["rect"][1] - last_bottom > 12 or FIG.match(next_row["text"]):
                            break
                        following.append(next_row["text"])
                        last_bottom = next_row["rect"][3]
                    captions[key] = {"page": page_no, "caption": clean("\n".join(following)), "y": row["rect"][1], "bottom": max([row["rect"][3], *(r["rect"][3] for r in rows[i + 1:i + len(following)])])}
                continue
            if argo and "Bold" in f and t == "Cases":
                save()
                section = "Cases"
                continue
            case = CASE.match(t) if argo and "Bold" in f else None
            if case:
                number, is_answer = int(case[1]), bool(case[2])
                if not is_answer:
                    save()
                    active = {"kind": "case", "number": number, "chapter": f"{chapter} / Cases", "page": page_no, "presentation": [], "answer": []}
                    mode = "presentation"
                elif active and active["kind"] == "case" and active["number"] == number:
                    mode = "answer"
                else:
                    issues.append(f"PDF p{page_no}: Case {number} answer has no matched presentation")
                continue
            if argo and "Bold" in f and t.startswith("■") and not case:
                save()
                section = t.lstrip("■ ").strip()
                continue
            if argo and "Bold" in f and size >= 9.9 and t not in ("Cases",):
                save()
                subsection, section = t, ""
                continue
            if not body:
                continue
            q = QSTART.match(t) if "Bold" in f and section != "Cases" else None
            if q:
                save()
                target = " / ".join(x for x in (chapter, subsection, section) if x)
                active = {"kind": "qa", "number": int(q[1]), "chapter": target, "page": page_no, "question": [q[2]], "answer": []}
                mode = "question"
                continue
            if not active:
                continue
            if active["kind"] == "qa" and mode == "question" and "Bold" not in f:
                mode = "answer"
            active[mode].append(t)
        # Do not cross a publisher's reference list into the next chapter.
    save()
    return chapters, captions, issues


def render_figure(doc, key, meta):
    """Crop a printed figure without adjacent prose; caption is stored as metadata."""
    page = doc[meta["page"] - 1]
    caption_y, bottom = meta["y"], meta["bottom"]
    candidates = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 1:
            continue
        x0, y0, x1, y1 = block["bbox"]
        if (x1 - x0) < 35 or (y1 - y0) < 28 or y0 > bottom + 2:
            continue
        # Include panels whose bottom is near the caption or whose right edge
        # meets a rotated caption (e.g. Fig. 1.2).
        if y1 <= caption_y + 5 or (caption_y < y1 <= bottom + 5):
            candidates.append(fitz.Rect(block["bbox"]))
    if candidates:
        closest = min(abs(caption_y - b.y1) for b in candidates)
        selected = [b for b in candidates if abs(caption_y - b.y1) <= max(18, closest + 8)]
        start = max(45, min(b.y0 for b in selected) - 6)
        end = min(caption_y - 2 if caption_y > max(b.y1 for b in selected) else max(b.y1 for b in selected) + 4, max(b.y1 for b in selected) + 6)
    else:
        # Vector-only figures have no raster block. Use the text immediately
        # before the caption as the upper limit of the figure area.
        body_bottoms = [r["rect"][3] for r in lines(page) if "Gulliver" in r["font"] and r["rect"][3] < caption_y - 18]
        start = max(45, max(body_bottoms, default=45) + 5)
        end = caption_y - 2
    clip = fitz.Rect(36, start, page.rect.width - 29, min(page.rect.height - 32, end))
    if clip.height < 25:
        return None
    return page.get_pixmap(matrix=fitz.Matrix(2.3, 2.3), clip=clip, alpha=False).tobytes("png")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf")
    parser.add_argument("zip")
    args = parser.parse_args()
    doc = fitz.open(args.pdf)
    chapters, captions, issues = extract(doc)
    image_keys = set()
    for chapter in chapters.values():
        for qa in chapter["qa_pairs"]:
            question_refs, answer_refs = refs(qa["question"]), refs(qa["answer"])
            qa["question_images"] = [{"file": f"fig_{key.replace('.', '_')}.png", "caption": captions[key]["caption"]} for key in dict.fromkeys(question_refs) if key in captions]
            qa["answer_images"] = [{"file": f"fig_{key.replace('.', '_')}.png", "caption": captions[key]["caption"]} for key in dict.fromkeys(answer_refs) if key in captions and key not in question_refs]
            image_keys.update(key for key in question_refs + answer_refs if key in captions)
            issues.extend(f"PDF p{qa['source_page']}: Q{qa['number']} references Fig. {key} without caption" for key in set(question_refs + answer_refs) - captions.keys())
        for case in chapter["cases"]:
            question_refs, answer_refs = refs(case["presentation"]), refs(case["stages"][0]["answer"])
            case["presentation_media"] = [{"file": f"fig_{key.replace('.', '_')}.png", "caption": captions[key]["caption"]} for key in dict.fromkeys(question_refs) if key in captions]
            case["stages"][0]["answer_media"] = [{"file": f"fig_{key.replace('.', '_')}.png", "caption": captions[key]["caption"]} for key in dict.fromkeys(answer_refs) if key in captions and key not in question_refs]
            image_keys.update(key for key in question_refs + answer_refs if key in captions)
            issues.extend(f"PDF p{case['source_page']}: Case {case['title']} references Fig. {key} without caption" for key in set(question_refs + answer_refs) - captions.keys())
    book = {"book_id": "neurosurgery-rounds-2e", "book_title": TITLE, "chapters": list(chapters.values())}
    audit = {"pages": len(doc), "questions": sum(len(c["qa_pairs"]) for c in chapters.values()), "cases": sum(len(c["cases"]) for c in chapters.values()), "chapters": len(chapters), "captioned_figures": len(captions), "referenced_figures": len(image_keys), "issues": issues}
    with zipfile.ZipFile(args.zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for key in sorted(image_keys, key=lambda k: tuple(map(int, k.split(".")))):
            png = render_figure(doc, key, captions[key])
            if png:
                z.writestr(f"fig_{key.replace('.', '_')}.png", png)
            else:
                issues.append(f"Fig. {key} crop too small on PDF p{captions[key]['page']}")
        z.writestr("rounds-qa.json", json.dumps(book, ensure_ascii=False, indent=1))
        z.writestr("rounds-audit.json", json.dumps(audit, ensure_ascii=False, indent=2))
    print(json.dumps({k: v if k != "issues" else v[:25] for k, v in audit.items()}, indent=2))


if __name__ == "__main__":
    main()
