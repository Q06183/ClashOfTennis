import {clamp,type Vec} from './types.js';
/** Arcade topspin: additional downward acceleration and a bounded bounce kick. */
export const spinAmount=(value=0)=>Number.isFinite(value)?clamp(value,0,1):0;
export const flightGravity=(ball:{topspin?:number})=>9.81+6*spinAmount(ball.topspin);
export const topspinCharge=(holdMs:number)=>clamp((holdMs-350)/550,0,1);

/** Shared by authority and touch projection so aim uses the flight we actually launch. */
export function flightTime(start:Vec,target:Vec,power:number,speed:number,gravity:number,options:{smash?:boolean;critical?:boolean;lob?:boolean}={}){
 const {smash,critical,lob}=options,distance=Math.hypot(target.x-start.x,target.z-start.z);
 // A long defensive ball must not be accelerated just to meet the old 1.85s
 // arcade ceiling. Keep short attacking/net balls fast and respect real range.
 let duration=clamp(distance/((11+power*12)*(smash?1.25:critical?1.14:1)*speed),smash?.32:critical?.42:.48,3.2)+(lob?.85:0);
 const crossing=-start.z/(target.z-start.z);
 if(crossing>0&&crossing<1){const baseHeight=start.y*(1-crossing)+target.y*crossing;const minimum=Math.sqrt(Math.max(0,(1.16+(lob?.7:0)-baseHeight)/((gravity/2)*crossing*(1-crossing))));duration=Math.max(duration,minimum+.002);}
 return duration;
}
