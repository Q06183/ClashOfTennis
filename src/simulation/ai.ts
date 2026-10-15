import type { Match } from './match.js';
import {assistedReceiver} from './team-play.js';
import { clamp, side, teamOf, type MatchState, type Seat, type Input } from './types.js';
export type AIDifficulty='relaxed'|'standard';
/** Relaxed-only openness in [-1,1]: positive gives the learner more attackable balls. */
export type AIOptions={openness?:number};
/** Deterministic per-flight value in [0,1), so replays and tests stay reproducible. */
const flightNoise=(s:MatchState,seat:Seat)=>{const v=Math.sin((s.rally+1)*12.9898+(s.score[0]*7+s.score[1]*13+seat)*78.233)*43758.5453;return v-Math.floor(v);};
/** Relaxed partner leaves a short, central ball on part of its returns. */
export function relaxedOpening(s:MatchState,seat:Seat,openness=0){
  const chance=clamp(.28+.14*clamp(openness,-1,1),.12,.45);
  return flightNoise(s,seat)<chance;
}
export function aiInput(s: MatchState, seat: Seat, difficulty: AIDifficulty='relaxed', options:AIOptions={}): Input | null {
  if(s.phase==='serve') {
    if(s.server!==seat||Math.sin(s.time*3)<.6) return null;
    return {type:'shot',aim:Math.sin(s.time)*.28,depth:.45,power:.48,lob:false};
  }
  if(s.phase!=='rally') return null;
  const b=s.ball,p=s.players[seat];
  if(s.mode==='doubles'&&assistedReceiver(s)!==seat) {
    // Match already moves every unassigned player into support. Issuing a
    // synthetic tap here renews manualUntil and delays the next assignment.
    return null;
  }
  if(teamOf(b.hitter)===teamOf(seat)) {
    return {type:'move',x:Math.sin(s.time*.4)*.4,z:side(seat,s)*9.8};
  }
  if(s.mode==='doubles'&&s.rally===1&&b.bounces===0)return null;
  // Reaction varies with rally length and position; every miss is a physical miss.
  const distance=Math.hypot(p.x-b.x,p.z-b.z);
  const slow=difficulty==='relaxed'&&s.rally%7===0;
  if(distance>(slow?.6:2.2)||b.z*side(seat,s)<.4||b.y>3.3) return null;
  const angle=Math.sin(s.time*1.37+seat*2.2);
  if(difficulty==='relaxed'&&relaxedOpening(s,seat,options.openness)){
    // An attackable ball: mid-court, central and slow. Still a legal physical return.
    return {type:'shot',aim:angle*.22,depth:.16+.12*Math.abs(Math.cos(s.time*.8)),power:.3,lob:false};
  }
  return {type:'shot',aim:angle*(difficulty==='relaxed'?.58:.92),depth:.38+.5*Math.abs(Math.cos(s.time*.8)),
    power:difficulty==='relaxed'?.35:.68,lob:s.rally%9===0};
}
export function driveAI(match: Match, seat: Seat, difficulty: AIDifficulty='relaxed', options:AIOptions={}) {
  const command=aiInput(match.state,seat,difficulty,options);if(command)match.input(seat,command);
}
/** Local-only adaptation from the last three finished practice results (true = learner won). */
export function practiceOpenness(recent:readonly boolean[]){
  const last=recent.slice(-3);if(!last.length)return 0;
  const losses=last.filter(won=>!won).length;
  return clamp((2*losses-last.length)/3,-1,1);
}
