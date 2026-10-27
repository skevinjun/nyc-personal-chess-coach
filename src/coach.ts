// The coach's brain: turns engine numbers into a verdict and plain-English advice.
// Everything here is pure so it can be unit tested without an engine.

import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import type { PvLine, Score } from "./uci";

export type Verdict = "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

/** Collapse a score to centipawns, treating a forced mate as a huge advantage. */
export function scoreToCp(score: Score): number {
  if (score.mate !== undefined) {
    if (score.mate === 0) return -10000; // side to move is already mated
    return Math.sign(score.mate) * (10000 - Math.abs(score.mate) * 10);
  }
  return score.cp ?? 0;
}

/** Chance of winning (0-100) for a centipawn edge; same curve Lichess uses for accuracy. */
export function winPercent(cp: number): number {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

export function classify(winDrop: number, playedBest: boolean): Verdict {
  if (playedBest || winDrop <= 1) return "best";
  if (winDrop < 4) return "excellent";
  if (winDrop < 10) return "good";
  if (winDrop < 20) return "inaccuracy";
  if (winDrop < 30) return "mistake";
  return "blunder";
}

export function uciToMove(fen: string, uci: string): Move | null {
  try {
    const chess = new Chess(fen);
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
}

/** Convert the first `max` moves of a UCI principal variation to SAN. */
export function pvToSan(fen: string, pv: string[], max = 6): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    try {
      out.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}

export function formatScore(score: Score, perspective: Color, sideToMove: Color): string {
  const sign = perspective === sideToMove ? 1 : -1;
  if (score.mate !== undefined) {
    const m = score.mate * sign;
    return m > 0 ? `mate in ${m}` : `getting mated in ${-m}`;
  }
  const pawns = ((score.cp ?? 0) * sign) / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

export interface Hanging {
  square: Square;
  piece: PieceSymbol;
  attackers: Square[];
}

/**
 * Pieces of `color` that the opponent can win right now: attacked and undefended,
 * or attacked by something cheaper. Simple, but it catches the bread-and-butter blunders.
 */
export function findHanging(chess: Chess, color: Color): Hanging[] {
  const them: Color = color === "w" ? "b" : "w";
  const out: Hanging[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== color || cell.type === "k") continue;
      const attackers = chess.attackers(cell.square, them);
      if (attackers.length === 0) continue;
      const defenders = chess.attackers(cell.square, color);
      const cheapest = Math.min(...attackers.map((sq) => PIECE_VALUE[chess.get(sq)!.type]));
      if (defenders.length === 0 || cheapest < PIECE_VALUE[cell.type]) {
        out.push({ square: cell.square, piece: cell.type, attackers });
      }
    }
  }
  return out.sort((a, b) => PIECE_VALUE[b.piece] - PIECE_VALUE[a.piece]);
}

/** One plain sentence about what a move does on the board. */
export function describeMove(move: Move): string {
  const piece = PIECE_NAME[move.piece];
  const parts: string[] = [];
  if (move.san.startsWith("O-O-O")) parts.push("castles queenside");
  else if (move.san.startsWith("O-O")) parts.push("castles kingside");
  else if (move.captured) parts.push(`${piece} takes the ${PIECE_NAME[move.captured]} on ${move.to}`);
  else parts.push(`${piece} to ${move.to}`);
  if (move.promotion) parts.push(`promotes to a ${PIECE_NAME[move.promotion]}`);
  if (move.san.endsWith("#")) parts.push("checkmate");
  else if (move.san.endsWith("+")) parts.push("with check");
  return parts.join(", ");
}

const VOICE: Record<Verdict, string[]> = {
  best: [
    "That's the move. Even I'd have played it.",
    "Engine's top choice. Don't let it go to your head.",
    "Clean. That's how you take a man's lunch money.",
  ],
  excellent: ["Strong move. Nearly as good as the best.", "Solid. No complaints from this side of the table."],
  good: ["Playable. There was something a little sharper.", "Fine, but you left a bit on the table."],
  inaccuracy: [
    "Inaccuracy. Not a disaster, but a real player punishes that.",
    "Loose. You're giving away little edges, and little edges add up.",
  ],
  mistake: [
    "That's a mistake. In the park that costs you five bucks.",
    "Mistake. You had better, and you know it.",
  ],
  blunder: [
    "Blunder. I used to make my rent off moves like that.",
    "Oof. That's a blunder. Sit up straight and look at the board.",
    "Blunder. Slow down. Checks, captures, threats. Every move.",
  ],
};

export function voiceLine(verdict: Verdict, seed: string): string {
  const lines = VOICE[verdict];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return lines[Math.abs(h) % lines.length];
}

export interface MoveReview {
  verdict: Verdict;
  san: string;
  bestSan: string | null;
  /** Win chance for the mover, 0-100, before and after the move. */
  winBefore: number;
  winAfter: number;
  lines: string[];
}

/**
 * Judge a move.
 * @param before engine lines for the position before the move (mover to play), best first.
 * @param after  engine's top line for the position after the move (opponent to play).
 */
export function reviewMove(fenBefore: string, uci: string, before: PvLine[], after: PvLine | null): MoveReview {
  const board = new Chess(fenBefore);
  const mover = board.turn();
  const move = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const best = before[0];
  const bestUci = best?.pv[0] ?? null;
  const bestMove = bestUci ? uciToMove(fenBefore, bestUci) : null;
  const playedBest = bestUci === uci;

  const cpBefore = best ? scoreToCp(best.score) : 0;
  let cpAfter: number;
  if (board.isCheckmate()) cpAfter = 10000;
  else if (board.isDraw()) cpAfter = 0;
  else cpAfter = after ? -scoreToCp(after.score) : cpBefore;
  if (playedBest) cpAfter = Math.max(cpAfter, cpBefore);

  const winBefore = winPercent(cpBefore);
  const winAfter = winPercent(cpAfter);
  const verdict = classify(winBefore - winAfter, playedBest);

  const lines: string[] = [voiceLine(verdict, fenBefore + uci)];
  lines.push(`You played ${move.san}: ${describeMove(move)}.`);

  if (verdict === "inaccuracy" || verdict === "mistake" || verdict === "blunder") {
    const reply = after?.pv[0] ? uciToMove(board.fen(), after.pv[0]) : null;
    if (after?.score.mate !== undefined && after.score.mate > 0) {
      const line = pvToSan(board.fen(), after.pv, after.score.mate * 2 - 1).join(" ");
      lines.push(`The problem: this allows mate in ${after.score.mate} (${line}).`);
    } else if (reply?.captured) {
      lines.push(
        `The problem: they answer ${reply.san} and win your ${PIECE_NAME[reply.captured]} on ${reply.to}.`,
      );
    } else if (reply) {
      lines.push(`The engine's reply is ${reply.san}, and your position gets worse from there.`);
    }
    const hanging = findHanging(board, mover).filter((h) => h.square !== reply?.to);
    if (hanging.length > 0) {
      const h = hanging[0];
      lines.push(`Also loose: your ${PIECE_NAME[h.piece]} on ${h.square} is under fire.`);
    }
  }

  if (!playedBest && bestMove && verdict !== "best") {
    const bestLine = pvToSan(fenBefore, best.pv, 4).join(" ");
    let why = describeMove(bestMove);
    if (best.score.mate !== undefined && best.score.mate > 0) why += `, forcing mate in ${best.score.mate}`;
    lines.push(`Better was ${bestMove.san} (${why}). Main line: ${bestLine}.`);
  }

  if (board.isCheckmate()) lines.push("And that's checkmate. Shake hands, collect your money.");

  return {
    verdict,
    san: move.san,
    bestSan: bestMove?.san ?? null,
    winBefore,
    winAfter,
    lines,
  };
}

/** Warnings to show when it's the player's turn: what of theirs is hanging. */
export function threatWarnings(chess: Chess): string[] {
  const me = chess.turn();
  return findHanging(chess, me)
    .slice(0, 2)
    .map((h) => {
      const att = chess.get(h.attackers[0])!;
      return `Heads up: your ${PIECE_NAME[h.piece]} on ${h.square} is attacked by the ${PIECE_NAME[att.type]} on ${h.attackers[0]}.`;
    });
}

/** First nudge: which piece to look at, without giving the move away. */
export function hintNudge(fen: string, bestUci: string): string {
  const chess = new Chess(fen);
  const piece = chess.get(bestUci.slice(0, 2) as Square);
  const move = uciToMove(fen, bestUci);
  if (!piece || !move) return "Look for checks, captures and threats.";
  const flavor = move.san.includes("+") ? "Is there a check?" : move.captured ? "Something can be taken." : "Find its best square.";
  return `Look at your ${PIECE_NAME[piece.type]} on ${bestUci.slice(0, 2)}. ${flavor}`;
}
