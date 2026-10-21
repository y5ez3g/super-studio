# Execution tiers

Pick the highest tier the environment supports, tell the owner which one and why, and record it in the plan.

| Tier | Needs | What you get | What you lose |
|---|---|---|---|
| A — Facade | Facade MCP tools in your tool list (`mcp__facade__start_agent`, `send_message`, `read_messages`, `read_screen`, `list_agents`) | Long-lived Claude and Codex agents in visible terminals, mailboxes with doorbells, managed worktrees, screen reading (limits, menus, each agent's model and effort) | — |
| B — headless CLIs | Codex logged in (`scripts/detect_env.py`), and no Facade tools in your session | Claude and Codex; every task is a fresh session (cheap) | Mid-task messaging, answering prompts, reading an agent's screen |

super-team uses Claude and Codex only. In both tiers:
- **The board's refresh loop** (`init_team.sh`) rebuilds the board every minute and stops when the phase is done.
- **Usage meters:** Claude: `claude -p "/usage" --no-session-persistence` prints the session and weekly % with their resets, with no terminal and no model call. Codex: `team/tools/quota-codex.mjs` reads its session logs, each window named by its length. Never open an idle terminal just to read a meter.
- **Swimlane:** record each helper's task with `st bar <name> "<task>"` when you start it and `st endbar <name>` (or `failed`) when it reports.

## Tier A — Facade

- **Launch:** `start_agent {name, cli, model, effort, new_worktree:true, task}` gives each helper's area its own worktree and branch named after the agent. Always pass `model` and `effort` from the team table, never a CLI default (`references/start-up.md`), and `read_screen` once it runs to confirm both in its header or status line; Facade doesn't check them. The new branch starts from **your own checkout's HEAD**, so fast-forward your worktree to main first (`git merge --ff-only main` in it) or the helper starts stale. To start a fresh session in an existing worktree (the normal case after the first task), pass `folder:<absolute worktree path>` instead; `new_worktree` fails if the branch already exists.
- **Talk:** `send_message`; replies ring your doorbell. Never poll or sleep. Print every message you receive to the terminal in one line so the human can follow. Facade agents only reach you through `send_message`, so put "report with send_message and never end a turn silently" in every task.
- **Long-turn CLIs:** Claude Code workers only read new messages when a turn ends, and some models run a whole task as one turn. To deliver an urgent message mid-turn, press `Escape` (`press_keys`), then `Enter` if the doorbell line is left on the prompt.
- **Inspect:** `read_screen` when an agent is silent too long. Behind a long "Thinking (29m)" timer, check its recent actions on screen and its output on disk: `git -C <worktree> status --short` and the last commit time. Answer menus and surveys with `press_keys`. Quota errors (429, "quota", "usage limit") show up here first.
- **Facade restart:** every agent ends and your run id changes. Relaunch lost agents with a handoff: their evidence on disk plus the ids of their last messages (`read_messages` can fetch them by id).
- **Self-wake:** while time is left, a recurring `CronCreate` heartbeat (about every 30 minutes, off-minute), plus a one-shot wake at every quota reset; or a background Bash sleep (run_in_background wakes you on exit), or the loop skill, if CronCreate isn't available. Doorbells are the primary wake signal. On each wake, check the clock and the board, and keep working while the product can get better (SKILL.md §6). Write `tl.nextWakeAt` to the dashboard after each wake, and delete the heartbeat when the run ends.

## Tier B — headless CLIs

- **Isolation:** each task is one non-interactive run in its own worktree: `git worktree add "../<project>-wt-<area>" -b <area>`. Keep the project's folder name in every worktree path, so `usage_report.py --project <project>` counts the work done there. Run it in the background with your host's mechanism (in Claude Code, Bash `run_in_background`), or one at a time if there is none, and wait for it to finish. Parallelism is the number of background jobs, capped per pool as in Tier A.
- **Commands:** check each CLI's `--help` once and record the exact flags in `team/tiers.json`; flags change between versions. Typical shapes:
  - Codex: `codex exec -m <model> -c model_reasoning_effort=<effort> --approve-for-me -C <dir> "<task>" < /dev/null`, verified on codex-cli 0.162.1. `--approve-for-me` implies a workspace-write sandbox, and adding `-s/--sandbox` to it is an error. Without `< /dev/null` it reads stdin when that isn't a terminal, and a background run can hang. A task that writes into team/ (feedback, art) runs with `-C <main checkout>`; from a worktree, add `--add-dir <main checkout>/team`, since the sandbox only writes inside its working root. Attach frames after the prompt: `… "<task>" -i <frame1> -i <frame2> < /dev/null`. `-i` reads every argument after it as an image path, so a prompt placed after it is lost. Codex's built-in image tool works headless, so art batches run this way too. Check the header's `model:` and `reasoning effort:` lines before trusting a run.
  - Claude: `claude -p "<task>" --model <model> --effort <effort>`, with the permission-mode flag the owner allows.
- **Model ids:** use the ids the owner chose. Otherwise take them from `scripts/detect_env.py` (`codex debug models`, `claude -p "/model"`). Run a one-line smoke prompt per CLI before the first real task, so a wrong id or a missing auto-approval flag fails in seconds rather than mid-round.
- **Task text:** the task must be self-contained: spec paths, acceptance checks, and the instruction to end with a short summary (branch, commit, checks run, open issues). Pipe output to `team/rounds/R<N>/<agent>.log`.
- **Helper task size:** past runs kept headless helper tasks to 30–45 min of work, because a run can't be redirected mid-way and a wrong turn should be cheap.
- **Quotas:** read the meters (above), use `usage_report.py` for tokens, and grep logs for limit errors. On a limit, reroute per the routing rules.
- **Dashboard:** you record bars and decisions yourself; the refresh loop still rebuilds the board every minute.
- **Hangs:** if a run hangs on an interactive prompt, kill it, add the CLI's auto/approval flag, and rerun.

## Modes by tier
| Mode | Tier A (Facade) | Tier B (headless CLIs) |
|---|---|---|
| Super Engineer | Codex as a Facade agent (reviews, art) | `codex exec` per review and per art batch |
| Super Team (experimental) | The EM (haiku) hosts; it starts the TL (opus) and Codex as Facade agents; the TL starts its helpers | Not offered: it needs Facade messages |

In Tier B each review is a fresh `codex exec` session: give it the reviewer brief and the request, which name every file to open; nothing carries over between calls. The reviewer must be able to run the product itself (a local server and a browser), so its run needs network access, for example `-c sandbox_workspace_write.network_access=true`. Check that it can open the snapshot with one smoke task at setup, and record the working flags in `team/tiers.json`.

## Silent or stalled agents
Go by output, not by the "Thinking" timer, which often counts the whole turn: check `git -C <worktree> status --short`, the last commit time, and the agent's screen. In past runs, nothing written or committed for about 15 minutes on the critical path usually meant a stall, but an agent that is exploring the product or waiting on a build can be quiet for a while. When it's really stuck, interrupt it with a narrower step, or restart the task in a fresh session. Otherwise, answer its prompt or let the turn finish.
