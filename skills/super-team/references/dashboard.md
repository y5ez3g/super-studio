# Dashboard: the progress board, state fields and `st` commands

`team/dashboard.html` re-reads `team/state.js` every 30 seconds and redraws every 10, so its times stay current between writes (a disclosure you opened stays open). Open it as a file; it needs no server and costs no model tokens. A build is another matter: a static build has to be served over http (see Builds below). **All dashboard text is in English**: the page and every free-text field you write (plan, tasks, decisions, needs, requests, feedback, responses, build notes). Talk to the owner in their language, but not here.

## How it works
- `team/tools/st` writes `team/state.json`, the source of truth.
- On every `st` command, and after every gate run, `team/tools/state.mjs` rebuilds `derived` from the files on disk and writes `team/state.js`: state.json plus `derived`. `derived` is never stored in state.json.
- The refresh loop, `team/tools/collect-loop.sh`, runs `st touch --no-bump` every minute (`REFRESH_SECONDS`), and the page re-reads state.js every 30 seconds, so a new round file shows within about 90 seconds. `init_team.sh` starts it: one per team/, its pid in team/'s `tools/collector.pid`. It stops by itself once the phase is `done` or team/ is gone.
- With `init_team.sh --no-refresh` there is no loop: a new file shows on the next `st` command or gate run, and `st touch` forces it.
- A missing or unreadable file the board reads (a round file, a build's notes, the spec, gate results) only empties its own part of the board, and never makes `st` fail. `team/state.json` itself is different: it is the run's record, so when it can't be read, every `st` command (the refresh loop's too) exits 2 and writes nothing. Fix or restore it, then run `st touch`.

## The board
| Part | Shows | From |
|---|---|---|
| Header | the mode's name (Super Engineer or Super Team (experimental), from `plan.mode`), the product's name and pitch (`plan.headline`, written "Name: pitch"), the last report (`updatedAt`, which every `st` command bumps but the refresh loop doesn't; an orange "last report" after 10 minutes without one), and a pill with the phase: Planning, Building, Improving · round k of N (Improving · round k · no round cap when `roundsMax` is null), Wrapping up, Run complete or Paused. k is the highest round with a request. **Needs your decision** sits under it while `needsYou` has items: one bullet each, a repeat shown once | `phase`, `plan`, `roundsMax`, the round folders, `needsYou` |
| **Latest build** | the build created last: its tag, when it was frozen, its hero image and the first line of its notes. With an index.html it offers **Copy start command** and **Open latest build**; without one it says "How to run: see team/builds/<tag>/NOTES.md" (see Builds). Not shown before the first build: What's left takes the width | `team/builds/<tag>/` |
| **What's left** | the time left until the time limit; the rounds left (or that this is the last round); the open items of the latest response; the acceptance summary, which counts only the lines a gate or the owner can settle (how many pass on the latest build, up to five failing ones by name, then how many are untested and how many are not checked by a gate); **Now**, what is happening (planning; building, since the plan's approval; round k: waiting for feedback, waiting for the response, or n items open; wrapping up), with the open task bars; and the warnings (below) | `endsAt`, `roundsMax`, the round folders, the spec, gate results, `timeline`, `tl` |
| **How we got here** | a swimlane: a Build column, one column per round, then ship. The lanes are You, TL and Reviewer. The Build column holds the plan's approval and the Build bar, from `plan.approvedAt` to `buildDoneAt` (or now, while it runs). A round's column is headed with its request time and holds the feedback in the Reviewer lane (items, bugs, the reviewer and the first line of the body) and the response in the TL lane (done, to do, declined). Ship holds the latest build's tag, and "signed off" once the owner has signed it off. The column in progress is marked "now". ✓ done, ● running (it stops pulsing when the state is stale), ✗ malformed feedback, ○ a response left with items to do once its round is no longer the one in progress; grey dashed boxes have not started. A column is at most 240 px wide; when the columns don't fit, the strip scrolls, starting at the newest | the round folders, `plan`, `buildDoneAt`, `owner.signoff` |
| **Acceptance** | every acceptance line with ✓ pass, ✗ fail, ○ untested or – not checked by a gate, and why: the failing ones listed, the others behind "N untested: view checks", "N not checked by a gate: view checks" and "N passed: view checks". The `[judge]` lines are listed apart, under "Reviewed in the feedback rounds (no scores in v0.11)". Beside them, the Gate line: the run the statuses come from, the newest run on another commit (the newest candidate), or why there is none | the spec, gate results |
| **Decisions**, **Run details** | the newest four decisions; the team (`st agent` rows, then the `plan.team` roles that have no lane, with their model and effort) and plan usage (`st quota`) behind a disclosure | `decisions`, `agents`, `plan.team`, `quota` |
| Footer | the next check-in (`tl.nextWakeAt`), the start, the time limit, plan usage left, and `links` (PLAN.md by default) | `tl`, `startedAt`, `endsAt`, `quota`, `links` |

### Phases
`phase` is one of six. `st set phase` refuses anything else.
- `planning`: the default until the plan is approved. A `planning` (or missing) phase shows as Building once `plan.approved` is `true`.
- `building`: phase 1, the TL builds the whole spec.
- `improving`: phase 2, the review rounds.
- `wrapping`: the TL makes sure the latest build works and writes the report.
- `done`: the run is over. `st set phase done` also stops the refresh loop.
- `paused`: nothing is expected; the board keeps its place but shows nothing as running.

The first time the phase moves on to `improving`, `wrapping` or `done`, `st` sets `buildDoneAt` to that moment: the end of the build. It never moves, whatever the phase does next.

### Warnings
What's left lists these in red. The board recomputes every wait with the clock, so they appear without a new write.
- **Stale state:** no write to state.json for 10 minutes (not while planning).
- **Time limit passed:** past `endsAt` while the phase is `building` or `improving`.
- **Reviewer silent?:** the latest round has a request but no feedback, more than 40 minutes after the request.
- **No response:** the latest round has feedback but no response, more than 30 minutes after the feedback.
- **Over the round cap:** a request beyond `roundsMax` (k > N) while the phase is `improving`. The last allowed round (k = N) is no warning: What's left says it is the last round.
- **Missed check-in:** `tl.nextWakeAt` passed more than 10 minutes ago.
- **Malformed feedback:** each feedback file that breaks the front matter, named with its round and the reason.

A paused or done run shows only the malformed warning.

## What the board reads
- **Builds.** A build is a folder `team/builds/<tag>/` that holds an index.html or a NOTES.md, or both. Its name is the build's git tag: one plain name (letters, digits and `_ . + @ -`, starting with a letter or digit); a folder with any other name is ignored. The **latest build** is the folder created last. The board orders build folders by their own birth time (`birthtimeMs`), or by their modification time on a filesystem that keeps no birth time (there, adding, removing or renaming a file in a folder moves it). Editing files inside an old build, its NOTES.md say, doesn't make it the latest; a tie goes to the higher tag.
  - **Hero and notes.** The board shows `hero.png` (else `hero.jpg`) from the folder and the first non-empty line of `NOTES.md`.
  - **Serving a static build.** The frozen layout of a static build is its dist files at the tag root (`team/builds/<tag>/index.html` and its assets). A Vite or other ES-module build does not run from `file://`, so the board links no index.html. Instead, **Copy start command** copies `python3 -m http.server 8765 -d team/builds/<tag>` (run it from the project root), and **Open latest build** opens http://127.0.0.1:8765/ once the command runs. The port is 8765 unless `state.play.port` is set (`team/tools/st set play.port 9000`). Check that it is free before serving; when it isn't, serve on a free one and set `play.port` to it, so the board's command and link match. Whether the served build works is for you to check.
  - **Other builds.** A build without an index.html at its root (a CLI, a service, a native app, or a static build left in a dist/ subfolder) gets no start command. The card says "How to run: see team/builds/<tag>/NOTES.md", so write how to run it there.
  - **Tags.** Tag the commit a build was frozen from with the same name. The board finds a build's commit with `git rev-list -n 1 <tag>`, and binds gate results to it.
- **Request.** `team/rounds/R<n>/request.md` means round n has started. Its time on the board is the file's modification time. The board doesn't read its text. Use one counter: round n is the folder `R<n>`, numbered from 1; the board orders rounds by that number.
- **Feedback.** `team/rounds/R<n>/feedback.md` opens with a front matter block, `---` to `---`. All four fields are required:
  - `build`: the tag of the build reviewed;
  - `reviewer`: who reviewed (not empty);
  - `items`: the number of improvement items (a whole number, 0 or more);
  - `bugs`: the number of bugs (a whole number, 0 or more).

  Other fields are allowed and ignored. The board shows the first paragraph of the body (headings, tables and code blocks are skipped). A file with no block, an unclosed block, or a missing or invalid field is malformed. It is listed in `derived.malformed` as `{round, reason}`, shows as a warning that names the round and the reason, and is left out of every count. Fix the file and the next `st` command (or the refresh loop) picks it up.
  ```markdown
  ---
  build: r4
  reviewer: codex gpt-6.1-sol
  items: 3
  bugs: 1
  ---
  New users lose what they typed when a form field fails its check, and that is the first thing they meet.

  1. Keep the input after a failed check: ...
  ```
- **Response.** `team/rounds/R<n>/response.md` is the TL's checklist. Only lines that start with one of these markers count:
  - `- [x]` (or `- [X]`): done;
  - `- [ ]`: to do;
  - `- [-]`: declined, with the reason after ` — ` (a space, an em dash and a space).

  Indented lines, other bullets (`*`, `+`) and lines in HTML comments or fenced code blocks are not items. The board counts each kind per round. The to-do lines of the latest response (the highest round with one) are listed under What's left.
  ```markdown
  - [x] do: keep the input after a failed check
  - [ ] another way: show the error under the field instead of a dialog
  - [-] decline: dark mode — out of scope for this release; noted in the report
  ```
- **Acceptance lines.** The board reads the spec at `state.spec`, a repo-relative path (`team/tools/st set spec '"docs/PRD.md"'`; super-pm's `docs/game-spec/SPEC.md` while unset). Acceptance lines under `## Acceptance` read `- [tag] A<n>: text`, where the tag is one of super-pm v0.8's kinds (goal, platform, perf, owner) or an earlier test tag (bot, trace, detector, build, audio, judge). Older specs' `[judge]` and `[owner]` lines under `## Aesthetic bar` are tracked too, as "Judge" and "Owner". HTML comments don't count. For a spec without such lines, a separate acceptance file holds both sections, recorded with `st set acceptance '"docs/acceptance.md"'`: the board then takes the lines from it, and the owner's spec is never edited. A path outside the repo is refused, and What's left says when the spec, the acceptance file or their lines are missing. A tagged line without an id isn't tracked; the board says so.
- **Gate results.** The gate is optional. When it runs, `scripts/gate.sh` writes every run to `team/gate/last.json` and appends one line to `team/gate/log.jsonl`. Both carry `"commit"` (the full sha of the tested commit: the gate's merge result, which a green run fast-forwards main to), `"head"` (the branch head) and `"config"` (the sha256 of `team/gate.json`'s content, copied once when the run starts, so a step that rewrites `team/gate.json` mid-run changes neither what ran nor the hash it is logged under). A check in `team/gate.json` may carry `"covers": ["A1", "A2"]`.
  - The board uses a run for the latest build only when its `commit` equals the commit of the build's tag and its `config` equals the sha256 of the `team/gate.json` on disk now. So tag the build on the tested commit, and a check you change afterwards inherits no earlier pass until the gate runs again.
  - A run without `commit` and `config` is unbound and counts for no build, and so does any run when the build's tag is not in git; the Gate line says which. The newest run on another commit shows apart, as "the newest candidate, <short sha>", with the checks it fails.
- **Statuses.** With no gate run that reached its checks, every line except `[owner]` and `[judge]` lines is "not checked by a gate". Otherwise, among the runs bound to the latest build, the newest one that got to its checks decides. A line passes when every check covering it passed in that run, fails when any failed (a later pass under the same check name never overwrites a failure), and is untested when no check covers it, the covering check was skipped, or no bound run exists. A run whose checks are all skipped is a completed run: its lines are untested and the board looks no further back. Only a run that never reached its checks (a merge conflict, a config error) is passed over for an older bound one. `[judge]` lines are the reviewer's call in the feedback rounds (no scores in v0.11): they show as "reviewed in the feedback rounds", are never open or failing, and are left out of the acceptance summary, which counts only the lines a gate or the owner can settle.
- **Owner sign-off.** `[owner]` passes only when `owner.signoff` is the latest build's tag. After the owner has tried that build and signed off, run `team/tools/st set owner.signoff '"<tag>"'`. The sign-off stays with the build it names: when a newer build appears, `[owner]` is untested again until the owner signs that one off. A boolean `true` is not bound to a build and shows "untested (sign-off not bound to a build)".

## Commands (`team/tools/st <cmd> …`)
Values are parsed as JSON when possible. With `set`, quote strings as JSON (`'"text"'`); a bare word works too (`set phase improving`). With `k=v` arguments, plain text works (`task="two words"`); a doubly quoted value is unwrapped.
| Command | Effect |
|---|---|
| `touch` | Regenerate state.js and bump `updatedAt`. `touch --no-bump` only regenerates state.js (the refresh loop and the gate use it, so the "last report" time still shows a stalled session) |
| `set <dot.path> <json>` | Set any field, e.g. `set plan.approved true`, `set plan.approvedAt '"<ISO>"'`, `set owner.signoff '"r3"'`, `set spec '"docs/PRD.md"'`. `set phase <phase>` accepts only the six phases: the first move to `improving`, `wrapping` or `done` also sets `buildDoneAt`, and `done` stops the refresh loop. `set roundsMax <N>` accepts a whole number from 1 to 99, or `null` for no cap. A refused value changes nothing and exits 1 |
| `push <dot.path> <json>` | Append to an array, e.g. `push plan.rules '"No push or publish"'` |
| `tl k=v …` | `nextWakeAt` (ISO): when the TL will next check in. The footer shows it, and What's left warns 10 minutes after it passes |
| `agent <name> k=v …` | A row under Run details: `role`, `cli`, `model`, `effort`, `status` (working, idle, blocked, limited or ended), `task` |
| `bar <agent> "<label>" [status=working] [round=N]` | Open a task bar for an agent (closing that agent's open one). Its round defaults to the round in progress (the highest round with a request), or none before the first. Open bars are listed after Now as open tasks |
| `endbar <agent> [failed\|limited]` | Close the agent's open bar as done, or as failed or limited |
| `quota <cli> k=v …` | A plan-usage row: `model`, `fiveHourLeft`, `weekLeft` (numbers, % left; leave out a window the plan doesn't have). `fiveHourResetsAt`, `weekResetsAt`, `decision` and `note` are kept for you; the board doesn't show them. It sets `checkedAt` itself |
| `decision "<text>"` | Add a timestamped line to the decisions log (the newest four are listed under Decisions) |
| `needs add "<text>"` / `needs clear` | One bullet in **Needs your decision** under the header: one decision per call, as a sentence / clear them all |

`round` and `roundset` were removed in v0.11. They fail with "round was removed in v0.11: rounds come from team/rounds/R<n>/ files" and change nothing: a round is its folder.

## Plan shape (`plan.*`)
```json
{"approved": false, "approvedAt": null, "mode": "super-engineer|super-team",
 "headline": "Product name: one sentence on what it is and for whom",
 "team": [{"role": "TL", "who": "Claude", "cli": "claude", "model": "opus", "effort": "xhigh", "why": "builds the product"},
          {"role": "Reviewer", "who": "Codex", "cli": "codex", "model": "<newest sol>", "effort": "xhigh", "why": "another family reviews each round"}],
 "rules": ["No push or publish", "No downloaded assets"]}
```
Set the whole plan at once with `st set plan '<json>'`. After approval: `st set plan.approved true`, `st set plan.approvedAt '"<ISO>"'`, `st set endsAt '"<ISO>"'` when there is a time limit (it runs from the approval; `references/start-up.md` §7), `st set phase building`, `st needs clear`. The board shows the headline (the name is the part before the colon), the mode's name in the header, and the approval.
- **Lanes.** The TL and Reviewer lanes take their label from `plan.team`. The Reviewer lane is the first row whose `role` names a reviewer, judge or critic; the TL lane is the first other row whose role names the TL or a tech lead, else a lead, an engineer or a builder. That row's `who`, `model` and `effort` show under the lane's name. A role whose model or effort is missing, "default" or "current" shows a red "model not set" or "effort not set", since every role's model and effort are chosen on purpose.
- **Other rows.** Rows with `"cli": "-"` (a role no CLI runs) and the rows that have no lane are listed under Run details with their model, effort and `why`, and the same red flags.
- **Old mode names** still name the mode: `claude-eng` and `tl-solo` as `super-engineer`, `claude-team` and `team` as `super-team`.

## Other fields
- `startedAt`, `updatedAt`: when `init_team.sh` ran, and the last write (`st` bumps it on every command but `touch --no-bump`).
- `endsAt`: the time limit (ISO), a maximum. `init_team.sh --hours <h>` or `--until <HH:MM or ISO>` sets it; with neither it is null, and the board says there is no time limit. The limit runs from the plan's approval, which sets `endsAt` again (`references/start-up.md` §7); while planning, the board shows the limit as a duration.
- `roundsMax`: the most improvement rounds, a whole number from 1 to 99, or null for no cap (`init_team.sh --rounds <N>`; the approval sets it again).
- `init_team.sh`'s `--hours`, `--until` and `--rounds` apply only when it first writes `team/state.json`; a re-run keeps the record as it is. Change a limit later with `st set endsAt` or `st set roundsMax`.
- `phase`, `buildDoneAt`: the phase (Phases, above) and the end of the build phase.
- `tl.nextWakeAt`: the TL's next check-in.
- `owner.signoff`: the tag of the build the owner has tried and signed off (starts `false`). It counts only while that build is the latest.
- `play.port`: the port in the start command and the URL (default 8765). A whole number from 1 to 65535.
- `spec`, `acceptance`: repo-relative paths of the spec and of a separate acceptance file (Acceptance lines, above).
- `needsYou[]`: the decisions waiting for the owner, written by `needs`.
- `agents[]`, `timeline[]`, `quota[]`, `decisions[]`: written by `agent`, `bar` and `endbar`, `quota`, and `decision`.
- `links[]`: `{label, href}`, relative to team/ (or an http(s) URL), listed in the footer.
