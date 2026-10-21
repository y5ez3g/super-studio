# AGENTS.md: <Title>

Read this before touching the code. The spec is in `docs/game-spec/`: SPEC.md is the brief, ART.md with concept/chosen.png defines the look, and owner-refs/ holds the owner's own references, each with its role.

## Stack (pinned)
three.js 0.186, TypeScript 5.9, Vite 8. Install `three` from npm and import it as a module. Never add CDN `<script>` tags or code written for old releases (global `THREE`, `THREE.Geometry`).

## Rules
- No downloaded models, textures, fonts or audio. Geometry is built in code; images come from the art director's pipeline or from code.
- Every string in the game is in <product language>.
- Don't edit `docs/game-spec/` to make a check pass. Owner constraints and approved experience goals (SPEC.md Provenance) change only with the owner's OK. Provisional design choices and implementation guesses are yours to change: log the material ones under "Changes after lock".
- Never push, publish or deploy.

<!-- The three.js guidance is condensed from three.js docs/llms.txt (MIT licence). -->
