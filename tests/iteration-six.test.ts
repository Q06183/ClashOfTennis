import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {rescueChance} from '../src/simulation/rescue.js';
import {frameMatch} from '../src/render/camera.js';
import {CourtView} from '../src/render/view.js';
import {AimCameraLock} from '../src/render/aim-camera.js';
import {side,type Seat} from '../src/simulation/types.js';
import {shotDepth} from '../src/simulation/shot-profile.js';
import {projectedOutgoingAngle} from './helpers/projected-shot.js';
import {rescueIncoming} from './helpers/rescue-incoming.js';

before(initPhysics);
test('eligible rescue starts in input immediately and uses total stamina, not depleted point stamina',()=>{
 for(const seat of [0,1] as Seat[]){
  let draws=0;const m=new Match(['lin','lin'],()=>{draws++;return .8;}),p=m.state.players[seat],sign=side(seat);
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,stamina:.05,totalStamina:1,vx:0,vz:0});
   rescueIncoming(m,seat);
   const time=m.state.time;
   m.input(seat,{type:'shot',aim:.2,depth:.5,power:.8,lob:false});
   assert.ok(p.rescue,'must jump before input returns');assert.equal(draws,1);assert.equal(m.state.time,time);
  }finally{m.dispose();}
 }
 assert.equal(rescueChance(1),.9);assert.equal(rescueChance(1/3),.1);
});
test('a high incoming ball can trigger a jump now if its future contact is legal',()=>{
 const m=new Match(['lin','lin'],()=>0),p=m.state.players[0];
 try{
  m.state.phase='rally';m.state.rally=2;m.step(.08);
  Object.assign(p,{x:0,z:10,tx:0,tz:10,vx:0,vz:0,stamina:1,totalStamina:1});
  rescueIncoming(m,0,'smash',3.65);
  m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
  assert.equal(p.rescue?.stroke,'smash');
  assert.ok(p.rescue!.contact.y<3.05&&p.rescue!.contact.y>2.25);
 }finally{m.dispose();}
});
test('near and far are uniform zooms of the same perspective rather than differently proportioned courts',()=>{
 for(const seat of [0,1] as Seat[]){
  const cameras=['near','far'].map(distance=>{const c=new PerspectiveCamera();frameMatch(c,390,844,seat,3,12.4,undefined,distance as 'near'|'far');return c;});
  assert.deepEqual(cameras[0].matrixWorld.elements,cameras[1].matrixWorld.elements);
  const samples=cameras.map(c=>{
   const p=(x:number,y:number,z:number)=>new Vector3(x,y,z*side(seat)).project(c);
   return [(p(0,1.96,12.4).y-p(0,0,12.4).y)/(p(0,0,-11.885).y-p(0,0,11.885).y),
    (p(4.115,0,11.885).x-p(-4.115,0,11.885).x)/(p(4.115,0,-11.885).x-p(-4.115,0,-11.885).x)];
  });
  samples[0].forEach((v,i)=>assert.ok(Math.abs(v-samples[1][i])<1e-10));
 }
});
test('straight swipes at both corners launch vertically on screen from actual racket contact',()=>{
 for(const seat of [0,1] as Seat[])for(const distance of ['near','far'] as const)for(const x of [-4,4])for(const serve of [false,true]){
  const m=new Match(),sign=side(seat),p=m.state.players[seat],camera=new PerspectiveCamera();
  try{
   if(!serve){m.state.phase='rally';m.state.rally=2;m.step(.08);}
   m.state.server=seat;
   Object.assign(p,{x:x*sign,z:12.4*sign,tx:x*sign,tz:12.4*sign,vx:0,vz:0});
   const contact={x:(x+(x>0?.4:-.4))*sign,y:serve?1.25:1.3,z:12*sign};
   m.physics.place(contact,{x:0,y:0,z:4*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   frameMatch(camera,390,844,seat,p.x,12.4,undefined,distance);
   const aimed=CourtView.prototype.aimShot.call({camera,seat,size:{w:390,h:844},aimCamera:new AimCameraLock()} as any,{type:'shot',aim:0,depth:.5,power:.4,lob:false},m.state,0,-150);
   m.input(seat,aimed);if(serve)for(let i=0;i<120&&m.state.rally===0;i++)m.step(1/60);
   assert.ok(Math.abs(projectedOutgoingAngle(camera,p.contact!,m.state.ball,390,844))<.001,`${seat}/${distance}/${x}/${serve}`);
  }finally{m.dispose();}
 }
});
test('serve setup lets both players move, confines the server behind the correct half-baseline and locks the toss',()=>{
 for(const total of [0,1,2,3]){
  const m=new Match();
  try{
   m.state.score=[total,0];m.state.phase='point';m.state.pointTimer=0;m.step(1/60);
   const seat=m.state.server,sign=side(seat),half=sign*(total%2===0?1:-1),p=m.state.players[seat],other=seat===0?1:0;
   m.input(seat,{type:'move',x:half*3,z:sign*15});
   m.input(other,{type:'move',x:2,z:side(other)*8});
   for(let i=0;i<90;i++)m.step(1/60);
   assert.ok(Math.abs(p.x-half*3)<.1&&Math.abs(p.z-sign*15)<.1);
   assert.ok(Math.abs(m.state.players[other].z-side(other)*8)<.1);
   m.input(seat,{type:'move',x:-half*5,z:sign*2});
   assert.ok(p.tx*half>0&&p.tz*sign>11.885);
   const location={x:p.x,z:p.z};
   m.input(seat,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
   m.input(seat,{type:'move',x:half,z:sign*16});
   for(let i=0;i<30;i++)m.step(1/60);
   assert.equal(p.x,location.x);assert.equal(p.z,location.z);
  }finally{m.dispose();}
 }
});
test('serve setup cannot drift across its legal boundary while braking',()=>{
 const m=new Match(),p=m.state.players[0];
 try{
  Object.assign(p,{x:.26,z:12.15,tx:.25,tz:12.135,vx:-5,vz:-4});
  m.step(1/60);
  assert.ok(p.x>=.25&&p.z>=12.135,'actual station, not only the target, stays legal');
 }finally{m.dispose();}
});
test('later rescue opportunities use the most recent stored swipe quality and direction',()=>{
 for(const seat of [0,1] as Seat[]){
  const sign=side(seat);let draws=0;
  const m=new Match(['lin','lin'],()=>{draws++;return 0;}),p=m.state.players[seat];
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,stamina:.8,totalStamina:1,vx:0,vz:0});
   m.physics.place({x:3*sign,y:1.2,z:1*sign},{x:0,y:2,z:8*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   m.input(seat,{type:'shot',aim:-.4,depth:.25,power:.3,lob:false});
   assert.equal(p.rescue,undefined);
   const latest={type:'shot' as const,aim:.4,depth:.7,power:1,lob:false,critical:true,topspin:.6};
   m.input(seat,latest);
   // No new swipe when the ball later enters the reachable jump envelope.
   rescueIncoming(m,seat);
   let started=false;
   for(let i=0;i<90&&m.state.rally===2;i++){m.step(1/60);started||=!!p.rescue;}
   assert.ok(started);assert.equal(m.state.ball.rescue,true);assert.equal(draws,3);
   assert.equal(m.state.ball.topspin,.6);
   assert.equal(m.state.ball.tier,'topspin');
   // RNG zero gives the known negative scatter, but does not erase swipe depth.
   assert.ok(Math.abs(m.state.ball.targetZ-(-sign*shotDepth(latest,false)-1.8))<1e-8);
  }finally{m.dispose();}
 }
});
test('actual outgoing angles match either wing, high contacts, both views and every side',()=>{
 for(const seat of [0,1] as Seat[])for(const px of [-4,0,4])for(const ratio of [-.2,0,.2]){
  const targets:number[]=[];
  for(const distance of ['near','far'] as const)for(const offset of [-.4,.4])for(const height of [1.1,2.4]){
   const m=new Match(),sign=side(seat),camera=new PerspectiveCamera();
   try{
    m.state.phase='rally';m.state.rally=2;m.step(.08);
    const p=m.state.players[seat];Object.assign(p,{x:px*sign,z:12.4*sign,tx:px*sign,tz:12.4*sign});
    m.physics.place({x:p.x+offset*sign,y:height,z:12*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
    frameMatch(camera,390,844,seat,p.x,12.4,undefined,distance);
    const aimed=CourtView.prototype.aimShot.call({camera,seat,size:{w:390,h:844},aimCamera:new AimCameraLock()} as any,{type:'shot',aim:0,depth:.5,power:.8,lob:false},m.state,ratio*150,-150);
    // Controlled contact isolates aiming from which high ball is naturally reachable.
    (m as unknown as {hit:(s:Seat,shot:object)=>void}).hit(seat,aimed);
    targets.push(m.state.ball.targetX);
    assert.ok(Math.abs(projectedOutgoingAngle(camera,p.contact!,m.state.ball,390,844)-Math.atan(ratio))<.001);
    assert.ok(Math.abs(p.contact!.y-height)<1e-6);
    assert.equal(p.contact!.x,m.state.ball.x);assert.equal(p.contact!.z,m.state.ball.z);
   }finally{m.dispose();}
  }
  // Uniform near/far zoom preserves each physical target, but different
  // contact locations need different targets for the same visible angle.
  for(let i=0;i<4;i++)assert.ok(Math.abs(targets[i]-targets[i+4])<1e-8);
 }
});
