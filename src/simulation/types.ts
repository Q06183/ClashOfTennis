export type ShotTier = 'normal'|'fast'|'power'|'critical'|'lob';
export type Seat = 0 | 1;
export type Vec = { x: number; y: number; z: number };
export type Shot = { type: 'shot'; aim: number; depth: number; power: number; lob: boolean; critical?: boolean; directionX?: number };
export type Input = Shot | { type: 'move'; x: number; z: number };
export type PlayerState = {
  characterId?: string;
  x: number; z: number; tx: number; tz: number; stamina: number;
  swing: number; stroke: 'forehand' | 'backhand' | 'serve' | 'volley' | 'lob';
  moving: boolean;
  vx?: number; vz?: number;
  contact?: Vec;
  backhand?: boolean;
  preparation?: {stroke:PlayerState['stroke'];progress:number;contact:Vec};
  shotQueued?: boolean;
  rescue?: {startedAt:number;fromX:number;fromZ:number;toX:number;toZ:number;contact:Vec;hit:boolean};
};
export type BallState = Vec & { vx: number; vy: number; vz: number; bounces: number; hitter: Seat; targetX: number; targetZ: number; tier?: ShotTier; critical?: boolean; rescue?: boolean };
export type MatchState = {
  time: number; phase: 'serve' | 'rally' | 'point' | 'over';
  score: [number, number]; players: [PlayerState, PlayerState]; ball: BallState;
  server: Seat; fault: number; pointTimer: number; rally: number; maxRally: number;
  winner: Seat | null; event: string; eventId: number; lastPoint: Seat | null;
};
export type RoomView = {
  code: string; seats: ({name: string; characterId?: string; connected: boolean; ready: boolean} | null)[];
  playing: boolean; paused: boolean; expiresAt: number | null;
};
export const side = (seat: Seat) => seat === 0 ? 1 : -1;
export const other = (seat: Seat): Seat => seat === 0 ? 1 : 0;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
