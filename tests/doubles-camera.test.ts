import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {frameMatch,frameDoublesMatch} from '../src/render/camera.js';
import {CourtView} from '../src/render/view.js';
import {AimCameraLock} from '../src/render/aim-camera.js';
import {App} from '../src/ui/app.js';
import {CameraChoice} from '../src/ui/camera-choice.js';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {side,teamOf,type Seat} from '../src/simulation/types.js';
import {swipeDirection} from '../src/input/aim.js';

before(initPhysics);
const stations=[{x:1.5,z:12.4},{x:-1.5,z:-10.3},{x:-2.5,z:3},{x:2.5,z:-6.4}];
test('portrait doubles close-up matches singles near scale instead of forcing far',()=>{
 for(const [w,h] of [[390,844],[430,932],[320,568]]){
  const far=new PerspectiveCamera(),near=new PerspectiveCamera(),doubles=new PerspectiveCamera();
  frameMatch(far,w,h,0,1.5,12.4,stations[1],'far');
  frameMatch(near,w,h,0,1.5,12.4,stations[1],'near');
  frameDoublesMatch(doubles,w,h,0,1.5,12.4,stations);
  const size=(camera:PerspectiveCamera)=>new Vector3(0,0,-11.885).project(camera).y-new Vector3(0,0,11.885).project(camera).y;
  assert.ok(size(doubles)/size(near)>.94,`${w}x${h}: nearly the same court size as singles near`);
  assert.ok(size(doubles)/size(far)>1.8,'not the old full-court thumbnail');
  assert.deepEqual(doubles.matrixWorld.elements,near.matrixWorld.elements,'same perspective, no enlarged athletes');
 }
});
test('all four players fit on portrait and landscape, including wide retreat and end changes',()=>{
 for(const [w,h] of [[390,844],[320,568],[844,390],[1440,900]])
 for(const seat of [0,1,2,3] as Seat[])for(const ends of [0,1] as const)
 for(const distance of ['near','far'] as const)for(const wide of [false,true]){
  const players=stations.map((p,i)=>({
   x:wide?(i%2?-8:8):p.x,z:(wide?Math.sign(p.z)*16.3:p.z)*(ends?-1:1),
  }));
  const p=players[seat],camera=new PerspectiveCamera();
  frameDoublesMatch(camera,w,h,(teamOf(seat)^ends) as Seat,p.x,p.z*side(seat,{ends}),players,distance);
  for(const player of players)for(const dx of [-.55,.55])for(const y of [0,2.6]){
   const q=new Vector3(player.x+dx,y,player.z).project(camera);
   assert.ok(Math.abs(q.x)<=.900001&&q.y>=-.760001&&q.y<=Math.min(.68,1-180/h)+1e-6,`${w}/${h}/${seat}/${ends}/${distance}/${wide}: ${q.toArray()}`);
  }
  for(const z of [-11.885,0,11.885]){
   assert.ok(Math.abs(new Vector3(-5.485,0,z).project(camera).y-new Vector3(5.485,0,z).project(camera).y)<1e-12,'level court lines');
   if(distance==='far')for(const x of [-5.485,5.485]){
    const q=new Vector3(x,0,z).project(camera);
    assert.ok(Math.abs(q.x)<=.900001&&q.y>=-.760001&&q.y<=.680001,'far still shows doubles alleys');
   }
  }
 }
});
test('doubles projection still maps taps and swipes onto court in the same direction',()=>{
 for(const seat of [0,1] as const)for(const distance of ['near','far'] as const){
  const camera=new PerspectiveCamera(),sign=side(seat),p=stations[seat];
  frameDoublesMatch(camera,390,844,seat,p.x,Math.abs(p.z),stations,distance);
  const dir=swipeDirection(camera,{x:p.x,y:0,z:p.z},20,-100,390,844,sign);
  const a=new Vector3(p.x,0,p.z).project(camera),b=new Vector3(p.x+dir*16*sign,0,p.z-16*sign).project(camera);
  assert.ok(Math.abs((b.x-a.x)*390/((b.y-a.y)*844)-.2)<1e-6);
 }
});
test('CourtView uses selected doubles distance, keeps the aiming lock, and refits after resize',()=>{
 const m=new Match(['lin','lin','lin','lin'],()=>1,{mode:'doubles'}),camera=new PerspectiveCamera();
 const view=Object.assign(Object.create(CourtView.prototype),{
  camera,seat:2,ends:0,doubles:true,mode:'match',size:{w:390,h:844},
  focus:{x:m.state.players[2].x,depth:m.state.players[2].z},cameraPlayers:m.state.players,
  aimCamera:new AimCameraLock(),cameraDistance:'near',appliedCameraDistance:'near',
  container:{clientWidth:844,clientHeight:390},renderer:{setSize(){}},
 }) as any;
 try{
  view.updateCamera(m.state,.016);assert.ok(camera.zoom>1.8);
  const before=[...camera.projectionMatrix.elements];
  view.setAiming(true);view.setCameraDistance('far');view.updateCamera(m.state,.016);
  assert.deepEqual(camera.projectionMatrix.elements,before);
  view.setAiming(false);view.updateCamera(m.state,.016);assert.equal(camera.zoom,1);
  view.setCameraDistance('near');view.resize(true);assert.ok(camera.zoom>1);
  const expected=new PerspectiveCamera();
  frameDoublesMatch(expected,844,390,0,view.focus.x,view.focus.depth,m.state.players,'near');
  assert.deepEqual(camera.projectionMatrix.elements,expected.projectionMatrix.elements);
 }finally{m.dispose();}
});
test('doubles HUD offers the same functional near/far picker and accurate help text',()=>{
 const app=Object.assign(Object.create(App.prototype),{
  remote:{mode:'doubles',surface:'hard'},audio:{muted:true},cameraChoice:new CameraChoice(),
 }) as any;
 assert.match(app.playing(),/data-action="camera-distance"/);
 assert.doesNotMatch(app.playing(),/双打全场/);
 assert.match(app.helpPanel(),/双打支持近 \/ 远视角切换/);
});
