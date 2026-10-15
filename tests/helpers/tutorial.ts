import assert from 'node:assert/strict';
import type {Match} from '../../src/simulation/match.js';
import type {PracticeTutorial} from '../../src/ui/practice-tutorial.js';
const shot={type:'shot' as const,aim:0,depth:.5,power:.35,lob:false};
export function advance(coach:PracticeTutorial,match:Match,predicate:()=>boolean,limit=3600){
  for(let i=0;i<limit&&!predicate();i++)coach.step(match,1/60);
  assert.ok(predicate(),JSON.stringify({stage:coach.stage,state:match.state}));
}
export function opening(coach:PracticeTutorial,match:Match){
  const p=match.state.players[0];
  coach.input(match,{type:'move',x:p.x+1,z:p.z+.5});
  advance(coach,match,()=>coach.stage==='serve');
  coach.input(match,shot);
  advance(coach,match,()=>coach.stage==='return');
}
export function returnBall(coach:PracticeTutorial,match:Match,next:string,slice=false){
  advance(coach,match,()=>coach.held(match));
  coach.input(match,{...shot,slice});
  advance(coach,match,()=>coach.stage===next);
}
/** Plays the real final lesson like a learner: serve, then return each ball to alternating sides. */
export function winFinal(coach:PracticeTutorial,match:Match,limit=60*120){
  let last=-1;
  advance(coach,match,()=>{
    const s=match.state;
    if(s.phase==='serve'&&s.server===0&&!s.players[0].preparation)coach.input(match,shot);
    if(s.phase==='rally'&&s.ball.hitter===1&&s.rally!==last){last=s.rally;coach.input(match,{...shot,aim:(s.rally%2?1:-1)*.7,depth:.6,power:.4});}
    return coach.completed;
  },limit);
}
export function recover(coach:PracticeTutorial,match:Match){
  const target=coach.movementTarget(match)!;
  coach.input(match,{type:'move',...target});
  advance(coach,match,()=>coach.stage==='return-again');
}

