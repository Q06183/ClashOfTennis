import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {assistedReceiver,supportPosition} from '../src/simulation/team-play.js';
import {canReachBouncedReturn,canWaitForBounce,returnPlan} from '../src/simulation/return-plan.js';
import {canReturnNormally} from '../src/simulation/skills.js';
import {aiInput,driveAI} from '../src/simulation/ai.js';
import {partner,side,other,type Seat} from '../src/simulation/types.js';
import type {SurfaceId} from '../src/simulation/surfaces.js';

before(initPhysics);
const shot={type:'shot',aim:0,depth:.5,power:.5,lob:false} as const;
function passingBall(seat:Seat=2,ends:0|1=0,surface:SurfaceId='hard',wing=1,pace=7){
 const m=new Match(['lin','lin','lin','lin'],()=>1,{mode:'doubles',surface}),s=m.state;
 s.phase='rally';s.rally=2;s.time=1;s.ends=ends;s.ball.ends=ends;
 (m as any).sinceHit=1;
 s.players.forEach(p=>p.ends=ends);
 const sign=side(seat,s),x=wing*sign;
 Object.assign(s.players[seat],{x:3*x,z:3.4*sign,tx:3*x,tz:3.4*sign});
 Object.assign(s.players[partner(seat)],{x:-2*x,z:10*sign,tx:-2*x,tz:10*sign});
 const b={x:x,y:1.8,z:2*sign,vx:3*x,vy:0,vz:pace*sign};
 m.physics.place(b,{x:b.vx,y:b.vy,z:b.vz});
 Object.assign(s.ball,b,{hitter:other(seat),bounces:0,tier:'normal'});
 return m;
}

test('ordinary diagonal pass goes to the reachable same-wing front player, not the shorter but late cross-court runner',()=>{
 const m=passingBall();
 try{
  const s=m.state;
  assert.equal(canWaitForBounce(s.ball,s.players[2],2),true);
  assert.equal(canWaitForBounce(s.ball,s.players[0],0),false);
  assert.equal(returnPlan(s.ball,s.players[2],2,false).air,false,'this is not a lob or volley');
  assert.equal(assistedReceiver(s),2);
 }finally{m.dispose();}
});

test('front player retreats and returns an ordinary bounced pass through real physics',()=>{
 for(const seat of [0,1,2,3] as Seat[])for(const ends of [0,1] as const){
  const m=passingBall(seat,ends);
  try{
   const s=m.state,p=s.players[seat],sign=side(seat,s),start=p.z;
   m.input(seat,shot);
   let bounced=false,maximumStep=0;
   for(let i=0;i<180&&s.phase==='rally'&&s.rally===2;i++){
    const before={x:p.x,z:p.z};m.step(1/60);
    bounced||=s.ball.bounces===1;
    maximumStep=Math.max(maximumStep,Math.hypot(p.x-before.x,p.z-before.z));
   }
   assert.equal(s.ball.hitter,seat,`${seat}/${ends}: ${s.event}`);
   assert.ok(bounced,'groundstroke, not an automatic volley');
   assert.ok((p.z-start)*sign>2,'must retreat');
   assert.ok(maximumStep<.15,'normal movement, no teleport');
   assert.equal(s.ball.rescue,false);
   assert.ok(p.contact&&canReturnNormally({...s.ball,...p.contact,bounces:1,vy:0},p,seat));
  }finally{m.dispose();}
 }
});

test('ordinary passed ball makes unassigned front player cover depth even with a queued swipe',()=>{
 const m=passingBall();
 try{
  const p=m.state.players[2];p.shotQueued=true;
  const support=supportPosition(m.state,2);
  assert.ok(support.z>p.z+2,'non-lob must not freeze at the net');
 }finally{m.dispose();}
});

test('retreat works at 30/60/120Hz on all surfaces, both wings and both hands',()=>{
 for(const fps of [30,60,120])for(const surface of ['hard','clay','grass'] as const)
 for(const wing of [-1,1])for(const id of ['lin','noah','luca']){
  // Use a catchable pace for every backhand style, rather than claiming all
  // characters can retrieve the same marginal 7m/s pass on every surface.
  const m=passingBall(2,0,surface,wing,6);
  try{
   const s=m.state;s.players[2].characterId=id;
   assert.equal(canReachBouncedReturn(s.ball,s.players[2],2),true,`${surface}/${wing}/${id}`);
   m.input(2,shot);
   for(let i=0;i<fps*3&&s.phase==='rally'&&s.rally===2;i++)m.step(1/fps);
   assert.equal(s.ball.hitter,2,`${fps}/${surface}/${wing}/${id}: ${s.event}`);
   assert.equal(s.ball.rescue,false);
  }finally{m.dispose();}
 }
});

test('already bounced ball still belongs to the runner who can retreat into its remaining contact window',()=>{
 const m=passingBall();
 try{
  const s=m.state,p=s.players[2];
  Object.assign(p,{x:3,z:4.5,tx:3,tz:9,vz:3});
  Object.assign(s.players[0],{x:-3,z:10,tx:-3,tz:10});
  m.physics.place({x:3.5,y:.4,z:7},{x:1,y:4,z:2});
  Object.assign(s.ball,m.physics.read(),{bounces:1});
  assert.equal(canReturnNormally(s.ball,p,2),false,'not in reach yet');
  assert.equal(canWaitForBounce(s.ball,p,2),false,'legacy pre-bounce predicate stays pre-bounce');
  assert.equal(canReachBouncedReturn(s.ball,p,2),true);
  assert.equal(canReachBouncedReturn(s.ball,s.players[0],0),false);
  assert.equal(assistedReceiver(s),2);
  m.input(2,shot);
  for(let i=0;i<100&&s.phase==='rally'&&s.rally===2;i++)m.step(1/60);
  assert.equal(s.ball.hitter,2);assert.ok(p.z>6);assert.equal(s.ball.rescue,false);
 }finally{m.dispose();}
});

test('a fatigued front player yields to a partner with a genuinely reachable return',()=>{
 const m=passingBall();
 try{
  const s=m.state;
  Object.assign(s.players[2],{stamina:0,totalStamina:.2});
  Object.assign(s.players[0],{x:-1.5,z:8,tx:-1.5,tz:8});
  assert.equal(canReachBouncedReturn(s.ball,s.players[2],2),false);
  assert.equal(canReachBouncedReturn(s.ball,s.players[0],0),true);
  assert.equal(assistedReceiver(s),0,'same wing is not an unconditional lock');
  m.input(0,shot);
  for(let i=0;i<180&&s.phase==='rally'&&s.rally===2;i++)m.step(1/60);
  assert.equal(s.ball.hitter,0);
 }finally{m.dispose();}
});

test('assignment forecasts do not mutate authority, consume RNG, or change with repeated reads',()=>{
 let draws=0;const m=passingBall();
 try{
  (m as any).random=()=>{draws++;return .5;};
  const before=structuredClone(m.state);
  for(let i=0;i<10;i++)assert.equal(assistedReceiver(m.state),2);
  assert.deepEqual(m.state,before);assert.equal(draws,0);
 }finally{m.dispose();}
});

test('a partner already at a legal contact takes priority over a future same-wing retreat',()=>{
 const m=passingBall();
 try{
  const s=m.state,b=s.ball,p=s.players[0];
  Object.assign(p,{x:b.x-.4,z:b.z+.45,tx:b.x-.4,tz:b.z+.45});
  assert.equal(canReturnNormally(b,p,0),true);
  assert.equal(assistedReceiver(s),0);
  m.input(0,shot);
  assert.equal(s.ball.hitter,0);assert.equal(s.rally,3);
 }finally{m.dispose();}
});

test('doubles AI support does not install a manual-movement grace period before reassignment',()=>{
 const m=passingBall();
 try{
  const s=m.state;
  s.ball.hitter=2;
  assert.equal(aiInput(s,2,'standard'),null,'Match owns automatic support movement');
  driveAI(m,2,'standard');
  s.ball.hitter=1;m.step(1/60);
  assert.ok(s.players[2].tz>7,'assignment must start retreat immediately');
 }finally{m.dispose();}
});

test('both receiving bots cooperate and return the pass without prequeued human gestures',()=>{
 for(const fps of [30,60,120]){
  const m=passingBall();
  try{
   const s=m.state;
   for(let i=0;i<fps*3&&s.phase==='rally'&&s.rally===2;i++){
    driveAI(m,0,'standard');driveAI(m,2,'standard');m.step(1/fps);
   }
   assert.equal(s.ball.hitter,2,`${fps}Hz: ${s.event}`);
   // Bots may deliberately take a legal early volley during the retreat.
   assert.ok(s.players[2].z>4);assert.equal(s.ball.rescue,false);
  }finally{m.dispose();}
 }
});

test('service receiver and a real manual positioning command retain priority',()=>{
 const m=passingBall();
 try{
  m.state.rally=1;m.state.receiver=0;
  assert.equal(assistedReceiver(m.state),0);
  m.state.rally=2;m.input(2,{type:'move',x:4,z:2});m.step(1/60);
  assert.equal(m.state.players[2].tx,4);assert.equal(m.state.players[2].tz,2);
 }finally{m.dispose();}
});
