import {flightGravity} from './flight.js';
import {handedness} from './characters.js';
import {movePlayer} from './movement.js';
import {canSmash} from './skills.js';
import {side,type BallState,type PlayerState,type Seat} from './types.js';

/** Rehearse a small set of descending high contacts using the normal mover.
 * No new reach or jump height: impact still has to pass canSmash in Match. */
export function overheadPlan(b:BallState,p:PlayerState,seat:Seat){
 if(b.bounces!==0||p.rescue)return null;
 const sign=side(seat,p),g=flightGravity(b),hand=handedness(p.characterId);
 if(b.vz*sign<0||b.y+Math.max(0,b.vy)**2/(2*g)<2.45)return null;
 for(const height of [2.5,2.3,2.1]){
  const d=b.vy*b.vy+2*g*(b.y-height);
  if(d<0)continue;
  const time=(b.vy+Math.sqrt(d))/g;
  if(time<.04||time>2.5)continue;
  const ball={...b,x:b.x+b.vx*time,y:height,z:b.z+b.vz*time,vy:b.vy-g*time};
  if(ball.z*sign<1||ball.z*sign>15.6||Math.abs(ball.x)>6)continue;
  const x=ball.x-sign*hand*.31,z=ball.z+sign*.12;
  const runner={...p,tx:x,tz:z};
  // Leave one frame to stabilize the racket before predicted contact.
  for(let t=0;t<time-1/60;t+=1/60)movePlayer(runner,seat,Math.min(1/60,time-1/60-t));
  if(canSmash(ball,runner,seat))return {
   x,z,time,point:{x:ball.x,y:ball.y,z:ball.z},backhand:false,smash:true,air:true,
  };
 }
 return null;
}
