---
name: super-pm
description: Turn a one-line game idea into an owner-approved plan for a 3D browser game (three.js + TypeScript + Vite), with a look the owner picks from in-game concept frames. The host (Claude or Codex) asks a few fixed questions and drafts the gameplay and goals; an art director (Codex when available, else the host) draws the frames from the owner's references and writes the art direction. The output, docs/game-spec/, is a brief any build team can implement. Use it when someone wants a new 3D browser game and has no spec ("make me a 3D game", "I have a game idea", "design a game with me", "write a game design doc"), and before a game build.
---

# Super PM

Paths under `scripts/`, `references/` and `assets/` are relative to this skill's folder, so run the helpers from the project as `python3 <this skill's folder>/scripts/<name>.py docs/game-spec`. Codex loads it from `~/.agents/skills/`.

You turn a short game idea into a direction the owner approved and a look they chose. You draft the gameplay, the art director does the looking, and the owner (the user this game is for; anyone answering for them is a proxy) decides.

**Fixed for every spec:** three.js 0.186 + TypeScript 5.9 + Vite 8; original names, characters and art; no downloaded models, textures, fonts or audio (all geometry is built in code); every string in the user's product language (default English). For a 2D game, say this skill makes 3D games, offer a 3D take, or stop.

**Output:** `docs/game-spec/` (`SPEC.md`, `ART.md`, `concept/`, and `owner-refs/` when the owner gave references) plus `AGENTS.md` and `CLAUDE.md` in the repo root; `references/spec-format.md` is the contract with the build team.

## 0. Start
`references/questions.md` holds everything the user sees, word for word: the opening, four screens, the switch line and the closing line. Say and ask them in its order and wording, fill only the `<…>` parts, ask nothing else, and state no duration anywhere. Skip a question the context already answers.
1. **Use what you already know about the user** (memory, CLAUDE.md, earlier specs) as defaults, such as the product language.
2. **Check this machine:** `python3 <this skill's folder>/scripts/detect_env.py --host claude` (`--host codex` when Codex runs this skill) reports logins, models, meters and `ask_art` (whether Screen 2 is asked); keep its meters for §3's PM session row.
3. **Project folder, first:** the current folder if it's empty or already this game's repo, else `./<working-title>/`; `git init` if needed.
4. **The owner's references,** never asked for (attachments, paths in the pitch, images they name): copy each, unaltered, into `docs/game-spec/owner-refs/` and record its source, their words and its role in `refs.json`: **literal target** or **taste example** (name the aspect), `provisional` when their words don't settle it.
5. **Opening:** the statement for this host, from `references/questions.md`. It states the product language and the camera; ask the camera only when the gameplay can't decide it.

## 1. Gameplay first, then the questions
1. **Draft the gameplay** from the pitch and the references: audience, player actions, core loop, challenge and reward, intended experience, essential scope, exclusions and major uncertainties. Ask only what could materially change it.
2. **Screen 1, the game:** Game, Size, Devices and Feel.
3. **Screen 2, the art director:** only on a Claude Code host with Codex ready (`ask_art`).
4. **Find the art director** (`references/art-director.md`) after Screen 2, never before. If you can generate images, you are the art director; with no Codex, or on `Claude, no Codex`, it's host-only. Otherwise, in this order: Facade → CLI → host-only. Never retry a failed route.
   - **Facade:** Codex in a worktree, saving into `art-out/` for you to copy. **CLI:** `codex exec --approve-for-me -C <project>`, one call per step, if a one-image smoke test saves a file. **Host-only:** you draw code-rendered PNG mockups (rasterise any SVG) and write ART.md yourself.
   - **Model and effort:** pass the ones Screen 2 chose, never on its local default; confirm them once it runs, with the line in `references/questions.md`.
5. **This session writes the spec,** so it should be Claude Opus at xhigh (Codex: detect_env.py's pick at xhigh). If your model or effort is off, ask Screens 1 and 2 first, start the art director, then end the turn with your host's switch line, word for word.

## 2. Style board: the owner picks the look
1. **Brief the art director** (board brief) with the pitch, size, devices, camera, feel, dislikes and the references as image inputs. With no direction from the owner, it explores distinct looks; with a direction or a literal target, it draws variants close to it. Three frames is the default, not a rule. Each is an in-game screenshot of the same gameplay moment, showing only what three.js renders from code-built geometry.
2. **Check every frame before the user sees it:** exactly 1280×720, gameplay through the chosen camera (not a poster), HUD fits, nothing from the "can't" list in `references/art-director.md`, and true to the references by role: image inputs can still drift. Send a failure back once (retry brief): archive it and its caption under `docs/game-spec/rejected/`, outside `concept/`; the replacement keeps its letter, and `captions.json` is updated before the board is built.
3. **Show the board:** `python3 <this skill's folder>/scripts/style_board.py docs/game-spec/concept` writes `docs/game-spec/board.html`; open it, then ask Screen 3, the look.
4. **Any change at the Look screen** (a mix, or any visual change, not just a letter): the art director edits the picked frame into `concept/R1-<slug>.png` (refinement brief), changing only what was asked. Check it as in step 2, and that nothing else changed; rebuild and reopen the board, and copy it to `concept/chosen.png`; otherwise copy the picked frame.
5. **One budget of 8 images covers everything,** consistency edits included. Default: 3 frames + at most 2 retries + 1 refinement + 1 smoke test = 7.
6. **The art director writes `ART.md`** (ART.md brief) from `assets/templates/ART.md` against `chosen.png`, before Screen 4. Every item carries one of four labels: owner constraint, approved experience goal, provisional design choice or implementation guess (`references/spec-format.md`). Approval attaches to what the owner saw and accepted, so numbers read off a frame are guesses.

## 3. Write SPEC.md
Fill `assets/templates/SPEC.md` while the art director draws:
- **Provenance:** sort the plan into the same four kinds: they say what the build team may change.
- **Acceptance:** goals and genuine platform and performance requirements, each exactly `- [kind] A<n>: <statement>` (grammar in `references/spec-format.md`): what must be true, never how to test it (that is the build team's plan). The `[owner]` line is the owner's hands-on acceptance.
- **Consistency review,** with the art director (consistency brief): can ordinary play of this plan plausibly look like that frame? Check content density, camera, scale, run length and performance; fix the plan or the frame where it can't (a frame edit is checked as in §2 and shown on the reopened board). Also check the **rules** (the plan's own rules can produce everything the frame shows) and the **feedback** (every player action answers visibly, every time, in every state).
- **Title:** you pick it (original, short) with two alternatives; nobody is asked.
- **Decisions:** a row per question asked or skipped, one for the title, and a "PM session" row (start and end time, images generated, plan-meter readings at start and end, from detect_env.py). The build reports this shared spec cost separately.

Then run `python3 <this skill's folder>/scripts/check_spec.py docs/game-spec`, and fix every problem it lists until it passes.

## 4. Lock and hand off
Ask Screen 4, the lock: its "Lock it" line is the whole summary, gameplay and look together. The build starts from the lock, so never lock without their approval.

Record a Lock row in Decisions: the Lock line as shown and who approved it, `owner`, or `proxy (provisional)` when anyone else answered for them or you can't tell. Never record a proxy as the owner; the build may proceed on a provisional approval.

Then write the repo's `AGENTS.md` from `assets/templates/AGENTS.md` and a `CLAUDE.md` whose only line is `@AGENTS.md`, adding to existing files. Run check_spec.py once more, with `--locked`, then commit them with `docs/game-spec/` as the project's first commit (`spec: <title>`). Then stop the art director and remove its worktree: its files are in the commit.

Say the closing line and stop.

## Rules
- **The owner picks the look, the art director directs it, and you don't judge its beauty:** you check that frames are valid (gameplay, buildable, readable) and true to the references. Style, composition and lighting come from the owner, their references and the art director, never from this skill.
- **Original only.** No characters, names, logos or styles tied to an existing franchise or artist: "like Mario Kart" becomes original karts.
- **Spec files in English,** for the build team and the judge. Use the fixed English wording in `references/questions.md` verbatim, even when the user speaks another language. The product language remains the user's setting.
- **Nothing leaves the machine:** no uploads or publishing.
- **Keep every frame, reference and answer:** they explain the decisions.
