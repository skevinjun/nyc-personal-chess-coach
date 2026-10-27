// A small click-to-move board. No drag and drop yet; tap a piece, then a square.

import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

const GLYPH: Record<PieceSymbol, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const FILES = "abcdefgh";

export interface BoardMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export interface BoardState {
  fen: string;
  orientation: Color;
  /** Only pieces of this color can be moved; null locks the board. */
  movable: Color | null;
  lastMove?: { from: string; to: string } | null;
  highlight?: string[];
}

export class Board {
  private el: HTMLElement;
  private state: BoardState | null = null;
  private selected: Square | null = null;
  private onMove: (m: BoardMove) => void;

  constructor(el: HTMLElement, onMove: (m: BoardMove) => void) {
    this.el = el;
    this.onMove = onMove;
    this.el.addEventListener("click", (e) => this.handleClick(e));
  }

  set(state: BoardState) {
    this.state = state;
    this.selected = null;
    this.render();
  }

  private squares(): Square[] {
    const out: Square[] = [];
    const white = this.state?.orientation !== "b";
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const rank = white ? 8 - r : r + 1;
        const file = white ? FILES[f] : FILES[7 - f];
        out.push(`${file}${rank}` as Square);
      }
    }
    return out;
  }

  private render() {
    if (!this.state) return;
    const chess = new Chess(this.state.fen);
    const targets = new Set<string>();
    if (this.selected) {
      for (const m of chess.moves({ square: this.selected, verbose: true })) targets.add(m.to);
    }
    const checkSq = chess.inCheck() ? this.kingSquare(chess, chess.turn()) : null;
    const html: string[] = [];
    for (const sq of this.squares()) {
      const file = sq.charCodeAt(0) - 97;
      const rank = Number(sq[1]);
      const cls = ["sq", (file + rank) % 2 === 0 ? "light" : "dark"];
      if (this.state.lastMove && (sq === this.state.lastMove.from || sq === this.state.lastMove.to)) cls.push("last");
      if (this.state.highlight?.includes(sq)) cls.push("hl");
      if (sq === this.selected) cls.push("sel");
      if (sq === checkSq) cls.push("check");
      const piece = chess.get(sq);
      if (targets.has(sq)) cls.push(piece ? "target capture" : "target");
      const glyph = piece ? `<span class="pc ${piece.color === "w" ? "white" : "black"}">${GLYPH[piece.type]}</span>` : "";
      const edgeFile = this.state.orientation === "w" ? rank === 1 : rank === 8;
      const edgeRank = this.state.orientation === "w" ? file === 0 : file === 7;
      const coords =
        (edgeFile ? `<span class="coord f">${sq[0]}</span>` : "") + (edgeRank ? `<span class="coord r">${rank}</span>` : "");
      html.push(`<div class="${cls.join(" ")}" data-sq="${sq}">${glyph}${coords}</div>`);
    }
    this.el.innerHTML = html.join("");
  }

  private kingSquare(chess: Chess, color: Color): string | null {
    for (const row of chess.board()) for (const c of row) if (c && c.type === "k" && c.color === color) return c.square;
    return null;
  }

  private handleClick(e: Event) {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-sq]");
    if (!target || !this.state || !this.state.movable) return;
    const sq = target.dataset.sq as Square;
    const chess = new Chess(this.state.fen);
    if (chess.turn() !== this.state.movable) return;
    const piece = chess.get(sq);

    if (this.selected) {
      const legal = chess.moves({ square: this.selected, verbose: true }).filter((m) => m.to === sq);
      if (legal.length > 0) {
        const from = this.selected;
        this.selected = null;
        if (legal.some((m) => m.promotion)) {
          this.askPromotion(chess.turn()).then((promotion) => {
            if (promotion) this.onMove({ from, to: sq, promotion });
            else this.render();
          });
        } else {
          this.onMove({ from, to: sq });
        }
        return;
      }
    }
    this.selected = piece && piece.color === chess.turn() && sq !== this.selected ? sq : null;
    this.render();
  }

  private askPromotion(color: Color): Promise<PieceSymbol | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "promo";
      overlay.innerHTML = (["q", "r", "b", "n"] as PieceSymbol[])
        .map((p) => `<button data-p="${p}" class="pc ${color === "w" ? "white" : "black"}">${GLYPH[p]}</button>`)
        .join("");
      overlay.addEventListener("click", (e) => {
        e.stopPropagation();
        const p = (e.target as HTMLElement).closest<HTMLElement>("[data-p]")?.dataset.p as PieceSymbol | undefined;
        overlay.remove();
        resolve(p ?? null);
      });
      this.el.appendChild(overlay);
    });
  }
}
