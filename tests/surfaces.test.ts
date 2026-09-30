import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {movePlayer} from '../src/simulation/movement.js';
import {reception} from '../src/simulation/reception.js';
import {flightGravity} from '../src/simulation/flight.js';
import type {PlayerState} from '../src/simulation/types.js';
before(initPhysics);
const surfaces=['hard','clay','grass'] as const;
type Surface=typeof surfaces[number];
const create=(surface?:Surface)=>new Match(['lin','lin'],()=>.5,{surface});
function bounce(surface?:Surface,topspin=0,slice=false){
 const m=create(surface);
 m.state.phase='rally';m.state.rally=2;
 m.physics.place({x:0,y:.18,z:5},{x:2,y:-6,z:8},topspin);
 Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:0,topspin,slice});
 for(let i=0;i<6&&m.state.ball.bounces===0;i++)m.step(1/120);
 assert.equal(m.state.ball.bounces,1);assert.equal(m.state.phase,'rally');
 const ball={...m.state.ball};m.dispose();return ball;
}
test('authority uses lower grass and higher clay bounce on the same incoming ball',()=>{
 const [hard,clay,grass]=surfaces.map(s=>bounce(s));
 assert.ok(grass.vy<hard.vy*.85,`grass ${grass.vy}, hard ${hard.vy}`);
 assert.ok(clay.vy>hard.vy*1.08);
 // Legacy hard court has zero horizontal friction already. Grass must not
 // manufacture energy to be faster; low bounce shortens the reaction window.
 assert.ok(Math.hypot(grass.vx,grass.vz)>=Math.hypot(hard.vx,hard.vz)-1e-6);
 assert.ok(Math.hypot(clay.vx,clay.vz)<Math.hypot(hard.vx,hard.vz)*.9);
});
test('surface is part of authority, player and ball state, with hard default unchanged',()=>{
 for(const surface of surfaces){
  const m=create(surface);
  assert.equal((m.state as any).surface,surface);
  assert.equal((m.state.ball as any).surface,surface);
  assert.ok(m.state.players.every(p=>(p as any).surface===surface));
  m.dispose();
 }
 assert.deepEqual(bounce(),bounce('hard'));
});
test('clay amplifies spin kick, grass slice stays lower, and launch direction is unchanged',()=>{
 const clay=bounce('clay',1),flatClay=bounce('clay'),hard=bounce('hard',1),flatHard=bounce('hard');
 assert.ok(clay.vy/flatClay.vy>hard.vy/flatHard.vy+.1);
 assert.ok(bounce('grass',0,true).vy<bounce('hard',0,true).vy*.85);
 const launches=surfaces.map(surface=>{
  const m=create(surface);m.input(0,{type:'shot',aim:.1,depth:.5,power:.5,lob:false,topspin:.8});
  for(let i=0;i<100&&m.state.phase==='serve';i++)m.step(1/60);
  const b=m.state.ball;m.dispose();return [b.x,b.y,b.z,b.vx,b.vy,b.vz,b.targetX,b.targetZ];
 });
 assert.deepEqual(launches[0],launches[1]);assert.deepEqual(launches[1],launches[2]);
});
test('hard grips most, clay takes longer to brake, and surface movers stay finite',()=>{
 const results=surfaces.map(surface=>{
  const p:PlayerState={surface,x:0,z:10,tx:-4,tz:10,vx:5,vz:0,stamina:1,swing:0,stroke:'forehand',moving:true} as PlayerState;
  for(let i=0;i<12;i++)movePlayer(p,0,1/60);
  assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.vx));return p.x;
 });
 assert.ok(results[1]>results[2]&&results[2]>results[0],String(results));
});
test('pre-bounce reception forecasts the actual surface rebound, including spin',()=>{
 for(const surface of surfaces)for(const topspin of [0,1]){
  const m=create(surface),p=m.state.players[0];
  const b={...m.state.ball,x:0,y:1.5,z:4,vx:1,vy:-3,vz:8,bounces:0,topspin};
  const plan=reception(b,p,0),g=flightGravity(b);
  const landing=(b.vy+Math.sqrt(b.vy*b.vy+2*g*(b.y-.12)))/g;
  m.state.phase='rally';m.state.rally=2;
  m.physics.place(b,{x:b.vx,y:b.vy,z:b.vz},topspin);Object.assign(m.state.ball,b,{hitter:1});
  let elapsed=0;
  while(elapsed<plan.time&&m.state.phase==='rally'){m.step(1/480);elapsed+=1/480;}
  assert.ok(plan.time>landing);
  assert.equal(m.state.ball.bounces,1);
  assert.ok(Math.abs(m.state.ball.y-plan.point.y)<.12,`${surface}/${topspin}: actual ${m.state.ball.y}, predicted ${plan.point.y}`);
  assert.ok(Math.abs(m.state.ball.z-plan.point.z)<.12);
  m.dispose();
 }
});
