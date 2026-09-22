import {before,test} from 'node:test';import assert from 'node:assert/strict';import {Match} from '../src/simulation/match.js';import {initPhysics} from '../src/simulation/physics.js';import {reception} from '../src/simulation/reception.js';import {canReturnNormally} from '../src/simulation/skills.js';import {side,type Seat} from '../src/simulation/types.js';
before(initPhysics);
const shot={type:'shot' as const,aim:0,depth:.5,power:.4,lob:false};
test('low bouncing ball keeps a future reception point even when it cannot reach waist height',()=>{
 const m=new Match(),p=m.state.players[0],b={...m.state.ball,x:-3,y:.27,z:4.85,vx:-1.45,vy:2.9,vz:4.09,bounces:1};const r=reception(b,p,0);assert.ok(r.time>.1);assert.ok(r.point.z>b.z+.4);assert.ok(canReturnNormally({...b,...r.point},{...p,x:r.x,z:r.z},0));m.dispose();
});
test('an ordinary player waiting at the auto-selected spot catches a low bounce with an early swipe',()=>{
 for(const seat of [0,1] as Seat[])for(const hand of ['lin','noah','adrian','luca']){
  const sign=side(seat),m=new Match([hand,hand],()=>1);m.state.phase='rally';m.state.rally=2;
  m.physics.place({x:-2.325743260793388*sign,y:1.2050785743631423,z:2.7722555100917816*sign},{x:-1.4527925858274102*sign,y:-.29331559827551246,z:4.088712823810056*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:0});
  const p=m.state.players[seat],r=reception(m.state.ball,p,seat);Object.assign(p,{x:r.x,z:r.z,tx:r.x,tz:r.z,vx:0,vz:0});
  m.input(seat,shot);for(let i=0;i<220&&m.state.rally===2&&m.state.phase==='rally';i++)m.step(1/60);
  assert.equal(m.state.rally,3,`${seat}/${hand}`);assert.notEqual(m.state.ball.skill,'volley');assert.equal(m.state.ball.rescue,false);m.dispose();
 }
});
