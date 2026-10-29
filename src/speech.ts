// The coach talks out loud using the browser's built-in text-to-speech.

const PIECE_WORD: Record<string, string> = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" };
const MUTE_KEY = "chess-coach.muted";
const VOICE_KEY = "chess-coach.voice";

/** "Nxe5+" -> "knight takes e5, check". */
export function sanToSpeech(san: string): string {
  if (san.startsWith("O-O-O")) return "castles queenside" + suffix(san);
  if (san.startsWith("O-O")) return "castles kingside" + suffix(san);
  const m = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?/.exec(san);
  if (!m) return san;
  const [, piece, fromFile, fromRank, capture, to, promo] = m;
  const parts: string[] = [];
  if (piece) parts.push(PIECE_WORD[piece]);
  else if (capture && fromFile) parts.push(`${fromFile} pawn`);
  const disambiguated = piece && (fromFile || fromRank);
  if (disambiguated) parts.push(`${fromFile ?? ""}${fromRank ?? ""}`);
  if (capture) parts.push("takes");
  else if (disambiguated) parts.push("to");
  parts.push(to);
  if (promo) parts.push(`promotes to ${PIECE_WORD[promo]}`);
  return parts.join(" ") + suffix(san);
}

function suffix(san: string): string {
  if (san.endsWith("#")) return ", checkmate";
  if (san.endsWith("+")) return ", check";
  return "";
}

const SAN_IN_TEXT = /\b(O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)(?=[\s.,;:!?)]|$)/g;

/** Make coach text pleasant to hear: moves in words, no markup, no engine numbers. */
export function toSpeech(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\b\d+\.\s*/g, "") // move numbers like "3."
    .replace(SAN_IN_TEXT, (san) => sanToSpeech(san))
    .replace(/\s+/g, " ")
    .trim();
}

function supported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Not persisted in private mode; fine.
  }
  if (muted && supported()) speechSynthesis.cancel();
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!supported()) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
}

export function getVoiceName(): string {
  try {
    return localStorage.getItem(VOICE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setVoiceName(name: string) {
  try {
    localStorage.setItem(VOICE_KEY, name);
  } catch {
    // ignore
  }
}

/** Queue a line. `interrupt` drops anything still waiting, for a fresh move. */
export function speak(text: string, { interrupt = false } = {}) {
  if (!supported() || isMuted() || !text) return;
  if (interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(toSpeech(text));
  const voice = listVoices().find((v) => v.name === getVoiceName());
  if (voice) u.voice = voice;
  u.rate = 1.08;
  u.pitch = 0.95;
  speechSynthesis.speak(u);
}
