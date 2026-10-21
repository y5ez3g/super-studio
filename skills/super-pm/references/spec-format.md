# The spec folder: the contract with the build team (v0.8.1)

`docs/game-spec/`, plus `AGENTS.md` and `CLAUDE.md` in the repo root, is committed as the project's first commit. The build team reads these files instead of asking the owner again, and every build mode gets the same ones. The spec is an owner-approved direction and a hypothesis, not a proof: the build's first playable slice tests whether it is fun and whether it can look like the frame.

| File | Written by | The build team uses it as |
|---|---|---|
| `SPEC.md` | the PM (the host: Claude or Codex) | the plan: gameplay, scope, goals and requirements, open risks, provenance. Its last section, Decisions, says why the spec says what it says, who approved it, records the PM session's cost, and logs changes after the lock |
| `ART.md` | the art director (Codex, or the host in host-only mode) | the visual direction for `concept/chosen.png`, every item labelled with its provenance |
| `concept/chosen.png` | the art director, picked by the owner | the approved frame: a direction to reach in motion, not a pixel target. It must be a valid PNG at exactly this path, because every consumer opens the literal path |
| `concept/*.png`, `captions.json`, `board.html` | the art director and the PM | the record of the options shown, and nothing else: no smoke test or scratch file. `captions.json` has one entry per frame, and only for frames that are there. Each frame is a valid PNG that `scripts/pngcheck.py` decodes (chunk CRCs, header, image data); anything else named `.png` (empty, truncated, another format, a folder) is junk |
| `rejected/` (frames and `captions.json`) | the PM | frames that failed the check, each with its caption and why. They stay outside `concept/`, so the board and the checker never offer them again |
| `owner-refs/` (files and `refs.json`) | the PM | the owner's own references, unaltered, each with its provenance and role (below). Absent when the owner supplied none |
| `AGENTS.md` (repo root) | the PM, from `assets/templates/AGENTS.md` | the rules every agent must follow: the pinned stack and the don'ts. It is always-loaded context, so no agent has to open a skill to find them |
| `CLAUDE.md` (repo root) | the PM | one line, `@AGENTS.md`, so Claude Code loads the same rules |

## Sections must have content
`scripts/check_spec.py` rejects a heading with nothing under it, in SPEC.md and in ART.md, because a skeleton passes for a design. Comments don't count as content. Write `N/A` for a section that truly doesn't apply. Decisions must hold a table with at least one filled row, and a `### Changes after lock` subsection, which stays empty until the build starts.

## Provenance: four kinds
Every ART.md item ends with one of these labels, and SPEC.md's Provenance section sorts the plan into the same four. They decide who may change what.

| Kind | Means | Who may change it |
|---|---|---|
| `owner constraint` | the owner said it, in words or in a reference | only the owner |
| `approved experience goal` | presented to the owner and accepted: the game reading, the look of the chosen frame (in words) | only the owner, unless they delegated it |
| `provisional design choice` | the PM's or the art director's proposal | the build team, logging material changes |
| `implementation guess` | inferred from a still image or estimated: hex colours, sizes on screen, camera, light, fog and shader values, speeds | the build team, freely |

Approval attaches to what was actually presented and accepted, never to every inferred number, so an approved experience goal carries no inferred number (the checker rejects a hex colour or a number with a unit on one). A better-looking deviation from an owner constraint or an approved goal is proposed to the owner with evidence, never substituted.

## The owner's references
`owner-refs/refs.json` holds one entry per file in `owner-refs/`:

`{"file": "<name>", "from": "<where it came from: the attachment or the original path>", "words": "<the owner's words about it, verbatim, or empty>", "role": "literal target" | "taste example", "aspect": "<for a taste example: what the owner likes in it>", "status": "stated" | "provisional"}`

- A **literal target** is how the game should look. It is a fidelity reference: compare the build with it.
- A **taste example** shows only its stated aspect. Nothing else in it is a requirement.
- `stated` means the owner gave the role; `provisional` means the PM read it from their words, and the owner may correct it.

ART.md's References section names every file and what the build keeps from it.

## Acceptance grammar
Acceptance states goals and genuine platform and performance requirements: what must be true of the finished game, never how to test it. Test recipes, harness details and detector designs belong to the build team's plan. Inside `## Acceptance`, every non-blank line is exactly this, and the checker rejects any other line:

`^- \[(goal|platform|perf|owner)\] A\d+: .+$`

That is a dash bullet, no indentation, single spaces, a known kind, a unique id and a statement. No `*` bullets, no continuation lines, no prose, so a build team can track every line by its id.

| Kind | States |
|---|---|
| `[goal]` | the experience or content the game delivers |
| `[platform]` | the devices, browsers, input and screen sizes it must run on |
| `[perf]` | the performance the platform and the play genuinely need |
| `[owner]` | the owner's hands-on acceptance: they play the final build and accept it |

Every spec holds at least one line of each kind.

## Other sections the checker reads
- **Consistency review:** one `- **<point>:** ...` line each for content density, camera, scale, run length, performance, rules and feedback: whether ordinary play of this plan can plausibly look like the chosen frame, whether the plan's own rules can produce everything the frame shows (each arrangement, piece and state), whether every player action answers visibly each time it's used, in every state the rules allow (where a rule makes an action do nothing, such as a choice that applies only later or a blocked move, the plan says what the player sees then, or changes the rule), and what was changed where it couldn't.
- **Uncertainties:** the major open questions and risks, for the build to test early.
- **Decisions:** every Source is `owner`, `proxy (provisional)`, `PM`, `context`, `memory`, `default` or `measured`. A proxy is anyone who answered for the owner, and is never recorded as the owner. The Lock row records the Lock line as shown and who approved it (`owner` or `proxy (provisional)`). The build may proceed on a provisional approval; the owner can confirm or change it later. `check_spec.py --locked` requires the Lock row.

## Change control
- **Provisional design choices and implementation guesses:** the build team decides, and logs the material changes under "Changes after lock".
- **Owner constraints and approved experience goals:** only with the owner's OK, unless the owner delegated that discretion. Add a dated line under "Changes after lock" with who approved it, and commit it as `spec: <change>`.
- **ART.md's Avoid list:** the owner's dislikes are owner constraints; the rest are provisional.
- Never edit the spec to make a check pass.

## The cost boundary
The Decisions table has a "PM session" row: the start and end time, the images generated, and the plan-meter readings at start and end ("unknown" if the PM couldn't read them). That is the shared cost of the spec. The build's usage snapshots begin at build start, so the build reports this cost separately and doesn't fold it into any one build's total.
