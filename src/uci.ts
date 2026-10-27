// Parsing for the subset of UCI output the coach needs.

/** Engine score, always from the side to move's point of view. */
export interface Score {
  cp?: number;
  mate?: number;
}

export interface PvLine {
  multipv: number;
  depth: number;
  score: Score;
  /** Moves in UCI notation, e.g. "e2e4", "e7e8q". */
  pv: string[];
}

export function parseInfo(line: string): PvLine | null {
  if (!line.startsWith("info ") || !line.includes(" pv ")) return null;
  const tokens = line.split(/\s+/);
  let multipv = 1;
  let depth = 0;
  const score: Score = {};
  let pv: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "depth") depth = Number(tokens[++i]);
    else if (t === "multipv") multipv = Number(tokens[++i]);
    else if (t === "score") {
      const kind = tokens[++i];
      const value = Number(tokens[++i]);
      if (kind === "cp") score.cp = value;
      else if (kind === "mate") score.mate = value;
      // Skip a trailing "lowerbound"/"upperbound" marker.
      if (tokens[i + 1] === "lowerbound" || tokens[i + 1] === "upperbound") i++;
    } else if (t === "pv") {
      pv = tokens.slice(i + 1).filter(Boolean);
      break;
    }
  }
  if (score.cp === undefined && score.mate === undefined) return null;
  return { multipv, depth, score, pv };
}

export function parseBestMove(line: string): string | null {
  const m = /^bestmove (\S+)/.exec(line);
  if (!m || m[1] === "(none)") return null;
  return m[1];
}
