import {before,test} from 'node:test';import assert from 'node:assert/strict';import {PerspectiveCamera} from 'three';
import {captureSwipeAim,shotDirection} from '../src/input/aim.js';import {directionAtContact} from '../src/simulation/shot-aim.js';import {frameMatch} from '../src/render/camera.js';import {Match} from '../src/simulation/match.js';import {initPhysics} from '../src/simulation/physics.js';import {side,type Seat} from '../src/simulation/types.js';
import {projectedOutgoingAngle,expectedControlledAngle} from './helpers/projected-shot.js';
before(initPhysics);const shot={type:'shot' as const,aim:0,depth:.6,power:.4,lob:false};
test('stored screen aim resolves at the future contact point for both seats and slices',()=>{
 for(const seat of [0,1] as Seat[])for(const slice of [false,true])for(const ratio of [-.25,0,.25]){
  const camera=new PerspectiveCamera(),sign=side(seat);frameMatch(camera,390,844,seat,-2*sign,10);const s={...shot,slice},dx=ratio*150,dy=slice?150:-150;
  const aim=captureSwipeAim(camera,s,dx,dy,390,844),contact={x:2*sign,y:.8,z:7*sign};
  assert.ok(Math.abs(directionAtContact(aim,contact,0,sign)-shotDirection(camera,contact,s,dx,dy,390,844,sign))<1e-6);
 }
});
test('running receiver saves the swipe, arrives legally and launches from actual contact with saved intent',()=>{
 for(const seat of [0,1] as Seat[]){const sign=side(seat),m=new Match(['lin','lin'],()=>1),p=m.state.players[seat];m.state.phase='rally';m.state.rally=2;Object.assign(p,{x:-2*sign,z:10*sign,tx:-4*sign,tz:12*sign,vx:-1*sign,vz:0});
  m.physics.place({x:1.2*sign,y:2.8,z:-2*sign},{x:.3*sign,y:4,z:7*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:0});
  const camera=new PerspectiveCamera();frameMatch(camera,390,844,seat,p.x,10);const aim=captureSwipeAim(camera,shot,24,-150,390,844),startX=p.x;
  m.input(seat,{...shot,directionX:shotDirection(camera,m.state.ball,shot,24,-150,390,844,sign),swipeAim:aim});assert.equal(m.state.rally,2);assert.equal(p.shotQueued,true);let frames=0;
  for(;frames<240&&m.state.rally===2&&m.state.phase==='rally';frames++)m.step(1/60);
  assert.equal(m.state.rally,3);assert.ok(frames>20);assert.ok(Math.abs(p.x-startX)>1);assert.equal(p.shotQueued,false);assert.equal(m.state.ball.rescue,false);
  assert.ok(Math.abs(projectedOutgoingAngle(camera,p.contact!,m.state.ball,390,844)-expectedControlledAngle(camera,p.contact!,m.state.ball,390,844,24/150))<.01);m.dispose();
 }
});
test('malformed saved aim is rejected without queuing a shot',()=>{
 for(const swipeAim of [null,{}, {projection:Array(9).fill(NaN),dx:1,dy:1},{projection:Array(9).fill(0),dx:0,dy:0},{projection:Array(100).fill(0),dx:1,dy:1}]){
  const m=new Match();m.state.phase='rally';m.state.ball.hitter=1;m.input(0,{...shot,swipeAim} as any);assert.equal(m.state.players[0].shotQueued,false);m.dispose();
 }
});
test('saved aim is copied, a later swipe replaces it, and unreachable balls do not teleport the receiver',()=>{
 const m=new Match(['lin','lin'],()=>1);m.state.phase='rally';m.state.rally=2;const p=m.state.players[0];Object.assign(p,{x:-6,z:15,tx:-6,tz:15,vx:0,vz:0});m.physics.place({x:4,y:.5,z:3},{x:0,y:-1,z:5});Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:0});
 const camera=new PerspectiveCamera();frameMatch(camera,390,844,0,-6,15);const first=captureSwipeAim(camera,shot,30,-150,390,844),second=captureSwipeAim(camera,shot,-30,-150,390,844),saved=[...second.projection],elevation=[...second.elevation!];
 m.input(0,{...shot,swipeAim:first});m.input(0,{...shot,swipeAim:second});second.projection.fill(999);second.elevation!.fill(999);
 assert.deepEqual((m as any).pending[0].shot.swipeAim.elevation,elevation);
 assert.deepEqual((m as any).pending[0].shot.swipeAim.projection,saved);assert.ok((m as any).pending[0].shot.swipeAim.dx<0);
 let previous={x:p.x,z:p.z};for(let i=0;i<180&&m.state.phase==='rally';i++){m.step(1/60);assert.ok(Math.hypot(p.x-previous.x,p.z-previous.z)<.14);previous={x:p.x,z:p.z};}
 assert.equal(m.state.rally,2);assert.equal(p.shotQueued,false);m.dispose();
});

test('extreme sideways swipe cannot launch along the backwards half of its projected line',()=>{
 for(const seat of [0,1] as Seat[])for(const slice of [false,true])for(const x of [-3,-6]){
  // Original near-net, low oblique view that exposes the backwards-line root.
  const sign=side(seat),camera=new PerspectiveCamera(30,390/844,.1,130);
  camera.position.set(x*sign*(1+14.6/13),6.5,16.6*sign);
  camera.lookAt(x*sign*3.6/13,1,-7.4*sign);camera.updateMatrixWorld();
  const aim=captureSwipeAim(camera,{...shot,slice},slice?-100:100,slice?8:-8,390,844);
  assert.equal(directionAtContact(aim,{x:x*sign,y:1,z:1.5*sign},0,sign),0);
 }
});
