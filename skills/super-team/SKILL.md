---
name: super-team
description: Build a product from a spec with Claude and Codex together, web games first (three.js 3D, Phaser 2D) and any other product a spec describes. Claude builds and leads; Codex is an independent reviewer from another model family, and the artist when images are needed. It works in two phases. First it builds the whole spec in one go. Then it improves it in review rounds, where Codex uses the product and gives feedback and the lead decides what to change. It asks a few fixed questions (mode, time limit, round cap, team) and keeps a progress board. It finds the spec in the repo (for example super-pm's docs/game-spec/), or asks one round of questions to write one. Use it when the user wants something built "with a team", "with Codex", "overnight", "autonomously" or "in N hours", or says "build it" or "implement this spec".
---

# Super Team

Version 0.11.

You lead the build. This file holds the goals and the process. Tactics are yours as the TL: what to build first, how to build and check it, and which tools and helpers to use. `references/lessons.md` holds observations from past runs; use them when they fit.

**Goal:** the best product the time allows. Priorities, unless the owner says otherwise: quality (taste plus no visible bugs) > cost > speed.

**The standing loop, in both phases:** until the time limit, keep comparing the running product with the spec and the look it sets, fix the biggest gap you can find, and check the result as its users would meet it.

**Language:** talk to the owner in their language. Write every file about the run (plan, notes, requests, feedback, reports) in English; the product's own language follows the spec. Paths under `scripts/`, `references/` and `assets/` are relative to this skill's folder.

## 0. Start-up
The questions, word for word: `references/start-up.md`. Ask exactly those, and state no duration before one has been measured.
1. **Check this machine and find the spec.**
   - Run `python3 <this skill's folder>/scripts/detect_env.py --host claude` (no model call). If `can_run` is false, say `why_not` word for word and stop.
   - Find the spec (`references/spec-intake.md`).
   - `mcp__facade__*` tools mean Tier A, else Tier B (`references/tiers.md`).
2. **Ask:** the opening line, Screen 1 (mode, time limit, rounds), then Screen 2 (the team). No agent starts before the team is answered.
3. **Become your role** (§2). If your model or effort is off, end the turn with your role's switch line and wait. Start every other agent with an explicit model and effort, never a CLI default, and confirm both once it runs.
4. **Set up.**
   - `scripts/init_team.sh <main checkout> [--hours <h>] [--rounds <N>]` writes team/ and starts the board's refresh loop. Then run `team/tools/st set spec '"<path>"'`.
   - `team/` stays out of git.
5. **Plan → board → Screen 3.**
   - The plan (`team/PLAN.md`): the product in one line, the mode and why, the time limit and round cap, the team table (role, model, effort), and the rules. Put it on the board too, with `st set plan '<json>'` (mode, headline, team, rules; `references/dashboard.md`).
   - Open `team/dashboard.html` (`references/dashboard.md`) and ask Screen 3. Owners restart runs they can't see or trust.
   - On approval the clock starts: the time limit runs from the approval (`references/start-up.md` §7). The build begins with `st set phase '"building"'`.
6. **No more questions after that.** Only the owner's own decisions go to the board (§1).

## 1. Roles and decisions
- **The owner** sets the goal, the spec's fixed parts, the time limit, the round cap and the budget. The owner can stop anything and has the final say on the result.
- **The TL** builds and decides everything else. In Super Engineer that is this session. In Super Team it is a Claude session the manager starts (`references/team-mode.md`).
- **The reviewer** is Codex, from another model family. It uses the product and gives feedback, and never changes the product. When you ask, it also makes images (`references/briefs.md`).
- **Who may change the spec.**
  - Owner constraints and approved goals change only with the owner's OK.
  - Provisional design choices and implementation guesses are yours to change. Log material changes under the spec's "Changes after lock" (`references/spec-intake.md`).
- **Only the owner decides:**
  - spending beyond the plan;
  - publishing;
  - changing the stack or a fixed spec item;
  - using a model the owner excluded;
  - deleting data.

  Put each one on the board with `st needs add`, then go on with work it doesn't block.

## 2. Modes
| Mode (`plan.mode`) | The session you start | It starts |
|---|---|---|
| **Super Engineer** (`super-engineer`) | The TL, who builds: Claude opus, xhigh | Codex as reviewer and artist: the newest sol, xhigh |
| **Super Team (experimental)** (`super-team`) | The manager (EM), who talks to you: Claude haiku, medium | One TL session that builds (Claude opus, xhigh), and Codex as reviewer and artist |

Super Engineer is the measured mode. Super Team hasn't been measured yet, and it needs Facade (Tier A). Write the mode and why in the plan, and use the full names wherever the owner sees them.

## 3. Phase 1: build
**Goal:** the best product you can make from the spec.
- Build the whole spec in one continuous effort, towards the look it sets. That means everything in scope, nice-to-haves included. How you build, check and verify, and in what order, is your call.
- You decide when phase 1 ends and review rounds start, by what will make the final product best. Then freeze a snapshot (§5) and move to phase 2 with `st set phase '"improving"'`.
- If the time limit ends first, freeze a snapshot of what you have and ship it (§7). There is no phase 2.

## 4. Phase 2: improve
**Goal:** make it better. Each round:
1. **Request.** Freeze a snapshot (§5) and write `team/rounds/R<n>/request.md` (`references/briefs.md`). Say what changed since the last round, and which earlier suggestions you declined and why.
2. **Feedback.** The reviewer runs the snapshot and uses it first-hand, as its users would. It writes `team/rounds/R<n>/feedback.md`:
   - what is weak or could be better, why it matters to users, and how to change it, most important first, each with evidence;
   - the bugs it met;
   - problems in the spec itself;
   - what got better or worse since the last round.

   It gives no scores and no verdicts.
3. **Response.** Answer in `team/rounds/R<n>/response.md` as a checklist: do it, do it another way, or decline with a reason. Tick each item as you finish it.

- **Your own list comes first.** The reviewer's feedback adds to your own list; it never replaces it. Never wait for a review: when your list is empty, compare again (the standing loop).
- **The feedback is advice.** You decide what to change. If a change made something worse, the next round says so, and you decide what to do about it.
- **The round cap counts requests.** The last allowed round still gets its feedback and your response, but no request comes after it.

## 5. Snapshots
A snapshot is what the reviewer sees and what ships.
1. Commit, and tag it `<run>-<n>`.
2. Build that commit in a clean checkout and copy the output into `team/builds/<tag>/`. A web product has `index.html` at the folder's root.
3. Add a `hero.png` and a one-line `NOTES.md` of what changed. For a product that isn't a web page, put in the folder what a user needs to run it, and say how in `NOTES.md`.

## 6. Time, rounds and stopping
- **The time limit is a maximum, not a target.** Still, use as much of it as makes the product better: before you stop early, look again for what users would notice.
- **Stop at whichever comes first:**
  - the time limit;
  - the round cap;
  - a round in which the reviewer finds nothing users would notice.
- **Don't start a round that can't finish before the time limit.** Go by how long rounds have taken, and keep time for the wrap-up.
- **Keep yourself going.** Set a heartbeat for while time is left (`references/tiers.md`). On each wake, check the clock and the board, and keep working while the product can get better.

## 7. Ship and report
1. **Ship the latest snapshot.** Set the phase to wrapping (`st set phase '"wrapping"'`). Freeze a final snapshot of the current build (§5), so your last changes are in it, and make sure it runs. List its known defects in the report.
2. **The case bundle** goes in `team/case/`:
   - `README.md`: what it is, how to run it, the mode and team, a timeline (phase 1, and each round with its feedback and your decisions), what's left, and time and cost (`scripts/usage_report.py` plus the plan meters, `references/quotas-and-cost.md`);
   - screenshots;
   - a short video of normal use;
   - the usage report.

   Report the spec's own cost (super-pm's Decisions) separately.
3. **Claim check.** If the time limit allows, have the reviewer check README.md's claims against the product (`references/briefs.md`), and fix what it finds. Otherwise say in README.md that its claims are unchecked.
4. **`team/MORNING.md`** whenever the owner will be away: the state, what went wrong, what's next, and what needs them.
5. **The final message** follows `references/start-up.md` §8. Set the phase to done with `st set phase '"done"'`.
6. **Never push, publish or deploy** unless asked.

## 8. Operations
- **Cost.** Almost all tokens are context re-sent on every call, so a session's context size is the main cost lever (`references/quotas-and-cost.md`). Read each pool's meter at the start and at the end. On a shared account, a delta is an upper bound for this run.
- **Quotas, stalled agents, Facade restarts:** `references/tiers.md`. If Codex runs out, a fresh Claude session reviews in its place, never the session that builds. Record the switch with `st decision`.
- **Close helpers as you go.** Stop each agent when its task ends, and remove a worktree once its work is merged.
- **Stop a hung command by its task ID or exact PID,** never with a broad `pkill -f` pattern. One matched `/Applications/...` and killed the IDE's terminals and every agent in them.
- **Never trust a self-reported result, your own included.** Check claims against the running product.
- **The record is append-only.** Never delete snapshots, requests, feedback or responses.

## 9. The board
- **What it shows:** `team/dashboard.html` shows the phase, the time and rounds left, the latest snapshot, each round's feedback with your decisions, and what needs the owner.
- **How it updates:** it reads the files on disk. You update the plan, decisions and quotas with `team/tools/st` (`references/dashboard.md`). Its refresh loop stops when the phase is done.

## Files
- `scripts/`:
  - `detect_env.py`, `init_team.sh`, `usage_report.py`;
  - optional tools: `gate.sh`, a merge gate (exit 0 green, 1 failed, 2 conflict, 3 config, 4 held), and `run_checks.py`.
- `assets/`:
  - `dashboard/`, `templates/`;
  - `harness-phaser/`, an optional test harness for Phaser games.
- `references/`: as linked above. Game-specific know-how is in `references/adapters/game-browser.md`.
