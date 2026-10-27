import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { CLASSICS } from "../src/assignments";
import { classify, findHanging, hintNudge, reviewMove, threatWarnings, winPercent } from "../src/coach";
import type { PvLine } from "../src/uci";

const line = (pv: string[], score: PvLine["score"], multipv = 1): PvLine => ({ multipv, depth: 14, score, pv });

describe("winPercent / classify", () => {
  it("is 50 at equality and symmetric", () => {
    expect(winPercent(0)).toBeCloseTo(50);
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100);
  });

  it("grades by how much winning chance was thrown away", () => {
    expect(classify(0, true)).toBe("best");
    expect(classify(3, false)).toBe("excellent");
    expect(classify(12, false)).toBe("inaccuracy");
    expect(classify(25, false)).toBe("mistake");
    expect(classify(45, false)).toBe("blunder");
  });
});

describe("findHanging", () => {
  it("flags an undefended piece and a piece attacked by something cheaper", () => {
    // White knight on e5 undefended, attacked by the d6 pawn; white queen d4 attacked by the c5 pawn.
    const chess = new Chess("4k3/8/3p4/2p1N3/3Q4/8/8/4K3 w - - 0 1");
    const squares = findHanging(chess, "w").map((h) => h.square);
    expect(squares).toEqual(["d4", "e5"]);
  });

  it("ignores a defended piece attacked by an equal piece", () => {
    const chess = new Chess("4k3/8/8/3n4/8/2N5/1P6/4K3 w - - 0 1");
    expect(findHanging(chess, "w")).toEqual([]);
  });
});

describe("reviewMove", () => {
  const backRank = "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1";

  it("praises the best move", () => {
    const r = reviewMove(backRank, "d1d8", [line(["d1d8"], { mate: 1 })], null);
    expect(r.verdict).toBe("best");
    expect(r.san).toBe("Rd8#");
    expect(r.lines.join(" ")).toMatch(/checkmate/);
  });

  it("calls out a blunder, explains the refutation and the better move", () => {
    // White to move with the queen on d4; Qxa7 walks into ...Rxa7.
    const fen = "r3k3/p7/8/8/3Q4/8/8/4K3 w - - 0 1";
    const before = [line(["d4h8", "e8e7"], { cp: 900 }), line(["d4a7", "a8a7"], { cp: -500 }, 2)];
    const after = line(["a8a7"], { cp: 500 });
    const r = reviewMove(fen, "d4a7", before, after);
    expect(r.verdict).toBe("blunder");
    const text = r.lines.join(" ");
    expect(text).toMatch(/Rxa7 and win your queen on a7/);
    expect(text).toMatch(/Better was Qh8\+/);
    expect(r.bestSan).toBe("Qh8+");
  });

  it("reports an allowed mate", () => {
    // The engine numbers are made up; the point is how a mate-against line is worded.
    const after = line(["g8f8", "d2d8", "f8e7"], { mate: 3 });
    const r = reviewMove(backRank, "d1d2", [line(["d1d8"], { mate: 1 })], after);
    expect(r.verdict).toBe("blunder");
    expect(r.lines.join(" ")).toMatch(/allows mate in 3/);
  });
});

describe("threats and hints", () => {
  it("warns about an attacked piece on your turn", () => {
    const chess = new Chess("4k3/8/3p4/4N3/8/8/8/4K3 w - - 0 1");
    expect(threatWarnings(chess)[0]).toMatch(/knight on e5 is attacked by the pawn on d6/);
  });

  it("nudges toward the right piece without naming the move", () => {
    const fen = "r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1";
    const nudge = hintNudge(fen, "d5c7");
    expect(nudge).toMatch(/knight on d5/);
    expect(nudge).not.toMatch(/c7/);
  });
});

describe("classic homework", () => {
  it.each(CLASSICS)("$title has a legal FEN and solution", (a) => {
    const chess = new Chess(a.fen);
    const move = chess.move({ from: a.solution.slice(0, 2), to: a.solution.slice(2, 4) });
    expect(move).toBeTruthy();
  });

  it("mate puzzles really end in mate", () => {
    for (const id of ["classic-back-rank", "classic-scholars", "classic-smothered"]) {
      const a = CLASSICS.find((c) => c.id === id)!;
      const chess = new Chess(a.fen);
      chess.move({ from: a.solution.slice(0, 2), to: a.solution.slice(2, 4) });
      expect(chess.isCheckmate(), id).toBe(true);
    }
  });
});
