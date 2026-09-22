import {before,test} from 'node:test';import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';import {initPhysics} from '../src/simulation/physics.js';import {returnPlan} from '../src/simulation/return-plan.js';import {canReturnNormally} from '../src/simulation/skills.js';import {movePlayer} from '../src/simulation/movement.js';import {side,type Seat} from '../src/simulation/types.js';
before(initPhysics);
test('distant incoming ball takes over a tapped destination even without a queued swipe',()=>{
 for(const seat of [0,1] as Seat[]){const m=new Match(),sign=side(seat);m.state.phase='rally';m.state.rally=2;Object.assign(m.state.players[seat],{x:-3,z:10*sign,tx:-3,tz:10*sign});m.physics.place({x:2,y:2,z:3*sign},{x:0,y:1,z:6*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:0});m.input(seat,{type:'move',x:-5,z:13*sign});for(let i=0;i<15;i++)m.step(1/60);assert.ok(m.state.players[seat].tx>0,'stale tap cannot keep runner moving away');m.dispose();}
});
test('route selects a reachable airborne contact along the flight, beyond old half-second plane',()=>{
 const m=new Match(),p=m.state.players[0];Object.assign(p,{characterId:'ines',x:-1,z:9,tx:4,tz:14,vx:0,vz:0});const b={...m.state.ball,x:1,y:2.2,z:2,vx:0,vy:4,vz:6,bounces:0};
 const plan=returnPlan(b,p,0,false);assert.equal(plan.air,true);assert.ok(plan.point.z<8);assert.ok(plan.time>.3);
 const runner={...p,tx:plan.x,tz:plan.z};for(let t=0;t<plan.time;t+=1/120)movePlayer(runner,0,Math.min(1/120,plan.time-t));
 assert.ok(canReturnNormally({...b,...plan.point,vy:b.vy-9.81*plan.time},runner,0));m.dispose();
});
test('unreachable slow volley falls back to a point beyond the bounce and serves always bounce',()=>{
 const m=new Match(),p=m.state.players[0];Object.assign(p,{x:-5,z:13,tx:0,tz:3});const b={...m.state.ball,x:3,y:.7,z:6,vx:0,vy:-1,vz:3,bounces:0};
 assert.equal(returnPlan(b,p,0,false).air,false);const plan=returnPlan(b,p,0,true);assert.equal(plan.air,false);assert.ok(plan.z>plan.point.z);assert.ok(canReturnNormally({...b,...plan.point,bounces:1},{...p,x:plan.x,z:plan.z},0));m.dispose();
});
test('new interception routes mirror across seats and handedness without changing the shot aim',()=>{
 const m=new Match();for(const seat of [0,1] as Seat[]){const sign=side(seat),p={...m.state.players[seat],characterId:'lin',x:-1,z:9*sign,tx:0,tz:12*sign,vx:.2,vz:0},b={...m.state.ball,x:1,y:2.2,z:2*sign,vx:.1,vy:4,vz:6*sign,bounces:0};
 const right=returnPlan(b,p,seat,false),left=returnPlan({...b,x:-b.x,vx:-b.vx},{...p,characterId:'noah',x:-p.x,tx:-p.tx,vx:-p.vx},seat,false);
 assert.equal(right.air,false);assert.equal(left.air,false);assert.ok(Math.abs(right.x+left.x)<.1);assert.ok(Math.abs(right.z-left.z)<.1);assert.equal(right.backhand,left.backhand);
 }m.dispose();
});
test('committed airborne route reaches actual contact instead of drifting behind the bounce',()=>{
 for(const seat of [0,1] as Seat[]){
  const m=new Match(['ines','ines'],()=>1),sign=side(seat);m.state.phase='rally';m.state.rally=2;
  Object.assign(m.state.players[seat],{x:-4*sign,z:7*sign,tx:-4*sign,tz:7*sign,vx:0,vz:0,stamina:1});
  m.physics.place({x:-2*sign,y:1.5,z:3*sign},{x:0,y:0,z:10*sign});
  Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:0});
  m.input(seat,{type:'shot',aim:0,depth:.6,power:.4,lob:false});
  for(let i=0;i<90&&m.state.rally===2&&m.state.phase==='rally';i++)m.step(1/60);
  assert.equal(m.state.rally,3);assert.equal(m.state.ball.skill,'volley');assert.equal(m.state.ball.rescue,false);
  assert.ok(m.state.players[seat].contact!.y>.12);m.dispose();
 }
});
