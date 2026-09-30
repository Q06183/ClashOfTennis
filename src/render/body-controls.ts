import {MathUtils} from 'three';
import type {PlayerState} from '../simulation/types.js';
/** Small anatomical corrections, not an alternate contact/reach solver.
 * Angles are authored estimates; the recordings are not 3D motion capture. */
export function bodyControls(p:PlayerState,turn:number,feetY:number[]){
 const stroke=p.preparation?.stroke??p.stroke,active=!!p.preparation||p.swing>0;
 const blend=active&&!p.rescue?(p.preparation?1:MathUtils.smoothstep(p.swing,0,.16)):0;
 const bh=stroke==='backhand'||stroke==='slice-backhand'||p.backhand;
 const shoulder=MathUtils.clamp(turn*.11,-.10,.10)*blend;
 return {
  waistCounterTurn:-turn*.28*blend,
  shoulderYaw:[shoulder*(bh?1:.6),shoulder] as [number,number],
  // Bend only a lifted forefoot; a planted toe must never be curled into court.
  toes:feetY.map(y=>MathUtils.smoothstep(y,.11,.18)*.20*blend),
 };
}
