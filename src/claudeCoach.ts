// Optional Claude-written explanations. The engine decides what's good; Claude
// turns the engine's facts into coaching a 1200 player can use.
//
// The API key is the player's own, typed into Settings and kept in this
// browser's localStorage. Nothing is sent anywhere except api.anthropic.com.

import type Anthropic from "@anthropic-ai/sdk";
import type { Verdict } from "./coach";

const KEY_STORAGE = "chess-coach.anthropic-key";
const MODEL = "claude-opus-5-5";

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Private mode: the key lives only for this page load.
  }
  client = null;
}

let client: Anthropic | null = null;

// The SDK is loaded on first use so players without a key don't download it.
const loadSdk = () => import("@anthropic-ai/sdk").then((m) => m.default);

async function getClient(): Promise<Anthropic | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  const Sdk = await loadSdk();
  // Safe enough here: it's the player's own key in the player's own browser.
  client ??= new Sdk({ apiKey, dangerouslyAllowBrowser: true });
  return client;
}

export interface MoveFacts {
  playerRating: number;
  playerColor: "White" | "Black";
  pgn: string;
  fenBefore: string;
  moveNo: number;
  san: string;
  verdict: Verdict;
  /** Mover's winning chances, 0-100. */
  winBefore: number;
  winAfter: number;
  bestSan: string | null;
  bestLine: string[];
  /** Engine's best continuation after the move that was played. */
  replyLine: string[];
  /** Rule-based notes the app already showed. */
  notes: string[];
}

export const SYSTEM_PROMPT = `You are a chess coach who used to hustle speed chess in Washington Square Park. You're blunt and a little cocky, but you care about your student and want them to improve.

Your student is rated around 1200 on Chess.com. After each of their moves you get the engine's verdict and lines. Explain the move in 2 to 4 short sentences:
- Say in plain words what the move does, or what it misses.
- If it's a mistake, name the concrete punishment from the engine line and the idea behind the better move (a principle they can reuse, like "develop before attacking" or "count attackers and defenders").
- If it's good, say why in one sentence and stop.
Only claim tactics that appear in the engine lines you were given. Use algebraic notation for moves. No headers, no bullet points, no emojis.`;

export function buildPrompt(f: MoveFacts): string {
  return [
    `Student plays ${f.playerColor}, rated about ${f.playerRating}.`,
    `Game so far (PGN): ${f.pgn || "(start)"}`,
    `Position before the move (FEN): ${f.fenBefore}`,
    `Student played: ${f.moveNo}. ${f.san}`,
    `Engine verdict: ${f.verdict}. Winning chances went from ${f.winBefore.toFixed(0)}% to ${f.winAfter.toFixed(0)}%.`,
    f.bestSan && f.bestSan !== f.san ? `Engine's best move was ${f.bestSan}. Line: ${f.bestLine.join(" ")}` : "",
    f.replyLine.length ? `Engine's best continuation after the student's move: ${f.replyLine.join(" ")}` : "",
    f.notes.length ? `Notes already shown to the student: ${f.notes.join(" ")}` : "",
    "Coach the student on this move.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function claudeEnabled(): boolean {
  return getApiKey() !== "";
}

/** Returns Claude's explanation, or null if Claude isn't set up or the call failed. */
export async function explainMove(f: MoveFacts): Promise<string | null> {
  const c = await getClient();
  if (!c) return null;
  try {
    const response = await c.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(f) }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (error) {
    if (error instanceof (await loadSdk()).AuthenticationError) throw new Error("Your Anthropic API key was rejected.");
    console.warn("Claude coach unavailable:", error);
    return null;
  }
}
