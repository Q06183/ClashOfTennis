import {characterEffects} from './characters.js';
import {clamp,side,type PlayerState,type Seat} from './types.js';
/** Acceleration, braking and direction-dependent court movement, in metres/sec. */
export function movePlayer(p:PlayerState,seat:Seat,dt:number){
 const athletic=characterEffects(p.characterId).movement;
 const dx=p.tx-p.x,dz=p.tz-p.z,distance=Math.hypot(dx,dz),sign=side(seat);
 const nx=distance>.001?dx/distance:0,nz=distance>.001?dz/distance:0;
 const limit=Math.hypot(nx*5.98,nz*(nz*sign>0?4.945:6.67))*(.75+.25*p.stamina)*athletic;
 const speed=Math.min(limit,Math.sqrt(2*16.1*Math.max(0,distance-.015)));
 const desiredX=nx*speed,desiredZ=nz*speed;
 let vx=p.vx??0,vz=p.vz??0;
 const changeX=desiredX-vx,changeZ=desiredZ-vz,change=Math.hypot(changeX,changeZ);
 const acceleration=vx*desiredX+vz*desiredZ<0||speed<Math.hypot(vx,vz)?20.7:14.95*athletic;
 if(change>0){const amount=Math.min(1,acceleration*dt/change);vx+=changeX*amount;vz+=changeZ*amount;}
 if(distance<.04&&Math.hypot(vx,vz)<.4){p.x=p.tx;p.z=p.tz;vx=0;vz=0;}
 else {p.x+=vx*dt;p.z+=vz*dt;}
 const x=clamp(p.x,-6.4,6.4),z=sign*clamp(p.z*sign,.9,16.5);
 if(x!==p.x)vx=0;if(z!==p.z)vz=0;p.x=x;p.z=z;
 p.vx=vx;p.vz=vz;p.moving=Math.hypot(vx,vz)>.12;
}
