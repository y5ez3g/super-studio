# Start-up: the questions, word for word

The session the owner starts runs this once, before any build.
- **The questions are fixed.** Ask them in this order, with this wording. `<…>` is filled in for the run at hand.
- **Ask nothing else,** apart from what this file names: which spec, when several files could be it (section 1); the no-spec questions (section 6); and your role's switch line (section 5).
- **State no duration anywhere:** nothing has been measured yet.

**How a screen looks in Claude Code:**
- One multiple-choice prompt per screen, at most 4 questions.
- Each question has the header given here, at most 12 characters.
- Each option has a label and a description. An option with no description here gets an empty one.
- Claude Code adds its own "Type something." to every question, and that can't carry a description. So a typed-answer hint is part of the question text, as written below.
- No option is marked "(Recommended)": nothing yet favours one mode, time limit, round cap or team.

## 1. Check this machine and find the spec
- **The machine.** `python3 <this skill's folder>/scripts/detect_env.py --host claude` prints one JSON object, with no model call. It holds:
  - Claude and Codex versions, logins, models and efforts;
  - the plan meters and the build tools;
  - `can_run`;
  - the two modes' roles, each with its recommended model and effort. Codex roles use the newest listed sol model at xhigh.
- **When `can_run` is false,** say `why_not` word for word, and stop. super-team runs only from Claude Code with Codex logged in. On a Codex host, run it with `--host codex`, which always says why not.
- **The spec.** Use the file the owner names. Otherwise search the repo (`references/spec-intake.md`). Ask only when several files could be it.
- **The tier.** `mcp__facade__*` tools in your own session mean Tier A. Without them it's Tier B (`references/tiers.md`).

## 2. Opening (a statement, not a question)
> Found the spec: `<path>` (`<name>`: `<n>` acceptance lines). Claude Code and Codex are both logged in.

- `<n>` counts every tagged line under `## Acceptance` and `## Aesthetic bar`, as the board does, so the two numbers match.
- For a spec without `A<n>` acceptance lines, or no spec at all, say so in the opening. Handle it after Screen 2 (section 6).

## 3. Screen 1: the run
1. **Mode** (header `Mode`): How should it be built?
   - `Super Engineer`: This session builds; Codex reviews.
   - `Super Team (experimental)`: This session manages; another Claude session builds; Codex reviews.
2. **Time limit** (header `Time limit`): Time limit for the run? It's a maximum: the team uses as much of it as makes the result better. Or type any number of hours.
   - `2 hours`
   - `3 hours`
   - `4 hours`
   - `No limit`
3. **Rounds** (header `Rounds`): How many review rounds at most, after the first full build? In each round Codex uses the product and gives feedback, and the builder decides what to change. Or type any number.
   - `3`
   - `5`
   - `10`
   - `No limit`

**In Tier B** (no Facade tools), Super Team isn't offered. Leave the Mode question out, use Super Engineer, and say so in the opening.

How the answers are passed on:
- The time limit is a number of hours, never a clock time. It becomes `init_team.sh --hours <h>`, and it runs from the plan's approval (section 7).
- The round cap is a whole number from 1 to 99. It becomes `init_team.sh --rounds <N>`.
- `No limit` passes nothing.
- With no time limit and no round cap, the run ends when a round finds nothing users would notice.

## 4. Screen 2: the team
4. **Team** (header `Team`): Your team for `<mode>`. Keep these models? Or type the role and the model or effort to change.
   - `Keep`: the chosen mode's roles, from `detect_env.py`:
     - Super Engineer: `Builder and lead: this session, Claude opus, xhigh. Reviewer and artist: Codex <model>, xhigh.`
     - Super Team: `Manager (EM): this session, Claude haiku, medium. Builder and lead (TL): a Claude opus session at xhigh. Reviewer and artist: Codex <model>, xhigh.`
   - `Reviewer at high`: Same model at lower effort; uses less Codex quota.

- **No agent starts before this answer.**
- **Write the team, as answered, into the plan's team table.** "default" and "current" are never values: the board shows them as not set.
- **If Codex runs out mid-run,** a fresh Claude opus session at xhigh reviews in its place, never the session that builds. That switch goes on the board.

## 5. Become your role
This session becomes the mode's first role: the TL in Super Engineer, the manager (EM) in Super Team.
- **Check yourself.**
  - Your model is in your system prompt.
  - Your effort is in your terminal header: Facade's `read_screen` on yourself shows "Opus 5.5 with xhigh effort".
  - Without Facade, read your launch arguments and `~/.claude/settings.json` (`effortLevel`), and ask if they disagree.
- **If either differs from the team table,** end the turn with the line for your role, word for word, and wait. If the owner changed the table, use its model and effort in the line.
  - Super Engineer: `This session is the builder. Type /model opus, then /effort xhigh, then continue.`
  - Super Team: `This session is the manager. Type /model haiku, then /effort medium, then continue.`
- **After "continue",** check again, then go on as that role.

## 6. Record the spec
Once `team/` exists (SKILL.md §0 step 4), record what you found:
- **The spec's path:** `team/tools/st set spec '"<repo-relative path>"'`. The board reads the acceptance lines from it (`references/dashboard.md`).
- **A spec without `A<n>` acceptance lines:**
  - Write them in the same grammar into a separate file next to it, for example `docs/acceptance.md` with an `## Acceptance` section.
  - Commit it, put it in the plan for approval, and record it with `st set acceptance '"<path>"'`.
  - Never edit the owner's spec.
- **No spec at all:**
  - Ask spec-intake.md's questions, write the answers as a spec file in the repo (`docs/SPEC.md`, with acceptance lines), commit it, and record it.
  - Or offer super-pm if the owner wants a fuller spec with a chosen look.

## 7. Screen 3: the plan
After the plan is written and the board is open:
5. **Plan** (header `Plan`): Approve the plan? The board is open in your browser.
   - `Approve`: `<mode · time limit · round cap · team>`
   - `Change something`: Tell me what.

Fill the `Approve` description like this:
- the time limit is the hours (`3 hours`) or `no time limit`;
- the round cap is `up to <N> review rounds` or `no round cap`.

On "Approve", run:
- `st set plan.approved true`
- `st set plan.approvedAt '"<ISO now>"'`
- `st set endsAt '"<ISO now + the time limit>"'`, or `st set endsAt null` with no time limit: the time limit runs from the approval, not from setup
- `st set roundsMax <N>`, or `st set roundsMax null` with no round cap
- `st set phase '"building"'`
- `st needs clear`

## 8. During the run and at the end
- **No more questions.** Only decisions that are the owner's alone go to the board with `st needs add`, one per call: spending beyond the plan, publishing, changing the stack or a fixed spec item, or deleting data.
- **At the end, one of:**
  - Done: `Done: <tag>, after the build and <k> review rounds in <h:mm>. Start it with <command>. Play it and tell me what you think?`
  - The time limit ended phase 1: `Stopped at the time limit before the build was finished. Latest build: <tag>. Start it with <command>. Not built yet: <items>.`
  - Nothing runs: `Stopped at the time limit. No build runs yet. Blocking: <issues>.`

## 9. Every agent you start
- **Pass its model and effort explicitly,** from the team table:
  - Facade: `start_agent {cli, model, effort, …}`.
  - Codex CLI: `codex exec -m <model> -c model_reasoning_effort=<effort> … "<task>"` (`references/tiers.md`).
  - Claude CLI: `claude -p --model <model> --effort <effort>`.
  - Never leave a CLI on its own default.
- **Confirm both once it runs:** its terminal header or status line (Facade `read_screen`), or the CLI's banner. If either is wrong, stop it and start it again. Facade passes the values through without checking them.
- **A switch the plan already allows** (the Claude fallback reviewer when Codex runs out) is recorded with `st decision`, with the agent's new model and effort on the board. Use `st needs add` only for a switch that needs the owner: a model or spending the plan doesn't cover.
