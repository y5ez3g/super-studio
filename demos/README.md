# superstudio demos

Products made with [superstudio](../)'s skills. Each demo is one product design built three ways: by super-team, by Claude Code alone and by Codex alone. The owner played all three and ranked them blind.

## Sundown Fold · 2026-10-21

*A paper plane glides through a floating archipelago at golden hour: steer with the mouse, ride warm updrafts to climb and thread lantern gates before the sun sets. The flight ends on a postcard of your route.*

| Build | Model and effort | Time | Claude | GPT | Total | Blind rank | Play |
|---|---|---|--:|--:|--:|---|---|
| **super-team** | Claude Opus 5.5 (xhigh) builds; Codex gpt-6.1-sol (xhigh) reviews, 5 rounds | 2 h 21 min | $28.75 | $10.06 | $38.81 | **1st**, the most balanced | [Play](https://claude.ai/artifact/YVTE76qsnqDQbUUgdCCdNs) |
| Codex alone | Codex gpt-6.1-sol (xhigh), with two Codex sub-agents as reviewers | 1 h 9 min | $0 | $4.18 | $4.18 | 2nd, about the same | [Play](https://claude.ai/artifact/NBsysN6GbNU1iBbP15JL6b) |
| Claude Code alone | Claude Opus 5.5 (xhigh) | 3 h 47 min | $85.17 | $0 | $85.17 | 3rd | [Play](https://claude.ai/artifact/NbgeGg5D6j8bEffyUETCQi) |

- **Same start, same rules.** All three built the same locked product design, which super-pm wrote in 14 minutes. Each build had a 5-hour cap and decided for itself when to stop.
- **Play** opens each build as a Claude artifact, where the postcard's "Save postcard" button doesn't work. To use it, run the builds locally: `python3 -m http.server 8000` in this folder, then open http://127.0.0.1:8000/.

The product design and the full record are in [sundown-fold-2026-10-21](sundown-fold-2026-10-21/).

## Brinewick · 2026-10-20

*A cozy harbor-town builder: click the sea to raise houses, docks and bridges, and the town shapes itself around what you build.*

| Build | Model and effort | Time | Claude | GPT | Total | Blind rank | Play |
|---|---|---|--:|--:|--:|---|---|
| **super-team** | Claude Opus 5.5 (xhigh) builds; Codex gpt-6.1-sol (xhigh) reviews, 7 rounds | 1 h 51 min | $22.45 | $7.42 | $29.87 | **1st** | [Play](https://claude.ai/artifact/QWZyta6rLke2bKzTwyKxtX) |
| Claude Code alone | Claude Opus 5.5 (xhigh) | 1 h 36 min | $57.08 | $0.12 | $57.20 | 2nd, a small gap | [Play](https://claude.ai/artifact/LiJSJG4QiwzhNC2kKZ25ji) |
| Codex alone | Codex gpt-6.1-sol (xhigh) | 1 h 24 min | $0 | $5.95 | $5.95 | 3rd, a large gap | [Play](https://claude.ai/artifact/WPPimAcS4VABYgUanqJas2) |

- **Same start.** All three built the same locked product design. super-pm wrote it in 33 minutes, with Claude Opus 5.5 as the PM and Codex gpt-6.1-sol (xhigh) as the art director, who drew 6 images.
- **Same rules.** Each build had a 3-hour cap and decided for itself when to stop.
- **Cost** is what the tokens would cost at API prices, split by model family: Claude, and GPT (Codex). The runs used subscription plans. Claude Code alone's GPT cost is three Codex critiques it chose to ask for. The product design's own cost isn't included.
- **Play** opens each build as a Claude artifact. The postcard's "Save image" button doesn't work there. To use it, run the builds locally: `python3 -m http.server 8000` in this folder, then open http://127.0.0.1:8000/.

The product design and the full record are in [brinewick-2026-10-20](brinewick-2026-10-20/).
