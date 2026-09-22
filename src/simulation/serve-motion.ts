import {clamp} from './types.js';
export const SERVE_DURATION=1.2;
export const TOSS_RELEASE=.28;
export const SERVE_RECOVERY=.72;
/** One clock across windup, impact and recovery; phase 1 is real contact. */
export const servePhase=(progress:number|undefined,swing:number)=>progress??(1+(SERVE_RECOVERY-clamp(swing,0,SERVE_RECOVERY))/SERVE_DURATION);
const smooth=(x:number)=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
/** Fixed overhead contact column preserves the aim projection; only the toss height changes. */
export function serveBallHeight(progress:number){
 const p=clamp(progress,0,1),releaseHeight=1.98;
 const flight=SERVE_DURATION*(1-TOSS_RELEASE),velocity=(2.65-releaseHeight+4.905*flight*flight)/flight,t=(p-TOSS_RELEASE)*SERVE_DURATION;
 if(p<=TOSS_RELEASE){const u=p/TOSS_RELEASE,delta=releaseHeight-1.25,end=velocity*SERVE_DURATION*TOSS_RELEASE;return 1.25+(3*delta-end)*u*u+(end-2*delta)*u*u*u;}
 return releaseHeight+velocity*t-4.905*t*t;
}
/** Palm follows the held ball, then points up before folding back into the trunk. */
export function serveTossHand(progress:number){
 if(progress<=TOSS_RELEASE)return serveBallHeight(progress)-.10;
 const releaseVelocity=(2.65-1.98+4.905*(SERVE_DURATION*(1-TOSS_RELEASE))**2)/(SERVE_DURATION*(1-TOSS_RELEASE));
 const elapsed=(progress-TOSS_RELEASE)*SERVE_DURATION,brake=.1,high=1.88+releaseVelocity*brake/2;
 if(elapsed<brake)return 1.88+releaseVelocity*(elapsed-elapsed*elapsed/(2*brake));
 if(progress<=.56)return high;
 return high-(high-1.3)*smooth((progress-.56)/.44);
}
