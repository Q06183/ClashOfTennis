import {effectiveStamina} from '../simulation/stamina.js';
import type {PlayerState} from '../simulation/types.js';

export function staminaBars(side:'me'|'them'){
 return `<div class="stamina-row"><span id="stamina-label-${side}">本分 100%</span><div class="stamina"><i id="stamina-${side}"></i></div></div>
 <div class="stamina-row total"><span id="total-stamina-label-${side}">总体 100%</span><div class="stamina"><i id="total-stamina-${side}"></i></div></div>`;
}
export function staminaLabels(p:Pick<PlayerState,'stamina'|'totalStamina'>){
 return {
  point:`本分 ${Math.round(p.stamina*100)}%`,
  total:`总体 ${Math.round((p.totalStamina??1)*100)}%`,
  effective:`有效体力 ${Math.round(effectiveStamina(p)*100)}%`,
 };
}
