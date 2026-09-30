import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {driveAI} from '../src/simulation/ai.js';
import {side,teamOf,type Seat} from '../src/simulation/types.js';
before(initPhysics);
const shot={type:'shot' as const,aim:0,depth:.5,power:.5,lob:false};
const doubles=()=>new Match(['lin','lin','lin','lin'],()=>1,{mode:'doubles'});
function incoming(m:Match,seat:Seat,hitter:Seat,bounces=1){
 const p=m.state.players[seat],sign=side(seat,m.state);
 m.state.phase='rally';m.state.rally=2;(m as any).sinceHit=1;
 Object.assign(p,{x:0,z:9*sign,tx:0,tz:9*sign});
 m.physics.place({x:.55*sign,y:1.2,z:8.5*sign},{x:0,y:0,z:4*sign});
 Object.assign(m.state.ball,m.physics.read(),{hitter,bounces});
}
test('four players serve and receive in fixed order, and change ends at six points',()=>{
 const m=doubles();assert.equal(m.state.players.length,4);
 for(const [total,server,receiver] of [[0,0,1],[1,1,2],[2,1,0],[3,2,3],[4,2,1],[5,3,2],[6,3,0]]){
  m.state.score=[total,0];m.state.phase='point';m.state.pointTimer=0;
  m.step(1/60);assert.equal(m.state.server,server);assert.equal(m.state.receiver,receiver);
 }
 m.dispose();
 const game=doubles();
 for(let i=0;i<6;i++){
  game.step(12.1); // server timeout awards one point without a test-only scorer
  assert.equal(game.state.phase,'point');game.step(2);
 }
 assert.equal(game.state.scoring?.totalPoints,6);assert.equal(game.state.ends,1);
 for(const seat of [0,1,2,3] as Seat[])assert.ok(game.state.players[seat].z*side(seat,game.state)>0);
 game.dispose();
});
test('either partner can legally take a rally, but cannot pass to a teammate',()=>{
 for(const seat of [0,1,2,3] as Seat[]){
  const m=doubles();incoming(m,seat,teamOf(seat)===0?1:0);m.input(seat,shot);
  assert.equal(m.state.ball.hitter,seat);assert.equal(m.state.rally,3);
  const mate=(seat^2) as Seat;
  Object.assign(m.state.players[mate],m.state.players[seat]);m.input(mate,shot);
  assert.equal(m.state.rally,3);assert.equal(m.state.ball.hitter,seat);
  m.dispose();
 }
});
test('doubles first bounce in the alley stays live, while a service into it faults',()=>{
 for(const service of [false,true]){
  const m=doubles();m.state.phase='rally';m.state.rally=service?1:2;(m as any).serviceFlight=service;
  m.physics.place({x:-5,y:.18,z:-5},{x:0,y:-6,z:0});Object.assign(m.state.ball,m.physics.read(),{hitter:0,bounces:0});
  for(let i=0;i<6&&m.state.ball.bounces===0;i++)m.step(1/120);
  assert.equal(m.state.phase,service?'point':'rally');assert.equal(m.state.fault,service?1:0);m.dispose();
 }
});
test('service landing keeps designated receiver; the partner cannot return that serve',()=>{
 const m=doubles();incoming(m,3,0);m.state.rally=1;(m as any).serviceFlight=true;
 // A remote pre-queued gesture does not award a fault without contact.
 m.state.players[3].x=5;
 const rally=m.state.rally;m.input(3,shot);assert.equal(m.state.rally,rally);
 incoming(m,1,0);m.state.rally=1;m.input(1,shot);assert.equal(m.state.rally,2);m.dispose();
});
test('a second-service net let replays the same server and receiver without erasing the fault',()=>{
 const m=doubles();m.state.fault=1;m.state.phase='rally';m.state.rally=1;(m as any).serviceFlight=true;
 // Graze the top band while otherwise landing inside the diagonal service box.
 m.physics.place({x:-1,y:1.10,z:.05},{x:0,y:1,z:-7});Object.assign(m.state.ball,m.physics.read(),{hitter:0,bounces:0});
 for(let i=0;i<180&&m.state.phase==='rally';i++)m.step(1/120);
 assert.match(m.state.event,/擦网/);assert.equal(m.state.fault,1);assert.deepEqual(m.state.score,[0,0]);
 m.step(2);assert.equal(m.state.phase,'serve');assert.equal(m.state.server,0);assert.equal(m.state.receiver,1);assert.equal(m.state.fault,1);m.dispose();
});
test('standard match keeps a server for each game and switches service on game win',()=>{
 const m=new Match(['lin','lin','lin','lin'],()=>1,{mode:'doubles',format:'standard'});
 for(let i=0;i<4;i++){assert.equal(m.state.server,0);m.step(12.1);m.step(2);}
 assert.deepEqual(m.state.scoring?.games,[0,1]);assert.deepEqual(m.state.score,[0,0]);assert.equal(m.state.server,1);
 assert.equal(m.state.ends,1);m.dispose();
});
test('four bots play natural rallies and all four players enter the service rotation',()=>{
 const m=doubles(),servers=new Set<Seat>();
 for(let i=0;i<60*300&&m.state.phase!=='over';i++){
  servers.add(m.state.server);
  for(const seat of [0,1,2,3] as Seat[])driveAI(m,seat,'standard');
  m.step(1/60);
 }
 assert.equal(servers.size,4);assert.ok(m.state.maxRally>=3,`longest ${m.state.maxRally}`);
 assert.ok(m.state.scoring!.totalPoints>6);
 assert.ok(m.state.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
 m.dispose();
});
test('actual reachable illegal doubles contacts lose the point, not merely early input',()=>{
 for(const kind of ['volley-serve','wrong-receiver','partner-pass'] as const){
  const m=doubles(),seat=kind==='wrong-receiver'?3:2;
  incoming(m,seat,kind==='volley-serve'?1:0,kind==='volley-serve'?0:1);
  (m as any).serviceFlight=kind!=='partner-pass';
  m.state.receiver=kind==='wrong-receiver'?1:2;
  m.input(seat,shot);
  assert.equal(m.state.phase,'point',kind);assert.match(m.state.event,/接发|连续/);
  assert.equal(m.state.score[kind==='wrong-receiver'?0:1],1);
  m.dispose();
 }
 const m=doubles();m.input(0,shot);m.input(1,shot);
 assert.equal(m.state.phase,'serve');assert.deepEqual(m.state.score,[0,0]);m.dispose();
});
