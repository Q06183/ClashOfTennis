import type {MatchState,Seat} from '../simulation/types.js';

/** Presentation-only lock. Never changes movement or authoritative shot timing. */
export class AimCameraLock {
 private touching=false;
 private pending:{rally:number;seat:Seat;score:string;remaining:number}|null=null;
 pointer(active:boolean){this.touching=active;}
 shot(s:MatchState,seat:Seat){
  if(!(s.phase==='serve'&&s.server===seat||s.phase==='rally'&&s.ball.hitter!==seat))return;
  this.pending={rally:s.rally,seat,score:s.score.join(':'),remaining:8};
 }
 reset(){this.touching=false;this.pending=null;}
 update(s:MatchState,dt:number){
  const p=this.pending;
  if(p){
   p.remaining-=dt;
   if(p.remaining<=0||s.phase==='point'||s.phase==='over'||s.score.join(':')!==p.score||
      s.rally>p.rally+1||s.rally<p.rally||
      s.rally===p.rally+1&&(s.ball.hitter!==p.seat||s.ball.bounces>0))this.pending=null;
  }
  return this.touching||this.pending!==null;
 }
}
