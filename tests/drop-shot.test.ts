import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {interpretGesture} from '../src/input/gesture.js';
import {shotDepth} from '../src/simulation/shot-profile.js';
import {frameMatch} from '../src/render/camera.js';
import {captureSwipeAim} from '../src/input/aim.js';
import {predictFlight} from '../src/simulation/trajectory.js';
import {reception} from '../src/simulation/reception.js';
import {projectedOutgoingAngle} from './helpers/projected-shot.js';
import {side} from '../src/simulation/types.js';
import {handedness} from '../src/simulation/characters.js';
import {dropStrength} from '../src/simulation/drop-shot.js';
import {canReturnNormally} from '../src/simulation/skills.js';
before(initPhysics);

const gesture=(length:number,duration=650)=>interpretGesture({dx:0,dy:-length,duration,hold:0,width:390,height:844})!;
test('short slow swipes land just over the net without changing long strokes or serves',()=>{
 for(const length of [25,40,70]){
  const s=gesture(length),depth=shotDepth(s,false);
  assert.ok(depth>=1&&depth<=2,`${length}px: ${depth}m beyond net`);
  assert.equal(shotDepth(s,true),3.4+s.depth*2.6,'serve remains in its service depth range');
 }
 const long=gesture(260);
 assert.ok(shotDepth(long,false)>8,'long slow stroke remains a deep placement');
 assert.ok(shotDepth(gesture(90,80),false)>shotDepth(gesture(90),false),'quick flick is not the same touch shot');
});

test('touch fades continuously and explicit lob, spin or fast pace never become drop shots',()=>{
 const base=gesture(40);let previous=shotDepth(base,false);
 for(let i=1;i<=1000;i++){
  const s={...base,depth:i/1000},d=shotDepth(s,false);
  // Start comparison at the first sampled depth rather than the fixture's depth.
  if(i>1){assert.ok(d>=previous);assert.ok(d-previous<.06);}
  previous=d;
 }
 for(const override of [{lob:true},{topspin:.2},{power:.5},{critical:true}]){
  assert.equal(dropStrength({...base,...override}),0);
 }
});

test('short slow placement survives high contact, roster power, slice randomness and the actual first bounce',()=>{
 for(const seat of [0,1] as const)for(const id of ['lin','wuming','noah'])
 for(const depth of [3,12.4])for(const height of [1.3,2.4])for(const slice of [false,true]){
  const m=new Match([id,id],()=>1),p=m.state.players[seat],sign=side(seat),camera=new PerspectiveCamera();
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:0,z:depth*sign,tx:0,tz:depth*sign});
   m.physics.place({x:.3*sign*handedness(id),y:height,z:(depth-.25)*sign},{x:0,y:0,z:4*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   frameMatch(camera,390,844,seat,0,depth,undefined,'near');
   const shot={...gesture(40),slice},reverse=slice?-1:1;
   m.input(seat,{...shot,swipeAim:captureSwipeAim(camera,shot,0,-40*reverse,390,844)});
   assert.equal(m.state.rally,3);
   assert.ok(Math.abs(m.state.ball.targetZ)<=2.2,`${id}/${height}/${slice}: ${m.state.ball.targetZ}`);
   assert.ok(Math.abs(projectedOutgoingAngle(camera,p.contact!,m.state.ball,390,844))<.001);
   const prediction=predictFlight(m.state.ball),forecast=reception(m.state.ball,m.state.players[seat===0?1:0],seat===0?1:0);
   assert.equal(prediction.hitNet,false);
   assert.ok(Math.abs(forecast.point.z)<4.5,'receiver predicts the short rebound');
   for(let i=0;i<240&&m.state.ball.bounces===0&&m.state.phase==='rally';i++)m.step(1/120);
   assert.equal(m.state.ball.bounces,1,'real ball clears the net and lands legally');
   assert.equal(m.state.phase,'rally');
   assert.ok(Math.abs(m.state.ball.z)<=2.3,'actual first bounce stays short');
   const second=predictFlight(m.state.ball);
   assert.ok(Math.abs(second.landing.z)<4.5,`short second bounce, not a deep drive: ${second.landing.z}`);
   assert.ok(Math.max(...second.points.map(p=>p.y))<.8,'soft low rebound');
  }finally{m.dispose();}
 }
});

test('a real rescue keeps touch depth despite extreme randomness and clears it next point',()=>{
 for(const random of [0,1]){
  let calls=0;const m=new Match(['lin','lin'],()=>calls++===0?0:random),p=m.state.players[0];
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:0,z:10,tx:0,tz:10,stamina:.08,totalStamina:.3});
   m.physics.place({x:2.65,y:1.2,z:8.2},{x:0,y:0,z:10});
   Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:1});
   const c=new PerspectiveCamera();frameMatch(c,390,844,0,0,10,undefined,'near');
   const shot=gesture(40);m.input(0,{...shot,swipeAim:captureSwipeAim(c,shot,0,-40,390,844)});
   for(let i=0;i<60&&m.state.rally===2;i++)m.step(1/60);
   assert.equal(m.state.ball.rescue,true);assert.equal(m.state.ball.drop,1);
   assert.ok(Math.abs(m.state.ball.targetZ)>1&&Math.abs(m.state.ball.targetZ)<2);
   const flight=predictFlight(m.state.ball);assert.equal(flight.hitNet,false);
   const receiver=m.state.players[1],target=reception(m.state.ball,receiver,1);
   const g=9.81,t=flight.duration,up=Math.min(Math.abs(m.state.ball.vy-g*t)*.72*.5,3);
   const after=target.time-t;
   const predicted={...m.state.ball,x:target.point.x,y:.12+up*after-g*after*after/2,z:target.point.z,bounces:1};
   assert.ok(canReturnNormally(predicted,{...receiver,x:target.x,z:target.z},1),'short ball has a physically reachable reception');
   m.state.phase='point';m.state.pointTimer=0;m.step(1/60);
   assert.equal(m.state.ball.drop,0);
  }finally{m.dispose();}
 }
});
