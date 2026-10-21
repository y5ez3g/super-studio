#!/usr/bin/env python3
"""Validate a super-pm spec folder. Prints one line; exits 0 only when the spec passes.

usage: check_spec.py [--locked] <spec-dir>        e.g. check_spec.py docs/game-spec

Checks (references/spec-format.md is the contract):
- SPEC.md and ART.md exist with the template's headings, and every required section has content.
  HTML comments don't count as content; a body of exactly "N/A" does.
- No <placeholder> or TODO/TBD/FIXME is left (HTML comments are ignored). Tech names three.js.
- Inside "## Acceptance", every non-blank line is exactly "- [kind] A<n>: statement": a dash bullet, no
  indentation, single spaces, a known kind and a unique id, so a build team can track every line by id.
  It holds at least one [goal], [platform], [perf] and [owner] line. Kinds say what a line requires,
  never how it is tested: test recipes belong to the build team's plan.
- Consistency review has a line for each of content density, camera, scale, run length, performance, rules and feedback.
- Provenance has a filled line for each of the four kinds: owner constraints, approved experience goals,
  provisional design choices and implementation guesses. The Title is not empty.
- Every ART.md item (a "- " bullet or a table row) carries one of the four labels, and no approved
  experience goal carries an inferred number (a hex colour, or a number with a unit): those are
  implementation guesses.
- Decisions holds a table with at least one filled row and a "### Changes after lock" subsection
  (the subsection may be empty). Every Source is owner, proxy (provisional), PM, context, memory,
  default or measured: "user" and a bare "proxy" are rejected, so a proxy is never recorded as the owner.
  A Lock row, once there, has Source owner or proxy (provisional); --locked (the run before the
  lock commit) requires one.
- owner-refs/, when present, holds refs.json: one entry per file there, each with where it came from,
  its role (literal target, or taste example with its aspect) and whether the owner stated the role
  or it is provisional. ART.md's References section names every file.
- concept/ holds at least one frame (*.png) and exactly chosen.png. Each must be a structurally complete truecolour PNG of exactly
  1280x720 (pngcheck.check_frame, which style_board.py applies too):
  pngcheck.py decodes its structure (chunk CRCs, header, image data), not just its first bytes.
- concept/captions.json exists once there are frames, and agrees with the folder (style_board.caption_problems):
  no caption for a missing file (rejected frames and their captions live in rejected/), one for every usable
  frame, no letter used twice.
- concept/ holds nothing else but captions.json: a leftover smoke test (_smoke.png) or any other stray file
  fails, because the folder is committed as the record of the options shown. Hidden files (.DS_Store) are ignored.
The PASS line counts acceptance lines as the Lock line does: every line under Acceptance.
It doesn't judge content: whether a threshold is sensible or a palette looks good is for the PM,
the art director and the user.
"""
import json
import os
import re
import sys

sys.dont_write_bytecode = True      # keep __pycache__ out of the skill folder
import pngcheck                     # scripts/pngcheck.py; Python puts this script's own folder on sys.path
import style_board                  # its captions loader and caption_problems, so both scripts agree on the board

SPEC_HEADINGS = ["Pitch", "Audience", "Core loop", "Challenge and reward", "Intended experience",
                 "Controls and camera", "Content and scope", "Screens", "Audio", "Constraints", "Tech", "Acceptance",
                 "Uncertainties", "Consistency review", "Provenance", "Title", "Decisions"]
ART_HEADINGS = ["Look", "References", "Palette", "Shapes and shading", "Light and atmosphere",
                "Camera and composition", "Motion and effects", "UI and type", "Audio mood", "Avoid"]
# Sections below have their own, more specific check, so the generic "empty section" check skips them
# (an empty one is reported once, by its own check).
OWN_CHECK = {"tech", "acceptance", "consistency review", "provenance", "title", "decisions"}
TAGS = ("goal", "platform", "perf", "owner")              # what a line requires; how it is tested is the build's plan
TAG_ALT = "|".join(TAGS)
DIMENSIONS = ("Content density", "Camera", "Scale", "Run length", "Performance", "Rules", "Feedback")
# The four provenance kinds: an ART.md label is the singular in parentheses; SPEC.md's Provenance lines may be plural.
KINDS = ("owner constraint", "approved experience goal", "provisional design choice", "implementation guess")
KIND_LINE = {k: re.compile(r"^- \*\*" + re.escape(k) + r"(?:s|es)?(?::\*\*|\*\*[^:\n]*:)[ \t]*\S", re.I) for k in KINDS}
LABEL_END = re.compile(r"\((" + "|".join(KINDS) + r")\)\s*\.?\s*$", re.I)
INFERRED = re.compile(r"#[0-9a-fA-F]{6}\b|\b\d+(?:\.\d+)?\s*(?:px|ms|m|s|fps|deg)\b|\d+(?:\.\d+)?\s*[%°]")
SOURCES = ("owner", "proxy (provisional)", "PM", "context", "memory", "default", "measured")
ROLES = ("literal target", "taste example")
COMMENT = re.compile(r"<!--.*?-->", re.S)
PLACEHOLDER = re.compile(r"<(?!br\s*/?>)[A-Za-z#][^<>\n]{0,160}>")
LEFTOVER = re.compile(r"\b(TODO|TBD|FIXME|lorem ipsum)\b", re.I)
# The one Acceptance grammar. Build tools (e.g. a progress board) read lines of this shape and ignore the rest.
ACCEPT_LINE = re.compile(rf"^- \[({TAG_ALT})\] (A\d+): .+$")
TAGGED = re.compile(r"^\[(\w+)\]\s+(\S.*)$")                        # "[kind] rest", loosely, for diagnosis
ACCEPT_ID = re.compile(r"^(A\d+):\s+\S")                            # "A3: statement", loosely, for diagnosis
CHANGES = re.compile(r"^###\s+Changes after lock\s*$", re.I | re.M)


def read(path):
    with open(path, encoding="utf-8") as f:
        return COMMENT.sub("", f.read())


def sections(text):
    """Map each '## Heading' (lower case) to the text under it."""
    out, cur, buf = {}, None, []
    for line in text.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            if cur is not None:
                out[cur] = "\n".join(buf)
            cur, buf = m.group(1).strip().lower(), []
        elif cur is not None:
            buf.append(line)
    if cur is not None:
        out[cur] = "\n".join(buf)
    return out


def has_content(body):
    """True if the section has any text once comments are gone ("N/A" has letters, so it counts)."""
    return re.search(r"\w", body) is not None


def form_problem(line):
    """Say why `line` is not an exact "- [kind] A<n>: statement" line."""
    want, exact = "- [kind] A<n>: statement", ACCEPT_LINE
    shown = line.strip()[:40]
    if line[:1].isspace():
        return f"indented line {shown!r}; start at column 0"
    if line[:2] in ("* ", "+ "):
        return f"'{line[0]}' bullet on {shown!r}; use '- '"
    if exact.match(re.sub(r"[ \t]+", " ", line.rstrip())):
        return f"extra spaces or tabs on {shown!r}; write exactly '{want}'"
    if not line.startswith("- "):
        return f"not a '{want}' line: {shown!r}"
    rest = line[2:].strip()
    m = TAGGED.match(rest)
    if not m:
        return f"no [kind] on {rest[:40]!r}"
    tag = m.group(1)
    if tag not in TAGS:
        if tag.lower() in TAGS:
            return f"kind [{tag}] must be lower case"
        return f"unknown kind [{tag}] (use goal, platform, perf or owner; how a line is tested is the build team's plan)"
    if not ACCEPT_ID.match(m.group(2)):
        return f"no A<n>: id and statement after the kind on {rest[:40]!r}"
    return f"odd spacing on {shown!r}; write exactly '{want}'"


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def tables(text):
    """Yield (header cells, [(raw line, body cells), ...]) for each markdown table in text."""
    head, body, prev = None, [], None
    for raw in text.split("\n") + [""]:
        if not raw.strip().startswith("|"):
            if head is not None:
                yield head, body
            head, body, prev = None, [], None
            continue
        row = cells(raw)
        if head is not None:
            body.append((raw, row))
        elif prev is not None and all(re.fullmatch(r":?-+:?", c) for c in row):
            head = prev
        prev = row


def art_items(art):
    """(unlabelled lines, approved-goal lines with an inferred number) over every ART.md section."""
    unlabelled, numbered = [], []
    for body in art.values():
        if body.strip() == "N/A":
            continue
        for head, rows in tables(body):
            for raw, row in rows:
                labels = [c.lower().strip("() ") for c in row if c.lower().strip("() ") in KINDS]  # bare or (in parentheses)
                if not labels:
                    unlabelled.append(raw.strip())
                elif "approved experience goal" in labels and INFERRED.search(raw):
                    numbered.append(raw.strip())
        for raw in body.split("\n"):
            if not raw.strip() or raw.strip().startswith("|"):   # table rows were checked above
                continue
            m = LABEL_END.search(raw)
            if not raw.startswith("- ") or not m:
                unlabelled.append(raw.strip())
            elif m.group(1).lower() == "approved experience goal" and INFERRED.search(raw[:m.start()]):
                numbered.append(raw.strip())
    return unlabelled, numbered


def source_problems(body, locked):
    """Problems with the Decisions table's Source column and its Lock row."""
    out, lock = [], []
    for head, rows in tables(body):
        names = [h.lower() for h in head]
        if "source" not in names:
            continue
        si, qi = names.index("source"), names.index("question") if "question" in names else 0
        for raw, row in rows:
            row += [""] * (len(head) - len(row))
            src = row[si]
            if row[qi].lower() == "lock":
                lock.append(src)
            if not src or src.lower() in [x.lower() for x in SOURCES]:
                continue
            if src.lower() == "user":
                out.append(f"Decisions: Source 'user' on {row[qi][:30]!r}; write owner, or proxy (provisional) "
                           "when someone answered for the owner")
            elif src.lower().startswith("proxy"):
                out.append(f"Decisions: Source {src!r} on {row[qi][:30]!r}; a proxy's answer is 'proxy (provisional)'")
            else:
                out.append(f"Decisions: unknown Source {src!r} on {row[qi][:30]!r} (use {', '.join(SOURCES)})")
    bad = [s for s in lock if s.lower() not in ("owner", "proxy (provisional)")]
    if bad:
        out.append(f"Decisions: the Lock row's Source is {bad[0]!r}; only owner or proxy (provisional) can approve")
    elif locked and not lock:
        out.append("Decisions: no Lock row (--locked: record the Lock line as shown and who approved it: "
                   "owner, or proxy (provisional))")
    return out


def ref_problems(d, art):
    """Problems with owner-refs/: refs.json against the folder, each entry's role, and ART.md's References."""
    folder = os.path.join(d, "owner-refs")
    if not os.path.isdir(folder):
        return [], 0
    names = sorted(n for n in os.listdir(folder) if not n.startswith(".") and n != "refs.json")
    path = os.path.join(folder, "refs.json")
    if not os.path.isfile(path):
        return ["owner-refs/: no refs.json (one entry per reference: file, from, role, status)"], len(names)
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (ValueError, OSError, RecursionError) as e:
        return [f"owner-refs/refs.json: unreadable: {e}"], len(names)
    if not isinstance(data, list) or not all(isinstance(e, dict) and isinstance(e.get("file"), str) for e in data):
        return ['owner-refs/refs.json: the root must be a list of objects, each with a string "file"'], len(names)
    out, listed = [], [e["file"] for e in data]
    gone = sorted(f for f in listed if not os.path.isfile(os.path.join(folder, f)))
    if gone:
        out.append("owner-refs/: refs.json names missing file(s) " + ", ".join(gone))
    bare = [n for n in names if n not in listed]
    if bare:
        out.append("owner-refs/: no refs.json entry for " + ", ".join(bare))
    for e in data:
        f, role = e["file"], e.get("role")
        if not str(e.get("from") or "").strip():
            out.append(f"owner-refs/refs.json {f}: no \"from\" (where the owner's file came from)")
        if role not in ROLES:
            out.append(f"owner-refs/refs.json {f}: role {role!r} is not literal target or taste example")
        elif role == "taste example" and not str(e.get("aspect") or "").strip():
            out.append(f"owner-refs/refs.json {f}: a taste example needs its \"aspect\" (what the owner likes in it)")
        if e.get("status") not in ("stated", "provisional"):
            out.append(f"owner-refs/refs.json {f}: status {e.get('status')!r} must be stated (the owner gave the role) "
                       "or provisional")
    if art is not None and listed:
        refs = art.get("references", "")
        missing = [f for f in listed if f not in refs]
        if missing:
            out.append("ART.md References: doesn't name " + ", ".join(missing))
    return out, len(listed)


def filled_rows(text):
    """Count table body rows (below a |---| line) in which every cell, up to the header's width, has text."""
    count, width, prev = 0, 0, None
    for raw in text.split("\n"):
        if not raw.strip().startswith("|"):
            width, prev = 0, None
            continue
        row = cells(raw)
        if width:
            row += [""] * (width - len(row))
            if all(row[:width]):
                count += 1
        elif prev is not None and all(re.fullmatch(r":?-+:?", c) for c in row):
            width = len(prev)
        prev = row
    return count


def check(d, locked=False):
    problems, stats = [], {}
    texts = {}
    for name in ("SPEC.md", "ART.md"):
        path = os.path.join(d, name)
        if not os.path.isfile(path) or os.path.getsize(path) == 0:
            problems.append(f"{name} missing or empty")
            continue
        texts[name] = read(path)
        left = PLACEHOLDER.findall(texts[name]) + LEFTOVER.findall(texts[name])
        if left:
            problems.append(f"{name}: {len(left)} unfilled placeholder(s), first {left[0]!r}")

    if "SPEC.md" in texts:
        spec = sections(texts["SPEC.md"])
        missing = [h for h in SPEC_HEADINGS if h.lower() not in spec]
        if missing:
            problems.append("SPEC.md: missing section(s) " + ", ".join(missing))
        empty = [h for h in SPEC_HEADINGS if h.lower() in spec and h.lower() not in OWN_CHECK
                 and not has_content(spec[h.lower()])]
        if empty:
            problems.append("SPEC.md: empty section(s) " + ", ".join(empty))
        if "tech" in spec and "three" not in spec["tech"].lower():
            problems.append("SPEC.md Tech: must name three.js")
        if "acceptance" in spec:
            lines = [l for l in spec["acceptance"].split("\n") if l.strip()]
            stats["acceptance"] = len(lines)
            if not lines:
                problems.append("SPEC.md Acceptance: empty")
            seen, ids = set(), set()
            for line in lines:
                m = ACCEPT_LINE.match(line.rstrip())
                if not m:
                    problems.append("SPEC.md Acceptance: " + form_problem(line))
                    continue
                seen.add(m.group(1))
                if m.group(2) in ids:
                    problems.append(f"SPEC.md Acceptance: duplicate id {m.group(2)}")
                ids.add(m.group(2))
            for need in TAGS:
                if lines and need not in seen:
                    problems.append(f"SPEC.md Acceptance: no [{need}] line")
        if "consistency review" in spec:
            body = spec["consistency review"]
            gaps = [k for k in DIMENSIONS
                    if not re.search(r"^- \*\*" + re.escape(k) + r":\*\*[ \t]*\S", body, re.M | re.I)]
            if gaps:
                problems.append("SPEC.md Consistency review: no line for " + ", ".join(gaps))
        if "provenance" in spec:
            lines = spec["provenance"].split("\n")
            gaps = [k for k in KINDS if not any(KIND_LINE[k].match(l) for l in lines)]
            if gaps:
                problems.append("SPEC.md Provenance: no filled line for " + ", ".join(k + ("es" if k.endswith("s") else "s")
                                                                                      for k in gaps))
        if "title" in spec and not spec["title"].strip():
            problems.append("SPEC.md Title: empty")
        if "decisions" in spec:
            body = spec["decisions"]
            sub = CHANGES.search(body)
            if not filled_rows(body[:sub.start()] if sub else body):
                problems.append("SPEC.md Decisions: no table with a filled row")
            if not sub:
                problems.append('SPEC.md Decisions: no "### Changes after lock" subsection')
            problems += ["SPEC.md " + p for p in source_problems(body[:sub.start()] if sub else body, locked)]

    if "ART.md" in texts:
        art = sections(texts["ART.md"])
        missing = [h for h in ART_HEADINGS if h.lower() not in art]
        if missing:
            problems.append("ART.md: missing section(s) " + ", ".join(missing))
        empty = [h for h in ART_HEADINGS if h.lower() in art and not has_content(art[h.lower()])]
        if empty:
            problems.append("ART.md: empty section(s) " + ", ".join(empty))
        unlabelled, numbered = art_items({h: b for h, b in art.items() if has_content(b)})
        if unlabelled:
            problems.append(f"ART.md: {len(unlabelled)} item(s) without a provenance label, first {unlabelled[0][:50]!r} "
                            "(end each with (owner constraint), (approved experience goal), (provisional design choice) "
                            "or (implementation guess))")
        if numbered:
            problems.append(f"ART.md: an approved experience goal carries an inferred number: {numbered[0][:50]!r} "
                            "(numbers read off a frame are implementation guesses)")
    refs, stats["refs"] = ref_problems(d, sections(texts["ART.md"]) if "ART.md" in texts else None)
    problems += refs

    concept = os.path.join(d, "concept")
    if not os.path.isdir(concept):
        problems.append("concept/ missing")
    else:
        names = sorted(os.listdir(concept))
        candidates = [n for n in names if n.lower().endswith(".png")
                      and not n.startswith("_") and not n.lower().startswith("chosen.")]
        bad, usable = [], []
        for n in candidates:
            ok, why = pngcheck.check_frame(os.path.join(concept, n))
            if ok:
                usable.append(n)
            else:
                bad.append(f"{n} ({why})")
        good = stats["frames"] = len(usable)
        caps = os.path.join(concept, "captions.json")
        if good and not os.path.isfile(caps):
            problems.append("concept/: no captions.json")
        elif good:
            captions, why = style_board.load_captions(caps)
            problems += [f"concept/: {why}"] if captions is None else \
                ["concept/: " + p for p in style_board.caption_problems(captions, set(names), usable)]
        stray = [n for n in names if not n.startswith(".") and not n.lower().startswith("chosen.") and n != "captions.json"
                 and (n.startswith("_") or not n.lower().endswith(".png"))]
        if stray:
            problems.append("concept/: stray file(s) " + ", ".join(stray) +
                            " (only the board frames, captions.json and chosen.png belong here; delete smoke tests)")
        if bad:
            problems.append("concept/: unusable frame(s) " + ", ".join(bad))
        elif not candidates:
            problems.append("concept/: no frames")
        if "chosen.png" not in names:
            other = [n for n in names if n.lower().startswith("chosen.")]
            hint = f" (found {', '.join(other)}; the build opens the literal path chosen.png)" if other else ""
            problems.append("concept/: no chosen.png" + hint)
        else:
            ok, why = pngcheck.check_frame(os.path.join(concept, "chosen.png"))
            if not ok:
                problems.append("concept/chosen.png: " + why)
    return problems, stats


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 0 if argv else 2
    locked = "--locked" in argv
    rest = [a for a in argv if a != "--locked"]
    if len(rest) != 1:
        print("usage: check_spec.py [--locked] <spec-dir>")
        return 2
    d = rest[0]
    if not os.path.isdir(d):
        print(f"FAIL {d}: not a folder")
        return 1
    problems, stats = check(d, locked)
    if problems:
        print(f"FAIL {d}: {len(problems)} problem(s): " + "; ".join(problems))
        return 1
    n = stats.get("refs", 0)
    print(f"PASS {d}: {stats.get('acceptance', 0)} acceptance lines, {stats.get('frames', 0)} frames, "
          f"{n} owner reference{'' if n == 1 else 's'}, " + ("locked, " if locked else "") + "chosen.png is a PNG")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
