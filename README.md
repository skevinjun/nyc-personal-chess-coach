# nyc-personal-chess-coach

Interactive chess coach to up-level the user's chess game. Careful- he's a former chess hustler and may have an attitude (but a kind heart).

## What it does

- **Play 1:1** against Stockfish at five strengths, from "Park rookie" to full strength.
- **A coach with attitude**: half Washington Square hustler, half tough-love boxing trainer. Lines rotate so they don't repeat.
- **The coach talks**: every move, warning, hint and result is read aloud. With an OpenAI key in Settings, OpenAI's `gpt-4o-mini-tts` voices him as a gravelly old New York boxing trainer (about 1.5¢ per minute of speech); without one, the most natural browser voice is used. The key stays in your browser. Mute button under the board.
- **Captured pieces and points lead** above and below the board (pawn 1, knight 3, bishop 3, rook 5, queen 9).
- **Every move gets a verdict** (Best, Excellent, Good, Inaccuracy, Mistake, Blunder) with a plain-English reason: what your move did, how the opponent punishes it, and what was better, with the main line.
- **Heads-up warnings** on your turn when one of your pieces is hanging.
- **Two-step hints**: first which piece to look at, then the move.
- **Claude coaching (optional)**: paste your own Anthropic API key in Settings and Claude adds a short note to every move, pitched at a ~1200 player and grounded in the engine's lines. The key stays in your browser's localStorage and is sent only to api.anthropic.com.
- **Homework**: every mistake or blunder you make is saved as a drill, next to a few classic patterns (back-rank mate, f7, knight fork, smothered mate). The engine judges your answer, so any equally good move counts.

Everything runs in the browser. Stockfish 19 (lite, single-threaded WASM) lives in `public/engine/` and runs in a web worker, so there is no server and no API key. Homework is kept in `localStorage`.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for the coach logic
npm run build    # static site in dist/
```

## Deploy

`.github/workflows/deploy.yml` runs the tests on every PR and publishes `dist/` to GitHub Pages on every push to `main`. One-time setup: in the repo's Settings → Pages, set Source to "GitHub Actions". (Pages on a private repo needs a paid GitHub plan; otherwise make the repo public. No secrets live in the code.)

## Layout

| File | What it does |
| --- | --- |
| `src/coach.ts` | Grades moves (win-percentage drop, same curve Lichess uses) and writes the explanations. Pure, unit tested. |
| `src/engine.ts` | Promise wrapper around the Stockfish worker (UCI). |
| `src/uci.ts` | Parses engine output. |
| `src/board.ts` | Click-to-move board with legal-move dots and promotion picker. |
| `src/persona.ts` | The coach's lines, drawn without repeats. |
| `src/speech.ts` | Text-to-speech, including saying moves in words ("knight takes e5, check"). |
| `src/material.ts` | Captured pieces and the points tally. |
| `src/claudeCoach.ts` | Optional Claude-written explanations (prompt + API call). |
| `src/assignments.ts` | Homework store and the classic puzzles. |
| `src/main.ts` | Wires the game, coach feed, hints and drills together. |

Stockfish is GPLv3; its license is in `public/engine/COPYING-stockfish.txt`.
