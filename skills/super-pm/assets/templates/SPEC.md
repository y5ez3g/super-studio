# <Title>: game spec

<!-- Written by super-pm v0.8.1. The look is defined by ART.md and concept/chosen.png; the owner's own references are in owner-refs/. Replace every <...>; HTML comments are guidance and may stay. Every section needs content (write N/A if one truly doesn't apply), because check_spec.py rejects empty sections. This plan is a hypothesis: the build's first playable slice tests it. -->

## Pitch
<One sentence: who the player is, what they do, and why it's fun.>

## Audience
<Who plays it, on which devices, and how long a session lasts.>

## Core loop
- **Next 5 seconds:** <the player's actions, and what they feel>
- **Next 30 seconds:** <the small goal that repeats>
- **Whole session:** <the arc from the start to the end screen>

## Challenge and reward
<What makes it hard, how that grows, and what the player earns.>

## Intended experience
<What playing it should feel like, in terms the owner would recognise.>

## Controls and camera
- **Camera:** <chase, top-down, side-on or first-person, and how it follows>
- **Desktop:** <keys and mouse>
- **Phone:** <touch scheme, or "not supported">

## Content and scope
- **Essential:** <what the first version can't ship without>
- **Nice:** <what to add only once the essentials play and look right>
- **Out:** <what this game deliberately doesn't do>
- **Levels:** <how many, one line each>

## Screens
<The screens, in order.>

## Audio
<Music mood and the sound effects. Synthesised in the browser with Web Audio; no downloaded audio.>

## Constraints
- Original names, characters and art. No downloaded models, textures, fonts or audio: all geometry is built in code, and images come from the art director's pipeline or from code.
- Product language: <English>. Every string in the game is in this language.
- Nothing is published, uploaded or pushed unless the owner asks.

## Tech
three.js 0.186 + TypeScript 5.9 + Vite 8, with a static build in `dist/`.

## Acceptance
<!-- What must be true of the finished game, never how to test it: test recipes, harnesses and detectors are the build team's plan. Every line is exactly: - [kind] A<n>: statement. A dash bullet, no indentation, single spaces, a unique id. Kinds: goal (the experience or content the game delivers), platform (devices, browsers, input, screen sizes), perf (a performance level the platform and the play genuinely need), owner (the owner's hands-on acceptance). Write requirements, not wishes: keep only what would make the owner reject the game if it failed. -->
- [goal] A1: <The core loop works from the start to the end screen: what a player can do and finish>
- [goal] A2: <The intended experience, as the owner would recognise it in play>
- [platform] A3: <The devices, browsers, input and screen sizes it must run on>, from a static build with no downloaded assets.
- [perf] A4: <The performance the play needs on those devices>
- [owner] A5: The owner plays the final build on <devices> and accepts its looks and feel.

## Uncertainties
<!-- The major open questions and remaining risks: what the plan assumes and nobody has seen yet. The build should test the biggest ones early. -->
- <the risk, and what would show it>

## Consistency review
<!-- With the art director, once chosen.png and this plan exist: can ordinary play of this plan plausibly look like the frame, can the plan's own rules produce everything the frame shows, and does every player action answer visibly each time it's used? Say what fits, and what you changed in the plan or the frame where it couldn't. Real feasibility is for the build to prove. -->
- **Content density:** <what fits, or what you changed>
- **Camera:** <what fits, or what you changed>
- **Scale:** <what fits, or what you changed>
- **Run length:** <what fits, or what you changed>
- **Performance:** <what fits, or what you changed>
- **Rules:** <whether the plan's rules can produce everything the frame shows (each arrangement, piece and state), or what you changed>
- **Feedback:** <whether every action answers visibly each time (where a rule makes one do nothing, what the player sees), or what you changed>

## Provenance
<!-- What the build team may change. Approval attaches only to what the owner was shown and accepted (the screens' answers, the chosen frame, the Lock line), never to every detail written here. ART.md labels each of its items with the same four kinds. -->
- **Owner constraints** (change only with the owner): <what the owner said: answers, references, dislikes>
- **Approved experience goals** (change only with the owner, unless they delegated it): <what was presented and accepted: the game reading, the look of chosen.png>
- **Provisional design choices** (the build team may change them, logging material changes): <the PM's and the art director's proposals>
- **Implementation guesses** (the build team tunes them freely): <inferred numbers and details, such as speeds, sizes and ART.md's guesses>

## Title
<The chosen title>. Alternatives considered: <two others>.

## Decisions
<!-- One row per question asked or skipped (for the look: the frames shown, the one chosen, the owner's words), one for the title (the PM's pick, or the owner's rename at the lock), a "PM session" row (start and end time, images generated, meter readings at start and end, or "unknown"), and, after the lock, a "Lock" row: the Lock line as shown, and who approved it. Source is owner, proxy (provisional) (anyone who answered for the owner), PM, context (the pitch or the owner's references answered it), memory, default or measured. Never record a proxy as the owner. -->
| # | Question | Answer | Source | What it changed |
|---|---|---|---|---|
| 1 | <question> | <answer> | owner | <its effect on the spec> |
| 2 | PM session | <start time to end time; images generated; meters at start and end, or "unknown"> | measured | The shared spec cost: the build reports it apart from its own. |

### Changes after lock
<!-- Dated lines: what changed, why, and who approved it. Empty until the build starts. -->
