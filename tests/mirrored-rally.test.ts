import {test} from 'node:test';import assert from 'node:assert/strict';
import {CHARACTERS} from '../src/simulation/characters.js';import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';import {aiInput} from '../src/simulation/ai.js';import type {Seat} from '../src/simulation/types.js';
test('complete rallies mirror exactly when only handedness and inputs mirror',async()=>{
 await initPhysics();const character=CHARACTERS[0],original=character.handedness;let comparisons=0;
 try{for(let seed=1;seed<=40;seed++){
  const right=new Match(['lin','lin'],()=>.5),left=new Match(['lin','lin'],()=>.5);
  try{
   for(const [m,mirror] of [[right,1],[left,-1]] as const){
    m.state.phase='rally';m.state.rally=2;(m as unknown as {sinceHit:number}).sinceHit=1;
    m.state.players.forEach((p,i)=>Object.assign(p,{x:mirror*Math.sin(seed+i)*2,z:i?-10:10,tx:mirror*Math.sin(seed+i)*2,tz:i?-10:10}));
    m.physics.place({x:mirror*Math.sin(seed)*2,y:2,z:-4},{x:mirror*Math.sin(seed*.6)*2,y:2,z:13});Object.assign(m.state.ball,m.physics.read(),{bounces:0,hitter:1});
   }
   for(let tick=0;tick<1000&&right.state.phase==='rally';tick++){
    for(const seat of [0,1] as Seat[]){character.handedness='right';const cmd=aiInput(right.state,seat,'standard');if(!cmd)continue;right.input(seat,cmd);character.handedness='left';left.input(seat,cmd.type==='move'?{...cmd,x:-cmd.x}:{...cmd,aim:-cmd.aim});}
    character.handedness='right';right.step(1/60);character.handedness='left';left.step(1/60);
    const context=`seed=${seed},tick=${tick}`;
    for(const seat of [0,1] as Seat[]){const a=right.state.players[seat],b=left.state.players[seat];assert.ok(Math.abs(a.x+b.x)<1e-8,context);assert.ok(Math.abs(a.z-b.z)<1e-8,context);comparisons++;}
    const a=right.state.ball,b=left.state.ball;assert.ok(Math.abs(a.x+b.x)<1e-8,context);assert.ok(Math.abs(a.z-b.z)<1e-8,context);assert.equal(right.state.phase,left.state.phase,context);
   }
  }finally{right.dispose();left.dispose();}
 }assert.ok(comparisons>10000);}finally{character.handedness=original;}
});
