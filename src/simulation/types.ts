import type {SurfaceId} from './surfaces.js';
import type {ScoringState,ScoringFormat} from './scoring.js';
export type ShotTier = 'normal'|'fast'|'power'|'critical'|'lob'|'topspin'|'smash'|'slice';
export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;
export type MatchMode = 'singles'|'doubles';
export type RescueStroke = 'forehand'|'backhand'|'volley'|'smash';
export type Vec = { x: number; y: number; z: number };
export type SwipeAim = {projection:number[];elevation?:number[];dx:number;dy:number};
export type Shot = { type: 'shot'; aim: number; depth: number; power: number; lob: boolean; critical?: boolean; directionX?: number; swipeAim?: SwipeAim; topspin?: number; slice?: boolean };
export type Input = Shot | { type: 'move'; x: number; z: number };
export type PlayerState = {
  surface?:SurfaceId;
  ends?:0|1;
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
export type BallState = Vec & { surface?:SurfaceId; mode?:MatchMode; ends?:0|1; vx: number; vy: number; vz: number; bounces: number; hitter: Seat; targetX: number; targetZ: number; placementAssist?:number; aimOrigin?:Vec; tier?: ShotTier; critical?: boolean; rescue?: boolean; topspin?: number; slice?: boolean; drop?:number; skill?: 'smash'|'volley'|'slice' };
export type MatchState = {
  surface?:SurfaceId;
  mode?:MatchMode; ends?:0|1; scoring?:ScoringState; receiver?:Seat;
  /** Match time and all physics are held; only this real-step countdown runs. */
  rescueWindow?: {seat:Seat;remaining:number;flight:number};
  time: number; phase: 'serve' | 'rally' | 'point' | 'over';
  score: [number, number]; players: PlayerState[]; ball: BallState;
  server: Seat; fault: number; pointTimer: number; rally: number; maxRally: number;
  winner: Team | null; event: string; eventId: number; lastPoint: Team | null;
};
export type RoomView = {
  mode?:MatchMode;surface?:SurfaceId;format?:ScoringFormat;host?:Seat;
  code: string; seats: ({name: string; characterId?: string; bot?:boolean; connected: boolean; ready: boolean} | null)[];
  playing: boolean; paused: boolean; expiresAt: number | null;
};
export const teamOf = (seat: Seat):Team => (seat%2) as Team;
export const partner = (seat: Seat):Seat => (seat^2) as Seat;
export const side = (seat: Seat,context?:{ends?:0|1}) => (teamOf(seat)===0?1:-1)*(context?.ends?-1:1);
/** Opposing team, not a guaranteed receiving player. */
export const other = (seat: Seat): Team => teamOf(seat)===0?1:0;
export const seatsFor = (mode?:MatchMode):readonly Seat[] => mode==='doubles'?[0,1,2,3]:[0,1];
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
