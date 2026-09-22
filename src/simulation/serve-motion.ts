import {clamp} from './types.js';
export const SERVE_DURATION=1.2;
export const TOSS_RELEASE=.28;
const smooth=(x:number)=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
/** Fixed overhead contact column preserves the aim projection; only the toss height changes. */
export function serveBallHeight(progress:number){
 const p=clamp(progress,0,1),releaseHeight=1.98;
 if(p<=TOSS_RELEASE)return 1.25+(releaseHeight-1.25)*smooth(p/TOSS_RELEASE);
 const flight=SERVE_DURATION*(1-TOSS_RELEASE),velocity=(2.65-releaseHeight+4.905*flight*flight)/flight,t=(p-TOSS_RELEASE)*SERVE_DURATION;
 return releaseHeight+velocity*t-4.905*t*t;
}
/** Palm follows the held ball, then points up before folding back into the trunk. */
export function serveTossHand(progress:number){
 if(progress<=TOSS_RELEASE)return serveBallHeight(progress)-.10;
 if(progress<=.44)return 1.88+.16*smooth((progress-TOSS_RELEASE)/(.44-TOSS_RELEASE));
 if(progress<=.62)return 2.04;
 return 2.04-.74*smooth((progress-.62)/.38);
}
