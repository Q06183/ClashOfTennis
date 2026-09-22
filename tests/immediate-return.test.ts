import {before,test} from 'node:test';import assert from 'node:assert/strict';import {Match} from '../src/simulation/match.js';import {initPhysics} from '../src/simulation/physics.js';import {canReturnNormally} from '../src/simulation/skills.js';import {side,type Seat} from '../src/simulation/types.js';
before(initPhysics);const shot={type:'shot' as const,aim:.2,depth:.5,power:.4,lob:false};
function incoming(seat:Seat,bounces:number){const m=new Match(['lin','lin'],()=>1),sign=side(seat);m.state.phase='rally';m.state.rally=2;m.step(.08);const p=m.state.players[seat];Object.assign(p,{x:0,z:8*sign,tx:0,tz:8*sign,vx:0,vz:0});m.physics.place({x:.5*sign,y:1,z:7.55*sign},{x:0,y:-1,z:4*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces});return m;}
test('a legal reachable swipe hits synchronously before queueing for both volleys and bounced balls',()=>{
 for(const seat of [0,1] as Seat[])for(const bounces of [0,1]){const m=incoming(seat,bounces),p=m.state.players[seat],contact={x:m.state.ball.x,y:m.state.ball.y,z:m.state.ball.z},time=m.state.time;assert.ok(canReturnNormally(m.state.ball,p,seat));m.input(seat,shot);
 assert.equal(m.state.rally,3);assert.equal(m.state.time,time);assert.deepEqual(p.contact,contact);assert.equal(p.shotQueued,false);assert.equal((m as any).pending[seat],null);assert.equal(m.state.ball.skill,bounces===0?'volley':undefined);m.dispose();}
});
test('a fresh reachable swipe overrides the earlier queued direction immediately',()=>{
 for(const seat of [0,1] as Seat[]){const m=incoming(seat,0),p=m.state.players[seat],sign=side(seat);p.x=-4*sign;m.input(seat,{...shot,directionX:-.2});assert.equal(p.shotQueued,true);p.x=0;m.input(seat,{...shot,directionX:.2});assert.equal(m.state.rally,3);assert.ok(Math.abs(m.state.ball.vx/m.state.ball.vz+.2)<1e-6);assert.equal(p.shotQueued,false);m.dispose();}
});
test('unreachable swipe stays queued without striking at a distance',()=>{
 const m=incoming(0,0);m.state.players[0].x=-4;m.input(0,shot);assert.equal(m.state.rally,2);assert.equal(m.state.players[0].shotQueued,true);m.dispose();
});
