import {handedness,singleBackhand} from './characters.js';
import {canReachContact} from './athlete.js';
import {flightGravity} from './flight.js';
import {MOVEMENT_HALF_WIDTH} from './rules.js';
import {clamp,side,type BallState,type PlayerState,type Seat} from './types.js';
export function canSmash(b:BallState,p:PlayerState,seat:Seat){
 const sign=side(seat,p),x=-(b.x-p.x)*sign*handedness(p.characterId),z=-(b.z-p.z)*sign;
 return b.y>=1.85&&b.vy<=1&&Math.hypot(x+.31,b.y-1.57,z-.05)<1.02;
}
export function canVolley(b:BallState,p:PlayerState,seat:Seat){
 const sign=side(seat,p);return canReachContact(-(b.x-p.x)*sign*handedness(p.characterId),b.y,-(b.z-p.z)*sign,(b.x-p.x)*sign*handedness(p.characterId)<0,true);
}
/** Meet the incoming flight in front of the chosen net position, never chase its bounce. */
export function airInterception(b:BallState,p:PlayerState,seat:Seat){
 const sign=side(seat,p),depth=clamp(p.tz*sign,1.1,16.5),plane=(depth-.45)*sign;
 const t=b.vz*sign>.1?clamp((plane-b.z)/b.vz,0,.55):0;
 const point={x:b.x+b.vx*t,y:b.y+b.vy*t-flightGravity(b)*t*t/2,z:b.z+b.vz*t};
 const backhand=(point.x-p.x)*sign*handedness(p.characterId)<-.25,smash=point.y>=1.85&&point.y<2.7&&b.vy-flightGravity(b)*t<=1;
 return {time:t,point,backhand,smash,x:clamp(point.x-sign*handedness(p.characterId)*(smash?.25:backhand?-.55:.65),-MOVEMENT_HALF_WIDTH,MOVEMENT_HALF_WIDTH),z:depth*sign};
}

/** Shared ordinary reach for both live contact and the last-chance rescue gate. */
export function canReturnNormally(b:BallState,p:PlayerState,seat:Seat,slice=false){
 const sign=side(seat,p);
 return canSmash(b,p,seat)||(b.bounces===0?canVolley(b,p,seat):canReachContact(-(b.x-p.x)*sign*handedness(p.characterId),b.y,-(b.z-p.z)*sign,(b.x-p.x)*sign*handedness(p.characterId)<0,slice||singleBackhand(p.characterId)));
}

/** A nearby airborne ball can be blocked anywhere; deeper automatic runs still
 * use the bounce unless the current flight is already within racket reach. */
export const wantsAirContact=(b:BallState,p:PlayerState,seat:Seat,serviceFlight:boolean)=>!serviceFlight&&b.bounces===0&&(Math.abs(p.z)<=7.4||canVolley(b,p,seat)||canSmash(b,p,seat));
export const returnHeightLegal=(b:BallState)=>b.y>(b.bounces===0?.13:.25)&&b.y<3.1;
export const volleyDifficulty=(b:BallState,p:PlayerState)=>Math.max(clamp((Math.abs(p.z)-6)/6,0,1),clamp((.8-b.y)/.65,0,1)*.65);
