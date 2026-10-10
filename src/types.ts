export type Role = 'thump' | 'crunch' | 'rustle' | 'call';
export type Prediction = { label: string; score: number };
export type Sample = {
  id: string;
  name: string;
  pcm: Float32Array;
  sampleRate: number;
  createdAt: number;
  origin: 'recorded' | 'imported' | 'demo';
  predictions: Prediction[];
  suggestedRole?: Role;
};
export type Track = { role: Role; sampleId: string | null; steps: boolean[]; volume: number; muted: boolean };
export type Project = { bpm: number; swing: number; tracks: Track[] };
export const ROLES: { id: Role; title: string; instrument: string; prompt: string; color: string }[] = [
  { id: 'thump', title: 'Thump', instrument: 'Kick', prompt: 'Footsteps on earth. A gentle tap on wood.', color: '#e56c42' },
  { id: 'crunch', title: 'Crunch', instrument: 'Snare', prompt: 'Dry leaves underfoot. A crisp little snap.', color: '#b08b56' },
  { id: 'rustle', title: 'Rustle', instrument: 'Hi-hat', prompt: 'Grass in the breeze. Leaves brushing together.', color: '#719070' },
  { id: 'call', title: 'Call', instrument: 'Accent', prompt: 'A distant bird. Your own little whistle.', color: '#7794b3' },
];
export function newProject(): Project {
  const beats = [[0, 6, 8], [4, 12], [2, 6, 10, 14], [3, 11]];
  return { bpm: 86, swing: 0, tracks: ROLES.map((role, index) => ({ role: role.id, sampleId: null, steps: Array.from({ length: 16 }, (_, step) => beats[index].includes(step)), volume: 0.75, muted: false })) };
}
