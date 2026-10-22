# Brinewick: game spec

<!-- Written by super-pm v0.8.1. The look is defined by ART.md and concept/chosen.png; the owner supplied no references, so there is no owner-refs/. HTML comments are guidance and may stay. This plan is a hypothesis: the build's first playable slice tests it. -->

## Pitch
A cozy harbor-town builder for a calm few minutes: the player clicks the sea to raise docks, houses and bridges, and the town shapes itself around each piece (roofs join, steps and arches appear, boats moor), so every click brings a small surprise.

## Audience
Casual desktop players who enjoy calm, no-fail creative toys: all ages, no reading, reflexes or genre knowledge needed. A session is 2–5 minutes, one sitting to grow a small harbor and keep a postcard of it; players may keep building after the postcard.

## Core loop
- **Next 5 seconds:** hover the sea or a piece and see a soft ghost of what a click will make; click, and the piece springs up while its neighbours re-shape (roofs join, steps, greenery or an arch appear). It feels like poking a living toy.
- **Next 30 seconds:** grow one corner of town on purpose (a row of houses along a quay, a pier with a boat, two blocks joined by a bridge) and see whether the town makes a form it hasn't made before; a new form fills a slot in the discoveries tray with a chime.
- **Whole session:** title over an empty bay → the first click (the one-line hint fades) → a little town spreads across the bay as the player finds the eight forms → the player takes a postcard: the HUD hides, the camera settles into a framed view, and the end screen shows the town as a postcard with "Keep building" and "New bay".

## Challenge and reward
No fail state, no timer, no resources, no score. The challenge is gentle and creative: learning how the town reads its neighbours, then arranging pieces on purpose to coax out the rarer forms. A bridge needs two stone pieces facing each other across a one-cell channel; a courtyard needs a quay closed in by houses on all four sides; a lighthouse needs a three-storey house with no house beside it. The reward is that every click visibly changes the town, each first-time form fills one of eight discoveries with a chime, and the postcard is the keepsake of the town the player made. Finding all eight brings evening, with windows and lanterns lit (a nice-to-have).

## Intended experience
Like arranging a tiny toy harbor on a quiet afternoon: unhurried, soft and a little magical, because the town answers each click with a detail the player didn't place themselves. Nothing to lose, nothing to read, always something new to try.

## Controls and camera
- **Camera:** a tilted overhead perspective camera that orbits the bay. The player can turn it a full circle, tilt it between a steep and a shallow view, and zoom between the whole bay and a close view of a few houses; zoom eases toward the point under the cursor, the orbit centre stays inside the bay, and the camera moves with gentle damping and eases back softly at its limits.
- **Desktop:** hover shows a placement marker and a ghost of what a click will make. Left-click raises the cell under the cursor one step (water → dock → quay → house → second storey → third storey). Right-click (also Ctrl-click, or a two-finger click on a trackpad) lowers it one step. Left-drag orbits (a press that moves more than a few pixels is a drag, never a click); scroll or trackpad pinch zooms. Arrow keys or A/D orbit, W/S zoom. Ctrl/Cmd+Z or the undo button undoes the last change. P or the postcard button takes the postcard; Esc leaves it. M mutes (the title screen also has a sound toggle).
- **Phone:** not supported.

## Content and scope
- **Essential:**
  - One bay: a square grid of buildable water ringed by a low rocky shore on some sides, with open sea beyond; it starts empty.
  - One verb with six steps per cell: water, dock (wooden planks on posts), quay (an open paved stone block), house (a ground storey on a stone terrace a few steps above the quay), second storey, third storey. Right-click lowers a step; undo reverts the last change.
  - The town's forms, re-shaped on every change from each cell's neighbours: **dock** (planks on posts just above the water); **quay** (a paved stone block with bollards on its water edges); **house** (on a raised stone terrace; walls with a door and simple windows); **tall house** (a second or third storey); **row roofs** (houses of the same height that touch in a line share one ridge, corners turn, a house taller than all its house neighbours gets a pyramid roof, and a taller neighbour shows a side wall with a window); **steps** (where a quay meets a house's terrace, or a dock meets a quay, one short flight of steps forms on that edge, at most one flight per edge run so they don't repeat everywhere); **moored boat** (the town ties a small boat along an exposed water edge of a dock, spaced so there is at most one boat per run of docks); **bridge** (a dock with stone pieces, quays or houses, on two opposite sides and water on the other two becomes an arched stone bridge, with water flowing under it); **courtyard** (a quay with houses on all four sides becomes a small paved square with a tree); **lighthouse** (a three-storey house with no house beside it becomes a slim tower with a slowly turning lamp). Small details the town adds by itself: chimneys on some roofs, box shrubs and cypress trees on open quay and terrace corners, lanterns on docks beside houses.
  - A hover ghost that previews the result of a click, including when a click will make a bridge, a courtyard or a lighthouse rather than the plain next step.
  - A discoveries tray of eight silhouettes (dock, quay, house, tall house, steps, bridge, courtyard, lighthouse), each filled in the first time the town makes that form; a slot is never left empty once its form exists in the bay.
  - House colours chosen by the town (varied, never picked by hand), so the town looks lived-in from the first rows.
  - Clear water, as the owner asked: see-through shallows around the town with a visible sandy sea floor, sparse sunken low-poly rocks and dock posts visible below the surface, fading from pale aqua near the town to deep turquoise further out.
  - Ambient life: a softly moving water surface with ripples where pieces meet it, a few gulls circling, moored boats bobbing, chimney smoke puffs.
  - Three screens (title, build, postcard) and synthesised audio.
- **Nice:**
  - Evening falls once all eight discoveries are found: the sky warms and dims, and windows and lanterns light up.
  - The bay is remembered between visits, in the player's own browser.
  - "Save image" on the postcard screen downloads the postcard as a PNG to the player's machine.
- **Out:** money, resources, timers, scores and fail states; quests or townsfolk with wishes; choosing piece types or colours by hand (the town decides); more than one bay; people or characters; phone and touch; online sharing, accounts or uploads.
- **Levels:** one: the bay, a sheltered square-grid harbor that starts as empty water and ends when the player takes a postcard (they may keep building after it).

## Screens
1. **Title:** the empty bay with the camera slowly circling, the title "Brinewick" in lettering drawn for the game, "Click to start" (any click or key starts, and starts the audio) and a small sound toggle.
2. **Build:** the bay with a small, quiet HUD: the discoveries tray along the bottom, and an undo button and a postcard button in the bottom-right corner. A one-line hint, "Click the sea to build", shows until the first click.
3. **Postcard:** the HUD hides, the camera eases to a framed view of the town, and the view becomes a postcard (a border and the title lettering), with "Keep building" and "New bay". "New bay" asks once, in the game's own UI, before it clears the bay.

## Audio
Music: sparse, warm plucked notes in a pentatonic scale over a soft pad, slow and unhurried, over a bed of tide-wash noise with occasional gull calls. Effects: a hollow wooden clack for a dock; a low stone knock for a quay; a soft stone thump with a small bell for a house; a higher thump for each storey; a soft descending whoosh to lower, ending in a small splash on the water; a gentle chime when a bridge, courtyard or lighthouse forms; a three-note chime for a discovery; a muted wooden tick when a piece can't go higher or there is nothing to lower; a reverse swish for undo; a shutter click for the postcard; a faint tick on HUD hover. All synthesised in the browser with Web Audio; no downloaded audio. Sound starts on the first click or key (browser rule), and M or the sound toggle mutes it.

## Constraints
- Original names, characters and art. No downloaded models, textures, fonts or audio: all geometry is built in code, and images come from the art director's pipeline or from code.
- Product language: English. Every string in the game is in this language.
- Nothing is published, uploaded or pushed unless the owner asks.

## Tech
three.js 0.186 + TypeScript 5.9 + Vite 8, with a static build in `dist/`.

## Acceptance
<!-- What must be true of the finished game, never how to test it: test recipes, harnesses and detectors are the build team's plan. -->
- [goal] A1: From the title screen, a player can grow a harbor town anywhere in the bay with one click verb (water to dock to quay to house to taller house), lower any piece with right-click, undo changes, and end on the postcard screen, with no timer, resources, score or fail state.
- [goal] A2: The town shapes itself: every change re-shapes the clicked cell and its neighbours, the rules produce every form in the plan (dock, quay, house, tall house, row roofs, steps, moored boat, bridge, courtyard, lighthouse), and the hover ghost shows what a click will make before it is made.
- [goal] A3: Every player action answers visibly and audibly at once, in every state: a springy rise or sink, a wiggle when a piece can't go higher, a ripple when there is nothing to lower, a shake of the undo button when there is nothing to undo; and the game stays calm, with no pop-ups, timers or alarms.
- [goal] A4: The discoveries tray fills a slot with a chime the first time the town makes each form, and a first-time player can find all eight within one 2–5 minute session.
- [goal] A5: In motion, the bay looks like concept/chosen.png as ART.md describes it (its style, light and palette), with moving water, circling gulls and bobbing boats.
- [platform] A6: It runs in current desktop Chrome, Safari and Firefox with a mouse or a trackpad, in windows from 1280×720 to 2560×1440, from a static build with no downloaded assets.
- [perf] A7: With every cell in the bay built, it stays smooth (about 60 frames per second) on a typical recent laptop with integrated graphics, and each click's change starts on the next frame.
- [owner] A8: The owner plays the final build in a desktop browser and accepts its looks and feel.

## Uncertainties
- The one-verb height rule (water → dock → quay → house → storeys) may feel like micromanaging rather than "the town shapes itself", and three clicks to a house may feel slow; the ghost preview and the neighbour re-shaping must carry the magic. The first playable slice should put it in front of a first-time player.
- Neighbour-aware meshes (joined roofs, corners, steps and arches across every height combination) are the biggest build risk: seams and odd roofs show at close zoom.
- The rarer forms (bridge, courtyard, lighthouse) may be too hard to stumble on in 2–5 minutes, or too easy; their rules may need tuning against that goal.
- The chosen look's rendering (outlines, soft shadows, the water shader) may cost too much on laptop integrated graphics with a full bay.
- A strict square grid may look more rigid than the frame; small per-house variation (roof pitch, colour, window placement) may be needed.

## Consistency review
- **Content density:** fits: the frame shows a few dozen cells (about ten house volumes plus open quays and docks) with generous open water, which a 2–5 minute session builds; stone joints and plank seams are decoration, never extra build cells.
- **Camera:** fits the adjustable orbit at a close-town zoom; the frame reads toward the shallow end of the tilt range, so the default view is tuned from the frame, not from a nominal angle.
- **Scale:** fits: one-cell houses, low docks, raised quays and terraces, one to three storeys and a one-cell channel produce this silhouette; the build grid stays coarser than the decorative seams.
- **Run length:** fits: the pictured town takes about 60–90 raise clicks, plausible in 2–5 unhurried minutes; finding all eight discoveries in that time (the courtyard and lighthouse especially) stays a playtest risk under Uncertainties.
- **Performance:** plausible, unproven: the look needs merged or instanced repeats, a capped pixel ratio, one sun shadow pass, simple seabed geometry and water tinted by depth (no realistic refraction, screen-space reflections or caustics); the frame has no outlines, so no outline pass. A full bay on a laptop is under Uncertainties.
- **Rules:** changed both: the plan gained the quay step (open paved stone with steps up to house terraces), corner greenery, pyramid roofs on houses taller than their neighbours, and boats moored along a dock's water edge rather than only at a dock's tip; the frame (R2) fills the bridge slot in the tray, because a built bridge always fills it. The rear three-storey tower has a house beside it, so it is not a lighthouse and that slot stays empty; the build's reconstruction of this town keeps that adjacency.
- **Feedback:** changed the frame: R2 adds the ghost dock inside the hovered square, which the plan promises. Every action answers visibly in every state: a raise springs up, a lower sinks (with a splash back to water), a raise at three storeys wiggles with a muted tick, a lower on open water makes a ripple and a tick, undo with nothing to undo shakes its button, a click outside the bay makes a ripple or a puff of dust where it lands, a drag turns the camera, and a first-time form fills its tray slot with a chime.

## Provenance
- **Owner constraints** (change only with the owner): the pitch, verbatim: "A cozy harbor-town builder: click the sea to raise houses, docks and bridges, and the town shapes itself around what you build."; Size: Jam (one polished level, 2–5 minutes of play); Devices: Desktop (a desktop browser, with mouse, trackpad or keyboard); the look: frame A, Salt & Apricot, with "more cristal", clarified as "Clear water" (see-through shallows: the sandy sea floor and rocks show through the water near the town, fading to deeper colour further out); the pinned stack, original-only art and the no-downloads rule; nothing published.
- **Approved experience goals** (change only with the owner, unless they delegated it): the game reading "Free-build harbor" as presented (every few seconds the player clicks the sea or a block to raise a piece, the town picks house, dock, stairs or bridge from its neighbours, and the player is after the next little surprise the town makes); the look of concept/chosen.png (R2: R1, the owner's clear-water edit of A, with the two consistency fixes), in words in ART.md; the Lock line.
- **Provisional design choices** (the build team may change them, logging material changes): the feel (the owner said "You decide": cozy, calm and tactile); English as the product language (the default); the six-step height rule, right-click lowering and undo; the forms and their neighbour rules; the small details the town adds; the hover ghost; the discoveries tray; the postcard ending; the camera and controls; the screens; the audio plan; the title; ART.md's provisional items.
- **Implementation guesses** (the build team tunes them freely): the bay's grid size (about 16 by 16 cells) and shore layout; three storeys as the cap; camera tilt and zoom limits; animation timings and springiness; how the town assigns house colours; gull, boat and smoke counts; every number in ART.md.

## Title
Brinewick. Alternatives considered: Lantern Quay, Tidewright.

## Decisions
<!-- One row per question asked or skipped, one for the title, a "PM session" row and, after the lock, a "Lock" row. -->
| # | Question | Answer | Source | What it changed |
|---|---|---|---|---|
| 1 | Game: which version is closest? | Free-build harbor (Recommended) | owner | The core loop: free building with one raise verb, neighbour-shaped forms, no wishes or ferry limits. |
| 2 | Size | Jam (Recommended): one polished level, 2–5 minutes of play | owner | One bay; the session arc and the discoveries tray are sized to 2–5 minutes. |
| 3 | Devices | Desktop (Recommended) | owner | Mouse and trackpad controls; no touch; the performance goal targets laptops. |
| 4 | Feel | You decide | owner | The PM resolved it as cozy, calm and tactile; the art director chose each look's mood. |
| 5 | Art director | Codex gpt-6.1-sol, xhigh (Recommended) | owner | Codex drew the board and wrote ART.md through Facade. |
| 6 | Camera (not asked) | Tilted overhead orbit camera | context | The builder's gameplay decided it; stated in the opening. |
| 7 | Product language (not asked) | English | default | Every string is English; no memory named another language. |
| 8 | Owner references (not asked) | None supplied | context | No owner-refs/; the board explored distinct looks. |
| 9 | Look (frames A: Salt & Apricot, B: Ink & Tide, C: Lantern Blue) | First answer, typed: "I want more cristal." Asked which frame and what should be more crystal: "A: Salt & Apricot" and "Clear water" (see-through shallows: the sandy sea floor and rocks show through the water near the town, fading to deeper colour further out) | owner | The art director edited A into R1 (clear water, nothing else changed); R1 became concept/chosen.png. |
| 10 | Look follow-up (asked because the typed answer named no frame and "cristal" was ambiguous) | See row 9 | PM | One extra question beyond the fixed screens, logged here. |
| 11 | Title (not asked) | Brinewick (alternatives: Lantern Quay, Tidewright) | PM | Names the game and the postcard; the owner can rename it at the lock. |
| 12 | PM session | 2026-10-20 13:49 to 14:22 PDT; 6 images generated (frames A, B, C, an extra simplification pass on A, R1, R2), no smoke test (Facade route); meters at start: Claude session 63%, week (all models) 9%, week (Fable) 0%, Codex week 1%; at end: Claude session 74%, week (all models) 10%, week (Fable) 0%, Codex week 1% | measured | The shared spec cost: the build reports it apart from its own. |
| 13 | Lock | Lock it: "Brinewick: Free-build harbor · Jam · Desktop · A: Salt & Apricot, clear water · open risks: the one-click height rule may feel like micromanaging rather than the town shaping itself (+4 more)" | owner | The spec is locked; the build starts from it. |

### Changes after lock
- 2026-10-20 (build): Contextual control tips after the first hint: "Right-click (or Ctrl-click) to lower a piece" when a cell first reaches the cap, and "Drag to turn the view · scroll to zoom" after the first few pieces; each fades once used. A small "?" controls card sits beside the sound toggle. (Provisional screens/hint choice; from the R1 review: the audience needs no genre knowledge, and the spec taught only the first click.)
- 2026-10-20 (build): Discovery cues: a first-time form sends a spark from where it formed to its tray slot; a bridge, courtyard or lighthouse sparkles and shows a golden marker when it forms; hovering a filled slot marks where that form stands; an unfound slot's hover tip names a short recipe. (Provisional discoveries-tray choice; from R1: the enclosed courtyard was easy to miss.)
- 2026-10-20 (build): Clear water is drawn as turquoise across the bay that clears to pale aqua over warm sand around whatever is built, over a soft, irregular sandy shelf. (Implementation within the owner's clear-water constraint.)
- 2026-10-20 (build): A boat moors at runs of two or more docks (a single dock gets none), and the title screen adds a short line under the lettering, "a little harbor that builds itself". (Implementation guess; provisional screens choice.)
- 2026-10-20 (build): Title keys: any key starts, and a start key never also presses a focused control, so the sound choice made on the title survives the start. (Provisional screens choice; from the R3 review.)
- 2026-10-20 (build): The orbit camera keeps above the rooftops around it: zooming or tilting into a dense town tilts the view up instead of dropping among the walls. (Implementation guess on camera limits; from R3.)
- 2026-10-20 (build): Tray tips for the rarer forms (courtyard, bridge, lighthouse, steps) show a small top-down 3x3 diagram of the needed arrangement in the game's colours, and a filled slot keeps its recipe and diagram (a little quieter) for rebuilding. (Provisional discoveries-tray choice; from the R4 and R5 reviews.)
