import {before,test} from 'node:test';import assert from 'node:assert/strict';import {PerspectiveCamera,Vector3} from 'three';
import {interpretGesture} from '../src/input/gesture.js';import {Match} from '../src/simulation/match.js';import {initPhysics} from '../src/simulation/physics.js';import {predictFlight} from '../src/simulation/trajectory.js';import {shotTier} from '../src/simulation/shot-profile.js';import {strokePose} from '../src/render/strokes.js';import {Athlete} from '../src/render/player.js';import {side,type Seat} from '../src/simulation/types.js';
before(initPhysics);
const shot={type:'shot' as const,aim:0,depth:.55,power:.6,lob:false,slice:true};
export function sliceReturn(seat:Seat=0,backhand=false,random:()=>number=()=>.5){
 const m=new Match(['lin','lin'],random),sign=side(seat);m.state.phase='rally';m.state.rally=2;Object.assign(m.state.players[seat],{x:0,z:10*sign,tx:0,tz:10*sign});m.input(seat,{type:'move',x:0,z:10*sign});m.physics.place({x:(backhand?-.6:.6)*sign,y:1.3,z:9.5*sign},{x:0,y:0,z:4*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});m.input(seat,shot);for(let i=0;i<12&&m.state.rally===2;i++)m.step(1/60);return m;
}
test('a downward swipe produces slice in the opposite direction, independent of charging',()=>{
 const g={dx:65,dy:230,duration:1100,hold:900,width:390,height:844};const cut=interpretGesture(g)!,flat=interpretGesture({...g,dx:-65,dy:-230,hold:0,duration:200})!;
 assert.ok(cut);assert.equal(cut.slice,true);assert.equal(cut.aim,flat.aim);assert.equal(cut.depth,flat.depth);assert.equal(cut.topspin,0);assert.equal(cut.lob,false);assert.equal(cut.critical,false);assert.equal(shotTier(cut),'slice');
 assert.deepEqual(cut,interpretGesture({...g,dx:130,dy:460,width:780,height:1688}));assert.equal(interpretGesture({...g,dy:0}),null);
});
test('both seats choose distinct forehand/backhand single-hand slice and contact the real ball',()=>{
 for(const seat of [0,1] as Seat[])for(const backhand of [false,true]){
  const m=sliceReturn(seat,backhand),p=m.state.players[seat];assert.equal(m.state.rally,3);assert.equal(p.stroke,backhand?'slice-backhand':'slice-forehand');assert.equal(m.state.ball.slice,true);assert.equal(m.state.ball.tier,'slice');assert.equal(m.state.ball.topspin,0);assert.equal(predictFlight(m.state.ball).hitNet,false);
  const a=new Athlete(seat);a.update(p,m.state.time,1/60);a.root.updateMatrixWorld(true);const tip=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3()),contact=p.contact!;assert.ok(tip.distanceTo(new Vector3(contact.x,contact.y,contact.z))<.09);m.dispose();
 }
});
test('slice has visible high-to-low preparation and follow-through without a two-hand grip',()=>{
 for(const backhand of [false,true]){const contact=new Vector3(backhand?.6:-.6,1.1,.5),stroke=backhand?'slice-backhand':'slice-forehand';const p={x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:stroke as any,swing:0,shotQueued:true};
 const prep=strokePose({...p,preparation:{stroke:p.stroke,progress:.48,contact}},contact),follow=strokePose({...p,swing:.44*(1-.7)},contact);assert.equal(prep.twoHands,false);assert.equal(follow.twoHands,false);assert.ok(prep.tip.y>1.55);assert.ok(follow.tip.y<.9);
 }
});
test('server scatter changes first landing and the irregular bounce, with a bounded low skid',()=>{
 const samples=[];for(const random of [()=>0,()=>.5,()=>1]){const m=sliceReturn(0,false,random),expected=predictFlight(m.state.ball);assert.ok(Math.abs(expected.landing.x-m.state.ball.targetX)<.001);assert.ok(Math.abs(expected.landing.z-m.state.ball.targetZ)<.001);const before={...m.state.ball};
  for(let i=0;i<180&&m.state.ball.bounces===0;i++)m.step(1/60);const b=m.state.ball;assert.equal(m.state.phase,'rally');assert.equal(b.bounces,1);assert.ok(Math.hypot(b.x-expected.landing.x,b.z-expected.landing.z)<.5);assert.ok(Math.hypot(b.vx,b.vz)<Math.hypot(before.vx,before.vz)*.95);assert.ok(b.vy>0&&b.vy<6);samples.push({target:before.targetX,angle:Math.atan2(b.vx,-b.vz),up:b.vy});m.dispose();
 }assert.ok(samples[0].target<samples[1].target&&samples[1].target<samples[2].target);assert.ok(new Set(samples.map(s=>s.angle.toFixed(2))).size===3);assert.ok(samples[0].up<samples[2].up);
});
test('slice input rejects malformed flags and serving stays an overhead serve',()=>{
 for(const slice of ['yes',1,null]){const m=new Match();m.input(0,{...shot,slice} as any);m.step(.1);assert.equal(m.state.players[0].preparation,undefined);m.dispose();}
 const m=new Match();m.input(0,{...shot,topspin:1,critical:true,power:1});for(let i=0;i<60&&m.state.phase==='serve';i++)m.step(1/60);assert.equal(m.state.players[0].stroke,'serve');assert.equal(m.state.ball.slice,false);assert.equal(m.state.ball.topspin,0);assert.equal(m.state.ball.critical,false);m.dispose();
});
import {shotDirection,swipeDirection} from '../src/input/aim.js';import {frameMatch} from '../src/render/camera.js';
test('downward diagonals project opposite the finger through both player cameras and authority',()=>{
 for(const seat of [0,1] as Seat[])for(const dx of [-60,60]){
  const m=sliceReturn(seat),sign=side(seat),p=m.state.players[seat],c=new PerspectiveCamera();frameMatch(c,390,844,seat,p.x,10);const cut=interpretGesture({dx,dy:210,duration:300,hold:0,width:390,height:844})!;
  const directionX=shotDirection(c,m.state.ball,cut,dx,210,390,844,sign);assert.equal(directionX,swipeDirection(c,m.state.ball,-dx,-210,390,844,sign));assert.equal(Math.sign(directionX),-Math.sign(dx));
  // New legal incoming flight: the reverse heading reaches the actual authoritative target.
  m.state.rally=4;m.physics.place({x:.6*sign,y:1.3,z:9.5*sign},{x:0,y:0,z:4*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1,slice:false});m.input(seat,{...cut,directionX});for(let i=0;i<20&&m.state.rally===4;i++)m.step(1/60);
  assert.equal(m.state.rally,5);const start=p.contact!;assert.ok(Math.abs((m.state.ball.targetX-start.x)*sign/Math.abs(m.state.ball.targetZ-start.z)-directionX)<1e-6);m.dispose();
 }
});
