# Sundown Fold: game spec

<!-- Written by super-pm v0.8.1. The look is defined by ART.md and concept/chosen.png; the owner's own references are in owner-refs/. Replace every <...>; HTML comments are guidance and may stay. Every section needs content (write N/A if one truly doesn't apply), because check_spec.py rejects empty sections. This plan is a hypothesis: the build's first playable slice tests it. -->

## Pitch
The player is a paper plane racing the setting sun through a floating archipelago at golden hour: they steer with the mouse, ride warm updrafts to climb, and thread glowing lantern gates that each buy back a little daylight, and when dusk falls (or the last gate is threaded) the flight ends on a postcard of the route they flew. It's fun because gliding is effortless to control but the falling sun turns every gate into a small, graceful decision: dive for speed, or climb for the line.

## Audience
Casual players and game-jam visitors in a desktop browser, using a mouse or trackpad. One session is a single flight of 2–5 minutes, then a postcard; players replay to thread more gates and finish with more daylight to spare.

## Core loop
- **Next 5 seconds:** move the mouse to bank and pitch the plane toward the next live lantern gate, trading height for speed in a dive or nosing into a shimmering updraft to climb. The plane answers at once, with a paper-light bank and soft trails off the wingtips.
- **Next 30 seconds:** thread a gate (the lantern flares, a chime rings and the daylight meter gains time, so the sun lifts a little), spot the next gate and the updraft that will carry you to it, and keep enough height, because the plane always sinks slowly.
- **Whole session:** launch off a cliff at golden hour; follow an 18-gate course that winds west toward the sun through the islands while the light deepens from gold to rose to violet; the flight ends at the final lantern arch (with daylight to spare) or at dusk, and the postcard shows the archipelago from above with your route inked across it.

## Challenge and reward
- **What's hard:** the plane only glides, so height is the resource: every climb needs speed or an updraft, and the course places gates above, below and behind islands so the player must plan which updraft to ride. The sun sinks all the time, so a missed gate is daylight never bought back.
- **How it grows:** the first gates sit in a straight, open line with an updraft right beside them; later gates bend around islands, sit high enough to need an updraft, or thread through rock arches, and the last third is spaced so a player who missed gates runs out of daylight before the final arch.
- **Gate rules:** gates are numbered along the course. Only the live gate (the one the chevron marks) scores; the next few gates stay lit, smaller, in the distance so the route reads ahead. A gate counts as missed when the plane passes it outside its ring, or threads a later gate first: then every skipped gate is missed, and the gate just threaded scores and becomes the current one. A missed gate drains to a muted state, and the chevron moves on, so the player never has to turn back.
- **Penalties are soft, never a sudden end:** clipping an island bounces the plane off with a tumble and a loss of speed; dipping into the sea of clouds below makes a gust toss the plane back up to safe height and costs a few seconds of daylight. Only dusk (or the final gate) ends the flight.
- **Height ceiling:** above a soft ceiling the air thins: lift fades, so the plane can't climb over the whole course. At the ceiling the reticle's upward travel compresses, a soft wind arc shows above the nose and the updraft motes turn sideways, so the lost climb has a visible cause.
- **Reward:** each threaded gate adds daylight, and threading one through its glowing centre adds a little more, with a brighter flare and a higher chime. A run of consecutive gates climbs a rising scale of chimes. The postcard records gates threaded, centre threads, flight time, distance and daylight left, next to the player's best (kept in this browser only).

## Intended experience
Graceful, floaty gliding with gentle urgency. The flight feels like a paper plane caught in warm evening air: smooth swoops, lifts that feel like a breath, and a sky that keeps getting more beautiful as time runs out. The sinking sun is a soft clock rather than an alarm. The pressure comes from the light changing, not from crashes or harsh failure. The ending is a keepsake: a postcard of exactly where you flew.

## Controls and camera
- **Camera:** chase camera behind and slightly above the plane, following with smooth lag, leaning a little into banks and widening its view slightly with speed. At the end it takes over and pulls up and away from the plane before the postcard.
- **Desktop:** the cursor's position relative to the screen centre steers: left and right bank and turn, up and down pitch (mouse up = nose up by default, with an invert option in the pause menu). A small reticle shows the steering input whenever it changes and fades out during steady flight (the approved frame shows none), with a dead zone in the middle so the plane flies straight. Arrow keys or WASD steer as an alternative. Click, Space or Enter starts; Esc or P pauses; the game also pauses when the window loses focus.
- **Phone:** not supported.

## Content and scope
- **Essential:** the paper plane with glide, dive and climb handling; one archipelago course with 18 lantern gates in order, about 12 course islands, 6 updrafts and a sea of clouds below, plus a non-colliding scenery layer (repeated distant islands, hazy horizon silhouettes, detached rock shards and sparse cone trees) that fills the view as the chosen frame does; the sinking sun tied to remaining daylight, with sky and light shifting from gold to dusk; gate threading with daylight gain and a centre-thread bonus; soft island bounces and cloud-dip recovery; the ending (final arch, or dusk) and the postcard with the recorded route and stats; title, flight HUD, pause, end and postcard screens; synthesised audio; a best result saved in this browser.
- **Nice:** a button that saves the postcard as an image to the player's own computer; a faint ghost line of the best route on the postcard; a short lantern-release celebration when the final arch is threaded with daylight to spare; updrafts that weaken slightly as dusk approaches.
- **Out:** more than one level, phone and touch controls, gamepad, multiplayer, online leaderboards or any upload or sharing, plane customisation, story or characters, procedurally generated courses, weather, collectibles other than gates.
- **Levels:** one: the Ember Isles, an 18-gate course winding west toward the setting sun through floating islands, rock arches and updrafts, from a launch cliff to a final lantern arch.

## Screens
1. **Title:** the plane resting on the launch cliff at golden hour, the game title, "Click to fly", one line of controls ("Move the mouse to steer · Esc to pause") and the best result so far.
2. **Flight:** the chase view with the HUD: a daylight meter (how much sun is left, with "+7s"-style gains floating up when a gate is threaded), the gate count (such as 7/18), and a pale chevron above the live gate (or at the screen edge, pointing toward it, when it is off screen). A steering reticle appears while the input changes.
3. **Pause:** over the frozen flight: Resume, Restart, Invert pitch (on/off), Sound (on/off).
4. **Ending:** at the final arch, the lanterns flare and the camera pulls up into the sunset; at dusk, the sun slips below the clouds, the lanterns keep glowing and the camera pulls up into the twilight. Steering is handed to the camera here.
5. **Postcard:** a postcard of the archipelago seen from above, with the route as an inked dashed line, threaded gates as bright marks and missed gates as faded ones, a stamp, the stats next to the best, and "Fly again" (straight back into a new flight, with no reload).

## Audio
Synthesised in the browser with Web Audio; no downloaded audio. Music: a slow, warm pad in a major key that drifts toward softer, darker chords as dusk approaches. Effects: a wind bed whose brightness follows speed; a soft chime for each gate, stepping up a pentatonic scale for consecutive gates, with an extra sparkle for a centre thread; a low muted note when a gate is missed; a rising whoosh entering an updraft; a paper crinkle on an island bounce; a gust and muffled hush for a cloud dip; a bell at dusk; a stamp thud on the postcard. Sound can be turned off in the pause menu.

## Constraints
- Original names, characters and art. No downloaded models, textures, fonts or audio: all geometry is built in code, and images come from the art director's pipeline or from code.
- Product language: English. Every string in the game is in this language.
- Nothing is published, uploaded or pushed unless the owner asks.

## Tech
three.js 0.186 + TypeScript 5.9 + Vite 8, with a static build in `dist/`.

## Acceptance
- [goal] A1: From the title screen a player can launch, steer the paper plane with the mouse through the whole 18-gate course, thread gates, ride updrafts to climb, reach an ending (the final arch or dusk), see the postcard and fly again without reloading the page.
- [goal] A2: The race against the sunset is felt in play: the sun visibly sinks and the light shifts toward dusk during the flight, every threaded gate visibly buys back daylight, and a missed gate visibly costs the chance to.
- [goal] A3: Penalties are soft: bumping an island or dipping into the clouds costs speed or daylight but never ends the flight; only dusk or the final gate does.
- [goal] A4: The postcard shows the archipelago from above with the route the player actually flew, which gates were threaded and which were missed, and the run's stats next to the best.
- [goal] A5: Every player action answers visibly and audibly each time it happens: steering, threading a gate (and its centre), missing one, entering an updraft, hitting the height ceiling, bumping an island and dipping into the clouds.
- [goal] A6: The game in motion reads as the look of concept/chosen.png, as ART.md describes it, from golden hour through to dusk.
- [platform] A7: It runs in current desktop Chrome, Edge, Firefox and Safari, in windows from 1280×720 to 2560×1440, played with a mouse or trackpad, or with the keyboard, from a static build with no downloaded assets.
- [perf] A8: Flight stays smooth at about 60 frames per second on a typical laptop with integrated graphics at 1920×1080, with no visible hitch when gates flare, updrafts appear, the light changes or the postcard opens.
- [perf] A9: The title screen is interactive within 5 seconds of opening the page from the static build on a broadband connection.
- [owner] A10: The owner plays the final build on a desktop browser and accepts its looks and feel.

## Uncertainties
- Steering by cursor position may feel twitchy on a trackpad or tiring over a 3–5 minute flight; the first playable slice should be tried with both a mouse and a trackpad before the course is built out.
- The daylight balance (starting daylight, time per gate, centre bonus, cloud-dip cost) decides whether this is a race or a stroll; a good run should finish the final arch with only a little daylight left, and a run with several misses should end at dusk before it.
- Reading gate depth and updraft positions from a chase camera in warm, low-contrast golden light may be hard, and it gets harder as the light fades to dusk; gates and updrafts must stay readable in every light the flight passes through.
- The look is approved at one moment of golden hour; the sky and light change continuously, and nobody has yet seen whether the chosen look holds at rose and violet dusk.
- The top-down postcard must look like a keepsake when rendered from code, not like a debug map.
- Many islands, bloom, fog and the cloud-sea shader together may be heavy for integrated graphics.

## Consistency review
<!-- Reviewed with the art director (Codex gpt-6.1-sol, xhigh) against concept/chosen.png (frame A). Every gap was closed in the plan; the frame is unchanged. Real feasibility is for the build to prove. -->
- **Content density:** fits once the plan allows a scenery layer: the frame shows far more land than 12 course islands, so the plan now adds non-colliding repeated distant islands, horizon silhouettes, rock shards and sparse cone trees around the course islands (plan changed).
- **Camera:** fits: a chase camera behind and slightly above the plane, with restrained lag, roll and speed widening, produces this bank and open corridor; tune it to ART.md's measured plane, gate and horizon bounds.
- **Scale:** fits: the close plane, the larger but farther lantern ring and the receding gates are a plausible perspective; world sizes are tuning guesses, with clear space kept around the live gate.
- **Run length:** fits: an 18-gate route over 2–5 minutes can show several gates ahead at once, as the frame does; space the route by flight time, not by distances read off the image. The starting daylight budget (75 s plus gate gains) is a guess for the first playtest.
- **Performance:** plausible but unproven on integrated graphics: instanced low-poly islands and trees, a cheap layered cloud surface (no volumetric or ray-marched clouds), pooled ribbons and motes, simple nearby shadows and bloom limited to lanterns, ribbons and trails; avoid heavy transparent overdraw. Listed under Uncertainties.
- **Rules:** the plan's rules can produce everything in the frame (gate 7 of 18 live with a chevron, three later gates lit in the distance, an updraft beside an island, the sun low over the clouds, the daylight meter part full). Two rules were made explicit to match it: later gates stay lit while only the chevron-marked gate scores, and the steering reticle fades during steady flight (plan changed).
- **Feedback:** gaps closed in the plan: the height ceiling now has a visible response (compressed reticle, wind arc, sideways motes); threading a later gate first scores it and marks the skipped ones missed instead of doing nothing; the reticle shows while steering, including keyboard steering; updraft motes persist while the plane is inside; island and cloud contacts answer every time without stacking full-screen flashes; with sound off every response stays visible; at the ending, steering cues are removed as the camera takes over. Every response must stay readable in gold, rose and violet light (plan changed).

## Provenance
- **Owner constraints** (change only with the owner): the pitch's own words: a paper plane, a floating archipelago at golden hour, mouse steering, warm updrafts to climb, glowing lantern gates to thread, and a flight that ends on a postcard of the route; Jam size (one polished level, 2–5 minutes); desktop only.
- **Approved experience goals** (change only with the owner, unless they delegated it): the game reading "Race the sunset" (thread a gate course against the setting sun; each gate buys a little more daylight; the flight ends at dusk); the chase camera behind the plane and English text, both stated in the opening and accepted; the look of concept/chosen.png as ART.md describes it in words; the Lock line.
- **Provisional design choices** (the build team may change them, logging material changes): the resolved feel (graceful, floaty gliding with gentle urgency), since the owner said "You decide"; soft penalties instead of crashes; the gate rules (only the chevron-marked gate scores, later gates stay lit, threading a later gate first misses the skipped ones); the fading steering reticle; the scenery layer; the centre-thread bonus and the rising chimes; the sun's height tied to remaining daylight; the final lantern arch as an early finish; the height ceiling and its visible response; the postcard's contents; the screens, the pause options and the controls beyond the mouse; the audio design; the course layout (18 gates, about 12 islands, 6 updrafts, heading west into the sun); the title; ART.md's provisional choices.
- **Implementation guesses** (the build team tunes them freely): speeds, sink rate, updraft lift, the height ceiling, daylight numbers (a guess to start from: 75 s of starting daylight, +7 s per gate, +3 s more for a centre thread, −5 s for a cloud dip), gate and island sizes, distances, camera offsets and lag, the frame-rate and load-time figures in Acceptance, and every number and colour in ART.md.

## Title
Sundown Fold. Alternatives considered: Last Light Glide, Lantern Dusk.

## Decisions
| # | Question | Answer | Source | What it changed |
|---|---|---|---|---|
| 1 | Game: which version is closest? | Race the sunset: thread a gate course against the setting sun; each gate buys a little more daylight, and the flight ends at dusk | owner | The core loop: daylight as the clock, gates as the way to buy it back, dusk as the ending |
| 2 | Size | Jam: one polished level, 2–5 minutes of play | owner | One course (the Ember Isles) of 18 gates; daylight sized for a 2–5 minute flight |
| 3 | Devices | Desktop: a desktop browser, with mouse, trackpad or keyboard | owner | Mouse-position steering with keyboard fallback; phone and touch are out |
| 4 | Feel | You decide | owner | The PM resolved it as graceful, floaty gliding with gentle urgency and soft penalties; shown in the looks |
| 5 | Art: who draws the looks and writes the art direction? | Codex gpt-6.1-sol, xhigh | owner | Codex drew the style board and wrote ART.md through Facade |
| 6 | Product language (not asked) | English | default | Every string in the game is English |
| 7 | Camera (not asked) | Chase camera behind the plane | context | The pitch's mouse-steered flight implies it; stated in the opening |
| 8 | References (not asked) | None supplied | context | No owner-refs/; the art director explored three distinct looks |
| 9 | Look: which look should the game have? | Shown A: Amber Archipelago, B: Paperlight Diorama, C: Lantern Afterglow (board.html); chose A: Amber Archipelago, with no changes ("A: Amber Archipelago") | owner | concept/chosen.png is frame A unchanged; ART.md describes it |
| 10 | Title (not asked) | Sundown Fold (alternatives: Last Light Glide, Lantern Dusk) | PM | The game's name; the owner can rename it at the lock |
| 11 | PM session | 2026-10-21 21:13 to 21:27 (-07:00), ending at the lock; 3 images generated (3 frames, no smoke test, retries or refinement); meters at start: Claude session 60%, Claude week (all models) 62%, Claude week (Fable) 0%, Codex week 44%; at end: Claude session 64%, Claude week (all models) 63%, Claude week (Fable) 0%, Codex week 44% | measured | The shared spec cost: the build reports it apart from its own. |
| 12 | Lock | Lock it: "Sundown Fold: race the sunset · Jam · Desktop · A: Amber Archipelago · open risks: cursor steering may feel twitchy on a trackpad (+5 more)" | owner | The spec is locked; the build starts from it, and later changes are logged below |

### Changes after lock
