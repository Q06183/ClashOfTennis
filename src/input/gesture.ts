import { clamp, type Shot } from '../simulation/types.js';
export type Gesture = {dx: number; dy: number; duration: number; hold: number; width: number; height: number};
export function interpretGesture(g: Gesture): Shot | null {
  const unit = Math.min(g.width, g.height);
  const dx = g.dx / unit, dy = g.dy / unit;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.045 || dy > -0.02) return null;
  const strokeSeconds = Math.max(0, (g.duration - g.hold) / 1000);
  const speed = distance / Math.max(0.12, strokeSeconds);
  return { type: 'shot', aim: clamp(dx / Math.max(0.12, -dy) * 1.5, -1.2, 1.2),
    depth: clamp((-dy - 0.08) / 0.8, 0, 1), power: clamp((speed - 0.4) / 3.8, 0.12, 1), lob: g.hold >= 430, critical: g.hold < 180 && strokeSeconds <= .1 && distance >= .58 && speed >= 5.2 };
}
