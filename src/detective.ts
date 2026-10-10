import type { Prediction } from './types';

// Clues use categories that exist in the bundled AudioSet checkpoint.
export const CLUES = [
  { id: 'crackle', title: 'The tiny thunder', riddle: 'Find something that crackles, but is not a storm.', hint: 'Try gently crumpling a dry fallen leaf.', answer: 'Crackling', labels: ['Crackle', 'Crack', 'Rustling leaves', 'Rustle'] },
  { id: 'steps', title: 'The travelling drum', riddle: 'It follows you everywhere. Change the ground and its voice changes.', hint: 'Listen to your own footsteps on a different surface.', answer: 'Footsteps', labels: ['Walk, footsteps'] },
  { id: 'bird', title: 'The hidden singer', riddle: 'Find a singer you can hear before you can see.', hint: 'Listen quietly for a bird. You can swap this clue if none are nearby.', answer: 'Bird calls', labels: ['Bird', 'Bird vocalization, bird call, bird song'] },
  { id: 'water', title: 'The wandering whisper', riddle: 'It trickles, splashes, or rushes, and never keeps its shape.', hint: 'Listen for a stream, fountain or running water.', answer: 'Water', labels: ['Water', 'Waterfall', 'Stream', 'Splash, splatter', 'Trickle, dribble', 'Water tap, faucet', 'Gush'] },
  { id: 'clap', title: 'The instant applause', riddle: 'Make a tiny burst of applause with no audience at all.', hint: 'Try two soft hand claps, with silence between them.', answer: 'Clapping', labels: ['Clapping'] },
  { id: 'whistle', title: 'The invisible flute', riddle: 'Find a flute that needs no instrument. A little tune will do.', hint: 'Make a short whistle, or listen for someone whistling.', answer: 'Whistling', labels: ['Whistling', 'Whistle'] },
  { id: 'knock', title: 'The secret password', riddle: 'Give a piece of wood a secret password: three gentle beats.', hint: 'Gently knock on a fallen branch or wooden surface.', answer: 'Knocking', labels: ['Knock', 'Tap', 'Thump, thud'] },
  { id: 'hum', title: 'The closed-mouth melody', riddle: 'Sing a tiny tune without opening your mouth.', hint: 'Hum a few notes. Keep the microphone close.', answer: 'Humming', labels: ['Humming'] },
] as const;
export type ClueId = typeof CLUES[number]['id'];
export type Discovery = { sampleId: string; verified: boolean };
export type DetectiveGame = {
  version: 1; id: string; clueIds: ClueId[]; discoveries: (Discovery | null)[];
  attempt: { index: number; sampleId: string } | null; searchUntil: number | null;
};
export type DetectiveCapture = { prompt: string; name: string; duration: number; onSaved: (sampleId: string) => void };
export type Verdict = { kind: 'match' | 'uncertain'; heard?: Prediction; target?: Prediction };
export const clueById = (id: ClueId) => CLUES.find(clue => clue.id === id)!;
export function createDetective(seed: number): DetectiveGame {
  const shuffled: ClueId[] = CLUES.map(clue => clue.id);
  let state = seed >>> 0;
  for (let i = shuffled.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { version: 1, id: crypto.randomUUID(), clueIds: shuffled.slice(0, 4), discoveries: [null, null, null, null], attempt: null, searchUntil: null };
}
export const nextClue = (game: DetectiveGame) => game.discoveries.findIndex(discovery => discovery === null);
export function judgeSound(clueId: ClueId, predictions: Prediction[]): Verdict {
  const valid = predictions.filter(p => Number.isFinite(p.score) && p.score >= 0 && p.score <= 1).sort((a, b) => b.score - a.score);
  const labels: readonly string[] = clueById(clueId).labels;
  const target = valid.find(p => labels.includes(p.label));
  const heard = valid[0];
  // A conservative gameplay heuristic, not calibrated confidence or proof.
  const match = Boolean(target && target.score >= 0.12 && heard && heard.score - target.score <= 0.08);
  return { kind: match ? 'match' : 'uncertain', heard, target };
}
export function startAttempt(game: DetectiveGame, index: number, sampleId: string): DetectiveGame {
  if (index !== nextClue(game) || !sampleId || game.discoveries.some(d => d?.sampleId === sampleId)) return game;
  return { ...game, searchUntil: null, attempt: { index, sampleId } };
}
export function claimDiscovery(game: DetectiveGame, sampleId: string, verified: boolean): DetectiveGame {
  const attempt = game.attempt;
  if (!attempt || attempt.index !== nextClue(game) || attempt.sampleId !== sampleId || game.discoveries[attempt.index] || game.discoveries.some(d => d?.sampleId === sampleId)) return game;
  return { ...game, discoveries: game.discoveries.map((d, i) => i === attempt.index ? { sampleId, verified } : d) };
}
export function swapClue(game: DetectiveGame): DetectiveGame {
  const index = nextClue(game);
  if (index < 0) return game;
  const current = CLUES.findIndex(clue => clue.id === game.clueIds[index]);
  const replacement = Array.from({ length: CLUES.length }, (_, offset) => CLUES[(current + offset + 1) % CLUES.length]).find(clue => !game.clueIds.includes(clue.id));
  if (!replacement) return game;
  return { ...game, attempt: null, searchUntil: null, clueIds: game.clueIds.map((id, i) => i === index ? replacement.id : id) };
}
export function parseDetective(raw: string | null): DetectiveGame | undefined {
  try {
    const g = JSON.parse(raw ?? 'null');
    if (!g || g.version !== 1 || typeof g.id !== 'string' || !g.id) return;
    if (!Array.isArray(g.clueIds) || g.clueIds.length !== 4 || new Set(g.clueIds).size !== 4 || g.clueIds.some((id: unknown) => !CLUES.some(clue => clue.id === id))) return;
    if (!Array.isArray(g.discoveries) || g.discoveries.length !== 4 || g.discoveries.some((d: Discovery | null) => d !== null && (!d || typeof d.sampleId !== 'string' || !d.sampleId || d.sampleId.length > 100 || typeof d.verified !== 'boolean'))) return;
    const ids = g.discoveries.filter(Boolean).map((d: Discovery) => d.sampleId);
    if (new Set(ids).size !== ids.length) return;
    if (g.attempt !== null && (!g.attempt || !Number.isInteger(g.attempt.index) || g.attempt.index < 0 || g.attempt.index > 3 || typeof g.attempt.sampleId !== 'string' || !g.attempt.sampleId || g.attempt.sampleId.length > 100)) return;
    if (g.attempt && (g.discoveries[g.attempt.index] ? g.discoveries[g.attempt.index].sampleId !== g.attempt.sampleId : g.attempt.index !== nextClue(g))) return;
    if (g.searchUntil !== null && (!Number.isFinite(g.searchUntil) || g.searchUntil < 0)) return;
    return g as DetectiveGame;
  } catch { return; }
}
