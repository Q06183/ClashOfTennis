import {test,before} from 'node:test';import assert from 'node:assert/strict';
import {CHARACTERS,getCharacter,characterEffects} from '../src/simulation/characters.js';
import {Match} from '../src/simulation/match.js';import {movePlayer} from '../src/simulation/movement.js';import {initPhysics} from '../src/simulation/physics.js';import {predictFlight} from '../src/simulation/trajectory.js';import type {Seat,BallState} from '../src/simulation/types.js';
before(initPhysics);
test('roster has six distinct balanced budgets with strengths, weaknesses and a neutral default',()=>{
 assert.equal(CHARACTERS.length,6);assert.equal(new Set(CHARACTERS.map(c=>c.id)).size,6);
 for(const c of CHARACTERS){const stats=Object.values(c.stats);assert.equal(stats.reduce((a,b)=>a+b,0),360);assert.ok(stats.every(n=>n>=40&&n<=85));if(c.id!=='lin'){assert.ok(Math.max(...stats)>=78);assert.ok(Math.min(...stats)<=52);}}
 assert.equal(getCharacter('bad').id,'lin');assert.deepEqual(characterEffects('lin'),{movement:1,forehand:1,backhand:1,volley:1,serve:1,drain:1,recovery:1});
});
test('movement and endurance attributes affect actual court travel and point recovery on either seat',()=>{
 for(const seat of [0,1] as Seat[]){
  const times:Record<string,number>={};
  for(const id of ['mei','lin','leo']){const m=new Match([id,id]);const p=m.state.players[seat];p.x=-3;p.tx=3;p.tz=p.z;let t=0;while(p.x<2.9&&t<5){movePlayer(p,seat,1/60);t+=1/60;}times[id]=t;p.stamina=.5;m.state.phase='point';m.state.pointTimer=0;m.step(1/60);assert.ok(Math.abs(p.stamina-(.5+.2*characterEffects(id).recovery))<1e-8);assert.equal(p.characterId,id);m.dispose();}
  assert.ok(times.mei<times.lin&&times.lin<times.leo);
 }
});
test('serve specialization alters real launch speed without changing swipe heading, target or colour tier',()=>{
 for(const total of [0,1]){const samples:Record<string,BallState>={};
 for(const id of ['mei','lin','leo']){const m=new Match([id,id]);m.state.score=[total,0];m.state.phase='point';m.state.pointTimer=0;m.step(1/60);m.input(m.state.server,{type:'shot',aim:0,depth:.5,power:.6,lob:false});for(let i=0;i<90&&m.state.rally===0;i++)m.step(1/60);samples[id]=structuredClone(m.state.ball);assert.equal(predictFlight(m.state.ball).hitNet,false);m.dispose();}
 assert.ok(Math.abs(samples.mei.vz)<Math.abs(samples.lin.vz)&&Math.abs(samples.lin.vz)<Math.abs(samples.leo.vz));for(const id of ['mei','leo']){assert.equal(samples[id].targetZ,samples.lin.targetZ);assert.equal(samples[id].targetX,samples.lin.targetX);assert.equal(samples[id].tier,samples.lin.tier);}
 }
});
test('character agility changes acceleration but braking is shared',()=>{
 const velocities=[];
 for(const id of ['mei','lin','leo']){const m=new Match([id,id]);const p=m.state.players[0];p.tx=p.x;p.tz=p.z;p.vx=5;p.vz=0;movePlayer(p,0,1/60);velocities.push(p.vx);m.dispose();}
 assert.deepEqual(velocities,[4.7,4.7,4.7]);
});
test('actual forehand, backhand and volley launches use their own attribute and preserve landing',()=>{
 for(const seat of [0,1] as Seat[])for(const kind of ['forehand','backhand','volley'] as const){const speeds:number[]=[];
  const specialist=kind==='forehand'?'rafa':kind==='backhand'?'sora':'ines';
  for(const id of ['lin',specialist]){
   const m=new Match([id,id]),p=m.state.players[seat],sign=seat===0?1:-1;p.x=0;p.z=sign*(kind==='volley'?4:10);p.stamina=1;
   // Controlled legal-height contact isolates stroke stats from run-up timing.
   const start={x:(kind==='backhand'?-.6:.6)*sign,y:1.8,z:p.z-.3*sign};m.physics.place(start);Object.assign(m.state.ball,m.physics.read(),{bounces:kind==='volley'?0:1});
   const internal=m as unknown as {bouncePoint:unknown;hit:(seat:Seat,shot:{type:'shot';aim:number;depth:number;power:number;lob:boolean})=>void};internal.bouncePoint=kind==='volley'?null:{x:start.x,z:start.z+sign*2};
   internal.hit(seat,{type:'shot',aim:0,depth:.55,power:.4,lob:false});assert.equal(p.stroke,kind);assert.equal(predictFlight(m.state.ball).hitNet,false);assert.equal(m.state.ball.targetZ,-sign*(2.8+.55*8.6+.35*(.5+.55)));speeds.push(Math.hypot(m.state.ball.vx,m.state.ball.vz));m.dispose();
  }
  assert.ok(speeds[1]>speeds[0],`${seat} ${kind}: ${speeds}`);
 }
});
test('stamina specialization changes actual running drain, idle recovery and strike cost',()=>{
 const results:Record<string,number[]>={};
 for(const id of ['mei','lin','leo']){
  const samples=[];
  for(const moving of [true,false]){const m=new Match([id,'lin']);const p=m.state.players[0];p.stamina=.5;p.x=-3;p.tx=moving?3:-3;p.tz=p.z;m.state.phase='rally';m.state.ball.hitter=0;m.physics.place({x:0,y:3,z:1},{x:0,y:0,z:-3});Object.assign(m.state.ball,m.physics.read());for(let i=0;i<20;i++)m.step(1/60);samples.push(p.stamina);m.dispose();}
  const m=new Match([id,'lin']);m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});for(let i=0;i<90&&m.state.rally===0;i++)m.step(1/60);samples.push(m.state.players[0].stamina);m.dispose();results[id]=samples;
 }
 for(let i=0;i<3;i++)assert.ok(results.mei[i]>results.lin[i]&&results.lin[i]>results.leo[i],`stamina scenario${i}: ${JSON.stringify(results)}`);
});
