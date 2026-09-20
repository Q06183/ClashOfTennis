import type { Seat } from './types.js';
import { side } from './types.js';
export const COURT = { halfWidth: 4.115, halfLength: 11.885, service: 6.4, net: 0.95, ballRadius: 0.12 };
export function serverForPoint(total: number): Seat { return total === 0 ? 0 : (Math.floor((total - 1) / 2) % 2 === 0 ? 1 : 0); }
export function winnerForScore(score: [number, number]): Seat | null {
  if (Math.max(...score) < 7 || Math.abs(score[0] - score[1]) < 2) return null;
  return score[0] > score[1] ? 0 : 1;
}
export function isInCourt(x: number, z: number, receiving: Seat): boolean {
  return Math.abs(x) <= COURT.halfWidth + 0.03 && z * side(receiving) >= 0 && Math.abs(z) <= COURT.halfLength + 0.03;
}
export function isInServiceBox(x: number, z: number, server: Seat, total: number): boolean {
  const sign = side(server) * (total % 2 === 0 ? 1 : -1);
  return isInCourt(x, z, server === 0 ? 1 : 0) && Math.abs(z) <= COURT.service + 0.03 && x * sign <= 0.03;
}
