export type ShotTier = 'normal'|'fast'|'power'|'critical'|'lob'|'topspin'|'smash'|'slice';
export type Seat = 0 | 1;
export type RescueStroke = 'forehand'|'backhand'|'volley'|'smash';
export type Vec = { x: number; y: number; z: number };
export type SwipeAim = {projection:number[];elevation?:number[];dx:number;dy:number};
export type Shot = { type: 'shot'; aim: number; depth: number; power: number; lob: boolean; critical?: boolean; directionX?: number; swipeAim?: SwipeAim; topspin?: number; slice?: boolean };
export type Input = Shot | { type: 'move'; x: number; z: number };
export type PlayerState = {
  characterId?: string;
  x: number; z: number; tx: number; tz: number; stamina: number;
  /** stamina is the per-point bar; optional fields support older snapshots. */
  totalStamina?: number;
  pointStaminaStart?: number;
  pointStaminaSpent?: number;
  pointStaminaCost?: number;
  pointStaminaSettled?: boolean;
  swing: number; stroke: 'forehand' | 'backhand' | 'serve' | 'volley' | 'lob' | 'smash' | 'slice-forehand' | 'slice-backhand';
  moving: boolean;
  vx?: number; vz?: number;
  contact?: Vec;
  backhand?: boolean;
  preparation?: {stroke:PlayerState['stroke'];progress:number;contact:Vec};
  shotQueued?: boolean;
  strokeSpin?: number;
  serveCourt?: 'deuce'|'ad';
  rescue?: {startedAt:number;fromX:number;fromZ:number;toX:number;toZ:number;contact:Vec;hit:boolean;stroke?:RescueStroke;backhand?:boolean;travel?:number;natural?:boolean;launchVx?:number;short?:boolean;missed?:boolean;recovery?:'step-out'|'supported-fall'};
};
export type BallState = Vec & { vx: number; vy: number; vz: number; bounces: number; hitter: Seat; targetX: number; targetZ: number; placementAssist?:number; aimOrigin?:Vec; tier?: ShotTier; critical?: boolean; rescue?: boolean; topspin?: number; slice?: boolean; drop?:number; skill?: 'smash'|'volley'|'slice' };
export type MatchState = {
  /** Match time and all physics are held; only this real-step countdown runs. */
  rescueWindow?: {seat:Seat;remaining:number;flight:number};
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
