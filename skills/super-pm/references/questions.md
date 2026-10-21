# The questions, word for word

The PM says and asks these in this order and with this wording, because they are what the user sees. `<…>` is filled in for the game at hand; everything else is fixed. Ask nothing else, and skip a question the pitch, the owner's references or memory already answers (Decisions logs it with Source `context`). State no duration anywhere (the opening, the options, the lock): nothing has been measured yet, so the Size options give play length only.

## How a screen is shown
- **Claude Code:** one multiple-choice prompt per screen, with the headers as given (at most 12 characters) and each option as a label and a description. Claude Code adds its own "Type something." to every question, and it can't carry a description, so a question's typed-answer hint is part of its text below ("Or type …").
- **Codex:** the same questions and options as numbered lists, one message per screen. Such a question's text ends before "Or type …", and its typed answer is the last numbered item, worded as given under it (`Other: …`).
- **Models** come from `scripts/detect_env.py`: `<model>` is its newest listed sol model (`recommend.art_director` on a Claude Code host, `recommend.pm` on a Codex host).

## Opening (a statement, not a question)
Say the variant for this host:
- **Claude Code, Codex ready** (`ask_art` is true):
  > Checked this Mac: Claude Code and Codex are ready. New repo, so I'll set it up here. Text in <language>, <camera>. A few questions, then you pick one of the looks.
- **Claude Code, no Codex** (`ask_art` is false):
  > Checked this Mac: Claude Code is ready. New repo, so I'll set it up here. Text in <language>, <camera>. Codex isn't set up here, so I'll draw the looks as code-rendered mockups.
- **Codex host** (`--host codex`):
  > Checked this Mac: Codex is ready. New repo, so I'll set it up here. Text in <language>, <camera>. I'll write the spec and draw the looks myself (<model>, xhigh).

- `<language>`: the product language from memory, else English. Never ask it.
- `<camera>`: the camera the pitch implies, said plainly (`camera behind the plane`). When the gameplay can't decide it, end the sentence at `Text in <language>.` and ask Camera on Screen 2.
- `New repo, so I'll set it up here.` is for an empty folder. In this game's existing repo, say `This is the game's repo, so I'll work here.` In any other folder, say `This folder holds other work, so I'll set it up in ./<working-title>/.`

## Screen 1: the game
1. **Game:** Which version is closest to what you have in mind?
   - `<Reading 1> (Recommended)`: <what the player does every few seconds, and what they're after>
   - `<Reading 2>`: <the same, for this reading>
   - `<Reading 3>`: <the same, for this reading>
2. **Size:** How big should the first version be?
   - `Jam (Recommended)`: One polished level, 2–5 minutes of play.
   - `Small`: Three levels and a finale, 10–15 minutes of play.
3. **Devices:** Which devices should it run on?
   - `Desktop (Recommended)`: A desktop browser, with mouse, trackpad or keyboard.
   - `Desktop and phone`: Adds touch controls and a tighter rendering budget.
4. **Feel:** How should it feel? Or type up to 3 games it should feel like, and anything you dislike.
   - `You decide`: I'll choose from the pitch and show it in the looks.
   - `<feel A>`: <what playing it is like>
   - `<feel B>`: <what playing it is like>
   - Codex: `Other: up to 3 games it should feel like, and anything you dislike.`

The readings are 2–3 concrete takes on your gameplay draft (SKILL.md §1): "steer a paper plane through rings" beats "an arcade flyer". Each "(Recommended)" has a reason: the first reading is closest to the user's own words, one polished level beats three rough ones, and this Mac can't measure phone performance.

## Screen 2: the art director (only on a Claude Code host with Codex ready)
Ask it only when `detect_env.py` reports `ask_art` true. Otherwise skip it: a Claude Code host without Codex draws code-rendered mockups, and a Codex host draws the looks itself.

5. **Art:** Who draws the looks and writes the art direction?
   - `Codex <model>, xhigh (Recommended)`: The newest Codex model on this Mac; generates in-game concept frames.
   - `Codex <model>, high`: Same model at lower effort; uses less Codex quota.
   - `Claude, no Codex`: Code-rendered mockups instead of generated images.

Start the art director only after this answer, with the model and effort chosen here (a typed answer names its own; `Claude, no Codex` means host-only mode). Check both once it runs (Facade `read_screen`, or the `model:` and `reasoning effort:` lines of the `codex exec` header), then say: `The art director is running as Codex <model> at <effort>; I checked both. While it draws the looks, I'll write the spec.`

**Camera,** only when the gameplay can't decide it, goes first on this screen; without Screen 2, it is a screen of its own:
- **Camera:** Which camera should the game use?
  - 2–3 cameras that suit the chosen version (chase, top-down, side-on, first-person), each `<Camera>`: <what the player sees>. Mark one "(Recommended)" only with a reason from the gameplay.

## Switch line (only when this session's model or effort is off)
This session writes the spec, so it runs Claude opus at xhigh on Claude Code, and `<model>` at xhigh on Codex. Your model is in your system prompt and your effort in your terminal header. If either is off, end the turn after the screens above (with the art director already started) with your host's line, word for word, and wait:
- Claude Code: `Before I write the spec: type /model opus, then /effort xhigh, then continue.`
- Codex: `Before I write the spec: type /model, pick <model> at xhigh, then continue.`

After "continue", check again.

## Screen 3: the look
Once the board is open (SKILL.md §2):

6. **Look:** Which look should the game have? The board is open in your browser. Or type a mix: say what to take from each.
   - `A: <name>`: <the frame's caption line>
   - `B: <name>`: <the frame's caption line>
   - `C: <name>`: <the frame's caption line>
   - Codex: `Other: Mix them: say what to take from each.`

Add `D: <name>` when the board has four frames. No "(Recommended)": the look is the user's taste.

## Screen 4: lock
Once `check_spec.py` passes (SKILL.md §3), and with no summary before it:

7. **Lock:** Lock the spec? The build team starts from it.
   - `Lock it`: <Title>: <game reading> · <size> · <devices> · <look> · open risks: <the top one> (+<k> more)
   - `Change something`: Tell me what, and I'll ask again.

For example: `Skyfold: checkpoint race · Jam · Desktop · A: Apricot Diorama · open risks: the cloud field may be too heavy for laptops (+2 more)`. The top risk is the first line of SPEC.md's Uncertainties, in a few words, and `+<k> more` counts the rest; with none, say `open risks: none`. There is no title question: you pick the title, and the user renames it here. On `Change something` or a typed answer, make the change, run `check_spec.py` again, and ask Lock again.

## After the lock
Once the commit is made and the art director has stopped (SKILL.md §4), say, word for word:

`Locked: docs/game-spec/ is committed as "spec: <title>", and the art director has stopped. Any build team can start from docs/game-spec/SPEC.md.`

When you were your own art director (no Codex, `Claude, no Codex`, or a Codex host), leave out `, and the art director has stopped`.

## Never asked
| Not asked | Instead |
|---|---|
| Product language | Memory, else English; stated in the opening |
| Camera | The gameplay decides it; asked only when it can't |
| Title | You pick it; the user renames it at the lock |
| CLIs, logins, models, meters | `detect_env.py` |
| References and their roles | Taken from the pitch and attachments; the role from the owner's words, else recorded as provisional |
| Who approved | Recorded in Decisions: owner, or proxy (provisional) when someone answered for them |
| How long it will take | Never stated: nothing has been measured |
