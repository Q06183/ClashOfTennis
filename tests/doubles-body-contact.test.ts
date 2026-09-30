import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
before(initPhysics);
function setup(service:boolean,seat:number){
 const m=new Match(['lin','lin','lin','lin'],()=>1,{mode:'doubles'});
 m.state.phase='rally';m.state.rally=service?1:3;
 (m as any).serviceFlight=service;(m as any).sinceHit=1;
 const sign=seat%2===0?1:-1;
 m.state.players.forEach((p,i)=>Object.assign(p,{x:i===seat?0:4,z:6*(i%2===0?1:-1),tx:4,tz:6*(i%2===0?1:-1)}));
 m.physics.place({x:0,y:1.1,z:5.3*sign},{x:0,y:0,z:120*sign});
 Object.assign(m.state.ball,m.physics.read(),{hitter:0,bounces:service?0:1});
 return m;
}
test('fast ball hitting a doubles partner body is adjudicated at swept contact',()=>{
 const m=setup(false,2);m.step(1/60);
 assert.equal(m.state.phase,'point');assert.equal(m.state.lastPoint,1);assert.match(m.state.event,/触身/);m.dispose();
});
test('serve hitting server partner is a service fault, not a point on first serve',()=>{
 const m=setup(true,2);m.step(1/60);
 assert.equal(m.state.fault,1);assert.deepEqual(m.state.score,[0,0]);assert.match(m.state.event,/触身/);m.dispose();
});
test('serve touching receiver before bouncing loses receiving team the point',()=>{
 const m=setup(true,1);m.step(1/60);
 assert.equal(m.state.lastPoint,0);assert.equal(m.state.fault,0);assert.match(m.state.event,/触身/);m.dispose();
});
test('ball passing by a player without contact does not trigger a body penalty',()=>{
 const m=setup(false,2);m.state.players[2].x=1.3;m.step(1/60);
 assert.equal(m.state.phase,'rally');m.dispose();
});
