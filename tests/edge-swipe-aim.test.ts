import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {CourtView} from '../src/render/view.js';
import {AimCameraLock} from '../src/render/aim-camera.js';
import {frameMatch} from '../src/render/camera.js';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {predictFlight} from '../src/simulation/trajectory.js';
import {side,type Seat} from '../src/simulation/types.js';
import {validateSwipeAim,directionAtContact,directionToLanding} from '../src/simulation/shot-aim.js';
import {captureSwipeAim} from '../src/input/aim.js';
import {projectedOutgoingAngle,expectedControlledAngle} from './helpers/projected-shot.js';

before(initPhysics);
test('real edge returns follow the swipe in screen space at actual height, speed and camera perspective',()=>{
 for(const id of ['lin','wuming','noah','adrian'])
 for(const seat of [0,1] as Seat[])
 for(const [w,h] of [[390,844],[320,568],[844,390]])
 for(const x of [-5.8,0,5.8])
 for(const depth of [11.8,16])
 for(const height of [.6,1.8])
 for(const ratio of [-.4,0,.4]){
  const m=new Match([id,id],()=>.5),sign=side(seat);
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   const p=m.state.players[seat];
   Object.assign(p,{x:x*sign,z:depth*sign,tx:x*sign,tz:depth*sign,vx:0,vz:0});
   m.physics.place({x:(x+.4)*sign,y:height,z:(depth-.4)*sign},{x:0,y:0,z:4*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   const camera=new PerspectiveCamera();
   frameMatch(camera,w,h,seat,p.x,depth,m.state.players[seat===0?1:0]);
   const shot={type:'shot' as const,aim:0,depth:.6,power:.7,lob:false};
   const aimed=CourtView.prototype.aimShot.call({camera,seat,size:{w,h},aimCamera:new AimCameraLock()} as any,shot,m.state,ratio*150,-150);
   m.input(seat,aimed);
   assert.equal(m.state.rally,3,`${id}/${seat}/${x}/${depth}/${height} legal contact`);
   const b=m.state.ball,c=p.contact!;
   const angle=projectedOutgoingAngle(camera,c,b,w,h),wanted=expectedControlledAngle(camera,c,b,w,h,ratio,{shot,player:p});
   assert.ok(Math.abs(angle-wanted)<.01,`${id}/${seat}/${w}x${h}/${x}/${depth}/${height}/${ratio}: angle error ${(angle-wanted)*180/Math.PI} degrees`);
   const flight=predictFlight(b);assert.equal(flight.hitNet,false);
   assert.ok(Math.abs(flight.landing.x-b.targetX)<.02&&Math.abs(flight.landing.z-b.targetZ)<.02);
  }finally{m.dispose();}
 }
});
test('edge aim includes high-contact smashes, slice slowdown, topspin, lobs and critical speed',()=>{
 for(const seat of [0,1] as Seat[])for(const id of ['lin','wuming'])
 for(const skill of ['smash','slice','topspin','lob','critical','volley'])
 for(const ratio of [-.3,0,.3]){
  const m=new Match([id,id],()=>.5),sign=side(seat),w=390,h=844;
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   const p=m.state.players[seat],x=5.6*sign;
   Object.assign(p,{x,z:16*sign,tx:x,tz:16*sign,vx:0,vz:0,stamina:.6});
   const height=skill==='smash'?2.4:1.3;
   m.physics.place({x:x+.25*sign,y:height,z:15.75*sign},{x:0,y:-.5,z:4*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:skill==='volley'||skill==='smash'?0:1});
   const camera=new PerspectiveCamera();frameMatch(camera,w,h,seat,x,16,m.state.players[seat===0?1:0]);
   const shot={type:'shot' as const,aim:0,depth:.6,power:skill==='critical'?1:.6,lob:skill==='lob',slice:skill==='slice',critical:skill==='critical',topspin:skill==='topspin'?1:0};
   const reverse=shot.slice?-1:1;
   const aimed=CourtView.prototype.aimShot.call({camera,seat,size:{w,h},aimCamera:new AimCameraLock()} as any,shot,m.state,ratio*150*reverse,-150*reverse);
   m.input(seat,aimed);assert.equal(m.state.rally,3,skill);
   assert.ok(Math.abs(projectedOutgoingAngle(camera,p.contact!,m.state.ball,w,h)-expectedControlledAngle(camera,p.contact!,m.state.ball,w,h,ratio,{shot,player:p}))<.01,`${id}/${seat}/${skill}/${ratio}`);
   assert.equal(predictFlight(m.state.ball).hitNet,false);
  }finally{m.dispose();}
 }
});
test('new elevation data is validated and legacy ground-only clients keep their direction',()=>{
 const camera=new PerspectiveCamera();frameMatch(camera,390,844,0,5,16);
 const shot={type:'shot' as const,aim:0,depth:.6,power:.7,lob:false};
 const aim=captureSwipeAim(camera,shot,30,-150,390,844);
 for(const elevation of [null,[],[1,2],[NaN,0,0],[Infinity,0,0],[1e8,0,0],['1',0,0]]){
  assert.equal(validateSwipeAim({...aim,elevation}),undefined);
 }
 const legacy={projection:aim.projection,dx:aim.dx,dy:aim.dy},start={x:5.4,y:1.8,z:15.6};
 assert.ok(validateSwipeAim(legacy));
 assert.equal(directionToLanding(legacy,start,-8,0,1),directionAtContact(legacy,start,0,1));
});
test('the reported wide baseline high contact no longer magnifies the angle into an out ball',()=>{
 for(const seat of [0,1] as Seat[]){
  const targets:number[]=[];
  for(const legacy of [true,false]){
   const m=new Match(['wuming','wuming'],()=>.5),sign=side(seat),camera=new PerspectiveCamera();
   try{
    m.state.phase='rally';m.state.rally=2;m.step(.08);
    const p=m.state.players[seat];Object.assign(p,{x:5.8*sign,z:12.4*sign,tx:5.8*sign,tz:12.4*sign,vx:0,vz:0});
    m.physics.place({x:6.2*sign,y:2.4,z:12*sign},{x:0,y:0,z:4*sign});
    Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
    // Preserve the original low-camera reproduction independently of the new
    // broadcast framing; fixed swipe pixels mean a different target in a new view.
    camera.aspect=390/844;camera.fov=30;
    camera.position.set(p.x*(1+14.6/(12.4+11)),6.5,27*sign);
    camera.lookAt(p.x*(3+11)/(12.4+11),1,3*sign);
    camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const aimed=CourtView.prototype.aimShot.call({camera,seat,size:{w:390,h:844},aimCamera:new AimCameraLock()} as any,{type:'shot',aim:0,depth:.6,power:1,lob:false},m.state,90,-150);
    if(legacy)delete aimed.swipeAim!.elevation;
    m.input(seat,aimed);assert.equal(m.state.rally,3);
    targets.push(Math.abs(m.state.ball.targetX));
    if(!legacy)assert.ok(Math.abs(projectedOutgoingAngle(camera,p.contact!,m.state.ball,390,844)-expectedControlledAngle(camera,p.contact!,m.state.ball,390,844,.6,{shot:aimed,player:p}))<.01);
   }finally{m.dispose();}
  }
  assert.ok(targets.every(Number.isFinite),JSON.stringify(targets));
 }
});
test('direction correction does not clamp deliberate wide or deep shots back into court',()=>{
 for(const [ratio,depth] of [[2,.6],[0,1]]){
  const m=new Match(['wuming','wuming']),camera=new PerspectiveCamera();
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   const p=m.state.players[0];Object.assign(p,{x:0,z:16,tx:0,tz:16,vx:0,vz:0});
   m.physics.place({x:.4,y:1.8,z:15.6},{x:0,y:0,z:4});Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:1});
   frameMatch(camera,390,844,0,0,16);
   const shot={type:'shot' as const,aim:0,depth,power:1,lob:false,critical:true};
   m.input(0,CourtView.prototype.aimShot.call({camera,seat:0,size:{w:390,h:844},aimCamera:new AimCameraLock()} as any,shot,m.state,ratio*150,-150));
   assert.equal(m.state.rally,3);
   if(ratio)assert.ok(Math.abs(m.state.ball.targetX)>4.145);
   else assert.ok(Math.abs(m.state.ball.targetZ)>11.915);
  }finally{m.dispose();}
 }
});
