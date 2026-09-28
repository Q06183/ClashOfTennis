import {test,before} from 'node:test';import assert from 'node:assert/strict';
import {CHARACTERS,STANDARD_CHARACTERS,getCharacter,characterEffects} from '../src/simulation/characters.js';
import {Match} from '../src/simulation/match.js';import {movePlayer} from '../src/simulation/movement.js';import {initPhysics} from '../src/simulation/physics.js';import {predictFlight} from '../src/simulation/trajectory.js';import type {Seat,BallState} from '../src/simulation/types.js';
import {spendStamina,settlePointStamina,pointRecoveryRate} from '../src/simulation/stamina.js';
before(initPhysics);
test('roster has nine distinct balanced budgets with strengths, weaknesses and a neutral default',()=>{
 const ordinary=STANDARD_CHARACTERS;
 assert.equal(ordinary.length,9);assert.equal(new Set(CHARACTERS.map(c=>c.id)).size,CHARACTERS.length);
 for(const c of ordinary){const stats=Object.values(c.stats);assert.equal(stats.reduce((a,b)=>a+b,0),360);assert.ok(stats.every(n=>n>=40&&n<=85));if(c.id!=='lin'){assert.ok(Math.max(...stats)>=78);assert.ok(Math.min(...stats)<=52);}}
 assert.equal(getCharacter('bad').id,'lin');assert.deepEqual(characterEffects('lin'),{movement:1,forehand:1,backhand:1,volley:1,serve:1,drain:1,recovery:1});
 assert.deepEqual(ordinary.map(c=>[c.id,...Object.values(c.stats)]),[
  ['lin',60,60,60,60,60,60],['mei',78,54,66,44,42,76],['rafa',60,82,46,54,66,52],
  ['sora',64,52,82,58,48,56],['ines',68,54,52,82,62,42],['leo',48,68,50,66,84,44],
  ['noah',62,80,48,44,66,60],['adrian',52,64,82,64,50,48],['luca',70,56,52,80,44,58],
 ]);
});
test('hidden master keeps six 99 stats with tenfold attribute bonuses, not tenfold final speeds',()=>{
 assert.equal(CHARACTERS.length,10);assert.equal(getCharacter('wuming').id,'wuming');
 assert.deepEqual(Object.values(getCharacter('wuming').stats),[99,99,99,99,99,99]);
 const expected={movement:1.468,forehand:1.468,backhand:1.975,volley:1.975,serve:1.975,drain:.22,recovery:1.78};
 for(const key of Object.keys(expected) as (keyof typeof expected)[]){
  assert.ok(Math.abs(characterEffects('wuming')[key]-expected[key])<1e-12,`${key}: ${characterEffects('wuming')[key]}`);
 }
});
test('all characters use tenfold coefficients for both strengths and weaknesses',()=>{
 for(const c of CHARACTERS){
  const s=c.stats;
  assert.deepEqual(characterEffects(c.id),{
   movement:1+(s.movement-60)*.0012*10,forehand:1+(s.forehand-60)*.0012*10,
   backhand:1+(s.backhand-60)*.0025*10,volley:1+(s.volley-60)*.0025*10,serve:1+(s.serve-60)*.0025*10,
   drain:1-(s.stamina-60)*.002*10,recovery:1+(s.stamina-60)*.002*10,
  });
  assert.ok(Object.values(characterEffects(c.id)).every(n=>Number.isFinite(n)&&n>0),c.id);
 }
});
test('ordinary role specializations are substantial without changing neutral Lin or master bonuses',()=>{
 const cases=[
  ['mei','movement',1.216],['mei','serve',.55],['mei','drain',.68],['mei','recovery',1.32],
  ['rafa','forehand',1.264],['rafa','backhand',.65],['sora','backhand',1.55],
  ['ines','volley',1.55],['ines','drain',1.36],['leo','serve',1.6],['leo','movement',.856],
  ['noah','forehand',1.24],['noah','volley',.6],['adrian','backhand',1.55],
  ['luca','volley',1.5],['luca','serve',.6],
 ] as const;
 for(const [id,key,expected] of cases)assert.ok(Math.abs(characterEffects(id)[key]-expected)<1e-12,`${id}/${key}`);
});
test('tenfold master movement bonus speeds up actual acceleration and long court sprints on both seats',()=>{
 for(const seat of [0,1] as Seat[]){
  const result:Record<string,{initial:number;peak:number;time:number}>={};
  for(const id of ['lin','wuming']){
   const m=new Match([id,id]),p=m.state.players[seat];
   p.x=-5;p.tx=5;p.tz=p.z;p.vx=0;p.vz=0;p.stamina=1;
   let time=0,initial=0,peak=0;
   while(p.x<4.9&&time<5){
    movePlayer(p,seat,1/120);if(time===0)initial=p.vx!;peak=Math.max(peak,p.vx!);time+=1/120;
   }
   result[id]={initial,peak,time};m.dispose();
  }
  assert.ok(Math.abs(result.wuming.initial/result.lin.initial-1.468)<1e-10);
  assert.ok(result.wuming.peak>result.lin.peak*1.4);
  assert.ok(result.wuming.time<result.lin.time*.85,JSON.stringify(result));
 }
});
test('movement and endurance attributes affect actual court travel and point recovery on either seat',()=>{
 for(const seat of [0,1] as Seat[]){
  const times:Record<string,number>={};
  for(const id of ['wuming','mei','lin','leo']){const m=new Match([id,id]);const p=m.state.players[seat];p.x=-3;p.tx=3;p.tz=p.z;let t=0;while(p.x<2.9&&t<5){movePlayer(p,seat,1/60);t+=1/60;}times[id]=t;spendStamina(p,.5);settlePointStamina(p);assert.ok(Math.abs(p.totalStamina!-(.9+.1*pointRecoveryRate(id)))<1e-8);assert.equal(p.characterId,id);m.dispose();}
  assert.ok(times.wuming<times.mei&&times.mei<times.lin&&times.lin<times.leo);
 }
});
test('serve specialization alters real launch speed without changing swipe heading, target or colour tier',()=>{
 for(const total of [0,1]){const samples:Record<string,BallState>={};
 for(const id of ['mei','lin','leo','wuming']){const m=new Match([id,id]);m.state.score=[total,0];m.state.phase='point';m.state.pointTimer=0;m.step(1/60);m.input(m.state.server,{type:'shot',aim:0,depth:.5,power:.6,lob:false});for(let i=0;i<90&&m.state.rally===0;i++)m.step(1/60);samples[id]=structuredClone(m.state.ball);assert.equal(predictFlight(m.state.ball).hitNet,false);m.dispose();}
 assert.ok(Math.abs(samples.mei.vz)<Math.abs(samples.lin.vz)&&Math.abs(samples.lin.vz)<Math.abs(samples.leo.vz)&&Math.abs(samples.leo.vz)<Math.abs(samples.wuming.vz));for(const id of ['mei','leo','wuming']){assert.equal(samples[id].targetZ,samples.lin.targetZ);assert.equal(samples[id].targetX,samples.lin.targetX);assert.equal(samples[id].tier,samples.lin.tier);}
 assert.ok(Math.hypot(samples.wuming.vx,samples.wuming.vz)>Math.hypot(samples.lin.vx,samples.lin.vz)*1.4,'master serve must be substantially faster, not just a larger display value');
 }
});
test('character agility changes acceleration but braking is shared',()=>{
 const velocities=[];
 for(const id of ['mei','lin','leo']){const m=new Match([id,id]);const p=m.state.players[0];p.tx=p.x;p.tz=p.z;p.vx=5;p.vz=0;movePlayer(p,0,1/60);velocities.push(p.vx);m.dispose();}
 assert.deepEqual(velocities,[4.655,4.655,4.655]);
});
test('actual forehand, backhand and volley launches use their own attribute and preserve landing',()=>{
 for(const seat of [0,1] as Seat[])for(const kind of ['forehand','backhand','volley'] as const){const speeds:number[]=[];
  const specialist=kind==='forehand'?'rafa':kind==='backhand'?'sora':'ines';
  for(const id of ['lin',specialist,'wuming']){
   const m=new Match([id,id]),p=m.state.players[seat],sign=seat===0?1:-1;p.x=0;p.z=sign*(kind==='volley'?4:10);p.stamina=1;
   // Controlled legal-height contact isolates stroke stats from run-up timing.
   const start={x:(kind==='backhand'?-.6:.6)*sign,y:1.8,z:p.z-.3*sign};m.physics.place(start);Object.assign(m.state.ball,m.physics.read(),{bounces:kind==='volley'?0:1});
   const internal=m as unknown as {bouncePoint:unknown;hit:(seat:Seat,shot:{type:'shot';aim:number;depth:number;power:number;lob:boolean})=>void};internal.bouncePoint=kind==='volley'?null:{x:start.x,z:start.z+sign*2};
   internal.hit(seat,{type:'shot',aim:0,depth:.55,power:.4,lob:false});assert.equal(p.stroke,kind);assert.equal(predictFlight(m.state.ball).hitNet,false);assert.equal(m.state.ball.targetZ,-sign*(2.8+.55*8.6+.35*(.5+.55)));speeds.push(Math.hypot(m.state.ball.vx,m.state.ball.vz));m.dispose();
  }
  // Strong volley specialists can now reach the same minimum-flight ceiling as
  // the master. The shared flight safety limit must not be removed to rank them.
  assert.ok(speeds[2]>=speeds[1]&&speeds[1]>speeds[0],`${seat} ${kind}: ${speeds}`);
  assert.ok(speeds[2]>speeds[0]*1.4,`${seat} ${kind} must have a substantial real speed increase: ${speeds}`);
 }
});
test('stamina specialization changes actual running drain, idle recovery and strike cost',()=>{
 for(const seat of [0,1] as Seat[]){
 const results:Record<string,number[]>={};
 for(const id of ['wuming','mei','lin','leo']){
  const samples=[];
  for(const moving of [true,false]){const m=new Match([id,id]);const p=m.state.players[seat];p.stamina=.5;p.x=-3;p.tx=moving?3:-3;p.tz=p.z;m.state.phase='rally';m.state.ball.hitter=seat;m.physics.place({x:0,y:3,z:seat===0?1:-1},{x:0,y:0,z:seat===0?-3:3});Object.assign(m.state.ball,m.physics.read());for(let i=0;i<20;i++)m.step(1/60);samples.push(p.stamina);m.dispose();}
  const m=new Match([id,id]);m.state.server=seat;m.input(seat,{type:'shot',aim:0,depth:.5,power:.5,lob:false});for(let i=0;i<90&&m.state.rally===0;i++)m.step(1/60);samples.push(m.state.players[seat].stamina);
  assert.equal(m.state.rally,1);
  // Stronger strikes also cost more: isolate the exact existing endurance formula.
  const effects=characterEffects(id);
  assert.ok(Math.abs(samples[2]-(1-(.022+.028*.5)*effects.drain*effects.serve))<1e-8);
  m.dispose();results[id]=samples;
 }
 for(let i=0;i<2;i++)assert.ok(results.wuming[i]>results.mei[i]&&results.mei[i]>results.lin[i]&&results.lin[i]>results.leo[i],`seat ${seat} stamina scenario${i}: ${JSON.stringify(results)}`);
 }
});
