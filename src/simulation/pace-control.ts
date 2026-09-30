import {clamp,type MatchMode} from './types.js';

/** Ordinary pace gets full placement forgiveness; power progressively removes
 * it, and a full-power strike is unassisted. Never add random heading error. */
export function placementAssist(power:number){
 const t=clamp((power-.38)/.62,0,1);
 return 1-t*t*(3-2*t);
}
/** Identity in the central region, C1 at the boundary, monotone everywhere.
 * Soft shoulders retain directional ordering rather than snapping to a line. */
export function softPlacement(value:number,inner:number,limit:number){
 const distance=Math.abs(value);
 return distance<=inner?value:Math.sign(value)*(inner+(limit-inner)*(1-Math.exp(-(distance-inner)/(limit-inner))));
}
export function controlledPlacement(rawX:number,rawZ:number,assist:number,mode:MatchMode='singles'){
 return {
  x:rawX+(softPlacement(rawX,mode==='doubles'?3.7:2.6,mode==='doubles'?5.2:3.9)-rawX)*assist,
  z:rawZ+(softPlacement(rawZ,8.5,10.7)-rawZ)*assist,
 };
}
