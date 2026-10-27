// Promise wrapper around a Stockfish web worker speaking UCI.

import { parseBestMove, parseInfo, type PvLine } from "./uci";

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

export class Engine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private ready: Promise<void>;

  constructor(options: Record<string, string | number | boolean> = {}) {
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e: MessageEvent) => {
      const line = String(e.data);
      for (const l of this.listeners) l(line);
    };
    this.ready = (async () => {
      await this.command("uci", "uciok");
      for (const [name, value] of Object.entries(options)) this.send(`setoption name ${name} value ${value}`);
      await this.command("isready", "readyok");
    })();
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private command(cmd: string, until: string): Promise<void> {
    return new Promise((resolve) => {
      const onLine = (line: string) => {
        if (line.startsWith(until)) {
          this.listeners.delete(onLine);
          resolve();
        }
      };
      this.listeners.add(onLine);
      this.send(cmd);
    });
  }

  /** Run jobs one at a time so searches never overlap on the same worker. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(() => this.ready).then(job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private search(fen: string, go: string, multipv: number): Promise<{ lines: PvLine[]; best: string | null }> {
    return new Promise((resolve) => {
      const lines = new Map<number, PvLine>();
      const onLine = (line: string) => {
        const info = parseInfo(line);
        if (info) {
          lines.set(info.multipv, info);
          return;
        }
        if (line.startsWith("bestmove")) {
          this.listeners.delete(onLine);
          const sorted = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
          resolve({ lines: sorted, best: parseBestMove(line) });
        }
      };
      this.listeners.add(onLine);
      this.send(`setoption name MultiPV value ${multipv}`);
      this.send(`position fen ${fen}`);
      this.send(go);
    });
  }

  /** Top `multipv` lines for a position, best first. Scores are from the side to move. */
  analyze(fen: string, { depth = 14, movetime = 1500, multipv = 3 } = {}): Promise<PvLine[]> {
    return this.enqueue(async () => (await this.search(fen, `go depth ${depth} movetime ${movetime}`, multipv)).lines);
  }

  bestMove(fen: string, { depth = 12, movetime = 600 } = {}): Promise<string | null> {
    return this.enqueue(async () => (await this.search(fen, `go depth ${depth} movetime ${movetime}`, 1)).best);
  }

  setOption(name: string, value: string | number | boolean): Promise<void> {
    return this.enqueue(async () => {
      this.send(`setoption name ${name} value ${value}`);
      await this.command("isready", "readyok");
    });
  }
}
