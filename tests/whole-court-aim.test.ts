import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {Controls} from '../src/input/controls.js';
import {interpretGesture} from '../src/input/gesture.js';
import {CourtView} from '../src/render/view.js';
import {AimCameraLock} from '../src/render/aim-camera.js';
import {frameMatch} from '../src/render/camera.js';
import {CHARACTERS} from '../src/simulation/characters.js';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {predictFlight} from '../src/simulation/trajectory.js';
import {side,type Seat} from '../src/simulation/types.js';
import {projectedOutgoingAngle,expectedControlledAngle} from './helpers/projected-shot.js';

before(initPhysics);
test('real outgoing motion follows gesture intent across the whole court and lands at its physical target',()=>{
 for(const distance of ['near','far'] as const)for(const c of CHARACTERS)for(const seat of [0,1] as Seat[])
 for(const [w,h] of [[390,844],[320,568],[844,390]])
 for(const depth of [2,6,10,12.4,16])for(const x of [-5,0,5])
 for(const ratio of [-.33,0,.33]){
  const m=new Match([c.id,c.id],()=>.5),sign=side(seat);
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   const p=m.state.players[seat];Object.assign(p,{x:x*sign,z:depth*sign,tx:x*sign,tz:depth*sign,vx:0,vz:0});
   m.physics.place({x:(x+.4)*sign,y:1.3,z:(depth-.4)*sign},{x:0,y:0,z:4*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   const camera=new PerspectiveCamera();frameMatch(camera,w,h,seat,p.x,depth,m.state.players[seat===0?1:0],distance);
   const dx=ratio*Math.min(w,h)*.45,dy=-Math.min(w,h)*.45;
   const shot=interpretGesture({dx,dy,duration:220,hold:0,width:w,height:h})!;
   const aimed=CourtView.prototype.aimShot.call({camera,seat,size:{w,h},aimCamera:new AimCameraLock()} as any,shot,m.state,dx,dy);
   m.input(seat,aimed);assert.equal(m.state.rally,3);
   const b=m.state.ball,contact=p.contact!,flight=predictFlight(b);
   assert.ok(Math.abs(flight.landing.x-b.targetX)<.02);
   const angle=projectedOutgoingAngle(camera,contact,b,w,h),error=angle-expectedControlledAngle(camera,contact,b,w,h,ratio,{shot,player:p});
   assert.ok(Math.abs(error)<.001,`${c.id}/${seat}/${w}x${h}/${x}/${depth}: ${error*180/Math.PI} degrees`);
   assert.equal(flight.hitNet,false);
  }finally{m.dispose();}
 }
});

test('pointer direction and aim lifecycle reach the view without viewport or DPR distortion',t=>{
 let now=1,raf=0;const calls:string[]=[],vectors:number[][]=[];
 class Element extends EventTarget {
  classList={add(){}};style={};clientWidth=390;clientHeight=844;
  width=1170;height=2532;setAttribute(){}removeAttribute(){}append(){}remove(){}setPointerCapture(){}
 }
 for(const key of ['document','requestAnimationFrame','cancelAnimationFrame']){
  const saved=Object.getOwnPropertyDescriptor(globalThis,key);
  Object.defineProperty(globalThis,key,{value:undefined,writable:true,configurable:true});
  t.after(()=>{if(saved)Object.defineProperty(globalThis,key,saved);else Reflect.deleteProperty(globalThis,key);});
 }
 t.mock.method(performance,'now',()=>now);
 t.mock.property(globalThis,'document',{createElementNS:()=>new Element(),body:new Element()} as any);
 t.mock.property(globalThis,'requestAnimationFrame',()=>++raf);t.mock.property(globalThis,'cancelAnimationFrame',()=>{});
 const canvas=new Element();
 const controls=new Controls(canvas as any,()=>null,()=>calls.push('send'),()=>{},()=>{},
  (s,dx,dy)=>{vectors.push([dx,dy]);return s;},()=>{},active=>calls.push(active?'begin':'end'));
 controls.enabled=true;
 const event=(type:string,x:number,y:number)=>{const e=new Event(type);Object.assign(e,{pointerId:1,clientX:x,clientY:y});canvas.dispatchEvent(e);};
 try{
  event('pointerdown',120,680);now=180;event('pointermove',180,500);now=221;event('pointerup',180,500);
  assert.deepEqual(vectors,[[60,-180]]);assert.deepEqual(calls,['begin','send','end']);
  calls.length=0;event('pointerdown',80,650);event('pointercancel',80,650);
  assert.deepEqual(calls,['begin','end']);
  calls.length=0;event('pointerdown',80,650);controls.enabled=false;
  assert.deepEqual(calls,['begin','end']);
 }finally{controls.dispose();}
});

test('pointer-to-match pipeline preserves the input camera and outgoing direction during a moving return',t=>{
 let now=1;const descriptors=new Map<string,PropertyDescriptor|undefined>();
 class Element extends EventTarget {
  classList={add(){}};style={};clientWidth=390;clientHeight=844;
  setAttribute(){}removeAttribute(){}append(){}remove(){}setPointerCapture(){}
 }
 for(const key of ['document','requestAnimationFrame','cancelAnimationFrame']){
  descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
  Object.defineProperty(globalThis,key,{value:undefined,writable:true,configurable:true});
 }
 t.after(()=>{for(const [key,saved] of descriptors){if(saved)Object.defineProperty(globalThis,key,saved);else Reflect.deleteProperty(globalThis,key);}});
 t.mock.method(performance,'now',()=>now);
 t.mock.property(globalThis,'document',{createElementNS:()=>new Element(),body:new Element()} as any);
 t.mock.property(globalThis,'requestAnimationFrame',()=>1);t.mock.property(globalThis,'cancelAnimationFrame',()=>{});
 for(const seat of [0,1] as Seat[])for(const depth of [3,10,16]){
  const m=new Match(['mei','wuming'],()=>.5),sign=side(seat),camera=new PerspectiveCamera(),canvas=new Element();
  m.state.phase='rally';m.state.rally=2;m.step(.08);
  const p=m.state.players[seat];Object.assign(p,{x:2*sign,z:depth*sign,tx:2*sign,tz:depth*sign,vx:0,vz:0});
  frameMatch(camera,390,844,seat,p.x,depth,m.state.players[seat===0?1:0]);
  const view=Object.assign(Object.create(CourtView.prototype),{camera,seat,mode:'match',size:{w:390,h:844},focus:{x:p.x,depth},aimCamera:new AimCameraLock()}) as any;
  const controls=new Controls(canvas as any,()=>null,i=>m.input(seat,i),()=>{},()=>{},
   (shot,dx,dy)=>view.aimShot(shot,m.state,dx,dy),()=>{},active=>view.setAiming(active));
  controls.enabled=true;
  const event=(type:string,x:number,y:number)=>{const e=new Event(type);Object.assign(e,{pointerId:1,clientX:x,clientY:y});canvas.dispatchEvent(e);};
  try{
   now=1;event('pointerdown',120,680);
   const inputMatrix=[...camera.matrixWorld.elements];
   p.x+=.5*sign;p.z-=.3*sign;view.updateCamera(m.state,.08);
   assert.deepEqual(camera.matrixWorld.elements,inputMatrix);
   m.physics.place({x:p.x+.4*sign,y:1.3,z:p.z-.4*sign},{x:0,y:0,z:4*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   now=101;event('pointermove',150,590);now=221;event('pointerup',180,500);
   assert.equal(m.state.rally,3);
   p.x+=.5*sign;view.updateCamera(m.state,.08);
   assert.deepEqual(camera.matrixWorld.elements,inputMatrix);
   const landing=predictFlight(m.state.ball).landing,c=p.contact!;
   assert.ok(Math.abs(landing.x-m.state.ball.targetX)<.02);
   const shot=interpretGesture({dx:60,dy:-180,duration:220,hold:100,width:390,height:844})!;
   assert.ok(Math.abs(projectedOutgoingAngle(camera,c,m.state.ball,390,844)-expectedControlledAngle(camera,c,m.state.ball,390,844,1/3,{shot,player:p}))<.001);
  }finally{controls.dispose();m.dispose();}
 }
});
