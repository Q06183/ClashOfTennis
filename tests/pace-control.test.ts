import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {frameMatch} from '../src/render/camera.js';
import {captureSwipeAim} from '../src/input/aim.js';
import {predictFlight} from '../src/simulation/trajectory.js';
import {isInCourt} from '../src/simulation/rules.js';
import {side,type Shot} from '../src/simulation/types.js';
import {placementAssist,controlledPlacement} from '../src/simulation/pace-control.js';
import {interpretGesture} from '../src/input/gesture.js';
import {CHARACTERS,handedness} from '../src/simulation/characters.js';
before(initPhysics);
test('pace protection is continuous, direction-ordered and disappears at full power',()=>{
 assert.equal(placementAssist(.2),1);assert.equal(placementAssist(.38),1);assert.equal(placementAssist(1),0);
 let previous=1;
 for(let i=0;i<=1000;i++){const v=placementAssist(i/1000);assert.ok(v<=previous&&v>=0);previous=v;}
 for(const power of [.2,.5,.7,1]){
  let previous=-Infinity;
  for(let i=-1200;i<=1200;i++){
   const raw=i/100,x=controlledPlacement(raw,6,placementAssist(power)).x;
   assert.ok(x>=previous);assert.ok(Math.abs(x)<=Math.abs(raw)+1e-9);
   assert.equal(Math.sign(x),Math.sign(raw));previous=x;
  }
  assert.deepEqual(controlledPlacement(1.2,6,placementAssist(power)),{x:1.2,z:6},'central intent is unchanged');
 }
 assert.deepEqual(controlledPlacement(20,15,0),{x:20,z:15},'full-power overhit remains untouched');
 const powers=[700,330,135,90].map(duration=>interpretGesture({dx:0,dy:-260,duration,hold:0,width:390,height:844})!.power);
 const assistance=powers.map(placementAssist);
 assert.ok(assistance[0]>assistance[1]&&assistance[1]>assistance[2]&&assistance[2]>assistance[3]);
});
test('ordinary touch swipes have real side/baseline margin and faster strokes progressively lose protection',()=>{
 for(const seat of [0,1] as const)for(const distance of ['near','far'] as const)
 for(const x of [-3,0,3])for(const ratio of [-.6,0,.6]){
  const samples:number[]=[];
  for(const power of [.2,.38,.5,.7,1]){
   const m=new Match(['lin','lin'],()=>.5),p=m.state.players[seat],sign=side(seat),camera=new PerspectiveCamera();
   try{
    m.state.phase='rally';m.state.rally=2;m.step(.08);
    Object.assign(p,{x:x*sign,z:12.4*sign,tx:x*sign,tz:12.4*sign});
    m.physics.place({x:(x+.3)*sign,y:1.3,z:12.15*sign},{x:0,y:0,z:4*sign});
    Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
    frameMatch(camera,390,844,seat,p.x,12.4,undefined,distance);
    const shot:Shot={type:'shot',aim:0,depth:1,power,lob:false,critical:power===1};
    m.input(seat,{...shot,swipeAim:captureSwipeAim(camera,shot,ratio*150,-150,390,844)});
    const b=m.state.ball,flight=predictFlight(b);
    assert.equal(m.state.rally,3);assert.equal(flight.hitNet,false);
    if(power<=.38){
     assert.ok(Math.abs(b.targetX)<3.96&&Math.abs(b.targetZ)<10.95,`${seat}/${x}/${ratio}: ${b.targetX},${b.targetZ}`);
     assert.equal(isInCourt(flight.landing.x,flight.landing.z,seat===0?1:0),true);
     // Advance actual physics through first bounce: no target-only protection.
     while(m.state.phase==='rally'&&m.state.ball.bounces===0)m.step(1/120);
     assert.equal(m.state.ball.bounces,1);assert.equal(m.state.phase,'rally');
    }
    samples.push(Math.abs(b.targetZ));
   }finally{m.dispose();}
  }
  assert.ok(samples[0]<=samples[1]&&samples[1]<samples[2]&&samples[2]<samples[3]&&samples[3]<samples[4]);
  assert.ok(samples[4]>11.915,'fast deliberate overhit remains out');
 }
});
test('every character can place an ordinary swipe safely, including a high automatic overhead or slice',()=>{
 for(const c of CHARACTERS)for(const seat of [0,1] as const)for(const height of [.8,2.4])for(const slice of [false,true]){
  const m=new Match([c.id,c.id],()=>1),p=m.state.players[seat],sign=side(seat),camera=new PerspectiveCamera();
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:3*sign,z:12.4*sign,tx:3*sign,tz:12.4*sign,stamina:.4,totalStamina:.6});
   m.physics.place({x:p.x+.3*sign*handedness(c.id),y:height,z:12.15*sign},{x:0,y:0,z:4*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   frameMatch(camera,390,844,seat,p.x,12.4,undefined,'near');
   const shot:Shot={type:'shot',aim:0,depth:1,power:.2,lob:false,slice},reverse=slice?-1:1;
   m.input(seat,{...shot,swipeAim:captureSwipeAim(camera,shot,90*reverse,-150*reverse,390,844),placementAssist:0} as Shot);
   assert.equal(m.state.rally,3);assert.equal(m.state.ball.placementAssist,1);
   const landing=predictFlight(m.state.ball);
   assert.equal(landing.hitNet,false);assert.ok(Math.abs(landing.landing.x)<3.96&&Math.abs(landing.landing.z)<10.95);
  }finally{m.dispose();}
 }
});
