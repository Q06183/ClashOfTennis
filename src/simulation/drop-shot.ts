import {clamp,type Shot} from './types.js';

const fade=(value:number,low:number,high:number)=>{
 const t=clamp((value-low)/(high-low),0,1);return 1-t*t*(3-2*t);
};
/** Touch is inferred from validated depth/pace, not a client-only magic flag.
 * Fade out smoothly so medium strokes retain their existing deep placement. */
export function dropStrength(shot:Shot){
 if(shot.lob||(shot.topspin??0)>.01||shot.critical)return 0;
 return fade(shot.depth,.13,.32)*fade(shot.power,.16,.38);
}
export function dropRebound(v:{x:number;y:number;z:number},strength=0){
 const amount=clamp(strength,0,1),pace=1-.68*amount;
 return {x:v.x*pace,y:v.y+(Math.min(v.y*.5,3)-v.y)*amount,z:v.z*pace};
}
