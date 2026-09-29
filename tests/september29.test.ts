import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {frameMatch} from '../src/render/camera.js';
import {CourtView} from '../src/render/view.js';
import {AimCameraLock} from '../src/render/aim-camera.js';
import {flightGravity} from '../src/simulation/flight.js';
import {beginPointStamina,recoverPointStamina} from '../src/simulation/stamina.js';
import {rescueTarget,RESCUE} from '../src/simulation/rescue.js';
import {side,type PlayerState} from '../src/simulation/types.js';
import {Athlete} from '../src/render/player.js';
import {disposeTree} from '../src/render/dispose.js';

before(initPhysics);
test('actual unmodified outgoing ball motion follows finger angle for both serve and returns',()=>{
 for(const seat of [0,1] as const)for(const distance of ['near','far'] as const)
 for(const x of [-3,0,3])for(const serve of [false,true])for(const ratio of [-.25,0,.25]){
  const m=new Match(),p=m.state.players[seat],sign=side(seat),camera=new PerspectiveCamera();
  try{
   if(!serve){m.state.phase='rally';m.state.rally=2;m.step(.08);}
   m.state.server=seat;Object.assign(p,{x:x*sign,z:12.4*sign,tx:x*sign,tz:12.4*sign});
   m.physics.place({x:(x+.4)*sign,y:serve?1.25:1.3,z:12*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   frameMatch(camera,390,844,seat,p.x,12.4,undefined,distance);
   m.input(seat,CourtView.prototype.aimShot.call({camera,seat,size:{w:390,h:844},aimCamera:new AimCameraLock()} as any,
    {type:'shot',aim:0,depth:.5,power:.5,lob:false},m.state,ratio*150,-150));
   if(serve)for(let i=0;i<120&&m.state.rally===0;i++)m.step(1/60);
   const b=m.state.ball,c=p.contact!,a=new Vector3(c.x,c.y,c.z).project(camera);
   const z=new Vector3(c.x+b.vx*.1,c.y+b.vy*.1-flightGravity(b)*.005,c.z+b.vz*.1).project(camera);
   const angle=Math.atan2((z.x-a.x)*390,(z.y-a.y)*844);
   assert.ok(Math.abs(angle-Math.atan(ratio))<.005,`${seat}/${distance}/${x}/${serve}/${ratio}: ${angle}`);
   // Also advance the actual Rapier body, rather than only checking the
   // analytic launch formula. Small tolerance covers numerical integration.
   for(let tick=0;tick<6;tick++)m.physics.step(1/60);
   const actual=m.physics.read(),screen=new Vector3(actual.x,actual.y,actual.z).project(camera);
   const measured=Math.atan2((screen.x-a.x)*390,(screen.y-a.y)*844);
   assert.ok(Math.abs(measured-Math.atan(ratio))<.005,`physical screen angle: ${measured}`);
  }finally{m.dispose();}
 }
});
test('point stamina starts and recovers no higher than its match-stamina opening value',()=>{
 const m=new Match(),p=m.state.players[0];
 try{
  p.totalStamina=.57;beginPointStamina(p);assert.equal(p.stamina,.57);
  p.stamina=.4;recoverPointStamina(p,1);assert.equal(p.stamina,.57);
  p.totalStamina=.4;beginPointStamina(p);assert.equal(p.stamina,.4);
 }finally{m.dispose();}
});
test('reachable approaching balls never enter rescue lottery; forward/back jumps are excluded',()=>{
 const m=new Match(['lin','lin'],()=>{throw Error('normal catch must not roll');}),p=m.state.players[0];
 try{
  m.state.phase='rally';m.state.rally=2;m.step(.08);Object.assign(p,{x:0,z:10,tx:0,tz:10});
  m.physics.place({x:.9,y:1,z:8},{x:0,y:0,z:10});Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:1});
  m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
  assert.equal(p.rescue,undefined);
  for(let i=0;i<60&&m.state.rally===2;i++)m.step(1/60);
  assert.equal(m.state.rally,3);assert.equal(m.state.ball.rescue,false);
  for(const z of [7,12]){
   const b={...m.state.ball,x:0,y:1,z,vx:0,vy:0,vz:4,bounces:1,hitter:1 as const};
   assert.equal(rescueTarget(b,{...p,x:0,z:10},0),null);
  }
 }finally{m.dispose();}
});
test('side dive lands prone and pushes off the floor with both hands over half a second',()=>{
 for(const characterId of ['lin','noah'])for(const seat of [0,1] as const)for(const direction of [-1,1]){
  const a=new Athlete(seat),sign=side(seat);
  const p:PlayerState={characterId,x:direction,z:10*sign,tx:direction,tz:10*sign,stamina:.8,
   stroke:'forehand',swing:0,moving:false,rescue:{startedAt:0,fromX:0,fromZ:10*sign,toX:direction,toZ:10*sign,
    contact:{x:direction*1.6,y:1,z:9.6*sign},hit:true,stroke:'forehand'}};
  try{
   assert.ok(Math.abs(RESCUE.duration-RESCUE.riseAt-.5)<1e-12);
   a.update(p,RESCUE.riseAt,1/60);
   const chest=a.root.getObjectByName('athlete-torso')!;
   const top=chest.localToWorld(new Vector3(0,1.4,0)),bottom=chest.localToWorld(new Vector3(0,.85,0));
   assert.ok(Math.abs(top.y-bottom.y)<.15,'torso horizontal, not a squat');
   const hands=['racket-grip','left-hand-grip'].map(n=>a.root.getObjectByName(n)!.getWorldPosition(new Vector3()));
   assert.ok(hands.every(h=>h.y<.3&&h.y>-.05),'both hands on floor for push-up');
   a.update(p,RESCUE.riseAt+.25,1/60);
   assert.ok(chest.localToWorld(new Vector3(0,1.4,0)).y>top.y+.15);
  }finally{disposeTree(a.root);}
 }
});
