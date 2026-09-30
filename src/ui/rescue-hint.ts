import {rescueChance,rescueAge,RESCUE_LABELS,RESCUE} from '../simulation/rescue.js';
import {teamOf,type MatchState,type Seat} from '../simulation/types.js';

export function rescueHint(s:MatchState,seat:Seat):string|undefined {
 const hold=s.rescueWindow;
 if(hold)return hold.seat===seat?`滑动回击 · 剩余 ${hold.remaining.toFixed(1)} 秒`:`${teamOf(hold.seat)===teamOf(seat)?'队友':'对手'}正在补滑回击 · 回合暂时定格`;
 const r=s.players[seat].rescue;
 const age=rescueAge(s.players[seat],s.time);
 if(r&&age>=RESCUE.landAt&&age<RESCUE.duration){
  return age<RESCUE.riseAt?'跳接落地缓冲中 · 暂时不能移动或击球':'正在起身 · 稍后恢复移动和击球';
 }
 if(r&&!r.hit)return `${RESCUE_LABELS[r.stroke??'forehand']}中…`;
 if(!s.ball.rescue)return;
 const hitter=s.ball.hitter,stroke=s.players[hitter].rescue?.stroke;
 const label=stroke?RESCUE_LABELS[stroke]:'极限救球';
 return hitter===seat?`${label}！回球变慢，尽快恢复站位`:`${teamOf(hitter)===teamOf(seat)?'队友':'对手'}${label} · 注意偏移后的落点`;
}
export const rescueChanceText=(stamina:number)=>`总体力跳接概率 ${Math.round(rescueChance(stamina)*1000)/10}% · 普通接不到时才尝试左右侧扑`;
