import {effectiveStamina} from '../simulation/stamina.js';
import type {PlayerState} from '../simulation/types.js';

/**
 * One slim bar per player. The solid fill is this point's usable strength
 * (point × match); the pale buffer behind it is the remaining match reserve.
 * Exact percentages remain available to assistive tech and as a tooltip.
 */
export function staminaBars(side:'me'|'them'){
 return `<div class="stamina-row combined" id="stamina-label-${side}" role="img" aria-label="体力 · 本分 100% · 总体 100%"><div class="stamina"><b id="total-stamina-${side}" class="stamina-reserve"></b><i id="stamina-${side}"></i></div></div>`;
}
export function staminaLabels(p:Pick<PlayerState,'stamina'|'totalStamina'>){
 return {
  point:`本分 ${Math.round(p.stamina*100)}%`,
  total:`总体 ${Math.round((p.totalStamina??1)*100)}%`,
  effective:`有效体力 ${Math.round(effectiveStamina(p)*100)}%`,
 };
}
