import {movePlayer} from './movement.js';
import {reception} from './reception.js';
import {airInterception,canReturnNormally} from './skills.js';
import {flightGravity} from './flight.js';
import {contactCrouch} from './athlete.js';
import {clamp,side,type BallState,type PlayerState,type Seat} from './types.js';
export const RESCUE={chance:.30,travel:.16,duration:.65,reach:1.8,slowdown:1.7};
/** A short, reachable interception. Never guess a future bounce or cross the net. */
export function rescueTarget(b:BallState,p:PlayerState,seat:Seat){
 const sign=side(seat),speed2=b.vx*b.vx+b.vz*b.vz;
 if(speed2<9||p.stamina<.12)return null;
 const closest=((p.x-b.x)*b.vx+(p.z-b.z)*b.vz)/speed2;
 if(closest<-.03||closest>.18)return null;
 const t=RESCUE.travel,contact={x:b.x+b.vx*t,y:b.y+b.vy*t-flightGravity(b)*t*t/2,z:b.z+b.vz*t};
 if(contact.y<.5||contact.y>1.65||contact.z*sign<1)return null;
 const x=contact.x-sign*.6,z=contact.z+sign*.4,distance=Math.hypot(x-p.x,z-p.z);
 if(distance<.7||distance>RESCUE.reach||Math.abs(x)>6.4||z*sign>16.5)return null;
 return {x,z,contact};
}
/** Wait for any ordinary contact on the approaching flight, not one sample at
 * the end of a jump. Predict the same acceleration, stamina and move target
 * as the live player, without mutating authoritative state or drawing RNG. */
export function hasNormalReturnWindow(b:BallState,p:PlayerState,seat:Seat,options:{time:number;manualUntil:number;serviceFlight:boolean;slice:boolean}){
 const runner={...p},ball={...b},sign=side(seat),dt=1/120,G=flightGravity(b);
 for(let step=0;step<=72;step++){
  if(step){
   // Match.step advances the ball before updating the player's move target.
   ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;ball.y+=ball.vy*dt-G*dt*dt/2;ball.vy-=G*dt;
  }
  if(ball.y<=.12||ball.z*sign<=.35)break;
  const air=!options.serviceFlight&&ball.bounces===0&&Math.abs(runner.z)<=7.4;
  const receiving=air?airInterception(ball,runner,seat):reception(ball,runner,seat);
  if(options.time+step*dt>options.manualUntil||air&&runner.shotQueued){runner.tx=receiving.x;runner.tz=receiving.z;}
  if(step)movePlayer(runner,seat,dt);
  if(ball.y>.25&&ball.y<3.1&&(!options.serviceFlight||ball.bounces>0)&&canReturnNormally(ball,runner,seat,options.slice))return true;
 }
 return false;
}
export function rescuePose(p:PlayerState,time:number){
 const r=p.rescue;if(!r)return {lift:0,lean:0,air:0};
 const age=Math.max(0,time-r.startedAt),air=Math.sin(Math.PI*clamp(age/.34,0,1));
 return {lift:.18*air,lean:.32*Math.sin(Math.PI*clamp(age/RESCUE.duration,0,1)),air};
}
export function moveRescue(p:PlayerState,time:number,dt:number){
 const r=p.rescue;if(!r)return false;
 const age=time-r.startedAt,u=clamp(age/RESCUE.travel,0,1),ease=u*(2-u),x=p.x,z=p.z;
 p.x=r.fromX+(r.toX-r.fromX)*ease;p.z=r.fromZ+(r.toZ-r.fromZ)*ease;
 p.vx=(p.x-x)/dt;p.vz=(p.z-z)/dt;p.moving=u<1;
 if(age>=RESCUE.duration){p.rescue=undefined;p.vx=0;p.vz=0;}
 return true;
}

/** Extra reach margin for the airborne, one-handed pose instead of a grounded torso turn. */
export function canReachRescue(b:BallState,p:PlayerState,seat:Seat,time:number){
 const sign=side(seat),x=-(b.x-p.x)*sign,z=-(b.z-p.z)*sign,y=b.y-rescuePose(p,time).lift;
 return Math.hypot(x+.31,y-(1.385-contactCrouch(y)),z-.05)<.88;
}
