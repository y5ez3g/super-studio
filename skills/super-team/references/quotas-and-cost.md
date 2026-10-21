# Quotas and cost

## The cost model in one line
In agent work about 99% of tokens are context re-sent on every call (cache reads); real output is ~0.3%. So **cost ≈ number of calls × context length**. Measured on one overnight build: a worker 965M cached input vs 4.4M output, the Claude TL 899M cached vs 1.8M output.

The levers themselves are in SKILL.md (cost discipline). The numbers behind them:
- **Session length:** long-lived sessions reached 300K+ context, and a single one burned about 150M tokens.
- **Concurrency:** five parallel workers emptied a pool's 5-hour window in about 2 hours.
- **Review cost:** a v0.9 judge reading curated evidence cost about 5–8% of a 5-hour window per review, and free exploration about 16% per round. A v0.11 reviewer uses the product itself, so expect the higher end, and read the meter after the first round.
- **TL wakes:** each idle wake re-reads your whole context, so a short heartbeat costs tokens even when nothing changed.
- **Effort:** it doesn't change the per-token price, only the token count, mostly through the number of calls. Compare by cost per completed task, because a cheap run that needs rework isn't cheap.

## Reading usage
| CLI | How | Notes |
|---|---|---|
| Claude Code | `claude -p "/usage" --no-session-persistence`: session % and weekly %, with their resets. No terminal, no model call | Every Claude session and subagent on the account shares the pool |
| Codex | `team/tools/quota-codex.mjs`: each window from its session logs, named by its length (300 min: 5-hour, 10080 min: week) | Plans differ: one logs a 5-hour and a weekly window, another (e.g. prolite) only a weekly one. Stale until Codex runs again after a reset; the reset time says so |
| Any | `scripts/usage_report.py --project <name> --since "<YYYY-MM-DD HH:MM>"`: tokens and API-equivalent $ per CLI and per model | Each request is priced at its own model's rates, long prompts at the long rates |

**No reading route** (no Codex session log yet, or a command that fails): write "unavailable" with the source and the time, and keep the API-equivalent dollars from `usage_report.py` separate. Never convert tokens into plan % without a measured rate. When other machines or runs use the same account, a meter delta is an upper bound for this run's share, not its measured use. An unavailable reading never blocks the run.

`usage_report.py` options: `--since` takes "YYYY-MM-DD HH:MM" in local time (an ISO 8601 timestamp with an offset also works). `--exclude <other run>` drops another run's worktrees and sessions in the same repo, so parallel runs don't count each other. `--claude-dir <name>=<dir>` counts another Claude Code config dir as its own row. A model missing from `prices.json` makes its row's $ "n/a", and the report names it.

## Watching the pools
Before each round, read the pools it needs and log one decision line, e.g. "codex 61%: reviewer only, artist paused". Thresholds that worked in past runs:
- **Above 70% of a 5h window:** pause non-essential consumers of that pool (e.g. the artist or extra reviewers) so the reviewer never starves.
- **Below 30% left:** don't start new parallel sessions on that pool.
- **On exhaustion:** let work in flight stop where it is (it's safe in its worktree). Reroute new work by the routing rules, schedule a one-shot wake at the reset time, and on reset start fresh sessions instead of resuming bloated ones.
- **Long caps:** some plans have longer caps beyond the 5h window. One heavy night hit a ~31h lockout after three windows. Budget scarce pools across the whole run.

## Observed burn (one heavy night: Phaser game, ~16 h)
Orders of magnitude only; measure your own.
| Pool | What happened |
|---|---|
| Codex | Judge, artist and player together used about 40% of the weekly quota. The artist alone burned about 1% of the 5h window per minute while generating images. |
| Claude (high-tier plan) | About 900M tokens (TL plus a player) used about 6% of the weekly quota. |

## Validate the measuring tools before trusting them
Check a usage or cost tool against ground truth once per setup:
- the unique response count, not raw log lines (Claude Code logs one response once per content block, which overcounted 2×);
- the plan's own meter (`/usage`, a dashboard, credits) over the same window.

Read the meter at the start of a run even when you expect not to need it. Answer deep questions such as plan generosity by having a fresh, focused agent dig into the raw data, not by estimating mid-run. A busy orchestrator's estimates were wrong by 2–5× in one run.

## Cutting the TL's coordination cost (Super Team)
In full-team runs, half or more of the TL's calls were mechanical: messages, `st` updates, starting and stopping agents, gate runs, screen reads. Each one re-sends the TL's 200–500K context. The saving comes from **smaller contexts and no model at all**, not from a cheaper model: on a subscription, a "cheap" model once cost about 10× Claude per token.

1. **Scripts first (0 tokens):**
   - `gate.sh` logs its verdict to the dashboard by itself;
   - the board rebuilds itself from rounds, snapshots and gate results;
   - quota scripts read the meters.
2. **Helpers send structured reports:** branch, commit, how they verified it (a `gate.sh --dry-run` JSON line, if you use the gate) and open issues. You read a few lines instead of their session.
3. **Batch per wake:** read all messages once, use one `st` command, and start or stop agents together (SKILL §4).
4. **In Super Team the EM carries the owner's questions and the round traffic** (`references/team-mode.md`), so the TL's context holds only the build. A full run hasn't been measured: record calls, context and plan usage per role.

## Budget the weekly pools at the start
Note each pool's weekly % before round 1, and plan how many heavy tasks it can take. A fast pool can drain in about 6 heavy tasks: one run took a pool from 15.6% to 1.5% of its week. For long-turn workers, keep it to one task per session with at most 3 items. One 6-item session ran for 2.5 hours.

## Worker profiles
- **Codex as reviewer** (as judge and art director up to v0.9): fast and precise. It gives numeric, located fix lists and marks honestly what it didn't verify. As a judge it used about 6–30% of a 5-hour window per 2-hour run, more when it generated images.
- **Claude building alone:** a well-specified 2-hour-box product took 40–85 min. In the Tidewell bake-off, Claude alone built for 3 hours for about $95 API-equivalent (706 requests at about 450K context each), and Codex alone for about $15 (lesson 33).
- **Super Team (haiku EM, one opus TL, optional sonnet helpers)** hasn't been profiled in a full run. Offline: $0.0003 per EM decision (Haiku medium), $0.04 per small coding task (Sonnet high) (lesson 30). Measure calls, context and plan usage before relying on them.

## Prices
API list prices live in `assets/templates/prices.json`, one entry per model id, with a "last checked" note. Re-verify before quoting money: claude.com/pricing (or the claude-api skill) for Claude, OpenAI's pricing page for Codex. Subscription plans aren't billed per token. Report both the API-equivalent dollars and the plan quota % used.
