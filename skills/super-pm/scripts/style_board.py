#!/usr/bin/env python3
"""Build the style board page from a folder of concept frames. Prints one line.

usage: style_board.py <concept-dir> [--out <board.html>] [--captions <captions.json>]

Defaults: --out is board.html next to <concept-dir>. --captions is <concept-dir>/captions.json
if it exists: a list of {"file", "letter", "style", "line", "palette": ["#rrggbb", ...]}. The root
must be a list, each entry an object with a string "file", and "palette" (optional) a list of
strings; any other shape is one FAIL line.
When captions.json exists it must agree with the folder (caption_problems, which check_spec.py applies too): no
entry for a file that isn't there (a rejected frame's caption left behind; rejected frames live in rejected/,
outside the concept folder), an entry for every usable frame, and no letter used twice.
Frames named chosen.* or starting with "_" (smoke tests) are left out. Only *.png files are frames,
and one is used only if pngcheck.check_frame finds it a structurally complete truecolour PNG of exactly 1280x720 (the test check_spec.py applies too); each
unusable frame is skipped and named in the output line. Exits 1 if no usable frame remains.
"""
import html
import json
import os
import re
import sys
import urllib.parse

sys.dont_write_bytecode = True      # keep __pycache__ out of the skill folder
import pngcheck                     # scripts/pngcheck.py; Python puts this script's own folder on sys.path

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Style board</title>
<style>
:root {{ --bg:#f6f6f4; --card:#ffffff; --ink:#1d1d1b; --muted:#6b6b66; --line:#e2e2dd; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#151514; --card:#1f1f1d; --ink:#ececea; --muted:#9a9a94; --line:#2e2e2b; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }}
main {{ max-width:1360px; margin:0 auto; padding:24px 16px 48px; }}
h1 {{ font-size:22px; margin:0 0 4px; }}
p.lead {{ margin:0 0 20px; color:var(--muted); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(420px, 1fr)); gap:16px; }}
@media (max-width:480px) {{ .grid {{ grid-template-columns:1fr; }} }}
figure {{ margin:0; background:var(--card); border:1px solid var(--line); border-radius:8px; overflow:hidden; }}
figure img {{ display:block; width:100%; aspect-ratio:16/9; object-fit:contain; background:#000; }}
figcaption {{ padding:12px 14px 14px; }}
.label {{ font-weight:600; font-size:17px; }}
.letter {{ display:inline-block; min-width:28px; padding:0 6px; margin-right:8px; border:1px solid var(--ink); border-radius:4px; text-align:center; }}
.line {{ margin:6px 0 8px; }}
.chips {{ display:flex; gap:6px; flex-wrap:wrap; }}
.chip {{ width:22px; height:22px; border-radius:4px; border:1px solid var(--line); }}
.file {{ margin-top:8px; color:var(--muted); font-size:12px; word-break:break-all; }}
</style></head>
<body><main>
<h1>Style board</h1>
<p class="lead">Pick one look, or combine two (for example, A's colours with C's shapes). The build team will aim for the look you choose.</p>
<div class="grid">
{cards}
</div>
</main></body></html>
"""

CARD = ('<figure><img src="{src}" alt="{alt}"><figcaption>'
        '<div class="label"><span class="letter">{letter}</span>{style}</div>'
        '<div class="line">{line}</div><div class="chips">{chips}</div>'
        '<div class="file">{file}</div></figcaption></figure>')


def json_type(v):
    names = {type(None): "null", bool: "a boolean", int: "a number", float: "a number",
             str: "a string", list: "a list", dict: "an object"}
    return names.get(type(v), type(v).__name__)


def load_captions(path):
    """({file: caption}, None), or (None, why the captions can't be used). Never raises on a wrong shape."""
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (ValueError, OSError, RecursionError) as e:
        return None, f"unreadable captions {path}: {e}"
    if not isinstance(data, list):
        return None, f"captions {path}: the root must be a list of objects, not {json_type(data)}"
    out = {}
    for i, c in enumerate(data):
        if not isinstance(c, dict) or not isinstance(c.get("file"), str) or not c["file"]:
            return None, f'captions {path}: entry {i} must be an object with a string "file"'
        pal = c.get("palette", [])
        if not isinstance(pal, list):
            return None, f'captions {path}: entry {i} "palette" must be a list of strings, not {json_type(pal)}'
        odd = [p for p in pal if not isinstance(p, str)]
        if odd:
            return None, f'captions {path}: entry {i} "palette" must hold only strings, not {json_type(odd[0])}'
        out[c["file"]] = c
    return out, None


def text(c, key):
    v = c.get(key)
    return "" if v is None else str(v)


def caption_problems(captions, present, usable):
    """Where captions.json and the concept folder disagree; [] when they agree. present: every name in the folder;
    usable: the frames that pass pngcheck."""
    out = []
    gone = sorted(f for f in captions if f not in present)
    if gone:
        out.append("captions.json names missing file(s) " + ", ".join(gone) +
                   " (a rejected frame's caption goes to rejected/captions.json with the frame)")
    bare = [n for n in usable if n not in captions]
    if bare:
        out.append("no caption for " + ", ".join(bare))
    letters = [text(c, "letter") for f, c in captions.items() if f in present and text(c, "letter")]
    dup = sorted({x for x in letters if letters.count(x) > 1})
    if dup:
        out.append("letter(s) used twice in captions.json: " + ", ".join(dup))
    return out


def parse(argv):
    args = {"dir": None, "out": None, "captions": None}
    it = iter(argv)
    for a in it:
        if a == "--out":
            args["out"] = next(it, None)
        elif a == "--captions":
            args["captions"] = next(it, None)
        elif args["dir"] is None:
            args["dir"] = a
        else:
            raise SystemExit(f"style_board: unexpected argument {a!r}")
    return args


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 0 if argv else 2
    args = parse(argv)
    d = args["dir"]
    if not d or not os.path.isdir(d):
        print(f"FAIL style_board: {d!r} is not a folder")
        return 1
    d = os.path.abspath(d)
    out = os.path.abspath(args["out"] or os.path.join(os.path.dirname(d), "board.html"))
    names = sorted(n for n in os.listdir(d) if n.lower().endswith(".png")
                   and not n.startswith("_") and not n.lower().startswith("chosen."))
    frames, skipped = [], []
    for n in names:
        ok, why = pngcheck.check_frame(os.path.join(d, n))
        if ok:
            frames.append(n)
        else:
            skipped.append(f"{n} ({why})")
    note = f"skipped {len(skipped)}: " + ", ".join(skipped) if skipped else ""
    if not names:
        print(f"FAIL style_board: no frames in {d}")
        return 1
    if not frames:
        print(f"FAIL style_board: no valid frames in {d}; {note}")
        return 1

    caps_path = args["captions"] or os.path.join(d, "captions.json")
    captions = {}
    if os.path.isfile(caps_path):
        captions, why = load_captions(caps_path)
        if captions is None:
            print(f"FAIL style_board: {why}")
            return 1
        disagree = caption_problems(captions, set(os.listdir(d)), frames)
        if disagree:
            print("FAIL style_board: " + "; ".join(disagree))
            return 1

    def key(name):
        return (text(captions.get(name, {}), "letter") or "~", name)

    cards = []
    for i, name in enumerate(sorted(frames, key=key)):
        c = captions.get(name, {})
        letter = text(c, "letter") or chr(ord("A") + i)
        style = text(c, "style") or os.path.splitext(name)[0]
        chips = "".join(f'<span class="chip" style="background:{p}" title="{p}"></span>'
                        for p in c.get("palette", []) if HEX.match(p))
        rel = os.path.relpath(os.path.join(d, name), os.path.dirname(out))
        cards.append(CARD.format(src=urllib.parse.quote(rel.replace(os.sep, "/")),
                                 alt=html.escape(f"{letter}: {style}"), letter=html.escape(letter),
                                 style=html.escape(style), line=html.escape(text(c, "line")),
                                 chips=chips, file=html.escape(name)))
    with open(out, "w", encoding="utf-8") as f:
        f.write(PAGE.format(cards="\n".join(cards)))
    print(f"board: {out} ({len(cards)} frames" + (f", {note}" if note else "") + ")")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
