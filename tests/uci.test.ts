import { describe, expect, it } from "vitest";
import { parseBestMove, parseInfo } from "../src/uci";

describe("parseInfo", () => {
  it("reads depth, multipv, cp score and pv", () => {
    const info = parseInfo(
      "info depth 12 seldepth 18 multipv 2 score cp -34 nodes 120000 nps 900000 time 130 pv e7e5 g1f3 b8c6",
    );
    expect(info).toEqual({ multipv: 2, depth: 12, score: { cp: -34 }, pv: ["e7e5", "g1f3", "b8c6"] });
  });

  it("reads mate scores and skips bound markers", () => {
    const info = parseInfo("info depth 5 score mate 1 lowerbound nodes 10 pv d1d8");
    expect(info?.score).toEqual({ mate: 1 });
    expect(info?.pv).toEqual(["d1d8"]);
  });

  it("ignores lines without a pv", () => {
    expect(parseInfo("info string NNUE evaluation enabled")).toBeNull();
    expect(parseInfo("info depth 3 currmove e2e4 currmovenumber 1")).toBeNull();
  });
});

describe("parseBestMove", () => {
  it("returns the move or null", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toBe("e2e4");
    expect(parseBestMove("bestmove (none)")).toBeNull();
  });
});
