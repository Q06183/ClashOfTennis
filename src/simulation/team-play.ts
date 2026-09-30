import {side,teamOf,other,partner,seatsFor,type MatchState,type Seat} from './types.js';
import {receiverForPoint} from './rules.js';
import {reception} from './reception.js';
import {canReturnNormally} from './skills.js';
import {overheadPlan} from './overhead-plan.js';
import {characterEffects} from './characters.js';
import {effectiveStamina} from './stamina.js';
import {canWaitForBounce} from './return-plan.js';

/** Only assistance is assigned. Either partner may manually intercept a rally.
 * A serve always belongs to its nominated receiver until returned. */
export function assistedReceiver(s:MatchState,service=s.rally===1):Seat{
 if(s.mode!=='doubles')return other(s.ball.hitter);
 if(service)return s.receiver??receiverForPoint(s.server,s.score[0]+s.score[1],s.mode);
 const candidates=seatsFor(s.mode).filter(i=>teamOf(i)!==teamOf(s.ball.hitter));
 const b=s.ball;
 // A deep lob on one wing belongs to that wing when its player can get
 // there. Raw distance otherwise sends the opposite back player diagonally
 // through their partner and leaves the front player standing still.
 if(b.bounces===0&&(b.tier==='lob'||b.y>2.45)){
  for(const seat of candidates){
   const p=s.players[seat],mate=s.players[partner(seat)],target=reception(b,p,seat);
   const wing=Math.sign(target.point.x);
   if(Math.abs(target.point.x)>.75&&target.z*side(seat,s)>7&&p.x*wing>.4&&mate.x*wing<-.4&&
      !p.rescue&&(overheadPlan(b,p,seat)||canWaitForBounce(b,p,seat)))return seat;
  }
 }
 const cost=(seat:Seat)=>{
  const p=s.players[seat],b=s.ball;
  if(!p.rescue&&b.z*side(seat,s)>.35&&canReturnNormally(b,p,seat))return -10;
  if(p.rescue&&!p.rescue.hit)return -9;
  if(p.rescue)return 100;
  const overhead=overheadPlan(b,p,seat);
  if(overhead)return -5+overhead.time;
  const target=reception(b,p,seat);
  const speed=characterEffects(p.characterId).movement*(.75+.25*effectiveStamina(p));
  // Use travel time, including slower retreat, rather than raw distance.
  const lateral=(target.x-p.x)/(5.98*speed),depth=(target.z-p.z)/((target.z-p.z)*side(seat,s)>0?4.945*speed:6.67*speed);
  return Math.hypot(lateral,depth);
 };
 return candidates.reduce((best,seat)=>cost(seat)<cost(best)?seat:best);
}
export function supportPosition(s:MatchState,seat:Seat){
 const p=s.players[seat],mate=s.players[partner(seat)],sign=side(seat,s);
 if(!mate)return {x:0,z:sign*9.8};
 // Cover the opposite half and stagger depth instead of both chasing the ball.
 const x=mate.x>=0?-2.6:2.6;
 const z=sign*(Math.abs(mate.z)>7?3.4:10);
 const b=s.ball;
 if(s.rally>1&&teamOf(b.hitter)!==teamOf(seat)&&b.bounces===0&&b.vz*sign>0&&b.y>2.45){
  const landing=reception(b,p,seat);
  if(landing.z*sign>p.z*sign+2&&p.z*sign<7){
   // Passed overhead: cover behind the service line, even if a previous swipe
   // queued while standing at the net. Do not freeze on the old tx/tz.
   return {x,z:sign*Math.min(10.5,Math.max(7.6,landing.z*sign-.8))};
  }
 }
 return p.shotQueued?{x:p.tx,z:p.tz}:{x,z};
}
