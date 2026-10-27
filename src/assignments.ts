// Homework: positions to drill. Seeded with classic patterns, then filled
// automatically with the positions where you went wrong in your own games.

export interface Assignment {
  id: string;
  fen: string;
  title: string;
  /** Why this position is on the list. */
  note: string;
  /** Expected answer in UCI, used for the "show me" button. The engine is the judge. */
  solution: string;
  source: "classic" | "your-game";
  solved: boolean;
  attempts: number;
  createdAt: number;
}

export const CLASSICS: Omit<Assignment, "solved" | "attempts" | "createdAt">[] = [
  {
    id: "classic-back-rank",
    fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    title: "Back-rank mate",
    note: "Their king is boxed in by its own pawns. Find the knockout.",
    solution: "d1d8",
    source: "classic",
  },
  {
    id: "classic-scholars",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    title: "The f7 weakness",
    note: "Black just played ...Nf6, hitting your queen. Is that a threat or a mistake?",
    solution: "h5f7",
    source: "classic",
  },
  {
    id: "classic-royal-fork",
    fen: "r3k3/8/8/3N4/8/8/5P2/4K3 w - - 0 1",
    title: "Knight fork",
    note: "Knights love hitting two things at once. Win material.",
    solution: "d5c7",
    source: "classic",
  },
  {
    id: "classic-smothered",
    fen: "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1",
    title: "Smothered mate",
    note: "The king is surrounded by its own army. One knight is enough.",
    solution: "g5f7",
    source: "classic",
  },
];

const KEY = "chess-coach.assignments.v1";

export function loadAssignments(): Assignment[] {
  let saved: Assignment[] = [];
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    saved = [];
  }
  const ids = new Set(saved.map((a) => a.id));
  for (const c of CLASSICS) {
    if (!ids.has(c.id)) saved.push({ ...c, solved: false, attempts: 0, createdAt: 0 });
  }
  return saved;
}

export function saveAssignments(list: Assignment[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage can be unavailable (private mode). Homework just won't persist.
  }
}

export function addFromGame(list: Assignment[], fen: string, solution: string, note: string, title: string): Assignment[] {
  if (list.some((a) => a.fen === fen)) return list;
  const next: Assignment = {
    id: `game-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fen,
    title,
    note,
    solution,
    source: "your-game",
    solved: false,
    attempts: 0,
    createdAt: Date.now(),
  };
  return [next, ...list];
}
