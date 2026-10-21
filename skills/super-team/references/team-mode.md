# Super Team (experimental)

**What it is:** the same two phases as Super Engineer (SKILL.md §3–§7), with a cheap manager in front. It needs Facade (Tier A): the manager, the TL and the reviewer talk through Facade messages. The owner talks only to the manager (EM). The EM starts one long-lived TL session that builds and decides, and the Codex reviewer.

**What it's for:** the TL's context stays free of the owner's questions and of round traffic. No full run has measured it yet. Record each role's calls, context and plan usage, so a run can be compared with Super Engineer.

| Role | Model and effort | Does | Never does |
|---|---|---|---|
| EM | Claude haiku, medium; the session the owner starts | Asks the start-up questions; starts the TL and the reviewer; passes requests and feedback between them; keeps the TL going while time is left; answers status questions from the board; reads meters; restarts stalled agents | Any product or technical judgment |
| TL | Claude opus, xhigh; one long-lived session | Writes the plan; builds the whole spec (phase 1); asks for review rounds and decides on the feedback (phase 2); ships and writes the case bundle | Talking to the owner directly, except through the EM |
| Helpers | Claude sonnet, high, when the TL wants them; one task per fresh session | Product code on owned areas | Self-certifying "done" |
| Reviewer and artist | Codex, the newest sol, xhigh | As in Super Engineer: feedback rounds, images, the claim check | Code |

- **Starting:**
  - The session the owner starts asks the start-up questions (`start-up.md`). When the owner picks this mode and the session's model or effort is off, it ends the turn with "This session is the manager. Type /model haiku, then /effort medium, then continue.", checks again, and from then on is the EM.
  - The EM starts the TL, which writes the plan. Nothing is built before the owner approves it.
- **The briefs** are in `briefs.md`: the EM brief, the TL brief, and the helper task with CONTRACTS.md and FRESH-START.md.
- **The TL's context is the cost to watch.** Past runs handed off at about 250K tokens; the TL decides when. It writes a handoff (state, decisions, next steps) to `team/specs/HANDOFF.md`, and the EM starts a fresh TL from it.
