import {COURT} from '../simulation/rules.js';
import {side,type MatchState} from '../simulation/types.js';

/** Corner targets on the opponent's half; each one hit earns a star. */
export const TARGET_DRILL={stars:3,halfWidth:1.5,halfDepth:2.2,centerX:2.6,centerDepth:9.4} as const;
export type TargetZone={x:number;z:number;halfWidth:number;halfDepth:number};

/** Opponent-half zone for the local learner (seat 0), honouring end changes. */
export function targetZone(s:MatchState,index:number):TargetZone{
  const opponent=-side(0,s),corner=index%2===0?1:-1;
  return {x:corner*TARGET_DRILL.centerX,z:opponent*TARGET_DRILL.centerDepth,halfWidth:TARGET_DRILL.halfWidth,halfDepth:TARGET_DRILL.halfDepth};
}
export const inZone=(zone:TargetZone,x:number,z:number)=>
  Math.abs(x-zone.x)<=zone.halfWidth&&Math.abs(z-zone.z)<=zone.halfDepth&&
  Math.abs(x)<=COURT.halfWidth&&Math.abs(z)<=COURT.halfLength;

/** Tracks one learner flight at a time; a star needs a legal first bounce inside the zone. */
export class TargetDrill {
  stars=0;
  index=0;
  private flight=-1;
  private judged=-1;
  get complete(){return this.stars>=TARGET_DRILL.stars;}
  zone(s:MatchState){return this.complete?null:targetZone(s,this.index);}
  observe(s:MatchState){
    if(this.complete||s.phase!=='rally')return false;
    const b=s.ball;
    if(b.hitter===0&&s.rally>1&&this.flight!==s.rally)this.flight=s.rally;
    if(this.flight===s.rally&&this.judged!==s.rally&&b.hitter===0&&b.bounces===1){
      this.judged=s.rally;
      if(inZone(targetZone(s,this.index),b.x,b.z)){this.stars++;this.index++;return true;}
    }
    return false;
  }
  get label(){return `${'★'.repeat(this.stars)}${'☆'.repeat(TARGET_DRILL.stars-this.stars)}`;}
}
