import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTERS,characterEffects} from '../src/simulation/characters.js';
import {Match} from '../src/simulation/match.js';
import {movePlayer} from '../src/simulation/movement.js';
import {initPhysics} from '../src/simulation/physics.js';
import {predictFlight} from '../src/simulation/trajectory.js';
import {aiInput} from '../src/simulation/ai.js';
import {side,type Seat} from '../src/simulation/types.js';
import {spendStamina,settlePointStamina,beginPointStamina,pointRecoveryRate} from '../src/simulation/stamina.js';

before(initPhysics);
test('all roster effects reach actual movement, endurance and serve on either seat',()=>{
 for(const c of CHARACTERS)for(const seat of [0,1] as Seat[]){
  const e=characterEffects(c.id),m=new Match([c.id,c.id]),p=m.state.players[seat],sign=side(seat);
  try{
   p.x=-4;p.tx=4;p.tz=p.z;p.vx=0;p.vz=0;p.stamina=1;
   movePlayer(p,seat,1/60);
   assert.ok(Math.abs(p.vx!-14.95*e.movement/60)<1e-10,`${c.id} acceleration`);
   spendStamina(p,.8);settlePointStamina(p);
   assert.ok(Math.abs(p.totalStamina!-(.84+.16*pointRecoveryRate(c.id)))<1e-10,`${c.id} point recovery`);
   p.totalStamina=1;beginPointStamina(p);
   m.state.server=seat;
   m.input(seat,{type:'shot',aim:0,depth:.5,power:.4,lob:false});
   for(let i=0;i<120&&m.state.rally===0;i++)m.step(1/60);
   assert.equal(m.state.rally,1,`${c.id} serve`);
   assert.ok(Math.abs(p.stamina-(1-(.022+.028*.4)*e.drain*e.serve))<1e-8,`${c.id} strike drain`);
   const prediction=predictFlight(m.state.ball);
   assert.equal(prediction.hitNet,false);
   assert.ok(Math.abs(prediction.landing.x-m.state.ball.targetX)<.02);
   assert.ok(Math.abs(prediction.landing.z-m.state.ball.targetZ)<.02);
  }finally{m.dispose();}
  for(const moving of [false,true]){
   const rally=new Match([c.id,c.id]),runner=rally.state.players[seat];
   try{
    rally.state.phase='rally';rally.state.rally=2;
    Object.assign(runner,{x:-4,z:10*sign,tx:moving?4:-4,tz:10*sign,vx:0,vz:0,stamina:.5});
    rally.physics.place({x:0,y:3,z:sign},{x:0,y:0,z:-3*sign});
    Object.assign(rally.state.ball,rally.physics.read(),{hitter:seat});
    rally.step(1/60);
    const expected=.5+(moving?-.013*e.drain:.006*e.recovery)/60;
    assert.ok(Math.abs(runner.stamina-expected)<1e-10,`${c.id} ${moving?'running':'idle'}`);
   }finally{rally.dispose();}
  }
 }
});
test('every ordinary player completes a seeded risk-taking match against the baseline from either seat',()=>{
 for(const c of CHARACTERS.filter(c=>!c.hidden))for(const seat of [0,1] as const){
  const pair:readonly [string,string]=seat===0?[c.id,'lin']:['lin',c.id];
  let seed=17;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const match=new Match(pair,random);
  try{
   for(let tick=0;tick<60*1800&&match.state.phase!=='over';tick++){
    for(const s of [0,1] as const){
     const input=aiInput(match.state,s,'standard');
     // Risk-taking shots deliberately include wide/deep errors. This tests the
     // real score/end flow, not whether two perfect conservative AIs finish.
     if(input?.type==='shot'&&match.state.phase==='rally'){
      input.aim=(random()*2-1)*1.1;input.power=.85;input.depth=.7+random()*.3;input.lob=false;
     }
     if(input)match.input(s,input);
    }
    match.step(1/60);
    if(tick%60===0)for(const p of match.state.players)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.stamina>=0&&p.stamina<=1);
   }
   assert.equal(match.state.phase,'over',`${pair}: ${match.state.score}`);
   assert.ok(Math.max(...match.state.score)>=7&&Math.abs(match.state.score[0]-match.state.score[1])>=2);
  }finally{match.dispose();}
 }
});
