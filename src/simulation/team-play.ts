import {side,teamOf,other,partner,seatsFor,type MatchState,type Seat} from './types.js';
import {receiverForPoint} from './rules.js';
import {reception} from './reception.js';
import {canReturnNormally} from './skills.js';

/** Only assistance is assigned. Either partner may manually intercept a rally.
 * A serve always belongs to its nominated receiver until returned. */
export function assistedReceiver(s:MatchState,service=s.rally===1):Seat{
 if(s.mode!=='doubles')return other(s.ball.hitter);
 if(service)return s.receiver??receiverForPoint(s.server,s.score[0]+s.score[1],s.mode);
 const candidates=seatsFor(s.mode).filter(i=>teamOf(i)!==teamOf(s.ball.hitter));
 const cost=(seat:Seat)=>{
  const p=s.players[seat],b=s.ball;
  if(b.z*side(seat,s)>.35&&canReturnNormally(b,p,seat))return -10;
  if(p.rescue&&!p.rescue.hit)return -9;
  const target=reception(b,p,seat);
  return Math.hypot(target.x-p.x,target.z-p.z);
 };
 return candidates.reduce((best,seat)=>cost(seat)<cost(best)?seat:best);
}
export function supportPosition(s:MatchState,seat:Seat){
 const p=s.players[seat],mate=s.players[partner(seat)],sign=side(seat,s);
 if(!mate)return {x:0,z:sign*9.8};
 // Cover the opposite half and stagger depth instead of both chasing the ball.
 const x=mate.x>=0?-2.6:2.6;
 const z=sign*(Math.abs(mate.z)>7?3.4:10);
 return p.shotQueued?{x:p.tx,z:p.tz}:{x,z};
}
