import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {initPhysics} from '../src/simulation/physics.js';
import {Match} from '../src/simulation/match.js';
import type {Shot} from '../src/simulation/types.js';
before(initPhysics);
const base={type:'shot',aim:0,depth:.5,power:.5,lob:false} as const;
test('directional swipe starts at the ball, never snaps back toward court centre',()=>{
  for(const total of [0,1,2,3])for(const directionX of [-.18,0,.18]){
    const m=new Match();m.state.score=[total,0];m.state.phase='point';m.state.pointTimer=0;m.step(1/60);
    const seat=m.state.server,sign=seat===0?1:-1,start={...m.state.ball};
    m.input(seat,{...base,directionX} as Shot);
    for(let i=0;i<60&&m.state.rally===0;i++)m.step(1/60);
    const b=m.state.ball;
    assert.ok(Math.abs((b.targetX-start.x)*sign-directionX*Math.abs(b.targetZ-start.z))<1e-6);
    assert.ok(Math.abs(b.vx/b.vz+(directionX))<1e-6);
    m.dispose();
  }
});
test('invalid directional input cannot launch a ball',()=>{
  for(const directionX of [NaN,Infinity,{},'1']){
    const m=new Match();m.input(0,{...base,directionX} as unknown as Shot);
    assert.equal(m.state.phase,'serve');m.dispose();
  }
});
