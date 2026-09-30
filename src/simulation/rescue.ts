import {canWaitForBounce,ReturnPlanner,shouldAssist} from './return-plan.js';
import {handedness,characterEffects} from './characters.js';
import {movePlayer} from './movement.js';
import {spendStamina,recoverPointStamina,STAMINA} from './stamina.js';
import {canReturnNormally,returnHeightLegal} from './skills.js';
import {flightGravity} from './flight.js';
import {predictFlight} from './trajectory.js';
import {isInCourt} from './rules.js';
import {dropRebound} from './drop-shot.js';
import {clamp,side,type BallState,type PlayerState,type Seat,type RescueStroke} from './types.js';
export const RESCUE={minChance:.10,maxChance:.90,lowStamina:1/3,travel:.20,landAt:.48,riseAt:.68,duration:1.18,shortReach:1.2,reach:3.5,travelSpeed:9,acceleration:65,window:.5,slowdown:1.7};
/** Existing authored poses use a 200ms reach phase. Natural dives stretch only
 * that phase; landing and the 500ms push-up keep their original duration. */
export function rescueAge(p:PlayerState,time:number){
 const r=p.rescue;if(!r)return 0;
 const age=Math.max(0,time-r.startedAt),travel=r.travel??RESCUE.travel;
 return r.natural?(age<travel?age/travel*RESCUE.travel:RESCUE.travel+age-travel):age;
}
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
/** Cubic Hermite from actual launch velocity to a stopped lateral landing. */
export function rescueMotion(distance:number,travel:number,velocity:number,u:number){
 const a=clamp(u,0,1),v=velocity*travel;
 return distance*(3*a*a-2*a*a*a)+v*(a*a*a-2*a*a+a);
}
export function rescueMotionBounds(distance:number,travel:number,velocity:number){
 const a=6*distance/travel-4*velocity,b=-6*distance/travel+3*velocity;
 const speedAt=(u:number)=>velocity+a*u+b*u*u;
 const critical=Math.abs(b)>1e-9?-a/(2*b):-1;
 const roots=[0,1],discriminant=a*a-4*b*velocity;
 if(Math.abs(b)>1e-9&&discriminant>=0){
  for(const u of [(-a-Math.sqrt(discriminant))/(2*b),(-a+Math.sqrt(discriminant))/(2*b)])if(u>0&&u<1)roots.push(u);
 }else if(Math.abs(b)<=1e-9&&Math.abs(a)>1e-9){const u=-velocity/a;if(u>0&&u<1)roots.push(u);}
 const positions=roots.map(u=>rescueMotion(distance,travel,velocity,u));
 return {min:Math.min(...positions),max:Math.max(...positions),speed:Math.max(Math.abs(velocity),Math.abs(speedAt(1)),critical>0&&critical<1?Math.abs(speedAt(critical)):0),
  acceleration:Math.max(Math.abs(a/travel),Math.abs((a+2*b)/travel))};
}
/** Provisional trajectory only. Never sample through a net/out/second bounce.
 * Slice uses its expected rebound until the real authoritative bounce occurs. */
function forecastRescueBall(b:BallState,seat:Seat,time:number,landing=b.bounces===0?predictFlight(b):null){
 const g=flightGravity(b);
 if(landing?.hitNet)return null;
 if(landing&&time>landing.duration){
  if(!isInCourt(landing.landing.x,landing.landing.z,seat))return null;
  const dt=time-landing.duration,kick=b.slice?.86:1+.12*(b.topspin??0);
  const v=dropRebound({x:b.vx*kick,y:Math.abs(b.vy-g*landing.duration)*.72*(b.slice?.68:1),z:b.vz*kick},b.drop);
  const spin=(b.topspin??0)*.55,y=.12+v.y*dt-flightGravity({topspin:spin})*dt*dt/2;
  if(y<=.12)return null;
  return {...b,x:landing.landing.x+v.x*dt,y,z:landing.landing.z+v.z*dt,
   vx:v.x,vy:v.y-flightGravity({topspin:spin})*dt,vz:v.z,bounces:1,topspin:spin};
 }
 const y=b.y+b.vy*time-g*time*time/2;
 if(y<=.12)return null;
 return {...b,x:b.x+b.vx*time,y,z:b.z+b.vz*time,vy:b.vy-g*time};
}
/** Forecast a legal interception, including the expected first bounce when
 * necessary. Never forecast through a second bounce or award predicted contact;
 * actual authority physics and arm reach must still meet before a hold/hit. */
export function rescueTarget(b:BallState,p:PlayerState,seat:Seat,serviceFlight=false){
 const sign=side(seat);
 const landing=b.bounces===0?predictFlight(b):null;
 if(landing?.hitNet)return null;
 for(let frame=0;frame<=37;frame++){
  const travel=.16+frame*.02;
  const projected=forecastRescueBall(b,seat,travel,landing);if(!projected)continue;
  const {x:cx,y:cy,z:cz,bounces}=projected,contact={x:cx,y:cy,z:cz};
  if(serviceFlight&&!bounces)continue;
  if(contact.y<.35||contact.y>3.05||contact.z*sign<1)continue;
  const backhand=(contact.x-p.x)*sign*handedness(p.characterId)<0;
  const stroke:RescueStroke=contact.y>=2.25?'smash':bounces===0?'volley':backhand?'backhand':'forehand';
  // Leave a little arm margin on the backhand side. A fully stretched target
  // may be reachable only between ticks, then missed at both adjacent ticks.
  const lateral=stroke==='smash'?.25:backhand?-.35:.6;
  const x=contact.x-sign*handedness(p.characterId)*lateral,z=p.z,distance=Math.abs(x-p.x);
  // Only lateral dives. Forward/backward gaps remain a footwork responsibility.
  if(Math.abs(contact.x-p.x)<.75||Math.abs(contact.z-p.z)>.75)continue;
  const launchVx=p.vx??0,delta=x-p.x,bounds=rescueMotionBounds(delta,travel,launchVx);
  // Preserve initial velocity, including a bounded brake before reversal.
  // Check the entire curve, not just endpoints, for reach/court overshoot.
  if(distance<.35||bounds.max-bounds.min>RESCUE.reach||
    p.x+bounds.min< -6.4||p.x+bounds.max>6.4||bounds.speed>RESCUE.travelSpeed||
    bounds.acceleration>RESCUE.acceleration||Math.abs(x)>6.4||z*sign>16.5)continue;
  const short=distance<=RESCUE.shortReach;
  const candidate={...p,x,z,rescue:{startedAt:0,fromX:p.x,fromZ:p.z,toX:x,toZ:z,contact,hit:false,stroke,backhand,travel,natural:true,launchVx,short}};
  if(!canReachRescue({...b,...contact},candidate,seat,travel))continue;
  // The new short rescue must improve a marginal ordinary window: require
  // two contact samples. Keep existing long-rescue physical gates unchanged.
  const later=short?forecastRescueBall(b,seat,travel+1/30,landing):null;
  if(short&&(!later||later.bounces!==bounces||!canReachRescue(later,candidate,seat,travel+1/30)))continue;
  return {x,z,contact,stroke,backhand,travel,launchVx,short};
 }
 return null;
}
/** Rehearse at most 240ms of NORMAL ground movement, then a lateral-only
 * rescue. This is advisory: next frame must revalidate from actual state. */
export function rescueApproach(b:BallState,p:PlayerState,seat:Seat,serviceFlight=false){
 const runner={...p},sign=side(seat);
 const ahead=forecastRescueBall(b,seat,.5);if(!ahead)return null;
 const x=clamp(ahead.x-sign*handedness(p.characterId)*.45,-6.4,6.4);
 const z=sign*clamp(ahead.z*sign+.35,.9,16.5);
 runner.tx=x;runner.tz=z;
 for(let i=1;i<=6;i++){
  movePlayer(runner,seat,.04);
  const e=characterEffects(runner.characterId);
  if(runner.moving)spendStamina(runner,.013*e.drain*.04);
  const projected=forecastRescueBall(b,seat,i*.04);if(!projected)return null;
  const target=rescueTarget(projected,runner,seat,serviceFlight);
  if(target)return {x,z,wait:i*.04,target};
 }
 return null;
}
/** Defer only when normal movement still leaves a feasible future rescue.
 * Keep a speed/acceleration reserve; don't wait until the solver barely passes. */
export function canDelayRescue(b:BallState,p:PlayerState,seat:Seat,target:NonNullable<ReturnType<typeof rescueTarget>>,serviceFlight=false){
 if(target.travel<.4||target.short)return false;
 const runner={...p};
 movePlayer(runner,seat,.04);
 const next=forecastRescueBall(b,seat,.04);if(!next)return false;
 const future=rescueTarget(next,runner,seat,serviceFlight);if(!future)return false;
 const bounds=rescueMotionBounds(future.x-runner.x,future.travel,future.launchVx);
 return bounds.speed<RESCUE.travelSpeed*.88&&bounds.acceleration<RESCUE.acceleration*.88&&
  future.travel<target.travel+.001;
}
/** Wait for any ordinary contact on the approaching flight, not one sample at
 * the end of a jump. Predict the same acceleration, stamina and move target
 * as the live player, without mutating authoritative state or drawing RNG. */
export function hasNormalReturnWindow(b:BallState,p:PlayerState,seat:Seat,options:{time:number;manualUntil:number;serviceFlight:boolean;slice:boolean;planner?:ReturnPlanner;flight?:number;airRequested?:boolean},minimumWindow=.10){
 if(canWaitForBounce(b,p,seat,minimumWindow))return true;
 const runner={...p},ball={...b},sign=side(seat),dt=1/120,G=flightGravity(b);
 const planner=options.planner?.clone()??new ReturnPlanner();
 let contactTime=0;
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
  contactTime=returnHeightLegal(ball)&&(!options.serviceFlight||ball.bounces>0)&&canReturnNormally(ball,runner,seat,options.slice)?contactTime+dt:0;
  if(contactTime>=minimumWindow-1e-9)return true;
 }
 return false;
}
export function rescuePose(p:PlayerState,time:number){
 const r=p.rescue;if(!r)return {lift:0,lean:0,air:0,crouch:0,landing:0,recovery:1,pitch:0,roll:0,hipHeight:.85};
 const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
 const age=rescueAge(p,time),air=age>=RESCUE.landAt?0:Math.sin(Math.PI*clamp(age/RESCUE.landAt,0,1));
 // Small jumps collect their limbs while descending; no post-landing get-up.
 // Contact geometry through .28s and the long fall's .5s push-up are unchanged.
 const recovery=r.short?smooth(.28,RESCUE.landAt,age):smooth(RESCUE.riseAt,RESCUE.duration,age);
 const landing=smooth(.38,.58,age)*(1-recovery);
 const stepOut=r.short||r.recovery==='step-out';
 const prone=stepOut?0:smooth(.28,.52,age)*(1-recovery);
 const pitch=stepOut?.18*smooth(.28,.52,age)*(1-recovery):Math.PI/2*prone;
 // Canonical racket space: seat 0 looks toward -z. Left-hand mirroring is
 // applied to the complete finished rig by the renderer, not to limb lengths.
 const lateral=-(r.toX-r.fromX)*(p.z>=0?1:-1);
 const bank=r.stroke==='smash'?.42:.90; // Keep the shoulder high enough for overhead contact.
 const roll=-Math.sign(lateral)*bank*Math.sin(Math.PI*clamp(age/.48,0,1))*(1-prone);
 return {lift:rescueHeight(r.stroke)*air,lean:.28*Math.sin(Math.PI*clamp(age/RESCUE.duration,0,1)),air,
  crouch:.30*landing,landing,recovery,pitch,roll,hipHeight:.85+rescueHeight(r.stroke)*air-.60*prone-(stepOut?.16*landing:0)};
}
export function moveRescue(p:PlayerState,time:number,dt:number){
 const r=p.rescue;if(!r)return false;
 const age=time-r.startedAt,u=clamp(age/(r.travel??RESCUE.travel),0,1),ease=r.natural?u*u*(3-2*u):u*(2-u),x=p.x,z=p.z;
 p.x=r.fromX+(r.natural?rescueMotion(r.toX-r.fromX,r.travel??RESCUE.travel,r.launchVx??0,u):(r.toX-r.fromX)*ease);p.z=r.fromZ+(r.toZ-r.fromZ)*ease;
 p.vx=r.natural&&age<=1e-9?(r.launchVx??0):(p.x-x)/dt;p.vz=(p.z-z)/dt;p.moving=u<1;
 if(rescueAge(p,time)>=(r.short?RESCUE.landAt:RESCUE.duration)-1e-9){
  p.rescue=undefined;p.vx=0;p.vz=0;p.moving=false;
  // The short landing already returned the racket to ready; do not resume
  // a residual groundstroke follow-through on the first free movement tick.
  if(r.short)p.swing=0;
 }
 return true;
}

/** Extra reach margin for the airborne, one-handed pose instead of a grounded torso turn. */
export function canReachRescue(b:BallState,p:PlayerState,seat:Seat,time:number){
 // Allow the leap to become visible before contact; don't hit at take-off.
 if(p.rescue&&(p.rescue.missed||rescueAge(p,time)<(p.rescue.natural ? .198 : .10)||rescueAge(p,time)>=RESCUE.landAt))return false;
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
