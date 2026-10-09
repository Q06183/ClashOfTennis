import {characterEffects,getCharacter,handedness} from './characters.js';
import {flightGravity} from './flight.js';
import {bounceVelocity} from './surfaces.js';
import {movePlayer} from './movement.js';
import {spendStamina,recoverPointStamina,STAMINA} from './stamina.js';
import {reception} from './reception.js';
import {canSmash,canReturnNormally,returnHeightLegal} from './skills.js';
import {overheadPlan} from './overhead-plan.js';
import {MOVEMENT_HALF_WIDTH} from './rules.js';
import {clamp,side,type BallState,type PlayerState,type Seat} from './types.js';

/** A tap remains useful for a small positioning adjustment. A distant return
 * resumes assistance after a short acknowledgement; a swipe requests it now. */
export function shouldAssist(b:BallState,p:PlayerState,time:number,manualUntil:number){
 return time>=manualUntil||!!p.shotQueued||time>=manualUntil-.65&&Math.hypot(b.x-p.x,b.z-p.z)>2.2;
}
/** Keep an attainable interception fixed in world space. Re-sampling a relative
 * time grid every frame can otherwise alternate between volley and bounce. */
export class ReturnPlanner {
 private lock:{at:number;flight:number;plan:ReturnType<typeof returnPlan>}|null=null;
 clear(){this.lock=null;}
 committed(time:number,flight:number){return !!this.lock&&this.lock.flight===flight&&time<=this.lock.at+.08;}
 clone(){const copy=new ReturnPlanner();copy.lock=this.lock;return copy;}
 update(b:BallState,p:PlayerState,seat:Seat,serviceFlight:boolean,time:number,flight:number,airRequested=false){
  if(this.lock&&!serviceFlight&&b.bounces===0&&this.committed(time,flight)){
   return {...this.lock.plan,time:Math.max(0,this.lock.at-time)};
  }
  const plan=returnPlan(b,p,seat,serviceFlight,airRequested);
  this.lock=plan.air?{at:time+plan.time,flight,plan}:null;
  return plan;
 }
}
/** Forecast ordinary retreat and post-bounce contact, including momentum and
 * fatigue. Slice bounce uses its expected kick; random deflection is only known
 * at the real bounce, when the authority replans. No RNG is consumed here. */
export function canReachBouncedReturn(b:BallState,p:PlayerState,seat:Seat,minimumWindow=.05){
 if(b.bounces>=2||p.rescue)return false;
 const G=flightGravity(b),drop=(b.vy+Math.sqrt(b.vy*b.vy+2*G*Math.max(0,b.y-.12)))/G;
 const ball={...b},runner={...p},effects=characterEffects(p.characterId),dt=1/60;
 const ground=reception(b,p,seat);
 let elapsed=0,bounced=b.bounces>0,contactFrames=0;
 for(let i=0;i<300;i++){
  const step=!bounced?Math.min(dt,Math.max(0,drop-elapsed)):dt;
  const gravity=flightGravity(ball);
  ball.x+=ball.vx*step;ball.z+=ball.vz*step;ball.y+=ball.vy*step-gravity*step*step/2;ball.vy-=gravity*step;elapsed+=step;
  if(!bounced&&elapsed>=drop-1e-8){
   bounced=true;ball.bounces=1;ball.y=.12;
   const rebound=bounceVelocity({x:ball.vx,y:ball.vy,z:ball.vz},ball);
   ball.topspin=(ball.topspin??0)*.55;
   ball.vx=rebound.x;ball.vy=rebound.y;ball.vz=rebound.z;
  }else if(bounced&&ball.y<=.12)break;
  const target=bounced?reception(ball,runner,seat):ground;runner.tx=target.x;runner.tz=target.z;
  movePlayer(runner,seat,step);
  if(runner.moving)spendStamina(runner,.013*effects.drain*step);
  else recoverPointStamina(runner,STAMINA.idleRecovery*effects.recovery*step);
  // Require a contact window, not one grazing sample: Rapier may report
  // the bounce a frame after the analytic floor crossing.
  contactFrames=bounced&&ball.z*side(seat,p)>.35&&returnHeightLegal(ball)&&canReturnNormally(ball,runner,seat)?contactFrames+1:0;
  if(contactFrames*dt>=minimumWindow-1e-9)return true;
 }
 return false;
}
export const canWaitForBounce=(b:BallState,p:PlayerState,seat:Seat,minimumWindow=.05)=>b.bounces===0&&canReachBouncedReturn(b,p,seat,minimumWindow);
export const prefersBounce=(b:BallState,p:PlayerState,seat:Seat)=>getCharacter(p.characterId).returnStyle!=='volley-first'&&!canSmash(b,p,seat)&&!(b.mode==='doubles'&&overheadPlan(b,p,seat))&&canWaitForBounce(b,p,seat);
/** Search the actual parabola, then run the same accelerated mover used by the
 * authority. Never choose a volley just because its landing target is nearby. */
export function returnPlan(b:BallState,p:PlayerState,seat:Seat,serviceFlight:boolean,airRequested=false){
 const ground=()=>({...reception(b,p,seat),air:false,smash:false});
 if(serviceFlight||b.bounces>0)return ground();
 const overhead=b.mode==='doubles'?overheadPlan(b,p,seat):null;
 if(overhead)return overhead;
 if(!airRequested&&prefersBounce(b,p,seat))return ground();
 const sign=side(seat,p),hand=handedness(p.characterId),G=flightGravity(b);
 if(b.z*sign>.35&&returnHeightLegal(b)&&canReturnNormally(b,p,seat))return {point:{x:b.x,y:b.y,z:b.z},time:0,x:p.x,z:p.z,backhand:(b.x-p.x)*sign*hand<0,smash:canSmash(b,p,seat),air:true};
 const bounce=(b.vy+Math.sqrt(b.vy*b.vy+2*G*Math.max(0,b.y-.12)))/G,horizon=Math.min(2.5,bounce-.035);
 for(let time=.08;time<=horizon;time+=.08){
  const ball={...b,x:b.x+b.vx*time,y:b.y+b.vy*time-G*time*time/2,z:b.z+b.vz*time,vy:b.vy-G*time};
  if(ball.z*sign<.9||ball.z*sign>16||Math.abs(ball.x)>MOVEMENT_HALF_WIDTH||ball.y<.4||ball.y>2.65)continue;
  const candidates=[.65,-.55].map(lateral=>({x:clamp(ball.x-sign*hand*lateral,-MOVEMENT_HALF_WIDTH,MOVEMENT_HALF_WIDTH),z:sign*clamp(ball.z*sign+.45,.9,16.5)}));
  candidates.sort((a,c)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(c.x-p.x,c.z-p.z));
  for(const target of candidates){
   const runner={...p,tx:target.x,tz:target.z};
   // Leave 50 ms to set the racket, and include existing momentum and fatigue.
   for(let t=0;t<time-.05;t+=1/60)movePlayer(runner,seat,Math.min(1/60,time-.05-t));
   if(canReturnNormally(ball,runner,seat))return {...target,point:{x:ball.x,y:ball.y,z:ball.z},time,backhand:(ball.x-runner.x)*sign*hand<0,smash:canSmash(ball,runner,seat),air:true};
  }
 }
 return ground();
}
