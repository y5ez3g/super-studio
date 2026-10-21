# Spec intake

## Finding it
1. Use the file the owner names.
2. Otherwise search the repo: super-pm's `docs/game-spec/SPEC.md` first, then markdown files named like spec, PRD, GDD, design, brief or requirements.
3. When more than one could be the spec, ask in the start-up message.

Record its path with `team/tools/st set spec '"<path>"'` so the board reads it. Never edit the owner's spec, except to log changes under its "Changes after lock" (below). A spec without `A<n>` acceptance lines gets a separate acceptance file (`references/start-up.md`).

## What each part becomes
super-pm writes all of these; a spec from elsewhere may have only some.

| Spec part | Becomes |
|---|---|
| The spec (super-pm's `SPEC.md`) | The brief. Phase 1 builds everything in scope: the essentials and the nice-to-haves. Out-of-scope items are never built. |
| `ART.md` + `concept/chosen.png` (or any look the spec sets) | The look to build towards, and the reviewer's reference. Its visual intent is fixed: you tune within it. Lines marked "(start)" are starting values to tune. ART.md's Never list only grows; removing an item needs the owner. |
| Acceptance lines (`- [tag] A<n>: …`, in the spec or the acceptance file) | What "built" means. How you check each line is your call. If you use `gate.sh`, map checks to ids with `"covers": ["A1", …]` and the board shows each id's status. `[owner]` lines are the owner's own play before they accept it. |
| Approval labels (super-pm v0.8: owner constraints, approved experience goals, provisional design choices, implementation guesses) | Who may change what (SKILL.md §1). |
| SPEC.md's Decisions section | Why the spec says what it says. Read it before you change something. |

**Changing the spec.**
- Log a material change to a provisional choice or an implementation guess as a dated line under "Changes after lock" in SPEC.md's Decisions section, and commit it as `spec: <change>`.
- A spec without that section: record the change with `st decision` and in the plan.
- A change to an owner constraint or an approved goal needs the owner's OK first (`st needs add`).
- Never edit the spec to make a check pass.

**The reviewer may find a problem in the spec itself**, such as a rule that makes the product confusing. Treat it like any other feedback item: you decide, within what you may change. Anything beyond that goes to the owner.

**No look in the spec:**
- When the look matters and nothing shows it, offer super-pm in the start-up message.
- Otherwise build towards the spec's words and the owner's references, and tell the reviewer that's the reference.

The spec's commit is the base of the integration branch.

## With no spec
Never ask the product language: use the owner's saved preference, else English.

Finish start-up's Screens 1 and 2 first (`start-up.md`). Then ask one batch, with only the questions below that the request doesn't already answer. If super-pm is available and the owner wants a fuller spec with a chosen look, offer it first.
- what it is, who it's for, references and the quality bar;
- stack and scope;
- the priority order of quality, cost and speed (default: quality > cost > speed);
- hard constraints, such as original names and brands, no downloaded assets, or no push or publish unless asked.

Write the answers as a spec in the repo: `docs/SPEC.md`, with a `## Acceptance` section of `- [tag] A<n>: …` lines. Commit it, record it with `st set spec '"docs/SPEC.md"'`, and put it in the plan for approval.
