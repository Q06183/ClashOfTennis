import {handedness,singleBackhand} from './characters.js';
import {clamp,side,type BallState,type PlayerState,type Seat,type Vec} from './types.js';
import {flightGravity} from './flight.js';
import {bounceVelocity} from './surfaces.js';
import {canReachContact} from './athlete.js';
const R=.12;
/** Predict the rising waist-height contact, rather than chasing the bounce. */
export function reception(b:BallState,p:PlayerState,seat:Seat){
  const sign=side(seat),G=flightGravity(b);
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
  const lateral=backhand?-.65:.8,forward=backhand&&singleBackhand(p.characterId)?.8:.65;
  let spacing=1;
  // Waiting at our own target must put the predicted ball inside the same
  // physical grip envelope used for impact, especially a low two-hand backhand.
  while(spacing>.6&&!canReachContact(-lateral*spacing,point.y,forward*spacing,backhand,singleBackhand(p.characterId)))spacing-=.1;
  return {point,time:t,backhand,x:clamp(point.x-sign*handedness(p.characterId)*lateral*spacing,-6.4,6.4),z:sign*clamp(point.z*sign+forward*spacing,1.1,16.5)};
}
