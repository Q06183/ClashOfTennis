import {handedness,singleBackhand} from './characters.js';
import {clamp,side,type BallState,type PlayerState,type Seat,type Vec} from './types.js';
import {flightGravity} from './flight.js';
import {bounceVelocity} from './surfaces.js';
import {canReachContact} from './athlete.js';
import {MOVEMENT_HALF_WIDTH} from './rules.js';
const R=.12;
/** Predict the rising waist-height contact, rather than chasing the bounce. */
export function reception(b:BallState,p:PlayerState,seat:Seat){
  const sign=side(seat,p),G=flightGravity(b);
  let t=0,point:Vec;
  if(b.bounces===0){
    const drop=(b.vy+Math.sqrt(b.vy*b.vy+2*G*Math.max(0,b.y-R)))/G;
    const rebound=bounceVelocity({x:b.vx,y:b.vy-G*drop,z:b.vz},b);
    const up=rebound.y;
    const afterG=flightGravity({topspin:(b.topspin??0)*.55});
    const height=Math.min(.98,up*up/(2*afterG)*.8);
    const rise=clamp((up-Math.sqrt(Math.max(0,up*up-2*afterG*height)))/afterG,.16,.34);
    t=drop+rise;point={x:b.x+b.vx*drop+rebound.x*rise,y:R+up*rise-afterG*rise*rise/2,z:b.z+b.vz*drop+rebound.z*rise};
  }else{
    // Low rebounds may never reach 1.1m. Aim below their actual apex instead
    // of abruptly chasing the current ball as soon as a bounce is reported.
    const apex=b.y+Math.max(0,b.vy)**2/(2*G),height=Math.min(1.1,R+(apex-R)*.8);
    const discriminant=b.vy*b.vy-2*G*(height-b.y);
    t=b.vy>0&&b.y<height&&discriminant>=0?Math.min(.34,(b.vy-Math.sqrt(discriminant))/G):0;
    point={x:b.x+b.vx*t,y:b.y+b.vy*t-G*t*t/2,z:b.z+b.vz*t};
  }
  // Freeze the intended side while preparing so it cannot flip at the last step.
  const backhand=(p.preparation?.stroke==='backhand'||p.preparation?.stroke==='slice-backhand'||p.preparation?.stroke==='lob'&&p.backhand)||(!p.preparation&&(point.x-p.x)*sign*handedness(p.characterId)<-.25);
  // Fast outward balls outrun lateral footwork (~6m/s). Both backhand styles
  // need a closer, less deep station to leave chase/braking margin for the
  // hitting arm across the body. Keep normal spacing for slow/central balls
  // rather than strengthening every backhand rally, and never add arm reach.
  const chase=backhand&&(point.x-p.x)*b.vx>0?clamp((Math.abs(b.vx)-5)/2,0,1):0;
  const lateral=backhand?-.65+.35*chase:.8;
  const normalForward=backhand&&singleBackhand(p.characterId)?.8:.65;
  const forward=normalForward+(.35-normalForward)*chase;
  let spacing=1;
  // Waiting at our own target must put the predicted ball inside the same
  // physical grip envelope used for impact, especially a low two-hand backhand.
  while(spacing>.6&&!canReachContact(-lateral*spacing,point.y,forward*spacing,backhand,singleBackhand(p.characterId)))spacing-=.1;
  return {point,time:t,backhand,x:clamp(point.x-sign*handedness(p.characterId)*lateral*spacing,-MOVEMENT_HALF_WIDTH,MOVEMENT_HALF_WIDTH),z:sign*clamp(point.z*sign+forward*spacing,1.1,16.5)};
}
