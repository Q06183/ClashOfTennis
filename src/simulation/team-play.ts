import {side,teamOf,other,partner,seatsFor,type MatchState,type Seat} from './types.js';
import {receiverForPoint} from './rules.js';
import {reception} from './reception.js';
import {canReturnNormally} from './skills.js';
import {overheadPlan} from './overhead-plan.js';
import {characterEffects} from './characters.js';
import {effectiveStamina} from './stamina.js';
import {canReachBouncedReturn,returnPlan} from './return-plan.js';

/** Only assistance is assigned. Either partner may manually intercept a rally.
 * A serve always belongs to its nominated receiver until returned. */
export function assistedReceiver(s:MatchState,service=s.rally===1):Seat{
 if(s.mode!=='doubles')return other(s.ball.hitter);
 if(service)return s.receiver??receiverForPoint(s.server,s.score[0]+s.score[1],s.mode);
 const candidates=seatsFor(s.mode).filter(i=>teamOf(i)!==teamOf(s.ball.hitter));
 const b=s.ball;
 // A contact already in reach (or an active rescue) must not be stolen by a
 // future coverage preference. These are assistance decisions, not free hits.
 const immediate=candidates.find(seat=>{
  const p=s.players[seat];
  return !p.rescue&&b.z*side(seat,s)>.35&&canReturnNormally(b,p,seat);
 });
 if(immediate!==undefined)return immediate;
 const rescuing=candidates.find(seat=>s.players[seat].rescue&&!s.players[seat].rescue!.hit);
 if(rescuing!==undefined)return rescuing;
 const plans=candidates.map(seat=>{
  const p=s.players[seat],target=reception(b,p,seat),overhead=overheadPlan(b,p,seat);
  return {seat,p,target,overhead,ground:canReachBouncedReturn(b,p,seat)};
 });
 // Wing ownership applies to ordinary passes too, before AND after the
 // bounce. Rehearse real retreat/acceleration and the moving contact window;
 // being nearer a single predicted landing point does not mean arriving in time.
 for(const {seat,p,target,overhead,ground} of plans){
  const mate=s.players[partner(seat)],wing=Math.sign(target.point.x);
  if(Math.abs(target.point.x)>.75&&target.z*side(seat,s)>7&&p.x*wing>.4&&mate.x*wing<-.4&&
     !p.rescue&&(overhead||ground))return seat;
 }
 const cost=({seat,p,target,overhead,ground}:typeof plans[number])=>{
  if(p.rescue)return 200;
  if(overhead)return -5+overhead.time;
  if(!ground){
   const air=returnPlan(b,p,seat,false);
   if(air.air)return -3+air.time;
  }
  const speed=characterEffects(p.characterId).movement*(.75+.25*effectiveStamina(p));
  // A viable return always beats an unattainable shorter route. If neither
  // can get there normally, keep approaching so the rescue solver can help.
  const lateral=(target.x-p.x)/(5.98*speed),depth=(target.z-p.z)/((target.z-p.z)*side(seat,s)>0?4.945*speed:6.67*speed);
  return (ground?0:100)+Math.hypot(lateral,depth);
 };
 const ranked=plans.map(plan=>({seat:plan.seat,cost:cost(plan)}));
 return ranked.reduce((best,plan)=>plan.cost<best.cost?plan:best).seat;
}
export function supportPosition(s:MatchState,seat:Seat){
 const p=s.players[seat],mate=s.players[partner(seat)],sign=side(seat,s);
 if(!mate)return {x:0,z:sign*9.8};
 // Cover the opposite half and stagger depth instead of both chasing the ball.
 const x=mate.x>=0?-2.6:2.6;
 const z=sign*(Math.abs(mate.z)>7?3.4:10);
 const b=s.ball;
 if(s.rally>1&&teamOf(b.hitter)!==teamOf(seat)&&b.vz*sign>0){
  const landing=reception(b,p,seat);
  if(landing.z*sign>p.z*sign+2&&p.z*sign<7){
   // Passed at any height: cover behind the service line, even if a previous swipe
   // queued while standing at the net. Do not freeze on the old tx/tz.
   return {x,z:sign*Math.min(10.5,Math.max(7.6,landing.z*sign-.8))};
  }
 }
 return p.shotQueued?{x:p.tx,z:p.tz}:{x,z};
}
