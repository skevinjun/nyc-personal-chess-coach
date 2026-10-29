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
  if (muted) stopAll();
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

// --- Natural voice (OpenAI text-to-speech) -----------------------------------
//
// With an OpenAI key in Settings, lines are voiced by gpt-4o-mini-tts, which can be
// told *how* to talk. The key stays in this browser and only goes to api.openai.com.

const OPENAI_KEY = "chess-coach.openai-key";
const OPENAI_VOICE = "ash";

export const COACH_DIRECTION = `Voice: a gravelly old New York boxing trainer in his sixties, thick Brooklyn accent, a lifetime of cigars and corner work.
Tone: tough love. Bark the criticism, warm up when he praises, a little cocky trash talk like a park chess hustler.
Delivery: punchy and fast, like shouting from the corner between rounds. Drop g's ("fightin'", "nothin'"). Real pauses for effect.`;

export function getOpenAiKey(): string {
  try {
    return localStorage.getItem(OPENAI_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setOpenAiKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(OPENAI_KEY, key.trim());
    else localStorage.removeItem(OPENAI_KEY);
  } catch {
    // Private mode: key lasts for this page only.
  }
}

/** Lines waiting to be played, in order. Each starts fetching its audio as soon as it's queued. */
let queue: { audio: Promise<string | null>; text: string }[] = [];
let playing: HTMLAudioElement | null = null;
let draining = false;
let onVoiceError: ((message: string) => void) | null = null;

export function onNaturalVoiceError(cb: (message: string) => void) {
  onVoiceError = cb;
}

async function fetchAudio(text: string, key: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: OPENAI_VOICE,
        input: text,
        instructions: COACH_DIRECTION,
        response_format: "mp3",
      }),
    });
    if (!res.ok) {
      onVoiceError?.(res.status === 401 ? "Your OpenAI key was rejected." : `OpenAI voice failed (${res.status}).`);
      return null;
    }
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}

function speakWithBrowser(text: string) {
  if (!supported()) return;
  const u = new SpeechSynthesisUtterance(text);
  const voice = listVoices().find((v) => v.name === getVoiceName()) ?? bestBrowserVoice();
  if (voice) u.voice = voice;
  // Slower and lower reads less like a robot.
  u.rate = 0.98;
  u.pitch = 0.8;
  speechSynthesis.speak(u);
}

/** The most natural-sounding English voice the browser offers. */
export function bestBrowserVoice(): SpeechSynthesisVoice | undefined {
  const voices = listVoices();
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|premium|enhanced/i.test(v.name) ? 4 : 0) +
    (/google/i.test(v.name) ? 2 : 0) +
    (v.lang === "en-US" ? 1 : 0) +
    (v.localService ? 0 : 1);
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const item = queue[0];
    const url = await item.audio;
    if (queue[0] !== item) continue; // interrupted while fetching
    queue.shift();
    if (!url) {
      speakWithBrowser(item.text); // fall back so the coach is never silent
      continue;
    }
    await new Promise<void>((resolve) => {
      playing = new Audio(url);
      playing.onended = playing.onerror = () => {
        URL.revokeObjectURL(url);
        playing = null;
        resolve();
      };
      playing.play().catch(() => resolve());
    });
  }
  draining = false;
}

function stopAll() {
  queue = [];
  if (playing) {
    playing.pause();
    playing.dispatchEvent(new Event("ended"));
  }
  if (supported()) speechSynthesis.cancel();
}

/** Queue a line. `interrupt` drops anything still waiting, for a fresh move. */
export function speak(text: string, { interrupt = false } = {}) {
  if (interrupt) stopAll();
  if (isMuted() || !text) return;
  const spoken = toSpeech(text);
  const key = getOpenAiKey();
  if (!key) {
    speakWithBrowser(spoken);
    return;
  }
  queue.push({ audio: fetchAudio(spoken, key), text: spoken });
  drain();
}
