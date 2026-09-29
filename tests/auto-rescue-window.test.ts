import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,PerspectiveCamera,Object3D} from 'three';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {Athlete} from '../src/render/player.js';
import {disposeTree} from '../src/render/dispose.js';
import {side,type Seat} from '../src/simulation/types.js';
import {SnapshotPlayback} from '../src/network/playback.js';
import {CourtView} from '../src/render/view.js';
import {frameMatch} from '../src/render/camera.js';
import {rescueHint} from '../src/ui/rescue-hint.js';
before(initPhysics);
const shot={type:'shot' as const,aim:.2,depth:.55,power:.5,lob:false};
export function approaching(seat:Seat=0,random=()=>0){
 const m=new Match(['lin','lin'],random),p=m.state.players[seat],sign=side(seat);
 m.state.phase='rally';m.state.rally=2;m.step(.08);
 Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,stamina:.08,totalStamina:1,vx:0,vz:0});
 m.physics.place({x:3.4*sign,y:1.8,z:6*sign},{x:0,y:1.5,z:8*sign});
 Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
 return m;
}
function waitContact(m:Match){for(let i=0;i<150&&!m.state.rescueWindow&&m.state.phase==='rally';i++)m.step(1/120);assert.ok(m.state.rescueWindow,'automatic physical contact window');}
test('without any swipe the player dives early at bounded speed and freezes at real racket contact',()=>{
 for(const seat of [0,1] as const){
  let draws=0;const m=approaching(seat,()=>{draws++;return 0;}),p=m.state.players[seat],a=new Athlete(seat);
  try{
   m.step(1/120);assert.ok(p.rescue,'no swipe needed');
   assert.ok(p.rescue.travel!>=.35,'travel allows a natural side dive, not 200ms across court');
   let old=p.x;
   for(let i=0;i<150&&!m.state.rescueWindow;i++){
    m.step(1/120);a.update(p,m.state.time,1/120);
    assert.ok(Math.abs(p.x-old)*120<10.1);old=p.x;
   }
   assert.ok(m.state.rescueWindow);assert.equal(draws,1);
   const ball=m.state.ball,tip=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
   assert.ok(tip.distanceTo(new Vector3(ball.x,ball.y,ball.z))<.1,'not just a visual freeze at an unreachable ball');
   const saved=structuredClone(m.state),physical=m.physics.read();
   m.input(seat,{type:'move',x:5,z:14});m.input(seat===0?1:0,{type:'move',x:4,z:-4});
   m.step(.49);
   assert.equal(m.state.time,saved.time);assert.deepEqual(m.state.players,saved.players);
   assert.deepEqual(m.state.ball,saved.ball);assert.deepEqual(m.physics.read(),physical);
   assert.ok(Math.abs(m.state.rescueWindow!.remaining-.01)<1e-8);
   m.input(seat,{...shot,power:NaN});assert.ok(m.state.rescueWindow,'invalid input does not release');
   m.input(seat,shot);
   assert.equal(m.state.rescueWindow,undefined);assert.equal(m.state.rally,3);assert.equal(m.state.ball.hitter,seat);
   assert.deepEqual(p.contact,{x:physical.x,y:physical.y,z:physical.z});
  }finally{m.dispose();disposeTree(a.root);}
 }
});
test('timeout restores original ball motion without rewind/hit and cannot be farmed by late swipes',()=>{
 let draws=0;const m=approaching(0,()=>{draws++;return 0;});
 try{
  waitContact(m);const saved={...m.state.ball},time=m.state.time;
  m.step(.5);assert.equal(m.state.rescueWindow,undefined);assert.equal(m.state.rally,2);
  assert.equal(m.state.time,time);assert.deepEqual(m.state.ball,saved);
  m.input(0,shot);assert.equal(m.state.rally,2,'expired pose cannot hit');
  m.step(1/60);
  assert.ok(m.state.ball.z>saved.z);assert.equal(m.state.ball.hitter,1);
  assert.equal(draws,1);assert.equal(m.state.rescueWindow,undefined);
 }finally{m.dispose();}
});
test('queued swipe skips the hold and preserves the most recent shot',()=>{
 const m=approaching();
 try{
  m.input(0,{...shot,power:.3});m.input(0,{...shot,topspin:.6});
  for(let i=0;i<150&&m.state.rally===2;i++){m.step(1/120);assert.equal(m.state.rescueWindow,undefined);}
  assert.equal(m.state.rally,3);assert.equal(m.state.ball.rescue,true);assert.equal(m.state.ball.topspin,.6);
 }finally{m.dispose();}
});
test('frozen snapshots do not extrapolate either player or ball and release without a stale window',()=>{
 const m=approaching(),playback=new SnapshotPlayback();
 try{
  waitContact(m);const s=structuredClone(m.state);
  playback.push(s,1000);
  const out=playback.sample(1300)!;
  assert.equal(out.time,s.time);assert.deepEqual(out.ball,s.ball);assert.deepEqual(JSON.parse(JSON.stringify(out.players)),JSON.parse(JSON.stringify(s.players)));
  m.input(0,shot);playback.push(JSON.parse(JSON.stringify(m.state)),1400);
  const released=playback.sample(1400)!;
  assert.equal(released.rescueWindow,undefined);assert.equal(released.rally,3);
  m.finish(0,'done');assert.equal(m.state.rescueWindow,undefined);
 }finally{m.dispose();}
});
test('ordinary reachable balls do not trigger without input and failed lotteries do not retry',()=>{
 const normal=approaching(0,()=>{throw Error('ordinary catch must not roll');});
 try{
  normal.physics.place({x:.6,y:1.4,z:8},{x:0,y:0,z:6});Object.assign(normal.state.ball,normal.physics.read());
  for(let i=0;i<20;i++){normal.step(1/120);assert.equal(normal.state.players[0].rescue,undefined);assert.equal(normal.state.rescueWindow,undefined);}
 }finally{normal.dispose();}
 let draws=0;const missed=approaching(0,()=>{draws++;return .999;});
 try{
  for(let i=0;i<180&&missed.state.phase==='rally';i++)missed.step(1/120);
  assert.equal(draws,1);assert.equal(missed.state.rescueWindow,undefined);assert.equal(missed.state.ball.hitter,1);
 }finally{missed.dispose();}
});
test('frozen view keeps both rigs, camera, and ball rotation fixed and labels the receiver clearly',()=>{
 const m=approaching();
 try{
  waitContact(m);const state=structuredClone(m.state),updates=[0,0],camera=new PerspectiveCamera();
  frameMatch(camera,390,844,0,0,10,undefined,'near');
  const projection=[...camera.projectionMatrix.elements],viewMatrix=[...camera.matrixWorld.elements];
  const view=Object.assign(Object.create(CourtView.prototype),{
   mode:'match',seat:0,size:{w:390,h:844},camera,scene:{},setCharacter(){},quality:{level:'balanced'},
   athletes:[0,1].map(i=>({root:new Object3D(),update(){updates[i]++;}})),
   contactShadows:[new Object3D(),new Object3D()],ball:new Object3D(),shadow:new Object3D(),target:new Object3D(),marker:new Object3D(),
   trail:[Object.assign(new Object3D(),{material:{color:{setHex(){}}}})],flight:{update(){}},renderer:{render(){}},
  }) as any;
  for(let i=0;i<30;i++)view.render(state,1/60,state);
  assert.deepEqual(updates,[1,1]);assert.equal(view.ball.rotation.z,0);
  assert.deepEqual(camera.projectionMatrix.elements,projection);assert.deepEqual(camera.matrixWorld.elements,viewMatrix);
  assert.match(rescueHint(state,0)!,/滑动回击/);assert.match(rescueHint(state,1)!,/对手/);
  assert.deepEqual(m.state,state,'presentation must not mutate authority');
 }finally{m.dispose();}
});
