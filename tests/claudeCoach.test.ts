import { describe, expect, it } from "vitest";
import { buildPrompt, type MoveFacts } from "../src/claudeCoach";

const facts: MoveFacts = {
  playerRating: 1200,
  playerColor: "White",
  pgn: "1. e4 e6 2. Qh5 d5",
  fenBefore: "rnbqkbnr/ppp2ppp/4p3/3p3Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 0 3",
  moveNo: 3,
  san: "Bc4",
  verdict: "blunder",
  winBefore: 45,
  winAfter: 5,
  bestSan: "d3",
  bestLine: ["d3", "Nf6", "Qe2"],
  replyLine: ["dxc4"],
  notes: ["The problem: they answer dxc4 and win your bishop on c4."],
};

describe("buildPrompt", () => {
  it("gives Claude the engine facts it is allowed to talk about", () => {
    const p = buildPrompt(facts);
    expect(p).toContain("rated about 1200");
    expect(p).toContain("Student played: 3. Bc4");
    expect(p).toContain("from 45% to 5%");
    expect(p).toContain("Engine's best move was d3. Line: d3 Nf6 Qe2");
    expect(p).toContain("after the student's move: dxc4");
  });

  it("leaves out the better-move line when the student found it", () => {
    const p = buildPrompt({ ...facts, san: "d3", verdict: "best", replyLine: [] });
    expect(p).not.toContain("best move was");
    expect(p).not.toContain("continuation");
  });
});
