export type Seat = 0 | 1;
export type Vec = { x: number; y: number; z: number };
export type Shot = { type: 'shot'; aim: number; depth: number; power: number; lob: boolean };
export type Input = Shot | { type: 'move'; x: number; z: number };
export type PlayerState = {
  x: number; z: number; tx: number; tz: number; stamina: number;
  swing: number; stroke: 'forehand' | 'backhand' | 'serve' | 'volley' | 'lob';
  moving: boolean;
};
export type BallState = Vec & { vx: number; vy: number; vz: number; bounces: number; hitter: Seat; targetX: number; targetZ: number };
export type MatchState = {
  time: number; phase: 'serve' | 'rally' | 'point' | 'over';
  score: [number, number]; players: [PlayerState, PlayerState]; ball: BallState;
  server: Seat; fault: number; pointTimer: number; rally: number; maxRally: number;
  winner: Seat | null; event: string; eventId: number; lastPoint: Seat | null;
};
export type RoomView = {
  code: string; seats: ({name: string; connected: boolean; ready: boolean} | null)[];
  playing: boolean; paused: boolean; expiresAt: number | null;
};
export const side = (seat: Seat) => seat === 0 ? 1 : -1;
export const other = (seat: Seat): Seat => seat === 0 ? 1 : 0;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
