import type {Match} from '../../src/simulation/match.js';
import {side,type Seat,type RescueStroke} from '../../src/simulation/types.js';
import {handedness} from '../../src/simulation/characters.js';
/** Earlier observation of the same lateral arrival. Gives a bounded-speed
 * dive time to travel, instead of requiring 2–3.5m in the last 120–200ms. */
export function rescueIncoming(m:Match,seat:Seat,kind:RescueStroke='forehand',gap=3.4){
 const p=m.state.players[seat],sign=side(seat);
 // Isolate emergency reach even for the all-99 runner; ordinary-return
 // priority at high total stamina is covered by separate tests.
 if(p.characterId==='wuming'){p.totalStamina=.1;gap=Math.max(gap,3.65);}
 const air=kind==='volley'||kind==='smash';
 if(air){p.z=14*sign;p.tz=p.z;gap=Math.max(gap,3.65);p.stamina=0;p.totalStamina=.1;}
 m.physics.place({x:p.x+gap*(kind==='backhand'?-1:1)*sign*handedness(p.characterId),
  y:kind==='smash'?2.2:1.8,z:p.z-(air?4.5:4)*sign},
  {x:0,y:air?3:1.5,z:8*sign});
 Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:kind==='forehand'||kind==='backhand'?1:0});
}
