// The coach's mouth: half Washington Square hustler, half tough-love boxing trainer.
// Lines are drawn from shuffle bags so the same one doesn't come back for a while.

import type { Verdict } from "./coach";

export type Moment =
  | Verdict
  | "intro"
  | "opponentMove"
  | "opponentCapture"
  | "opponentCheck"
  | "warning"
  | "takeBack"
  | "hint"
  | "win"
  | "loss"
  | "draw"
  | "drillSolved"
  | "drillMissed";

export const LINES: Record<Moment, string[]> = {
  intro: [
    "Alright champ, gloves on. I call every move, good or bad. No crying.",
    "Sit down, put your money on the table. Let's see what you got.",
    "Ding ding! Round one. Keep your hands up and your eyes on the board.",
    "Welcome to my office. The park bench. Every move, I'm watching.",
    "Same rules as the gym: you work, I talk. Let's go.",
  ],
  best: [
    "That's the move! Even I'd have played it.",
    "Boom! Right on the chin. Beautiful.",
    "Clean shot. That's how you take a man's lunch money.",
    "Now we're cooking! Textbook.",
    "Ha! Look at you. That's championship stuff.",
    "Perfect jab. Don't get cocky. But perfect.",
    "Engine's first choice. I'm almost proud of you.",
    "That's the money move. Cha-ching!",
    "Who taught you that? Oh right. Me.",
    "Stick and move, baby. Stick and move.",
  ],
  excellent: [
    "Strong move. You're light on your feet today.",
    "Good hands. Nearly perfect.",
    "Solid. No complaints from my corner.",
    "That works. Keep that rhythm.",
    "Nice combination. Keep throwing.",
    "Yeah, I like that. Stay sharp.",
  ],
  good: [
    "Playable. But you left something on the table.",
    "Fine. Fine is how you lose on points, though.",
    "Okay, okay. There was a sharper punch.",
    "Decent. Decent doesn't pay rent.",
    "You're in the fight. But you're not winning it with moves like that.",
    "Eh. A little lazy. Wake up.",
  ],
  inaccuracy: [
    "Sloppy! You're dropping your guard.",
    "Inaccuracy. A real hustler eats that for breakfast.",
    "Loose. Little edges add up, and you just gave one away.",
    "Hands up! You're leaving the chin open.",
    "That's a lazy jab. Put some snap on it.",
    "Hmm. In my day that costs you a dollar.",
  ],
  mistake: [
    "Mistake! That's five bucks in the park, pal.",
    "You walked right into that one. Head on a swivel!",
    "Mistake. You had better and you know it.",
    "Ouch. You took a shot to the body there.",
    "What was that? Shake it off, but learn from it.",
    "Come on! Footwork! You're flat-footed!",
    "That's a mistake. I've seen pigeons play better. Okay, not really. But close.",
  ],
  blunder: [
    "Blunder! I used to make my rent off moves like that!",
    "Oh no. Oh no no no. You just got knocked down.",
    "Blunder! Checks, captures, threats! Every! Single! Move!",
    "You dropped your hands and ate a haymaker. Get up!",
    "Ugh! That's the kind of move that gets you hustled.",
    "Timber! That's a blunder. Down goes Kevin!",
    "Did you even look? Sit up straight and look at the board!",
    "Blunder. Somewhere in Washington Square, a hustler just smiled.",
  ],
  opponentMove: [
    "They answer with",
    "Here comes the counter:",
    "Your opponent fires back:",
    "Watch this. They play",
    "The other side goes",
    "Response from across the table:",
  ],
  opponentCapture: [
    "They take!",
    "They grab material!",
    "Snatch! They take",
    "They're eating your pieces!",
  ],
  opponentCheck: ["Check! Protect yourself!", "Check! Hands up!", "They're coming at your king!"],
  warning: [
    "Heads up!",
    "Look out!",
    "Guard up!",
    "Eyes open, champ!",
  ],
  takeBack: [
    "Take-back. In the park that costs you extra.",
    "Fine, do-over. The ref's feeling generous.",
    "Mulligan. Don't get used to it.",
    "One take-back. In a real fight, there's no rewind button.",
  ],
  hint: [
    "Alright, here's a tip.",
    "Listen to your corner.",
    "Coach says:",
  ],
  win: [
    "Checkmate! Raise that glove! You're the champ!",
    "Knockout! Shake hands and take the money.",
    "Winner winner! That's how we do it in the park.",
  ],
  loss: [
    "You got knocked out. It happens. Now we go back to the gym.",
    "That's a loss, champ. Every great fighter has a few. Learn from it.",
    "Down for the count. Wipe your face, do your homework, run it back.",
  ],
  draw: [
    "A draw. Split decision. Nobody's happy.",
    "Draw. You lived to fight another day.",
  ],
  drillSolved: [
    "That's it! Burn that pattern into your brain.",
    "Nailed it. That's how you train.",
    "Yes! Muscle memory, baby.",
  ],
  drillMissed: [
    "Not it. Again!",
    "Nope. Back on the bag. Again.",
    "Wrong. Think. Checks, captures, threats.",
  ],
};

const bags = new Map<Moment, string[]>();

/** Next line for a moment. Every line in the pool is used before any repeats. */
export function say(moment: Moment, rng: () => number = Math.random): string {
  let bag = bags.get(moment);
  if (!bag || bag.length === 0) {
    bag = [...LINES[moment]];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    bags.set(moment, bag);
  }
  return bag.pop()!;
}
