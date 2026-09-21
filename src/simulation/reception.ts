import {clamp,side,type BallState,type PlayerState,type Seat,type Vec} from './types.js';
const G=9.81,R=.12;
/** Predict the rising waist-height contact, rather than chasing the bounce. */
export function reception(b:BallState,p:PlayerState,seat:Seat){
  const sign=side(seat);
  let t=0,point:Vec;
  if(b.bounces===0){
    const drop=(b.vy+Math.sqrt(b.vy*b.vy+2*G*Math.max(0,b.y-R)))/G;
    const up=Math.abs(b.vy-G*drop)*.72;
    const height=Math.min(.98,up*up/(2*G)*.8);
    const rise=clamp((up-Math.sqrt(Math.max(0,up*up-2*G*height)))/G,.16,.34);
    t=drop+rise;point={x:b.x+b.vx*t,y:R+up*rise-G*rise*rise/2,z:b.z+b.vz*t};
  }else{
    const discriminant=b.vy*b.vy-2*G*(1.1-b.y);
    t=b.vy>0&&b.y<1.1&&discriminant>=0?Math.min(.34,(b.vy-Math.sqrt(discriminant))/G):0;
    point={x:b.x+b.vx*t,y:b.y+b.vy*t-G*t*t/2,z:b.z+b.vz*t};
  }
  // Freeze the intended side while preparing so it cannot flip at the last step.
  const backhand=p.preparation?.stroke==='backhand'||(!p.preparation&&(point.x-p.x)*sign<-.25);
  const lateral=backhand?-.65:.8;
  return {point,time:t,backhand,x:clamp(point.x-sign*lateral,-6.4,6.4),z:sign*clamp(point.z*sign+.65,1.1,16.5)};
}
