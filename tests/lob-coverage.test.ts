import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {assistedReceiver,supportPosition} from '../src/simulation/team-play.js';
import {returnPlan} from '../src/simulation/return-plan.js';
import {canSmash} from '../src/simulation/skills.js';
import {side,type Seat} from '../src/simulation/types.js';
before(initPhysics);
const shot={type:'shot' as const,aim:0,depth:.5,power:.5,lob:false};
function lob(seat:Seat=2,surface:'hard'|'clay'|'grass'='hard',deep=false){
 const m=new Match(['lin','lin','lin','lin'],()=>1,{mode:'doubles',surface});
 const sign=side(seat),mate=(seat^2) as Seat;
 m.state.phase='rally';m.state.rally=2;m.state.time=1;(m as any).sinceHit=1;
 Object.assign(m.state.players[seat],{x:2.6*sign,z:3.4*sign,tx:2.6*sign,tz:3.4*sign});
 Object.assign(m.state.players[mate],{x:-2.6*sign,z:10*sign,tx:-2.6*sign,tz:10*sign});
 const b={x:2.3*sign,y:deep?7:4,z:3*sign,vx:0,vy:deep?2:1,vz:(deep?7:5)*sign};
 m.physics.place(b,{x:b.vx,y:b.vy,z:b.vz});Object.assign(m.state.ball,b,{hitter:sign===1?1:0,bounces:0,tier:'lob'});
 return m;
}
test('reachable overhead is assigned to front player instead of the nearest post-bounce partner',()=>{
 for(const seat of [2,3] as Seat[])for(const surface of ['hard','clay','grass'] as const){
  const m=lob(seat,surface);
  assert.equal(assistedReceiver(m.state),seat,`${seat}/${surface}`);
  const plan=returnPlan(m.state.ball,m.state.players[seat],seat,false);
  assert.equal(plan.air,true);assert.equal(plan.smash,true);assert.ok(plan.z*side(seat)>4);
  m.dispose();
 }
});
test('front player automatically retreats and returns a lob as a legal smash with an early swipe',()=>{
 for(const seat of [2,3] as Seat[])for(const surface of ['hard','clay','grass'] as const){
  const m=lob(seat,surface),p=m.state.players[seat],start=p.z,sign=side(seat);
  m.input(seat,shot);
  let maximumStep=0,prev={x:p.x,z:p.z};
  for(let frame=0;frame<180&&m.state.phase==='rally'&&m.state.rally===2;frame++){
   m.step(1/60);maximumStep=Math.max(maximumStep,Math.hypot(p.x-prev.x,p.z-prev.z));prev={x:p.x,z:p.z};
  }
  assert.ok((p.z-start)*sign>1,`${seat}/${surface} did not retreat`);
  assert.equal(m.state.ball.hitter,seat);assert.equal(m.state.ball.skill,'smash');
  assert.ok(maximumStep<.15,'must run rather than teleport');
  assert.ok(canSmash({...m.state.ball,...p.contact!,vy:0},p,seat),'actual contact is within original smash reach');
  m.dispose();
 }
});
test('unreachable deep lob is covered behind the net player, even when their swipe was queued',()=>{
 const m=lob(2,'hard',true),p=m.state.players[2];
 p.shotQueued=true;
 const support=supportPosition(m.state,2);
 assert.ok(support.z>p.z+2,'queued gesture must not freeze support at old net position');
 for(let i=0;i<30;i++)m.step(1/60);
 assert.ok(p.z>3.8,'front player must move back for coverage');m.dispose();
});
test('a high but nearby lob is intercepted above shoulder height instead of waiting passively for a bounce',()=>{
 const m=lob();Object.assign(m.state.ball,{y:3,vy:-1,vz:1});
 const plan=returnPlan(m.state.ball,m.state.players[2],2,false);
 assert.equal(plan.air,true);assert.equal(plan.smash,true);m.dispose();
});
test('front player can be the rear retriever when partner is badly out of position',()=>{
 const m=lob(2,'hard',true);Object.assign(m.state.players[0],{x:-6,z:1,tx:-6,tz:1});
 assert.equal(assistedReceiver(m.state),2);
 const plan=returnPlan(m.state.ball,m.state.players[2],2,false);
 assert.ok(plan.z>8);m.dispose();
});
test('service return assignment and explicit movement remain authoritative',()=>{
 const m=lob();m.state.rally=1;m.state.receiver=0;
 assert.equal(assistedReceiver(m.state),0);
 assert.equal(returnPlan(m.state.ball,m.state.players[2],2,true).air,false);
 m.state.rally=2;m.input(2,{type:'move',x:4,z:2});m.step(1/60);
 assert.equal(m.state.players[2].tx,4);assert.equal(m.state.players[2].tz,2);m.dispose();
});
test('right front owns a reachable right-back lob instead of asking the left-back partner to cross',()=>{
 for(const sign of [-1,1])for(const ends of [0,1] as const){
  const seat=(sign*(ends?-1:1)>0?2:3) as Seat,m=lob(seat),mate=(seat^2) as Seat;
  m.state.ends=ends;m.state.ball.ends=ends;m.state.players.forEach(p=>p.ends=ends);
  Object.assign(m.state.players[seat],{x:3*sign,z:2*sign,tx:3*sign,tz:2*sign});
  Object.assign(m.state.players[mate],{x:-sign,z:10*sign,tx:-sign,tz:10*sign});
  const b={x:3*sign,y:5,z:3*sign,vx:0,vy:1,vz:4*sign};
  m.physics.place(b,{x:b.vx,y:b.vy,z:b.vz});Object.assign(m.state.ball,b,{hitter:seat%2===0?1:0,bounces:0});
  assert.equal(assistedReceiver(m.state),seat,'stay on your side if retreat can reach the ball');
  m.input(seat,shot);
  for(let i=0;i<220&&m.state.rally===2&&m.state.phase==='rally';i++)m.step(1/60);
  assert.equal(m.state.ball.hitter,seat);assert.ok(m.state.players[seat].z*sign>6);
  m.dispose();
 }
});
