# nyc-personal-chess-coach

Interactive chess coach to up-level the user's chess game. Careful- he's a former chess hustler and may have an attitude (but a kind heart).

## What it does

- **Play 1:1** against Stockfish at five strengths, from "Park rookie" to full strength.
- **Every move gets a verdict** (Best, Excellent, Good, Inaccuracy, Mistake, Blunder) with a plain-English reason: what your move did, how the opponent punishes it, and what was better, with the main line.
- **Heads-up warnings** on your turn when one of your pieces is hanging.
- **Two-step hints**: first which piece to look at, then the move.
- **Homework**: every mistake or blunder you make is saved as a drill, next to a few classic patterns (back-rank mate, f7, knight fork, smothered mate). The engine judges your answer, so any equally good move counts.

Everything runs in the browser. Stockfish 19 (lite, single-threaded WASM) lives in `public/engine/` and runs in a web worker, so there is no server and no API key. Homework is kept in `localStorage`.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for the coach logic
npm run build    # static site in dist/
```

## Layout

| File | What it does |
| --- | --- |
| `src/coach.ts` | Grades moves (win-percentage drop, same curve Lichess uses) and writes the explanations. Pure, unit tested. |
| `src/engine.ts` | Promise wrapper around the Stockfish worker (UCI). |
| `src/uci.ts` | Parses engine output. |
| `src/board.ts` | Click-to-move board with legal-move dots and promotion picker. |
| `src/assignments.ts` | Homework store and the classic puzzles. |
| `src/main.ts` | Wires the game, coach feed, hints and drills together. |

Stockfish is GPLv3; its license is in `public/engine/COPYING-stockfish.txt`.
