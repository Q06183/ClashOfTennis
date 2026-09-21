import {flightGravity} from './flight.js';
import {canReachContact,contactCrouch} from './athlete.js';
import {clamp,side,type BallState,type PlayerState,type Seat} from './types.js';
export const RESCUE={chance:.35,travel:.16,duration:.65,reach:1.8,slowdown:1.7};
/** A short, reachable interception. Never guess a future bounce or cross the net. */
export function rescueTarget(b:BallState,p:PlayerState,seat:Seat){
 const sign=side(seat),speed2=b.vx*b.vx+b.vz*b.vz;
 if(speed2<9||p.stamina<.12)return null;
 const closest=((p.x-b.x)*b.vx+(p.z-b.z)*b.vz)/speed2;
 if(closest<-.03||closest>.18)return null;
 const t=RESCUE.travel,contact={x:b.x+b.vx*t,y:b.y+b.vy*t-flightGravity(b)*t*t/2,z:b.z+b.vz*t};
 if(contact.y<.5||contact.y>1.65||contact.z*sign<1)return null;
 const usualX=p.x+(p.vx??0)*t,usualZ=p.z+(p.vz??0)*t;
 if(canReachContact(-(contact.x-usualX)*sign,contact.y,-(contact.z-usualZ)*sign,(contact.x-usualX)*sign<0))return null;
 const x=contact.x-sign*.6,z=contact.z+sign*.4,distance=Math.hypot(x-p.x,z-p.z);
 if(distance<.7||distance>RESCUE.reach||Math.abs(x)>6.4||z*sign>16.5)return null;
 return {x,z,contact};
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
