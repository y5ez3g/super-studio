# Brinewick (2026-10-20)

**Idea** (one line, given to super-pm with no images): "A cozy harbor-town builder: click the sea to raise houses, docks and bridges, and the town shapes itself around what you build."

**Product design:** super-pm v0.8.1 wrote it in 33 minutes (13:49–14:22), with Claude Opus 5.5 as the PM and Codex gpt-6.1-sol (xhigh) as the art director, who drew 6 images. The owner picked frame A and asked for clearer water (R1); super-pm's consistency review made the final frame (R2). The files are in `spec/`: SPEC.md, ART.md and chosen.png.

**Three builds from the same locked product design:**

| Folder | Built by | Model and effort | Time | Blind rank | Play |
|---|---|---|---|---|---|
| `super-team-v0.11.1/` | super-team v0.11.1 (Super Engineer mode): Claude builds, Codex reviews, 7 rounds | Claude Opus 5.5 (xhigh) + Codex gpt-6.1-sol (xhigh) | 1 h 51 min (16:04–17:55) | **1** | [Play](https://claude.ai/artifact/QWZyta6rLke2bKzTwyKxtX) |
| `claude-alone/` | Claude Code alone, with one prompt | Claude Opus 5.5 (xhigh) | 1 h 36 min (14:26–16:02) | 2 ("a small gap, mostly details") | [Play](https://claude.ai/artifact/LiJSJG4QiwzhNC2kKZ25ji) |
| `codex-alone/` | Codex alone, with the same prompt | Codex gpt-6.1-sol (xhigh) | 1 h 24 min (14:26–15:50) | 3 ("a large gap") | [Play](https://claude.ai/artifact/WPPimAcS4VABYgUanqJas2) |

**Cost** (API-equivalent; the runs used subscription plans):

| Build | Claude | GPT (Codex) | Total |
|---|--:|--:|--:|
| super-team | $22.45 | $7.42 | $29.87 |
| Claude alone | $57.08 | $0.12 | $57.20 |
| Codex alone | $0 | $5.95 | $5.95 |

**Notes:**
- Each build had at most 3 hours and decided for itself when to stop; nobody nudged them.
- super-team's time splits into the first full build (29 min), seven review rounds (63 min) and the final check and report (19 min).
- Claude alone called Codex three times on its own (gpt-6.1-sol, xhigh), for visual critiques of its screenshots. That is its $0.12 of GPT cost.
- A first super-team v0.11 run was voided: it waited for review feedback instead of building. v0.11.1 added a standing loop (compare with the product design and the look, fix the biggest gap, check, until the time limit), and this run used it.
- The product design's cost was recorded only as plan-meter readings (Claude session 63% → 74%), not in dollars, so it isn't in the table.
- The Play links open each build as a Claude artifact, where the postcard's "Save image" button doesn't work.
