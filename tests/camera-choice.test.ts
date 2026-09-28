import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {frameMatch} from '../src/render/camera.js';
import {AimCameraLock} from '../src/render/aim-camera.js';
import {CourtView} from '../src/render/view.js';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {interpretGesture} from '../src/input/gesture.js';
import {projectedLandingAngle} from './helpers/projected-shot.js';

before(initPhysics);
test('near and far presets stay behind both players, with clearly different subject sizes',()=>{
 for(const seat of [0,1] as const)for(const [w,h] of [[390,844],[844,390]]){
  const sign=seat===0?1:-1,heights=[];
  for(const distance of ['near','far'] as const){
   const c=new PerspectiveCamera();frameMatch(c,w,h,seat,0,12.4,{x:0,z:-12.4*sign},distance);
   const foot=new Vector3(0,0,12.4*sign).project(c),head=new Vector3(0,1.96,12.4*sign).project(c);
   heights.push(head.y-foot.y);
   assert.ok(Math.abs(c.getWorldDirection(new Vector3()).x)<1e-12);
   for(const z of [-11.885,11.885]){
    assert.ok(Math.abs(new Vector3(-4.115,0,z).project(c).y-new Vector3(4.115,0,z).project(c).y)<1e-12);
   }
  }
  assert.ok(heights[0]>heights[1]*1.8,'near view must actually be substantially closer');
 }
});
test('changing camera distance waits until the current swipe/flight lock has finished',()=>{
 const m=new Match(),camera=new PerspectiveCamera(),lock=new AimCameraLock();
 const view=Object.assign(Object.create(CourtView.prototype),{camera,seat:0,mode:'match',size:{w:390,h:844},focus:{x:0,depth:12.4},
  aimCamera:lock,cameraDistance:'near',appliedCameraDistance:'near'}) as any;
 try{
  view.updateCamera(m.state,.016);
  const before=[...camera.projectionMatrix.elements],world=[...camera.matrixWorld.elements];
  view.setAiming(true);view.setCameraDistance('far');
  view.updateCamera(m.state,.016);
  assert.deepEqual(camera.projectionMatrix.elements,before);assert.deepEqual(camera.matrixWorld.elements,world);
  view.setAiming(false);view.updateCamera(m.state,.016);
  assert.equal(view.appliedCameraDistance,'far');assert.notDeepEqual(camera.matrixWorld.elements,world);
 }finally{m.dispose();}
});
test('both presets retain actual screen-to-landing direction for each seat',()=>{
 for(const distance of ['near','far'] as const)for(const seat of [0,1] as const)for(const x of [-3,0,3]){
  const m=new Match(),sign=seat===0?1:-1,camera=new PerspectiveCamera();
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   const p=m.state.players[seat];Object.assign(p,{x:x*sign,z:10*sign,tx:x*sign,tz:10*sign});
   m.physics.place({x:(x+.4)*sign,y:1.3,z:9.6*sign},{x:0,y:0,z:4*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   frameMatch(camera,390,844,seat,p.x,10,m.state.players[seat===0?1:0],distance);
   const shot=interpretGesture({dx:30,dy:-150,duration:220,hold:0,width:390,height:844})!;
   const aimed=CourtView.prototype.aimShot.call({camera,seat,size:{w:390,h:844},aimCamera:new AimCameraLock()} as any,shot,m.state,30,-150);
   m.input(seat,aimed);assert.equal(m.state.rally,3);
   assert.ok(Math.abs(projectedLandingAngle(camera,p.contact!,m.state.ball,390,844)-Math.atan(.2))<.001);
  }finally{m.dispose();}
 }
});
