import {canReachContact} from './athlete.js';
import {flightGravity} from './flight.js';
import {clamp,side,type BallState,type PlayerState,type Seat} from './types.js';
export function canSmash(b:BallState,p:PlayerState,seat:Seat){
 const sign=side(seat),x=-(b.x-p.x)*sign,z=-(b.z-p.z)*sign;
 return b.y>=1.85&&b.vy<=1&&Math.hypot(x+.31,b.y-1.57,z-.05)<1.02;
}
export function canVolley(b:BallState,p:PlayerState,seat:Seat){
 const sign=side(seat);return canReachContact(-(b.x-p.x)*sign,b.y,-(b.z-p.z)*sign,(b.x-p.x)*sign<0,true);
}
/** Meet the incoming flight in front of the chosen net position, never chase its bounce. */
export function airInterception(b:BallState,p:PlayerState,seat:Seat){
 const sign=side(seat),depth=clamp(p.tz*sign,1.1,7.4),plane=(depth-.45)*sign;
 const t=b.vz*sign>.1?clamp((plane-b.z)/b.vz,0,.55):0;
 const point={x:b.x+b.vx*t,y:b.y+b.vy*t-flightGravity(b)*t*t/2,z:b.z+b.vz*t};
 const backhand=(point.x-p.x)*sign<-.25,smash=point.y>=1.85&&point.y<2.7&&b.vy-flightGravity(b)*t<=1;
 return {time:t,point,backhand,smash,x:clamp(point.x-sign*(smash?.25:backhand?-.55:.65),-6.4,6.4),z:depth*sign};
}
