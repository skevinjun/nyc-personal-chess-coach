import { Chess, type Color, type Square } from "chess.js";
import { addFromGame, loadAssignments, saveAssignments, type Assignment } from "./assignments";
import { Board, type BoardMove } from "./board";
import {
  describeMove,
  formatScore,
  hintNudge,
  pvToSan,
  reviewMove,
  scoreToCp,
  threatWarnings,
  uciToMove,
  winPercent,
  type MoveReview,
  type Verdict,
} from "./coach";
import { claudeEnabled, explainMove, getApiKey, setApiKey } from "./claudeCoach";
import { Engine } from "./engine";
import { material } from "./material";
import { say } from "./persona";
import { getVoiceName, isMuted, listVoices, sanToSpeech, setMuted, setVoiceName, speak } from "./speech";
import type { PvLine } from "./uci";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const coachEngine = new Engine();
const opponent = new Engine();

let mode: "play" | "drill" = "play";
let game = new Chess();
let playerColor: Color = "w";
let orientation: Color = "w";
/** Bumped whenever the position is reset, so stale engine results get dropped. */
let gen = 0;
let thinking = false;
let hintStage = 0;
let stats = emptyStats();
let homework = loadAssignments();
let drill: { a: Assignment; chess: Chess; fails: number } | null = null;

/** Kevin's Chess.com rating; used to pitch Claude's explanations. */
const PLAYER_RATING = 1200;

const analysisCache = new Map<string, Promise<PvLine[]>>();

const board = new Board($("board"), (m) => (mode === "drill" ? onDrillMove(m) : onPlayMove(m)));

function emptyStats(): Record<Verdict, number> {
  return { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
}

function analyze(fen: string, multipv = 3): Promise<PvLine[]> {
  const key = `${multipv}|${fen}`;
  let p = analysisCache.get(key);
  if (!p) {
    p = coachEngine.analyze(fen, { multipv });
    analysisCache.set(key, p);
  }
  return p;
}

function lastMoveOf(chess: Chess) {
  const h = chess.history({ verbose: true });
  const m = h[h.length - 1];
  return m ? { from: m.from, to: m.to } : null;
}

const GLYPH: Record<string, string> = { q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

/** Captured pieces above and below the board, with the points lead. */
function renderCaptures(fen: string, bottom: Color) {
  const m = material(fen);
  const top: Color = bottom === "w" ? "b" : "w";
  const row = (side: Color) => {
    const victimColor = side === "w" ? "black" : "white";
    const pieces = m.captured[side].map((p) => `<span class="pc ${victimColor}">${GLYPH[p]}</span>`).join("");
    const lead = side === "w" ? m.diff : -m.diff;
    return pieces + (lead > 0 ? `<span class="lead">+${lead}</span>` : "");
  };
  $("cap-top").innerHTML = row(top);
  $("cap-bottom").innerHTML = row(bottom);
}

function renderBoard(highlight: string[] = []) {
  if (mode === "drill" && drill) {
    const side = new Chess(drill.a.fen).turn();
    renderCaptures(drill.chess.fen(), side);
    board.set({
      fen: drill.chess.fen(),
      orientation: side,
      movable: thinking || drill.a.solved ? null : drill.chess.turn(),
      lastMove: lastMoveOf(drill.chess),
      highlight,
    });
    return;
  }
  const canMove = !thinking && !game.isGameOver() && game.turn() === playerColor;
  renderCaptures(game.fen(), orientation);
  board.set({ fen: game.fen(), orientation, movable: canMove ? playerColor : null, lastMove: lastMoveOf(game), highlight });
}

function setStatus(text: string) {
  $("status").textContent = text;
}

function post(kind: string, html: string): HTMLLIElement {
  const li = document.createElement("li");
  li.className = `msg ${kind}`;
  li.innerHTML = html;
  const feed = $("feed");
  feed.appendChild(li);
  feed.scrollTop = feed.scrollHeight;
  return li;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

const VERDICT_LABEL: Record<Verdict, string> = {
  best: "Best",
  excellent: "Excellent",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

function postReview(r: MoveReview, moveNo: number): HTMLLIElement {
  const [voice, ...rest] = r.lines;
  return post(
    `review ${r.verdict}`,
    `<div class="head"><span class="tag ${r.verdict}">${VERDICT_LABEL[r.verdict]}</span> <b>${moveNo}. ${r.san}</b></div>` +
      `<p class="voice">${voice}</p>` +
      rest.map((l) => `<p>${l}</p>`).join(""),
  );
}

function updateEval(lines: PvLine[], fen: string) {
  if (!lines[0]) return;
  const turn = new Chess(fen).turn();
  const cpWhite = scoreToCp(lines[0].score) * (turn === "w" ? 1 : -1);
  $("evalfill").style.height = `${winPercent(cpWhite)}%`;
  $("evaltext").textContent = formatScore(lines[0].score, "w", turn);
  $("evalbar").classList.toggle("flipped", orientation === "b" && mode === "play");
}

async function newGame() {
  gen++;
  mode = "play";
  drill = null;
  game = new Chess();
  playerColor = ($("color") as HTMLSelectElement).value as Color;
  orientation = playerColor;
  stats = emptyStats();
  $("feed").innerHTML = "";
  showDrillControls(false);
  const level = Number(($("level") as HTMLSelectElement).value);
  const myGen = gen;
  thinking = true;
  renderBoard();
  setStatus("Setting up the board...");
  await opponent.setOption("Skill Level", level);
  if (myGen !== gen) return;
  const intro = say("intro");
  post("coach", `${intro} Mistakes go in your homework. Before each move: checks, captures, threats.`);
  speak(intro, { interrupt: true });
  if (playerColor === "b") await engineMove();
  else startPlayerTurn();
}

async function startPlayerTurn() {
  const myGen = gen;
  thinking = false;
  hintStage = 0;
  renderBoard();
  setStatus(`Your move (${playerColor === "w" ? "White" : "Black"}).`);
  const warnings = threatWarnings(game);
  for (const w of warnings) post("warn", w);
  if (warnings[0]) speak(`${say("warning")} ${warnings[0].replace(/^Heads up: your/, "Your")}`);
  const lines = await analyze(game.fen());
  if (myGen !== gen) return;
  updateEval(lines, game.fen());
}

async function onPlayMove(m: BoardMove) {
  const myGen = gen;
  const fenBefore = game.fen();
  const moveNo = game.moveNumber();
  const move = game.move(m);
  thinking = true;
  renderBoard();
  setStatus("Coach is looking at your move...");

  const before = await analyze(fenBefore);
  const after = game.isGameOver() ? [] : await analyze(game.fen(), 1);
  if (myGen !== gen) return;

  const review = reviewMove(fenBefore, move.lan, before, after[0] ?? null);
  stats[review.verdict]++;
  const card = postReview(review, moveNo);
  if (after[0]) updateEval(after, game.fen());
  speak(spokenReview(review), { interrupt: true });
  let claudeNote: Promise<void> = Promise.resolve();
  if (claudeEnabled()) {
    const history = new Chess();
    const pgnBefore = game.history().slice(0, -1);
    for (const san of pgnBefore) history.move(san);
    claudeNote = addClaudeNote(card, {
      playerRating: PLAYER_RATING,
      playerColor: playerColor === "w" ? "White" : "Black",
      pgn: history.pgn().replace(/\[[^\]]*\]\s*/g, "").replace(/\s*\*$/, ""),
      fenBefore,
      moveNo,
      san: review.san,
      verdict: review.verdict,
      winBefore: review.winBefore,
      winAfter: review.winAfter,
      bestSan: review.bestSan,
      bestLine: before[0] ? pvToSan(fenBefore, before[0].pv, 6) : [],
      replyLine: after[0] ? pvToSan(game.fen(), after[0].pv, 6) : [],
      notes: review.lines.slice(1),
    });
  }

  if ((review.verdict === "mistake" || review.verdict === "blunder") && before[0]?.pv[0]) {
    homework = addFromGame(
      homework,
      fenBefore,
      before[0].pv[0],
      `In a game you played ${review.san} here. Find the move that keeps you in control.`,
      `${VERDICT_LABEL[review.verdict]} on move ${moveNo}`,
    );
    saveAssignments(homework);
    renderHomework();
    post("note", "This position went into your homework.");
  }

  if (game.isGameOver()) return endGame();
  // Let the coach finish talking before the opponent moves, like a real lesson (but never stall the game).
  await Promise.race([claudeNote, new Promise((r) => setTimeout(r, 10000))]);
  if (myGen !== gen) return;
  await engineMove();
}

/** What the coach says out loud about a move: the reaction, then the one thing that matters. */
function spokenReview(r: MoveReview): string {
  const parts = [r.lines[0]];
  if (!claudeEnabled()) {
    const problem = r.lines.find((l) => l.startsWith("The problem"));
    if (problem) parts.push(problem);
    if (r.bestSan && r.bestSan !== r.san && r.verdict !== "best" && r.verdict !== "excellent") {
      parts.push(`Better was ${r.bestSan}.`);
    }
  }
  return parts.join(" ");
}

/** Claude's take arrives a few seconds later; the game doesn't wait for it. */
async function addClaudeNote(card: HTMLLIElement, facts: Parameters<typeof explainMove>[0]) {
  const p = document.createElement("p");
  p.className = "claude pending";
  p.textContent = "Coach is thinking it over...";
  card.appendChild(p);
  try {
    const text = await explainMove(facts);
    if (!text) {
      p.remove();
      return;
    }
    p.className = "claude";
    p.innerHTML = escapeHtml(text).replace(/\n+/g, "<br>");
    speak(text);
  } catch (e) {
    p.className = "claude error";
    p.textContent = `${(e as Error).message} Check it in Settings.`;
  }
  const feed = $("feed");
  feed.scrollTop = feed.scrollHeight;
}

async function engineMove() {
  const myGen = gen;
  thinking = true;
  renderBoard();
  setStatus("Opponent is thinking...");
  const uci = await opponent.bestMove(game.fen());
  if (myGen !== gen || !uci) return;
  const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  post("opp", `Opponent plays <b>${move.san}</b>: ${describeMove(move)}.`);
  const lead = move.san.includes("+") ? say("opponentCheck") : move.captured ? say("opponentCapture") : say("opponentMove");
  speak(`${lead} ${sanToSpeech(move.san)}.`);
  if (game.isGameOver()) return endGame();
  startPlayerTurn();
}

function endGame() {
  thinking = false;
  renderBoard();
  let result: string;
  if (game.isCheckmate()) {
    const youWon = game.turn() !== playerColor;
    result = youWon ? "Checkmate. You won." : "Checkmate. You lost.";
  } else if (game.isStalemate()) result = "Stalemate. Draw.";
  else if (game.isThreefoldRepetition()) result = "Draw by repetition.";
  else if (game.isInsufficientMaterial()) result = "Draw, insufficient material.";
  else result = "Draw.";
  setStatus(result);
  const outro = game.isCheckmate() ? say(game.turn() !== playerColor ? "win" : "loss") : say("draw");
  speak(outro);
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const solid = stats.best + stats.excellent + stats.good;
  const errors = stats.mistake + stats.blunder;
  const summary = (Object.keys(stats) as Verdict[])
    .filter((v) => stats[v] > 0)
    .map((v) => `${stats[v]} ${VERDICT_LABEL[v].toLowerCase()}`)
    .join(", ");
  const verdict =
    errors === 0
      ? "No real mistakes. Now that's how you play."
      : `${errors} serious error${errors === 1 ? "" : "s"}. They're in your homework. Do it before the next game.`;
  post(
    "coach",
    `<b>${result}</b><p class="voice">${outro}</p><p>${total} moves: ${summary || "none"}. ${solid} of ${total} were solid.</p><p>${verdict}</p>`,
  );
}

async function hint() {
  const chess = mode === "drill" && drill ? drill.chess : game;
  if (thinking || chess.isGameOver()) return;
  if (mode === "play" && game.turn() !== playerColor) return;
  const myGen = gen;
  const fen = chess.fen();
  const lines = await analyze(fen);
  if (myGen !== gen || !lines[0]?.pv[0]) return;
  const best = lines[0].pv[0];
  if (hintStage === 0) {
    const nudge = `${say("hint")} ${hintNudge(fen, best)}`;
    post("hint", nudge);
    speak(nudge, { interrupt: true });
    renderBoard([best.slice(0, 2)]);
    hintStage = 1;
  } else {
    const move = uciToMove(fen, best)!;
    post("hint", `Fine. Play <b>${move.san}</b>. Evaluation: ${formatScore(lines[0].score, chess.turn(), chess.turn())}.`);
    speak(`Fine. Play ${move.san}.`, { interrupt: true });
    renderBoard([best.slice(0, 2), best.slice(2, 4)]);
  }
}

function takeBack() {
  if (mode !== "play" || game.history().length === 0) return;
  gen++;
  game.undo();
  while (game.turn() !== playerColor && game.history().length > 0) game.undo();
  const quip = say("takeBack");
  post("note", quip);
  speak(quip, { interrupt: true });
  if (game.turn() !== playerColor) engineMove();
  else startPlayerTurn();
}

// --- Homework / drills -------------------------------------------------------

function renderHomework() {
  const open = homework.filter((a) => !a.solved).length;
  $("hw-count").textContent = open ? String(open) : "";
  $("hw-list").innerHTML = homework
    .map(
      (a) => `<li class="${a.solved ? "solved" : ""}">
        <div><b>${a.title}</b> <span class="src">${a.source === "classic" ? "Classic" : "Your game"}</span>
        ${a.solved ? '<span class="tag best">Solved</span>' : ""}</div>
        <p>${a.note}</p>
        <button data-drill="${a.id}">${a.solved ? "Try again" : "Solve"}</button>
      </li>`,
    )
    .join("");
}

function showDrillControls(on: boolean) {
  $("controls").classList.toggle("hidden", on);
  $("drill-controls").classList.toggle("hidden", !on);
}

function switchTab(tab: string) {
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("panel-play").classList.toggle("hidden", tab !== "play");
  $("panel-homework").classList.toggle("hidden", tab !== "homework");
}

function openDrill(id: string) {
  const a = homework.find((x) => x.id === id);
  if (!a) return;
  gen++;
  if (a.solved) a.solved = false;
  mode = "drill";
  drill = { a, chess: new Chess(a.fen), fails: 0 };
  thinking = false;
  hintStage = 0;
  showDrillControls(true);
  switchTab("play");
  post("drill", `<b>Homework: ${a.title}</b><p>${a.note}</p><p>${drill.chess.turn() === "w" ? "White" : "Black"} to move.</p>`);
  setStatus("Homework: find the best move.");
  renderBoard();
  analyze(a.fen).then((lines) => updateEval(lines, a.fen));
}

async function onDrillMove(m: BoardMove) {
  if (!drill) return;
  const d = drill;
  const myGen = gen;
  const fen = d.chess.fen();
  const move = d.chess.move(m);
  thinking = true;
  renderBoard();
  setStatus("Checking...");
  const before = await analyze(fen);
  const after = d.chess.isGameOver() ? [] : await analyze(d.chess.fen(), 1);
  if (myGen !== gen) return;
  const review = reviewMove(fen, move.lan, before, after[0] ?? null);
  d.a.attempts++;
  thinking = false;
  if (review.verdict === "best" || review.verdict === "excellent") {
    d.a.solved = true;
    const cheer = say("drillSolved");
    post("review best", `<span class="tag best">Solved</span> <b>${move.san}</b><p class="voice">${cheer}</p>`);
    speak(cheer, { interrupt: true });
    setStatus("Solved. Pick another from Homework, or go back to your game.");
  } else {
    d.fails++;
    const problem = review.lines.find((l) => l.startsWith("The problem")) ?? "";
    const jab = say("drillMissed");
    speak(`${jab} ${problem}`, { interrupt: true });
    post(
      "review mistake",
      `<span class="tag mistake">Not it</span> <b>${move.san}</b><p class="voice">${jab}</p><p>${problem}</p>` +
        (d.fails >= 2 ? "<p>Stuck? Use Hint, or Show me.</p>" : "<p>Try again.</p>"),
    );
    d.chess.undo();
    setStatus("Try again.");
  }
  saveAssignments(homework);
  renderHomework();
  renderBoard();
}

function showSolution() {
  if (!drill) return;
  const move = uciToMove(drill.a.fen, drill.a.solution);
  if (!move) return;
  post("hint", `The answer: <b>${move.san}</b> (${describeMove(move)}). Play it on the board so it sticks.`);
  speak(`The answer is ${move.san}. Play it so it sticks.`, { interrupt: true });
  renderBoard([move.from, move.to]);
}

function exitDrill() {
  gen++;
  mode = "play";
  drill = null;
  showDrillControls(false);
  post("note", "Back to the game.");
  if (game.isGameOver()) {
    renderBoard();
    setStatus("Game over. Start a new one when you're ready.");
  } else if (game.turn() !== playerColor) engineMove();
  else startPlayerTurn();
}

// --- Wiring ------------------------------------------------------------------

$("new").addEventListener("click", () => newGame());
$("hint").addEventListener("click", () => hint());
$("undo").addEventListener("click", () => takeBack());
$("flip").addEventListener("click", () => {
  orientation = orientation === "w" ? "b" : "w";
  renderBoard();
  $("evalbar").classList.toggle("flipped", orientation === "b");
});
$("drill-show").addEventListener("click", () => showSolution());
$("drill-exit").addEventListener("click", () => exitDrill());
$("hw-list").addEventListener("click", (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>("[data-drill]")?.dataset.drill;
  if (id) openDrill(id);
});
document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab!)));

// Drill hints reuse the same Hint flow.
$("drill-controls").insertAdjacentHTML("afterbegin", '<button id="drill-hint">Hint</button>');
$("drill-hint").addEventListener("click", () => hint());

function renderMute() {
  $("mute").textContent = isMuted() ? "🔇 Coach muted" : "🔊 Coach talking";
}
$("mute").addEventListener("click", () => {
  setMuted(!isMuted());
  renderMute();
  if (!isMuted()) speak("I'm back. Let's work.", { interrupt: true });
});
renderMute();

function renderVoices() {
  const select = $("voice") as HTMLSelectElement;
  const voices = listVoices();
  select.innerHTML =
    '<option value="">Browser default</option>' +
    voices.map((v) => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)}</option>`).join("");
  select.value = getVoiceName();
}
if ("speechSynthesis" in window) speechSynthesis.addEventListener("voiceschanged", renderVoices);
$("voice-test").addEventListener("click", () => {
  setVoiceName(($("voice") as HTMLSelectElement).value);
  speak(say("blunder"), { interrupt: true });
});

function openSettings() {
  renderVoices();
  ($("api-key") as HTMLInputElement).value = getApiKey();
  $("settings").classList.remove("hidden");
}

$("settings-open").addEventListener("click", () => openSettings());
$("settings-close").addEventListener("click", () => $("settings").classList.add("hidden"));
$("settings-save").addEventListener("click", () => {
  setApiKey(($("api-key") as HTMLInputElement).value);
  setVoiceName(($("voice") as HTMLSelectElement).value);
  $("settings").classList.add("hidden");
  post("note", claudeEnabled() ? "Claude coaching is on. Explanations arrive a few seconds after each move." : "Claude coaching is off.");
});

renderHomework();
newGame();

// Exposed for debugging in the console.
Object.assign(window, { __coach: { get game() { return game; }, squares: (s: Square) => game.get(s) } });
