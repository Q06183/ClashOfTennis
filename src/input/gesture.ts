import { clamp, type Shot } from '../simulation/types.js';
import {topspinCharge} from '../simulation/flight.js';
export type Gesture = {dx: number; dy: number; duration: number; hold: number; width: number; height: number};
export function interpretGesture(g: Gesture): Shot | null {
  const unit = Math.min(g.width, g.height);
  const slice=g.dy>0,reverse=slice?-1:1;
  const dx = g.dx / unit*reverse, dy = g.dy / unit*reverse;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.045 || dy > -0.02) return null;
  const strokeSeconds = Math.max(0, (g.duration - g.hold) / 1000);
  const speed = distance / Math.max(0.12, strokeSeconds);
  // Widen the fast tier while keeping the normal and critical entry speeds.
  const fastSpeed = 1.844, strongSpeed = 4.6, criticalSpeed = 5.2;
  const power = speed < fastSpeed ? (speed - 0.4) / 3.8
    : speed < strongSpeed ? .38 + .32 * (speed - fastSpeed) / (strongSpeed - fastSpeed)
    : .7 + .3 * (speed - strongSpeed) / (criticalSpeed - strongSpeed);
  return { type: 'shot', aim: clamp(dx / Math.max(0.12, -dy) * 1.5, -1.2, 1.2),
    depth: clamp((-dy - 0.08) / 0.8, 0, 1), power: clamp(power, 0.12, 1), lob: false, slice, topspin:slice?0:topspinCharge(g.hold), critical: !slice && g.hold < 180 && strokeSeconds <= .1 && distance >= .58 && speed >= criticalSpeed };
}
