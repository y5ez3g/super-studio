# The art director

"Art director" means whichever actor is available. Prefer a model that can see and generate images and comes from a different family than the builder, so the look isn't the builder's own taste: Codex with its image generation is the default. If you can generate images yourself (e.g. you are Codex), or no route can save images, you are the art director (host-only mode). The art director draws the style board, writes ART.md and joins the consistency review. You check that frames are valid and true to the owner's references, never whether they're beautiful.

## Connect
**Model and effort, always explicit.** Codex's own default (`~/.codex/config.toml`) may be a max-effort model you didn't choose. Pass the model and effort the user chose on Screen 2 (`references/questions.md`) on every start: `scripts/detect_env.py` recommends the newest listed sol model at xhigh. Then check that the agent's status line (Facade `read_screen`) or the `codex exec` header shows them; if not, stop it and start again.

Set up the project folder first (SKILL.md §0 step 3), because every route ends with files in it. If you can generate images yourself, skip the routes. Otherwise, in this order: Facade → CLI → host-only. A failed route is never retried; take the next untried one.

1. **Facade (preferred when its tools are in your session):** `start_agent {name: "art", cli: "codex", model: <model>, effort: <effort>, folder: <your own launch folder>, new_worktree: true, task: <brief>}`. One Codex session keeps the board in mind for the refinement and ART.md, reports with `send_message`, and works where the user can watch it.
   - Start the agent from a folder Facade allows: your own launch folder. With worktree management on, a child needs a worktree Facade creates, hence `new_worktree: true`; without it, drop that flag. Never point a Facade child at a new folder Facade doesn't manage (such as the new project folder): Facade refuses it, and a repo with no commit has nothing to branch a worktree from.
   - Have the agent save into `art-out/` inside its own folder and report with `send_message`. Copy the files into the project yourself: after the board, only the frames (`<letter>-*.png`) and `captions.json` from `art-out/concept/` into `docs/game-spec/concept/`; after a retry or the refinement, only the new frame and its caption entry; at the end, `art-out/ART.md` into `docs/game-spec/`.
   - Keep the same session for the refinement and for ART.md, so it remembers the board. When its files are copied and committed (SKILL.md §4), stop it and remove its worktree.
2. **Codex CLI (without Facade tools):** one `codex exec` call per step, run in the background so you write SPEC.md while it draws. On codex-cli 0.162.1 this works:
   `codex exec -m <model> -c model_reasoning_effort=<effort> --approve-for-me -C <project> "<brief>" < /dev/null`
   - `--approve-for-me` runs it unattended in the workspace-write sandbox, so it writes straight into the project and nothing needs copying. Never add `-s`/`--sandbox`: the two together are an error. Other versions name the flag differently, so check `codex exec --help` once.
   - `<project>` must be a git repo (SKILL.md §0 step 3 runs `git init`). `codex exec` reads stdin whenever it isn't a terminal, so a background call with stdin left open hangs: keep `< /dev/null` with a brief passed as an argument. A long brief can go on stdin instead: write it to a file outside the repo and pass `- < <file>` in place of `"<brief>" < /dev/null`.
   - Send its output to a log file outside the repo. Its header comes first: check its `model:` and `reasoning effort:` lines before you tell the user it's running. If either is wrong, stop it and start again.
   - Codex's image tool saves into `~/.codex/generated_images/`, and Codex copies each image to the path the brief names, so every brief names exact output paths.
   - **Image inputs** (the owner's references, the picked frame): add `-i <file>` for each, before `-m`, because `-i` takes several files and would swallow the brief. A Facade agent opens them by path instead.
   - **Smoke test first:** ask for one 256×256 image of a red cube on white, saved as `docs/game-spec/concept/_smoke.png`. If the file doesn't appear, Codex can't draw headless on this machine, and this route has failed. If it does, delete it at once: it is a test, not a frame, and `check_spec.py` rejects any stray file in `concept/`, so a leftover blocks the lock. The smoke test is one of the 8 images.
   - **Context between calls:** each `exec` is a fresh session that remembers nothing, so each brief below is complete on its own: it names the files to open and carries the approved brief and the user's words. Don't use `codex exec resume`: in 0.162.1 it takes no `-C` or `--approve-for-me`, and `--last` picks the newest session on this machine, which may be another run's.
3. **Host-only:** you are the art director. Draw the frames and write ART.md yourself, from the same briefs below.
   - Frames must be PNG. If you can generate images (e.g. you are Codex), generate each frame directly at 1280×720 from the board brief and skip the code-rendered mockups below; then continue with the board, the user's pick and ART.md as usual. Otherwise, build each style as a small three.js or HTML mockup of the gameplay moment, open it in a headless browser at 1280×720 (Playwright, Puppeteer, or `chrome --headless --screenshot`), and save the screenshot. If you sketch in SVG, rasterise it to PNG first: the board and the checker take PNG only.
   - For code-rendered mockups, tell the user so, and don't rank them. No image model is used then, so the 8-image cap doesn't bind, but keep to the same counts (3 frames, 2 retries, 1 refinement).

## Board brief (send once)
`<out>` is `docs/game-spec` for the CLI and for host-only mode, and `art-out` for Facade. `<references>` lists each file in `docs/game-spec/owner-refs/` by absolute path, with its role (and whether the owner stated it or it is provisional), its aspect for a taste example, and the owner's words; attach each as an image input. Write "none" when there are none.
Pick the mode line. **Explore**, when the owner gave no direction: `Make <3 by default> concept frames, each a distinct look that suits this pitch (you choose them).` **Close**, when they gave a direction or a literal target: `Make <3 by default> concept frames, each a variant close to the owner's direction and references: <the direction, in their words>. Vary only what they left open, and make the frames visibly different there, so the choice is real.`
```
You are the art director for a 3D browser game built with three.js from code-built geometry (no downloaded models or textures).
Pitch: <the chosen game reading>. Camera: <camera>. Platforms: <devices>. Size: <size>. Feel: <feel, or "choose one that suits the pitch">. User dislikes from Screen 1: <verbatim, or "none stated">.
References from the owner: <references>. A literal target is how the game should look: match its look. A taste example shows only its stated aspect: keep that aspect, and nothing else in it is a requirement.
<the mode line>
Every frame shows the same gameplay moment: <moment>, as an in-game screenshot saved as a 1280×720 PNG, through the <camera> camera, with the game's HUD.
Use only what three.js renders from code (list below). Original designs only. No text except the HUD.
Before you save each frame, compare it with the references by role, and redraw it if it drifted.
Inspect each generated image's size. Before you save it, crop and resize it as needed to a 1280×720 RGB or RGBA PNG, keeping its proportions and the hero and HUD in view, then inspect the exported file.
Save them as <out>/concept/<A|B|C|D>-<style-slug>.png, and write <out>/concept/captions.json:
[{"file": "A-<slug>.png", "letter": "A", "style": "<name>", "line": "<one sentence>", "palette": ["#rrggbb", ...]}]
Reply with one line per frame.
```
Paste the two lists below into the board, retry and refinement briefs.

Every retry and refinement brief repeats the approved game, size, devices, camera, resolved feel (yours, if the user said "You decide"), product language, title, Screen 1's dislikes verbatim, the references with their roles (attached again), the original gameplay moment and both lists below, because a CLI call starts with no memory. Each asks for exactly one new frame.

## Retry brief (a frame failed the check)
First archive the failed frame: move it to `docs/game-spec/rejected/` (add `-try<k>` to its name if that name is taken), and move its entry from `concept/captions.json` to `rejected/captions.json`, adding `"why"`. Both stay outside `concept/`, so neither the board nor the checker ever offers it again.
```
You are the art director for a 3D browser game built with three.js from code-built geometry (no downloaded models or textures).
Approved brief: <game reading>, <size>, <devices>, <camera>, feel: <feel>, product language: <language>, title: <title>.
User dislikes from Screen 1: <verbatim, or "none stated">.
References from the owner: <references>. A literal target is how the game should look; a taste example shows only its stated aspect.
Frame <letter>, "<style name>" ("<its caption line>"), failed the check: <reason, such as drift from a reference>. It is archived at <path of the archived frame>: open and look at it.
Draw exactly one replacement for <letter> in the same style family, fixing that, showing the same gameplay moment: <moment>, as an in-game screenshot through the <camera> camera, with the game's HUD.
Use only what three.js renders from code (list below), and nothing it can't render cheaply (list below). Original designs only. No text except the HUD.
Inspect each generated image's size. Before you save it, crop and resize it as needed to a 1280×720 RGB or RGBA PNG, keeping its proportions and the hero and HUD in view, then inspect the exported file.
Save it as <out>/concept/<letter>-<style-slug>.png, and add its entry, with letter <letter>, to <out>/concept/captions.json. Reply with one line.
```
Update `concept/captions.json` (Facade: copy in only the new frame and its entry, because `art-out/` still holds the failed one), and only then rebuild the board.

## Refinement brief (any change at the Look screen)
When the user's answer is a mix or any other visual change, not just a letter. A refinement is an edit: attach the picked frame (and, for a mix, the other one) as image inputs, with the references.
```
You are the art director for a 3D browser game built with three.js from code-built geometry (no downloaded models or textures).
Approved brief: <game reading>, <size>, <devices>, <camera>, feel: <feel>, product language: <language>, title: <title>.
User dislikes from Screen 1: <verbatim, or "none stated">.
References from the owner: <references>. A literal target is how the game should look; a taste example shows only its stated aspect.
The user picked <letter> and asked: "<their words, verbatim>". Open and look at <out>/concept/<the picked frame's file> (and <the other frame's file> if they mixed two).
Draw exactly one revised frame, as an edit of the picked frame: make that change, and only that change. Keep everything they didn't ask to change as it is in the picked frame: the composition, lighting and colours, the same gameplay moment: <moment>, seen through the <camera> camera, and the HUD. From another frame, take only what they named.
Use only what three.js renders from code (list below), and nothing it can't render cheaply (list below). Original designs only. No text except the HUD.
Inspect each generated image's size. Before you save it, crop and resize it as needed to a 1280×720 RGB or RGBA PNG, keeping its proportions and the hero and HUD in view, then inspect the exported file.
Save it as <out>/concept/R1-<style-slug>.png, and add its entry, with letter R1, to <out>/concept/captions.json. Reply with one line.
```
Compare R1 with the picked frame: only the asked change may differ, so send it back once if anything else moved. Check R1 like any frame (SKILL.md §2), rebuild and reopen the board, and copy R1 to `concept/chosen.png`. ART.md is written only after that.

## ART.md brief (once `concept/chosen.png` is final)
```
Approved brief: <game reading>, <size>, <devices>, <camera>, feel: <feel>, product language: <language>, title: <title>. Keep these choices.
User dislikes from Screen 1: <verbatim, or "none stated">.
References from the owner: <references>. Under "References", name each file, its role and what the build keeps from it.
The approved look is <out>/concept/<the chosen frame's file> (<letter>; the user said: "<their words, or "just the letter">"). Open and look at it, and read <out>/concept/captions.json.
Write <out>/ART.md from this template: <template text>, for exactly that frame. It is 1280×720: measure every px size on it.
End every item with one of four labels. (owner constraint): the owner said it, in words or in a reference. (approved experience goal): the owner was shown it and accepted it, such as what the chosen frame shows, written in words. (provisional design choice): your proposal. (implementation guess): anything inferred from a still image, such as hex colours, sizes on screen, camera, light, fog and shader values. An approved experience goal carries no inferred number. Make each item specific enough to check on a frame or in code.
Under "Avoid", list every dislike above, in the user's words, as owner constraints, then what would break this look, as provisional design choices. Reply when done.
```

## Consistency brief (once SPEC.md is drafted and `concept/chosen.png` is final)
```
Read <the project's docs/game-spec/SPEC.md, by absolute path> and look at <out>/concept/<the chosen frame's file>.
Could ordinary play of this plan plausibly look like this frame? Check content density, camera, scale, run length and performance on <devices>, within what three.js renders from code (lists below). Then the rules: can the plan's own rules produce everything this frame shows (each arrangement, piece and state)? Name anything in the frame that ordinary play under these rules could never produce.
Reply with one line per point: it fits, or the gap and whether the plan or the frame should change. Draw nothing.
```
A frame change goes through the refinement brief, with the gap as the asked change, saved as the next `R<k>`.

## What three.js can render from code (frames may show these)
- Low-poly and stylised geometry: primitives, extrusions, lathes, noise-displaced terrain, instanced repeats.
- Toon and flat shading (gradient maps), rim light, outlines (inverted hull or an outline pass).
- Sky gradients, procedural skies, sun discs, distance fog, simple shadow maps.
- Post-processing: bloom, colour grading, vignette, film grain, tilt-shift, mild depth of field.
- Particles and trails (points, instanced sprites, ribbons); stylised water and clouds from shader noise.
- Textures from the image model or drawn in code: skies, decals, terrain colour, UI.

## What it can't render cheaply (frames must not show these)
- Realistic or detailed organic characters (faces, anatomy, cloth). A stylised mascot built from simple shapes is fine.
- Photographic or physically detailed materials, film-quality depth of field, volumetric light shafts, volumetric clouds.
- Dense unique detail everywhere, such as hand-modelled cities or forests of distinct trees.
- Anything that implies downloaded models or textures.
