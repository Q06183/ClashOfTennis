import type {Shot,ShotTier} from './types.js';
import {dropStrength} from './drop-shot.js';
/** Shared tiers keep touch feedback, authoritative depth and flight colours aligned. */
export const SHOT_PROFILES={
 slice:{label:'切削球',color:0xddefff,depthPush:0,servePush:0},
 smash:{label:'高压球',color:0xffd64d,depthPush:.4,servePush:0},
 topspin:{label:'上旋球',color:0x44e0c0,depthPush:0,servePush:0},
 normal:{label:'普通球',color:0xbdec71,depthPush:0,servePush:0},
 fast:{label:'快速球',color:0x51c7ff,depthPush:.35,servePush:.18},
 power:{label:'强力球',color:0xffac43,depthPush:.85,servePush:.45},
 critical:{label:'暴击球',color:0xff5179,depthPush:1.75,servePush:1.0},
 lob:{label:'高吊球',color:0xa995ff,depthPush:0,servePush:0},
} as const;
export function shotTier(shot:Pick<Shot,'power'|'lob'|'critical'|'topspin'|'slice'>):ShotTier{
 return shot.slice?'slice':shot.lob?'lob':(shot.topspin??0)>.01?'topspin':shot.critical&&shot.power>=.9?'critical':shot.power>=.7?'power':shot.power>=.38?'fast':'normal';
}
export function shotDepth(shot:Shot,serve:boolean){
 // Downward serves reverse the gesture but retain the overhead serve's pace/depth.
 const profile=SHOT_PROFILES[shotTier(serve&&shot.slice?{...shot,slice:false}:shot)];
 const normal=(serve?3.4+shot.depth*2.6:2.8+shot.depth*8.6)+(serve?profile.servePush:profile.depthPush)*(.5+shot.depth);
 const touch=serve?0:dropStrength(shot);
 return normal+(1.15+shot.depth*4-normal)*touch;
}
