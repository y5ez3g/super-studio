# Lessons: observations from past runs

Each one comes from something that happened in a real run. They are observations, not rules: use one when it fits your situation, and use the why to judge whether it does. Numbers 33–35 come from the run that shaped v0.11.

## Cost and throughput
1. **Restart workers per task.** Sessions that lived for hours carried 300K+ context into every call, and one session burned about 150M tokens. Fresh sessions with a handoff file did the same work for a fraction of that.
2. **Cap parallel workers per pool.** Five at once emptied a 5-hour window in about 2 hours, and then all engineering stopped. Two workers last the whole window and also cause fewer merge conflicts.
3. **Don't make the TL a busy-waiter.** A 20-minute heartbeat ran 46 times and each run re-read the TL's huge context, about 100M tokens for mostly "nothing changed". Rely on doorbells and keep the heartbeat at about 60 minutes.
4. **The cheapest model isn't the cheapest per completed task.** Fast, cheap workers produced more rework (rule violations, wrong fixes, merge conflicts) that cost TL tokens and wall time. Route judgment-heavy work to the more careful model.

## Verification
5. **The smoke test passing ≠ the product works.** One smoke test reached the "mission complete" screen while the real mission ended early, the boss sat off camera, and the test harness wasted 61 seconds before handing over control. The TL found every one of these by running the full route itself. So replay the full route on every green build, and add an assertion to the gate for each new feature (e.g. "boss is on camera").
6. **Never trust self-reported green.** A worker claimed its scripted run "rode the vehicle"; replaying it showed no vehicle events. Re-run gates yourself and check claims against traces or events.
7. **Check where every new binary came from.** A downloaded third-party font slipped in as a "fix". `gate.sh` lists new binaries; each must come from your own pipeline.
8. **Protect the test harness.** Workers can "fix" a failing gate by changing the test. `gate.sh` reports changes under protected paths; accept them only from the harness owner, and read the diff.
9. **Test-mode switches must change only what they say.** An invulnerability flag also made enemies passive, so every assisted run looked too easy. Specify test flags precisely and verify they have no side effects.
10. **Judges misread pictures too.** The PD reported the hero "behind the boss"; it was another character. Before acting on a P0, require a timestamp and an image, and look yourself.
11. **AI players miss fast action.** In a real-time action game, AI players saw under 1% of frames, played coarsely, and one invented findings. Bots plus per-frame detectors caught what they missed. For fast real-time products, a reviewer's own use is worth combining with recordings or bots; for slower products (a builder toy, a website) first-hand use worked well. The owner's hands-on play is the final word.

## Engineering hygiene
12. **Split hot files by owner early.** Repeated conflicts in one big scene file cost several rounds. Split it into owned modules before parallel work starts.
13. **Keep generated assets reproducible.** A worker hand-edited a built atlas, which the next pipeline run would have reverted. Fix the pipeline input, not the output.
14. **Real-time behaviour can't be tested in lockstep.** A target frame rate isn't a cap, and per-frame movement doubles speed on 120 Hz screens. Cap the frame rate or use delta time, and add a real-time check.
15. **Freeze a snapshot for every review round.** Testers and the reviewer need a fixed target while main keeps moving. Copy it to `team/builds/<tag>/`.

## Operations
16. **Quota exhaustion is routine, not a crisis.** Work in flight stays in its worktree. Reroute, schedule a one-shot wake at the reset time, and resume with fresh sessions.
17. **Plan for a Facade restart.** It ends every agent and changes your id. Relaunch from evidence on disk plus message ids. The board's refresh loop runs outside Facade and keeps going.
18. **A long "Thinking" timer isn't a hang.** Some CLIs show the whole turn's timer. Check recent actions before interrupting.
19. **Show the plan and get approval before starting.** Owners restart runs whose process they can't see or trust.
20. **Tests can pass by testing nothing.** A worker's reduced-motion test was an OR of three checks, one of them always true. It stayed green whether motion was off or not. Give every new assertion a negative control, and read the assertions cheap workers write.
21. **New worktrees start from the caller's HEAD.** An engineer spawned from a TL worktree that lagged main started 4 commits stale. Fast-forward your own worktree before spawning.


## Team shape and evidence
22. **Default to a duo; add a team only for broad scope.** On the same brief, a duo (strong builder + cross-model reviewer) scored 8.3 in 75 min for about $28 (Codex judge's scores), while a full cheap-worker team scored 6.1 in 100 min for about $60. On a 3-region game the team shipped 1 region in 6 h, while one strong session shipped all 3 (one observation each). Handoffs and re-read context cost more than parallelism saved.
23. **Reported fixes don't always land.** In a duo, two fixes reported to the judge had silently not applied. A reviewer that uses the snapshot itself sees whether they did; the request's "changed since the last round" tells it where to look.
24. **Cap art at about 40% of a pool it shares with the reviewer.** One art batch used about 61% of a shared 5-hour window in 10 minutes, and the judge ran out before its last review. Reviews matter more; art can wait for the reset.
25. **Give every cross-owner seam one owner and a test.** A shared event without an attacker id and a flag with two owners broke smoke late in a run. Name each seam's emitter, payload and owner in CONTRACTS.md before parallel work starts.
26. **Evidence is append-only.** Two runs lost evidence to a wrap-up `rm`. Re-record into a new folder instead of deleting; recordings, reviews and frozen builds are the run's record.
27. **Set up and smoke-test the fallback reviewer at the start.** In a polish run, Codex ran out after one review, and the fallback was first tried in the last 25 minutes. Choose the fallback at setup and test it with one tiny task.
28. **Scores don't track the owner's taste.** On the paper-plane game, Codex scored the duo build 8.3, while the owner preferred a polished team build that judges had scored 6.6 (Codex) and 7.4 (another model). Absolute scores drift between builds and judges. Up to v0.9 this was answered with anchors, pairwise judging and shipping the best-judged build; lesson 33 shows what that cost, and v0.11 asks for feedback instead of scores.
29. **Treat a reviewer's code diagnosis as a hypothesis.** In a published study (arXiv 2607.21656), Codex reviewing Claude's code without running tests lowered the pass rate from 91.4% to 82.8%. Judges are reliable on what they can see. Confirm a code-level claim with a failing test before changing code.
30. **Write the dispatcher's rules without ambiguity; its model and effort mattered less.** In an offline test of 29 EM decisions (5 repeats), Haiku at every effort from low to max scored 98–100%. Every miss came from two ambiguous rules: a round number read as a cycle count, and whether a re-review of the best counts toward stopping early. With both spelled out, every Haiku effort scored 145/145 (Sonnet and Opus, run twice, 58/58), at $0.0003 a decision for Haiku medium. Opus scored 24/24 on 8 TL decisions with checkable answers at high and at xhigh, for the same cost ($0.016–0.017 each); max cost 5× with no gain. Sonnet passed 3 coding tasks scored by hidden tests at medium, high and xhigh (high +20% cost, xhigh 2×). These tasks were too easy to separate the efforts, so the team table takes the higher effort where the cost is about the same.

## Models and helpers
31. **Pass every agent's model and effort explicitly, and check them once it runs.** Setting up the Skyfold bake-off, the PM's art director started on Codex's local default, a max-effort model nobody had chosen, and the smoke run's judge showed "default" on the board instead of the planned newest sol at xhigh. A CLI's default is whatever that machine's config says. Write each role's model and effort in the plan, pass both on every start, and read them on the agent's screen.
32. **Close helpers when their task ends.** In the same runs, a Claude session opened only to read `/usage` stayed open, and the art director's worktree outlived its committed work. `claude -p "/usage" --no-session-persistence` reads the meter without a session. Stop each agent when its task ends, and remove a worktree once its work is merged or committed; evidence stays.

## The Tidewell bake-off (2026-10-19)
One super-pm spec, three arms at once on one Mac, a 3-hour limit each; the owner ranked the results blind.
33. **Build in one go, then improve.** super-team v0.9 built a small slice in 17 minutes, then spent its time in short judged cycles: freeze, record, judge, fix list. It shipped the code from minute 81: its latest build, with gulls, smoke and save, was held back by a perf rule its own lead had just added and by "promote only on better". Claude alone ($95) and Codex alone ($15) each built for about 3 hours straight, and the owner ranked both above it (v0.9 cost $40).
34. **A reviewer that only sees the builder's recordings sees what the builder shows.** The v0.9 judge never ran the game. It accepted a boat the owner couldn't find, and scored the build with gulls and smoke the same as the one without. Every claim it checked was in the recordings it was given.
35. **Agents stop early.** Told to work until 3 hours had passed, the Claude arm stopped at 2 h 46 min; three reminders each produced one more real improvement (greenery, boat reflections, boats moored snug). A heartbeat that checks the clock brings the TL back while time is left.
