// Captured pieces and the points tally (pawn 1, knight 3, bishop 3, rook 5, queen 9).

import { Chess, type Color, type PieceSymbol } from "chess.js";

export const POINTS: Record<Exclude<PieceSymbol, "k">, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const START: Record<Exclude<PieceSymbol, "k">, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const ORDER: Exclude<PieceSymbol, "k">[] = ["q", "r", "b", "n", "p"];

export interface Material {
  /** Pieces each side has captured from the other, most valuable first. */
  captured: Record<Color, PieceSymbol[]>;
  /** Points on the board for each side. */
  points: Record<Color, number>;
  /** White's points minus Black's. */
  diff: number;
}

export function material(fen: string): Material {
  const counts: Record<Color, Record<string, number>> = { w: {}, b: {} };
  const points: Record<Color, number> = { w: 0, b: 0 };
  for (const row of new Chess(fen).board()) {
    for (const cell of row) {
      if (!cell || cell.type === "k") continue;
      counts[cell.color][cell.type] = (counts[cell.color][cell.type] ?? 0) + 1;
      points[cell.color] += POINTS[cell.type];
    }
  }
  const missing = (color: Color): PieceSymbol[] => {
    const out: PieceSymbol[] = [];
    // A promotion can leave more pieces than the start; that just means nothing of that kind is missing.
    for (const p of ORDER) for (let i = (counts[color][p] ?? 0); i < START[p]; i++) out.push(p);
    return out;
  };
  return {
    captured: { w: missing("b"), b: missing("w") },
    points,
    diff: points.w - points.b,
  };
}
