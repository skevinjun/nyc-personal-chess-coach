import { describe, expect, it } from "vitest";
import { material } from "../src/material";
import { LINES, say } from "../src/persona";
import { sanToSpeech, toSpeech } from "../src/speech";

describe("say", () => {
  it("uses every line before repeating one", () => {
    const n = LINES.blunder.length;
    const seen = new Set(Array.from({ length: n }, () => say("blunder")));
    expect(seen.size).toBe(n);
  });
});

describe("speech", () => {
  it("reads moves the way a coach would say them", () => {
    expect(sanToSpeech("Nxe5+")).toBe("knight takes e5, check");
    expect(sanToSpeech("exd5")).toBe("e pawn takes d5");
    expect(sanToSpeech("e8=Q#")).toBe("e8 promotes to queen, checkmate");
    expect(sanToSpeech("O-O")).toBe("castles kingside");
    expect(sanToSpeech("Rad1")).toBe("rook a to d1");
    expect(sanToSpeech("R1xe4")).toBe("rook 1 takes e4");
  });

  it("turns moves inside sentences into words", () => {
    expect(toSpeech("The problem: they answer dxc4 and win your bishop on c4. Better was <b>d3</b>.")).toBe(
      "The problem: they answer d pawn takes c4 and win your bishop on c4. Better was d3.",
    );
  });
});

describe("material", () => {
  it("lists captures and the points lead with queen = 9", () => {
    // White is missing a knight; Black is missing its queen and a pawn.
    const m = material("rnb1kbnr/ppp1pppp/8/8/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1");
    expect(m.captured.w).toEqual(["q", "p"]);
    expect(m.captured.b).toEqual(["n"]);
    expect(m.diff).toBe(7);
  });
});
