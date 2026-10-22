# Brinewick: art direction

## Look

- Salt & Apricot is a sun-warmed, pastel toy harbor: cream and peach houses, broad apricot roofs, honey timber docks, sandy stone quays, and crystalline aqua water. The town is the visual focus; the bay remains spacious and calm. (approved experience goal)
- The visual target is `concept/chosen.png`, the approved clear-water frame with the bridge discovery filled and the dock preview visible; its source is `concept/R2-salt-and-apricot-clear-water.png`, the owner's clear-water edit of frame A (R1) with the two consistency fixes. (approved experience goal)
- Keep the owner's clear-water request: see-through shallows reveal the sandy sea floor and submerged rocks near the town, fading to deeper color farther out. (owner constraint)
- Keep the free-build harbor readable as a small, tactile construction toy: docks, open quays, houses, joined roofs, steps and a water-spanning arch remain recognizable at the normal play distance. (approved experience goal)
- Build original geometry in code, with no downloaded models, textures, fonts or audio. (owner constraint)

## References

- N/A. (owner constraint)

## Palette

| Role | Screenshot color sample or starting color | Label
|---|---|---
| Deeper open water | `#119cc8` | (implementation guess)
| Clear aqua water above the shallow sand | `#9ddbb5` | (implementation guess)
| Cream house wall in soft shade | `#dcbb9c` | (implementation guess)
| Pale sunlit plaster | `#fde8b7` | (implementation guess)
| Peach plaster | `#e6af82` | (implementation guess)
| Sun-facing apricot roof | `#fda561` | (implementation guess)
| Darker terracotta roof face | `#e77c47` | (implementation guess)
| Lit sandy stone | `#fcdebc` | (implementation guess)
| Stone in warm shade | `#b8a08f` | (implementation guess)
| Sunlit dock planks | `#e79954` | (implementation guess)
| Dark timber posts | `#54351e` | (implementation guess)
| Recessed windows | `#466f61` | (implementation guess)
| Cypress and box-shrub green | `#556e2b` | (implementation guess)
| HUD ivory | `#faf2e7` | (implementation guess)
| Undiscovered icon gray | `#a7a5a7` | (implementation guess)
| Undo and camera icon ink | `#6e6d6d` | (implementation guess)

- These are rendered-image samples, including light and water tint, rather than mandatory material albedos. Match their relationships on a rendered frame; tune base materials with lighting. (implementation guess)

## Shapes and shading

- Architecture has broad flat planes, simple shaded side faces, subtly softened edges and clean silhouettes. Roofs are uninterrupted triangular or pyramid planes, with sparse chimneys; walls have simple recessed rectangular windows and rounded door openings. (approved experience goal)
- Timber docks use plain plank strips and square posts; the underwater continuation of the posts is visible. Quays use large stone blocks and restrained paving seams. The bridge has a clear arch opening with water visible beneath it. (approved experience goal)
- Houses share roof ridges where the plan's neighbor rules join them. Different heights expose plain side walls; the tallest roof forms make a varied skyline. Stone terraces and short stairs explain the height changes between buildings, quays and docks. (approved experience goal)
- The shoreline and submerged rocks are faceted primitive forms. Greenery is limited to tapered cypress-like forms and boxy shrubs on corners; the boat is a simple hull, small cabin and sparse rigging. (approved experience goal)
- Use flat or softly diffuse shading, small geometric edge bevels where useful, and soft contact shadows. Keep materials matte and the surface detail subordinate to the building shapes. (provisional design choice)
- Render the shallow sand shelf beneath a transparent water surface; blend its visibility into a richer depth tint. Use sparse low-poly submerged rocks, broad low-contrast seabed variation and a few surface dashes. Keep the sandy shelf submerged. (provisional design choice)
- Use ordinary shadowing, vertex colors and simple procedural variation for depth. A separate outline pass and downloaded detail maps are unnecessary for this target. (provisional design choice)
- Reconstruct decorative stone joints and plank seams within build cells; do not turn every visible seam into another gameplay cell. Keep a house beside the rear tall pyramid-roof building so it remains a tall house under the lighthouse rule. (provisional design choice)

## Light and atmosphere

- The scene reads as a bright, gentle coastal afternoon. Warm lit walls and roofs sit against cooler aqua water, with soft readable shadows and no dramatic haze obscuring the bay. (approved experience goal)
- Distant shore fragments frame the upper corners; open water continues between them. Clear shallow water surrounds the town and transitions into deeper turquoise toward the open foreground and bay mouth. (approved experience goal)
- Start with a warm directional sun and broad neutral-warm ambient fill. Tune sun position so roof planes, wall sides, dock posts and the arch stay distinct; the still does not establish a unique world-space light direction. (implementation guess)
- Start with a sun elevation of 55°, ambient strength 0.65 and directional strength 2.0; treat these as renderer-dependent tuning values. Use one 2048 × 2048 shadow map for the town, then benchmark the full bay before increasing it. (implementation guess)
- Start with no bloom, no depth of field, no vignette, no film grain and no visible fog. Keep the sand readable through the water using depth tint and simple transparency, without screen-space reflections or simulated photographic caustics. (implementation guess)
- Optional evening, if implemented after all discoveries, should preserve the same geometry, clear shallow-water readability and quiet UI while adding warmer windows. It is an extension of the plan rather than a replacement for this daylight target. (provisional design choice)

## Camera and composition

- Use a perspective orbit view with visible roof planes and building sides. The harbor sits above the screen's middle, the shoreline frames the upper edges, and a broad foreground of water separates the town from the quiet bottom HUD. (approved experience goal)
- The reference composition has two house-and-quay clusters connected across an open channel, timber docks wrapping their water edges, a boat at the left dock, and placement feedback on open water at the front-right edge. (approved experience goal)
- Match this composition at a close-town zoom while allowing ordinary play to orbit, tilt and zoom around different constructions. The bay starts empty; the reference town is a possible mid-session arrangement. (provisional design choice)
- All screen measurements below use the actual 1280 × 720 px RGB export, with the origin at the upper-left. Solid-fill and visible-ink bounds exclude soft shadows and faint antialiasing; they are matching guides rather than hidden interaction bounds. (implementation guess)
- The marker and cursor together occupy approximately x = 998–1117 px and y = 435–485 px, a 120 × 51 px footprint; the dock ghost stays inside the marker while the pointer overlaps its lower-right edge. (implementation guess)
- The marker's projected grid edges suggest a relatively shallow camera. Start with a depression of 25°, a diagonal yaw of 45° and a perspective field of view of 40°; adjust distance and tilt until the cell projection and building scale match the frame. These values cannot be uniquely recovered from the still. (implementation guess)
- Frame the town so the bridge opening, stair flights, boat, underwater rocks and posts remain separable. Keep the hover preview above the HUD and leave open water between the architecture and the discovery tray. (approved experience goal)

## Motion and effects

- The dock preview is translucent honey-colored wood within a pale grid-aligned placement outline; the cursor remains legible over it. A neighboring fresh dock and a restrained water ripple communicate a recent placement. (approved experience goal)
- A click starts the piece's visible rise immediately, with a soft spring and gentle neighbor reshaping. Lowering sinks the piece; the last step into water ends with a small ripple or splash. (provisional design choice)
- Start the raise with a 320 ms spring, 6% height overshoot and full settling by 550 ms; lower over 250 ms. Begin on the next animation frame and shorten the settling tail if rapid clicks stack. These timings are animation guesses, not measurements from the still. (implementation guess)
- Start the ghost opacity at 0.4 and keep its plank gaps and short posts visible; use the same geometry as the next predicted dock form so the preview corresponds to the click result. (implementation guess)
- Use slow low-amplitude water motion, small contact ripples, bobbing moored boats and circling gulls. Chimney smoke, when present under the plan, should be sparse pale puffs that leave roof silhouettes clear. (provisional design choice)
- Start with boat bobbing at 0.02 cell heights over a 4 s cycle, tide displacement at 0.015 cell heights over 12 s, ripple fade over 900 ms and at most 3 gulls; tune from motion and performance rather than treating the still as evidence of these values. (implementation guess)
- Keep response visible in boundary states: a capped house wiggles, a lower on empty water ripples, empty undo shakes its button, and out-of-bay clicks receive a small ripple or dust response according to the surface. (provisional design choice)

## UI and type

- The HUD is an ivory rounded discovery tray at bottom center with small dimensional silhouettes, plus separate ivory circular undo and camera buttons at bottom right. It remains quiet enough for the harbor and clear water to dominate. (approved experience goal)
- In this pictured state, dock, quay, house, tall house, steps and bridge are warm filled discoveries; courtyard and lighthouse remain muted gray. Preserve this state in comparison screenshots, and fill discoveries from actual gameplay in the running game. (approved experience goal)
- The visible ivory tray fill spans x = 377–901 px and y = 613–674 px, measuring 525 × 62 px with a 45 px gap below it. Its broad center is near x = 639 px. (implementation guess)
- Visible discovery glyphs measure 20–42 px wide and 23–41 px high, with approximately 64 px horizontal spacing. Their left-to-right visible-ink boxes are dock 38 × 29 px, quay 37 × 31 px, house 34 × 29 px, tall house 30 × 41 px, steps 37 × 33 px, bridge 42 × 23 px, courtyard 39 × 37 px and lighthouse 20 × 38 px. (implementation guess)
- The undo disk's visible fill spans x = 1129–1175 px and y = 628–675 px, measuring 47 × 48 px. The camera disk spans x = 1194–1239 px and y = 628–675 px, measuring 46 × 48 px. Their centers are approximately 65 px apart, with a 40 px right margin and 44 px bottom margin. (implementation guess)
- Use a simple curved-arrow undo symbol and a compact camera symbol, centered within their disks. Keep a light soft shadow beneath the tray and buttons and fine neutral separators between discovery slots. (approved experience goal)
- The reference build frame contains no visible text. Keep English for the game's strings, with only the plan's brief first-click hint, accessible control labels and concise menu actions when those states need them. (provisional design choice)
- Draw the Brinewick title lettering for the game using code paths, and use `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` for readable menu text. No downloaded fonts. Menu lettering and postcard details are proposals because those screens are absent from the chosen frame. (provisional design choice)
- Carry the ivory, warm ink and rounded controls into the title and postcard screens; hide build HUD controls in the postcard view and use the plan's Keep building and New bay actions. (provisional design choice)
- Keep desktop mouse, trackpad and keyboard operation available; a hovered element gets a clear gentle response without covering the town with a persistent instruction panel. (provisional design choice)

## Audio mood

- Warm, airy, unhurried: sparse pentatonic plucked notes, a soft pad, tide wash and occasional gull calls; wooden clicks and stone knocks are short and quiet, with small chimes for discoveries. Synthesize the sound in the browser under the plan. (provisional design choice)
- Start at 60 BPM with sparse notes and generous silence; make discovery chimes brief enough that consecutive placements stay calm. Tempo and effect envelopes are implementation starting points. (implementation guess)

## Avoid

- Avoid opaque water that conceals the sandy shallows, submerged rocks or underwater dock posts; this would erase the defining clear-water refinement. (provisional design choice)
- Avoid exposed dry sand around the town, crystalline jewel structures, dense underwater vegetation or crowded rocks that obstruct the placement area. (provisional design choice)
- Avoid tiled roof detail, dense architectural ornament, detailed characters, realistic surface maps and unique handmade clutter across every cell. (provisional design choice)
- Avoid dark outlines, dramatic bloom, volumetric light shafts, photographic reflections, busy caustics, grain and blur that compete with the simple pastel shapes. (provisional design choice)
- Avoid a flat overhead map view, a rigid orthographic presentation, or a camera framing that hides the bridge opening and stairs behind the houses. (provisional design choice)
- Avoid oversized HUD panels, saturated alarm colors, scores, timers, toast messages and instructions that distract from the unhurried building loop. (provisional design choice)
- Avoid copying the still's discovery state blindly into every session: the bridge must be discovered whenever present, and an isolated tall lighthouse must show its lamp and fill its own slot according to the rules. (provisional design choice)
