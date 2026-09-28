import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AimCameraLock} from '../src/render/aim-camera.js';
import {CourtView} from '../src/render/view.js';
import {frameMatch} from '../src/render/camera.js';
import {PerspectiveCamera} from 'three';
import type {MatchState,Seat} from '../src/simulation/types.js';

function state(seat:Seat):MatchState{
 return {time:1,phase:'rally',score:[0,0],rally:2,server:0,fault:0,pointTimer:0,maxRally:2,winner:null,event:'',eventId:0,lastPoint:null,
  players:[0,1].map(i=>({x:0,z:i?-10:10,tx:0,tz:i?-10:10,stamina:1,swing:0,stroke:'forehand',moving:false})) as MatchState['players'],
  ball:{x:0,y:1,z:4,vx:0,vy:0,vz:4,bounces:1,hitter:seat===0?1:0,targetX:0,targetZ:10}};
}
test('camera stays stable from pointer down through queued contact and outgoing first bounce',()=>{
 for(const seat of [0,1] as Seat[]){
  const lock=new AimCameraLock(),s=state(seat);
  lock.pointer(true);assert.equal(lock.update(s,1/60),true);
  lock.shot(s,seat);lock.pointer(false);
  for(let i=0;i<120;i++){s.time+=1/60;s.players[seat].x+=.01;assert.equal(lock.update(s,1/60),true);}
  s.rally++;s.ball.hitter=seat;s.ball.bounces=0;
  for(let i=0;i<60;i++)assert.equal(lock.update(s,1/60),true);
  s.ball.bounces=1;assert.equal(lock.update(s,1/60),false);
 }
});
test('cancel, lost shots, point transitions and opponent returns always release camera lock',()=>{
 const lock=new AimCameraLock(),s=state(0);
 lock.pointer(true);lock.pointer(false);assert.equal(lock.update(s,.016),false);
 lock.shot(s,0);assert.equal(lock.update(s,9),false);
 lock.shot(s,0);s.phase='point';assert.equal(lock.update(s,.016),false);
 s.phase='rally';lock.shot(s,0);s.rally+=2;assert.equal(lock.update(s,.016),false);
 lock.shot(s,0);lock.reset();assert.equal(lock.update(s,.016),false);
 // Swiping after our shot cannot freeze the camera for the opponent's rally.
 s.ball.hitter=0;lock.shot(s,0);assert.equal(lock.update(s,.016),false);
});
test('serve toss and repeated input preserve the same camera until flight bounces',()=>{
 const s=state(0),lock=new AimCameraLock();s.phase='serve';s.rally=0;s.ball.hitter=0;
 lock.shot(s,0);assert.equal(lock.update(s,.8),true);
 lock.shot(s,0);s.phase='rally';s.rally=1;s.ball.bounces=0;
 assert.equal(lock.update(s,.8),true);s.ball.bounces=1;assert.equal(lock.update(s,.016),false);
});
test('actual view camera matrix stays fixed despite runner/opponent motion and same-mode HUD redraws',()=>{
 for(const seat of [0,1] as Seat[]){
  const s=state(seat),camera=new PerspectiveCamera(),sign=seat===0?1:-1;
  frameMatch(camera,390,844,seat,0,10,s.players[seat===0?1:0]);
  const view=Object.assign(Object.create(CourtView.prototype),{
   camera,seat,mode:'match',size:{w:390,h:844},focus:{x:0,depth:10},aimCamera:new AimCameraLock(),
  }) as any;
  const projection=[...camera.projectionMatrix.elements],world=[...camera.matrixWorld.elements];
  view.setAiming(true);
  view.updateCamera(s,1/60);
  view.aimShot({type:'shot',aim:0,depth:.6,power:.5,lob:false},s,30,-150);
  view.setAiming(false);
  for(let i=0;i<120;i++){
   s.players[seat].x+=.025*sign;s.players[seat].z-=.015*sign;
   s.players[seat===0?1:0].x-=.02*sign;
   view.updateCamera(s,1/60);
   view.setMode('match',seat); // e.g. mute/help HUD rerender must not reset aim.
   assert.deepEqual(camera.projectionMatrix.elements,projection);
   assert.deepEqual(camera.matrixWorld.elements,world);
  }
  s.rally++;s.ball.hitter=seat;s.ball.bounces=0;view.updateCamera(s,.016);
  assert.deepEqual(camera.matrixWorld.elements,world);
  view.container={clientWidth:390,clientHeight:844};view.renderer={setSize(){}};
  view.resize(); // automatic quality/DPR changes are not a viewport resize
  view.updateCamera(s,.016);
  assert.deepEqual(camera.matrixWorld.elements,world);
  s.ball.bounces=1;view.updateCamera(s,.016);
  assert.notDeepEqual(camera.matrixWorld.elements,world);
 }
});
