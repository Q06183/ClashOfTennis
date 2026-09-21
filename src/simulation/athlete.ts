import {clamp} from './types.js';
/** Shared physical dimensions; renderer and hit eligibility use the same racket. */
export const RACKET={sweet:.45,secondHand:.10,headRadius:.132,headStretch:1.3,rim:.01};
export const contactCrouch=(height:number)=>clamp((.9-height)*.45,0,.24);
export function contactTurn(_x:number,z:number,backhand:boolean){
 const late=clamp(-z/.5,0,1),smooth=late*late*(3-2*late);
 return backhand?.62+.22*smooth:-.12-.43*smooth;
}
export function canReachContact(x:number,y:number,z:number,backhand:boolean,singleHand=false){
 const turn=contactTurn(x,z,backhand),c=Math.cos(turn),s=Math.sin(turn);
 const right=Math.hypot(x+.31*c,y-(1.385-contactCrouch(y)),z-.05-.31*s);
 const left=Math.hypot(x-.31*c,y-(1.385-contactCrouch(y)),z-.05+.31*s);
 return right<1.07&&(!backhand||singleHand||left<.99);
}
