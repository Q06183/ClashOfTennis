import {rescueChance,RESCUE_LABELS,RESCUE} from '../simulation/rescue.js';
import type {MatchState,Seat} from '../simulation/types.js';

export function rescueHint(s:MatchState,seat:Seat):string|undefined {
 const r=s.players[seat].rescue;
 if(r&&s.time-r.startedAt>=RESCUE.landAt&&s.time-r.startedAt<RESCUE.duration){
  return s.time-r.startedAt<RESCUE.riseAt?'跳接落地缓冲中 · 暂时不能移动或击球':'正在起身 · 稍后恢复移动和击球';
 }
 if(r&&!r.hit)return `${RESCUE_LABELS[r.stroke??'forehand']}中…`;
 if(!s.ball.rescue)return;
 const hitter=s.ball.hitter,stroke=s.players[hitter].rescue?.stroke;
 const label=stroke?RESCUE_LABELS[stroke]:'极限救球';
 return hitter===seat?`${label}！回球变慢，尽快恢复站位`:`对手${label} · 注意偏移后的落点`;
}
export const rescueChanceText=(stamina:number)=>`当前体力的跳身救球概率 ${Math.round(rescueChance(stamina)*1000)/10}% · 仅用于正常够不到的球`;
