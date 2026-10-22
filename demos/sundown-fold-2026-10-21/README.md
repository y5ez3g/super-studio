# Sundown Fold (2026-10-21)

**Idea** (one line, given to super-pm with no images; the owner chose the direction, a paper plane through floating islands, and Claude drafted the line): "A paper plane glides through a floating archipelago at golden hour: move the mouse to steer, ride warm updrafts to climb, and thread glowing lantern gates; the flight ends on a postcard of your route."

**Product design:** super-pm v0.8.1 wrote it in 14 minutes (21:13–21:27), with Claude Opus 5.5 (xhigh) as the PM and Codex gpt-6.1-sol (xhigh) as the art director, who drew 3 images. The owner picked frame A unchanged. The files are in `spec/`: SPEC.md, ART.md and chosen.png.

**Three builds from the same locked product design:**

| Folder | Built by | Model and effort | Time | Blind rank | Play |
|---|---|---|---|---|---|
| `super-team-v0.11.2/` | super-team v0.11.2 (Super Engineer mode): Claude builds, Codex reviews, 5 rounds | Claude Opus 5.5 (xhigh) + Codex gpt-6.1-sol (xhigh) | 2 h 21 min (21:38–23:59) | **1** ("the most balanced; better light, finer detail") | [Play](https://claude.ai/artifact/YVTE76qsnqDQbUUgdCCdNs) |
| `codex-alone/` | Codex alone, with one prompt | Codex gpt-6.1-sol (xhigh) | 1 h 9 min (21:51–23:01) | 2 ("about the same"; it wins on art feel, but the distant sun and such are coarse) | [Play](https://claude.ai/artifact/NBsysN6GbNU1iBbP15JL6b) |
| `claude-alone/` | Claude Code alone, with the same prompt | Claude Opus 5.5 (xhigh) | 3 h 47 min (21:51–01:38) | 3 ("too AI") | [Play](https://claude.ai/artifact/NbgeGg5D6j8bEffyUETCQi) |

**Cost** (API-equivalent; the runs used subscription plans):

| Build | Claude | GPT (Codex) | Total |
|---|--:|--:|--:|
| super-team | $28.75 | $10.06 | $38.81 |
| Codex alone | $0 | $4.18 | $4.18 |
| Claude alone | $85.17 | $0 | $85.17 |

**Notes:**
- Each build had at most 5 hours and decided for itself when to stop; nobody nudged them. Both solo builds got this prompt, word for word: "Build the game in docs/game-spec/SPEC.md. Match the look in docs/game-spec/concept/chosen.png. Make it as good as you can. You have at most 5 hours: run `date` now, and use as much of that time as makes the game better: keep comparing the running game with chosen.png and the spec, fixing the biggest gaps, and checking the result in a browser."
- super-team's time splits into the first full build (30 min), five review rounds (91 min) and the wrap-up with a claim check (20 min). Round 5 found nothing users would notice, so it stopped well inside its 5 hours.
- **Codex alone wasn't a single agent.** The prompt matched super-team's skill description, so Codex read that SKILL.md first. super-team doesn't run on a Codex host, so Codex built the spec directly, but it borrowed the plan and review rounds and ran two native Codex sub-agents as independent reviewers. Their tokens are in its cost.
- Claude alone used no skill and no other model.
- **The ranking is the owner's blind play of one game.** The builds were served on three random ports as A, B and C. At first the owner put Codex alone first. After comparing more, the owner settled on super-team as the best and most balanced, with Codex alone about the same.
- The product design's cost was recorded only as plan-meter readings (Claude session 60% → 64%, week 62% → 63%; Codex week 44% → 44%), not in dollars, so it isn't in the table.
- **Play** opens each build as a Claude artifact, where the postcard's "Save postcard" button doesn't work. To use it, run `python3 -m http.server 8000` in this repo, then open http://127.0.0.1:8000/sundown-fold-2026-10-21/super-team-v0.11.2/ (or `codex-alone/`, `claude-alone/`). Steer with the mouse; Esc pauses.
