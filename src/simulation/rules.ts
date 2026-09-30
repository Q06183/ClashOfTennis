import type { Seat, Team, MatchMode } from './types.js';
import { side, other } from './types.js';
export const COURT = { halfWidth: 4.115, doublesHalfWidth:5.485, halfLength: 11.885, service: 6.4, net: 0.95, ballRadius: 0.12 };
export const courtHalfWidth=(mode?:MatchMode)=>mode==='doubles'?COURT.doublesHalfWidth:COURT.halfWidth;
export function serverForPoint(total: number,mode:MatchMode='singles'): Seat {
  return (total===0?0:(Math.floor((total-1)/2)+1)%(mode==='doubles'?4:2)) as Seat;
}
export function receiverForPoint(server:Seat,total:number,mode:MatchMode='singles'):Seat {
  return (other(server)+(mode==='doubles'&&total%2===1?2:0)) as Seat;
}
export function winnerForScore(score: [number, number]): Team | null {
  if (Math.max(...score) < 7 || Math.abs(score[0] - score[1]) < 2) return null;
  return score[0] > score[1] ? 0 : 1;
}
export function isInCourt(x: number, z: number, receiving: Seat,mode:MatchMode='singles',ends:0|1=0): boolean {
  return Math.abs(x) <= courtHalfWidth(mode) + 0.03 && z * side(receiving,{ends}) >= 0 && Math.abs(z) <= COURT.halfLength + 0.03;
}
export function isInServiceBox(x: number, z: number, server: Seat, total: number,ends:0|1=0): boolean {
  const sign = side(server,{ends}) * (total % 2 === 0 ? 1 : -1);
  return isInCourt(x, z, other(server),'singles',ends) && Math.abs(z) <= COURT.service + 0.03 && x * sign <= 0.03;
}
