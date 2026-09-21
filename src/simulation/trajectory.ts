import {flightGravity} from './flight.js';
import {COURT} from './rules.js';
import type {Vec} from './types.js';
type FlyingBall=Vec & {vx:number;vy:number;vz:number;topspin?:number};
/** First flight only; the net truncates the prediction exactly like the match. */
export function predictFlight(b:FlyingBall){
  const gravity=flightGravity(b);
  let duration=Math.max(0,(b.vy+Math.sqrt(b.vy*b.vy+2*gravity*Math.max(0,b.y-COURT.ballRadius)))/gravity);
  const at=(t:number):Vec=>({x:b.x+b.vx*t,y:b.y+b.vy*t-gravity*t*t/2,z:b.z+b.vz*t});
  const netTime=b.vz===0?-1:-b.z/b.vz;
  const hitNet=netTime>0&&netTime<duration&&at(netTime).y<COURT.net+COURT.ballRadius;
  if(hitNet)duration=netTime;
  const points=Array.from({length:41},(_,i)=>at(duration*i/40));
  const landing=points[points.length-1];if(hitNet)landing.z=0;
  return {points,landing,hitNet,duration};
}
