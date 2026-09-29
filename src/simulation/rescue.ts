import {canWaitForBounce,ReturnPlanner,shouldAssist} from './return-plan.js';
import {handedness,characterEffects} from './characters.js';
import {movePlayer} from './movement.js';
import {spendStamina,recoverPointStamina,STAMINA} from './stamina.js';
import {canReturnNormally,returnHeightLegal} from './skills.js';
import {flightGravity} from './flight.js';
import {clamp,side,type BallState,type PlayerState,type Seat,type RescueStroke} from './types.js';
export const RESCUE={minChance:.10,maxChance:.90,lowStamina:1/3,travel:.20,landAt:.48,riseAt:.68,duration:1.18,reach:3.5,travelSpeed:18,slowdown:1.7};
/** Total-match stamina drives the smooth 10%–90% rescue lottery. */
export function rescueChance(stamina:number){
 const s=Number.isFinite(stamina)?clamp(stamina,0,1):0;
 if(s<=RESCUE.lowStamina)return RESCUE.minChance;
 if(s>=1)return RESCUE.maxChance;
 const t=(s-RESCUE.lowStamina)/(1-RESCUE.lowStamina);
 return RESCUE.minChance+(RESCUE.maxChance-RESCUE.minChance)*t*t*(3-2*t);
}
export const RESCUE_LABELS:Record<RescueStroke,string>={forehand:'正手飞身救球',backhand:'反手跃步救球',volley:'腾空截击救球',smash:'跃起高压救球'};
export const rescueHeight=(stroke?:RescueStroke)=>stroke==='smash'?.62:stroke==='volley'?.38:.34;
export const rescueLift=(stroke:RescueStroke|undefined,age:number)=>rescueHeight(stroke)*Math.sin(Math.PI*clamp(age/.48,0,1));
/** Search the remaining flight for a reachable jump, not just a fixed 200ms
 * sample (fast rebounds can already be outside the arena at that time).
 * Never extrapolate through a bounce, across the net or beyond court bounds. */
export function rescueTarget(b:BallState,p:PlayerState,seat:Seat){
 const sign=side(seat),speed2=b.vx*b.vx+b.vz*b.vz;
 if(speed2<9)return null;
 for(const travel of [RESCUE.travel,.12,.14,.16,.18,.22,.24,.26,.28]){
  const contact={x:b.x+b.vx*travel,y:b.y+b.vy*travel-flightGravity(b)*travel*travel/2,z:b.z+b.vz*travel};
  if(contact.y<.35||contact.y>3.05||contact.z*sign<1)continue;
  const backhand=(contact.x-p.x)*sign*handedness(p.characterId)<0;
  const stroke:RescueStroke=contact.y>=2.25?'smash':b.bounces===0?'volley':backhand?'backhand':'forehand';
  // Leave a little arm margin on the backhand side. A fully stretched target
  // may be reachable only between ticks, then missed at both adjacent ticks.
  const lateral=stroke==='smash'?.25:backhand?-.35:.6;
  const x=contact.x-sign*handedness(p.characterId)*lateral,z=p.z,distance=Math.abs(x-p.x);
  // Only lateral dives. Forward/backward gaps remain a footwork responsibility.
  if(Math.abs(contact.x-p.x)<.9||Math.abs(contact.z-p.z)>.75)continue;
  // Enlarge body travel, not the arm/contact envelope. Scale its duration
  // allowance as well; increasing reach alone still capped a 200ms dive at 2.6m.
  if(distance<.55||distance>Math.min(RESCUE.reach,RESCUE.travelSpeed*travel)||Math.abs(x)>6.4||z*sign>16.5)continue;
  const candidate={...p,x,z,rescue:{startedAt:0,fromX:p.x,fromZ:p.z,toX:x,toZ:z,contact,hit:false,stroke,backhand,travel}};
  if(!canReachRescue({...b,...contact},candidate,seat,travel))continue;
  return {x,z,contact,stroke,backhand,travel};
 }
 return null;
}
/** Wait for any ordinary contact on the approaching flight, not one sample at
 * the end of a jump. Predict the same acceleration, stamina and move target
 * as the live player, without mutating authoritative state or drawing RNG. */
export function hasNormalReturnWindow(b:BallState,p:PlayerState,seat:Seat,options:{time:number;manualUntil:number;serviceFlight:boolean;slice:boolean;planner?:ReturnPlanner;flight?:number;airRequested?:boolean}){
 if(canWaitForBounce(b,p,seat))return true;
 const runner={...p},ball={...b},sign=side(seat),dt=1/120,G=flightGravity(b);
 const planner=options.planner?.clone()??new ReturnPlanner();
 for(let step=0;step<=72;step++){
  if(step){
   // Match.step advances the ball before updating the player's move target.
   ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;ball.y+=ball.vy*dt-G*dt*dt/2;ball.vy-=G*dt;
  }
  if(ball.y<=.12||ball.z*sign<=.35)break;
  const time=options.time+step*dt,assist=shouldAssist(ball,runner,time,options.manualUntil);
  if(!assist)planner.clear();
  const receiving=planner.update(ball,runner,seat,options.serviceFlight,time,options.flight??0,options.airRequested);
  if(assist){runner.tx=receiving.x;runner.tz=receiving.z;}
  else planner.clear();
  if(step){
   movePlayer(runner,seat,dt);
   const e=characterEffects(runner.characterId);
   if(runner.moving)spendStamina(runner,.013*e.drain*dt);
   else recoverPointStamina(runner,STAMINA.idleRecovery*e.recovery*dt);
  }
  if(returnHeightLegal(ball)&&(!options.serviceFlight||ball.bounces>0)&&canReturnNormally(ball,runner,seat,options.slice))return true;
 }
 return false;
}
export function rescuePose(p:PlayerState,time:number){
 const r=p.rescue;if(!r)return {lift:0,lean:0,air:0,crouch:0,landing:0,recovery:1,pitch:0,roll:0,hipHeight:.85};
 const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
 const age=Math.max(0,time-r.startedAt),air=age>=RESCUE.landAt?0:Math.sin(Math.PI*clamp(age/RESCUE.landAt,0,1));
 const recovery=smooth(RESCUE.riseAt,RESCUE.duration,age);
 const landing=smooth(.38,.58,age)*(1-recovery);
 const prone=smooth(.28,.52,age)*(1-recovery);
 const pitch=Math.PI/2*prone;
 // Canonical racket space: seat 0 looks toward -z. Left-hand mirroring is
 // applied to the complete finished rig by the renderer, not to limb lengths.
 const lateral=-(r.toX-r.fromX)*(p.z>=0?1:-1);
 const bank=r.stroke==='smash'?.42:.90; // Keep the shoulder high enough for overhead contact.
 const roll=-Math.sign(lateral)*bank*Math.sin(Math.PI*clamp(age/.48,0,1))*(1-prone);
 return {lift:rescueHeight(r.stroke)*air,lean:.28*Math.sin(Math.PI*clamp(age/RESCUE.duration,0,1)),air,
  crouch:.30*landing,landing,recovery,pitch,roll,hipHeight:.85+rescueHeight(r.stroke)*air-.60*prone};
}
export function moveRescue(p:PlayerState,time:number,dt:number){
 const r=p.rescue;if(!r)return false;
 const age=time-r.startedAt,u=clamp(age/(r.travel??RESCUE.travel),0,1),ease=u*(2-u),x=p.x,z=p.z;
 p.x=r.fromX+(r.toX-r.fromX)*ease;p.z=r.fromZ+(r.toZ-r.fromZ)*ease;
 p.vx=(p.x-x)/dt;p.vz=(p.z-z)/dt;p.moving=u<1;
 if(age>=RESCUE.duration){p.rescue=undefined;p.vx=0;p.vz=0;}
 return true;
}

/** Extra reach margin for the airborne, one-handed pose instead of a grounded torso turn. */
export function canReachRescue(b:BallState,p:PlayerState,seat:Seat,time:number){
 // Allow the leap to become visible before contact; don't hit at take-off.
 if(p.rescue&&(time-p.rescue.startedAt<.10||time-p.rescue.startedAt>=RESCUE.landAt))return false;
 const sign=side(seat),hand=handedness(p.characterId);
 // The renderer solves in canonical right-hand space, rotates the complete
 // body about the hips, then mirrors it. Apply the same inverse here.
 const canonical=hand===1?p:{...p,x:-p.x,rescue:p.rescue?{...p.rescue,fromX:-p.rescue.fromX,toX:-p.rescue.toX}:undefined};
 const pose=rescuePose(canonical,time);
 const dx=-(b.x-p.x)*sign*hand,dy=b.y-pose.hipHeight,dz=-(b.z-p.z)*sign;
 const cy=dy*Math.cos(pose.pitch)+dz*Math.sin(pose.pitch);
 const z=-dy*Math.sin(pose.pitch)+dz*Math.cos(pose.pitch);
 const x=dx*Math.cos(pose.roll)+cy*Math.sin(pose.roll);
 const y=-dx*Math.sin(pose.roll)+cy*Math.cos(pose.roll)+.85;
 const backhand=p.rescue?.backhand??false,turn=backhand?.38:-.10;
 return Math.hypot(x+.31*Math.cos(turn),y-1.39,z-.31*Math.sin(turn))<1.00;
}
