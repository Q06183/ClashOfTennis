import {test} from 'node:test';
import assert from 'node:assert/strict';
import {predictFlight} from '../src/simulation/trajectory.js';
import {BallPhysics,initPhysics} from '../src/simulation/physics.js';
test('forecast agrees with actual physics first ground contact',async()=>{
  await initPhysics();const p=new BallPhysics();
  const start={x:1,y:2.5,z:10},velocity={x:-1.8,y:4,vz:0,z:-13};
  p.place(start,velocity);const f=predictFlight({...start,vx:velocity.x,vy:velocity.y,vz:velocity.z});
  assert.equal(f.hitNet,false);
  let before=p.read(),after=before;
  for(let i=0;i<720;i++){before=after;p.step(1/240);after=p.read();if(after.vy>0&&before.vy<0)break;}
  assert.ok(Math.abs(after.x-f.landing.x)<.08);
  assert.ok(Math.abs(after.z-f.landing.z)<.08);p.dispose();
});
test('forecast stops at a net collision and does not imply a playable landing',()=>{
  const f=predictFlight({x:0,y:.7,z:2,vx:1,vy:0,vz:-15});
  assert.equal(f.hitNet,true);assert.equal(f.landing.z,0);assert.ok(f.points.every(p=>p.z>=0));
});

test('network guide uses authoritative flight even when rendered position is smoothed',async()=>{
  const {FlightGuide}=await import('../src/render/trajectory.js');
  const {Match}=await import('../src/simulation/match.js');
  await initPhysics();const match=new Match();match.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
  for(let i=0;i<75;i++)match.step(1/60);
  const actual=match.state,draw=structuredClone(actual);draw.ball.z+=1;draw.ball.y+=.15;
  const guide=new FlightGuide();guide.update(draw,0,true,actual);
  const ring=guide.root.children[1];const expected=predictFlight(actual.ball).landing;
  assert.ok(Math.abs(ring.position.z-expected.z)<1e-6);match.dispose();
});
