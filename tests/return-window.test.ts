import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {initPhysics} from '../src/simulation/physics.js';
import {Match} from '../src/simulation/match.js';
import {side,type Seat} from '../src/simulation/types.js';
before(initPhysics);
const shot={type:'shot' as const,aim:0,depth:.5,power:.5,lob:false};
function fixture(seat:Seat=0){
 const m=new Match(['lin','lin'],()=>1),sign=side(seat);m.state.phase='rally';m.state.rally=2;
 Object.assign(m.state.ball,{hitter:seat===0?1:0,bounces:0});
 Object.assign(m.state.players[seat],{x:-.6*sign,z:9.5*sign,tx:-.6*sign,tz:9.5*sign,vx:0,vz:0});
 m.input(seat,{type:'move',x:-.6*sign,z:9.5*sign});return m;
}
test('a reachable rising ball near its bounce can be returned at the baseline on both seats',()=>{
 for(const seat of [0,1] as const){const m=fixture(seat),sign=side(seat);
  m.physics.place({x:0,y:.14,z:9*sign},{x:0,y:-5,z:2*sign});Object.assign(m.state.ball,m.physics.read());m.input(seat,shot);
  for(let i=0;i<22&&m.state.rally===2;i++)m.step(1/60);
  assert.equal(m.state.rally,3,'physical racket reach, not distance from bounce, determines contact');assert.ok(m.state.players[seat].contact!.y<.42,'do not lift a legal low contact to an artificial launch height');m.dispose();
 }
});
test('an early swipe stays queued for the same slow incoming flight beyond 2.6 seconds',()=>{
 const m=fixture();m.physics.place({x:0,y:1,z:-8},{x:0,y:14,z:6});Object.assign(m.state.ball,m.physics.read());m.input(0,shot);
 for(let i=0;i<163;i++)m.step(1/60);
 assert.equal(m.state.phase,'rally');assert.equal(m.state.players[0].shotQueued,true,'do not discard input before slow ball arrives');
 for(let i=0;i<150&&m.state.rally===2&&m.state.phase==='rally';i++)m.step(1/60);
 assert.equal(m.state.rally,3);m.dispose();
});
test('a slightly delayed gesture uses a recent physically reachable contact, but not a stale one',()=>{
 for(const delay of [.1,.25]){
  const m=fixture();m.physics.place({x:0,y:1.15,z:8.6},{x:0,y:0,z:15});Object.assign(m.state.ball,m.physics.read(),{bounces:1});
  for(let i=0;i<6;i++)m.step(1/60);
  // Freeze the feet to isolate input latency while the ball leaves racket reach.
  const p=m.state.players[0];m.input(0,{type:'move',x:p.x,z:p.z});for(let i=0;i<delay*60;i++)m.step(1/60);
  m.input(0,shot);m.step(1/60);
  assert.equal(m.state.ball.hitter===0,delay===.1,`delay ${delay}`);m.dispose();
 }
});
test('late-input grace never crosses a bounce, finished point, or current physical reach',()=>{
 for(const mode of ['bounce','point','far']){
  const m=fixture();m.physics.place({x:0,y:1.15,z:8.6},{x:0,y:0,z:15});Object.assign(m.state.ball,m.physics.read(),{bounces:1});
  for(let i=0;i<12;i++)m.step(1/60);
  if(mode==='bounce')m.state.ball.bounces=2;
  if(mode==='point')m.finish(1,'已结束');
  if(mode==='far')m.state.players[0].x=-5;
  m.input(0,shot);assert.equal(m.state.ball.hitter,1,mode);m.dispose();
 }
});
test('queued input is consumed once and cannot spill into a new flight or point',()=>{
 const m=fixture();m.physics.place({x:0,y:1,z:0},{x:0,y:5,z:7});Object.assign(m.state.ball,m.physics.read());m.input(0,shot);assert.equal(m.state.players[0].shotQueued,true);
 m.state.rally++;m.step(1/60);assert.equal(m.state.players[0].shotQueued,false);
 m.input(0,shot);m.finish(1,'对手获胜');assert.equal(m.state.players[0].shotQueued,false);m.dispose();
});
