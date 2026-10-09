import type { Match } from './match.js';
import {assistedReceiver} from './team-play.js';
import { side, teamOf, type MatchState, type Seat, type Input } from './types.js';
export function aiInput(s: MatchState, seat: Seat, difficulty: 'relaxed'|'standard'='relaxed'): Input | null {
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
  return {type:'shot',aim:angle*(difficulty==='relaxed'?.58:.92),depth:.38+.5*Math.abs(Math.cos(s.time*.8)),
    power:difficulty==='relaxed'?.35:.68,lob:s.rally%9===0};
}
export function driveAI(match: Match, seat: Seat, difficulty: 'relaxed'|'standard'='relaxed') {
  const command=aiInput(match.state,seat,difficulty);if(command)match.input(seat,command);
}
