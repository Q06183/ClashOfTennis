import {clamp} from './types.js';
/** Arcade topspin: additional downward acceleration and a bounded bounce kick. */
export const spinAmount=(value=0)=>Number.isFinite(value)?clamp(value,0,1):0;
export const flightGravity=(ball:{topspin?:number})=>9.81+6*spinAmount(ball.topspin);
export const topspinCharge=(holdMs:number)=>clamp((holdMs-350)/550,0,1);
