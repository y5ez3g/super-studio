# <Title>: art direction

<!-- Written by the art director for concept/chosen.png. Replace every <...>, including each <label>. Every item is a "- " bullet, or a table row, that ends in one of four labels, because the build team's rights depend on it:
(owner constraint): the owner said it, in words or in a reference;
(approved experience goal): the owner was shown it and accepted it, such as what the chosen frame shows, written in words;
(provisional design choice): the art director's or the PM's proposal;
(implementation guess): a number or detail inferred from a still image, such as hex colours, sizes on screen, camera, light, fog and shader values.
An approved experience goal never carries an inferred number. Be specific enough to check each item on a frame or in code. Write N/A for a section that doesn't apply. -->

## Look
- <What the chosen frame shows, in words: the style, the mood, and what makes it distinct> (approved experience goal)

## References
<!-- One bullet per file in owner-refs/: its role, and what the build keeps from it. N/A when the owner supplied none. -->
- <owner-refs/file: literal target, or taste example for its stated aspect; what the build keeps from it> (owner constraint)

## Palette
| Role | Hex | Label |
|---|---|---|
| <role> | <#rrggbb> | implementation guess |
| <role> | <#rrggbb> | implementation guess |

## Shapes and shading
- <How chunky or smooth the geometry is, the shading, any outlines, texture rules> (<label>)

## Light and atmosphere
- <The light, sky and atmosphere, in words> (<label>)
- <Their values: directions, colours, fog or post-processing strengths, or "none"> (implementation guess)

## Camera and composition
- <The camera type, and what is framed where> (<label>)
- <Camera numbers and sizes on screen, measured at 1280×720> (implementation guess)

## Motion and effects
- <How things move, and what the effects look like> (<label>)
- <Durations, counts and strengths> (implementation guess)

## UI and type
- <HUD layout, menu style, and type: a system font stack or lettering drawn for this game; no downloaded fonts> (<label>)

## Audio mood
- <Three words and a tempo> (<label>)

## Avoid
<!-- The owner's dislikes first, in their words. Then what would break this look. -->
- <each dislike, in the owner's words> (owner constraint)
- <what would break this look> (provisional design choice)
