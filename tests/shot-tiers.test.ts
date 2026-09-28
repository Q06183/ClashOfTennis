import {test,before} from 'node:test';import assert from 'node:assert/strict';import {PerspectiveCamera,Vector3,Line,LineDashedMaterial,Mesh,MeshBasicMaterial} from 'three';
import {shotDepth,shotTier,SHOT_PROFILES} from '../src/simulation/shot-profile.js';import {Match} from '../src/simulation/match.js';import {initPhysics} from '../src/simulation/physics.js';
import {frameMatch} from '../src/render/camera.js';import {swipeDirection} from '../src/input/aim.js';import {predictFlight} from '../src/simulation/trajectory.js';import {FlightGuide} from '../src/render/trajectory.js';import {isInCourt,isInServiceBox} from '../src/simulation/rules.js';import type {Shot} from '../src/simulation/types.js';
before(initPhysics);
const shots:Shot[]=[.2,.5,.85,1].map((power,i)=>({type:'shot',aim:0,depth:.8,power,lob:false,critical:i===3}));
test('same swipe depth produces successively deeper tiers and only the critical shot crosses the baseline',()=>{
 const depths=shots.map(s=>shotDepth(s,false));for(let i=1;i<4;i++)assert.ok(depths[i]>depths[i-1]);
 assert.equal(isInCourt(0,-depths[2],1),true);assert.equal(isInCourt(0,-depths[3],1),false);
 assert.equal(isInServiceBox(-1,-shotDepth(shots[2],true),0,0),true);assert.equal(isInServiceBox(-1,-shotDepth(shots[3],true),0,0),false);
});
test('overhead swipe mapping survives authoritative serve launch for every tier, seat and service side',()=>{
 for(const total of [0,1,2,3])for(const source of shots)for(const ratio of [-.3,0,.3]){
  const m=new Match();m.state.score=[total,0];m.state.phase='point';m.state.pointTimer=0;m.step(1/60);
  const seat=m.state.server,sign=seat===0?1:-1,p=m.state.players[seat],contact={...m.state.ball,y:2.65},camera=new PerspectiveCamera();frameMatch(camera,390,844,seat,p.x,12.4);
  const directionX=swipeDirection(camera,contact,ratio*100,-100,390,844,sign,-sign*shotDepth(source,true));
  m.input(seat,{...source,directionX});for(let i=0;i<90&&m.state.rally===0;i++)m.step(1/60);
  const flight=predictFlight(m.state.ball),from=new Vector3(contact.x,contact.y,contact.z).project(camera),to=new Vector3(flight.landing.x,.12,flight.landing.z).project(camera);
  assert.equal(flight.hitNet,false);assert.ok(Math.abs((to.x-from.x)*390/((to.y-from.y)*844)-ratio)<.00001);
  assert.equal(m.state.ball.tier,shotTier(source));m.dispose();
 }
});
test('flight path always uses the authoritative tier colour while an invalid serve landing is marked separately',()=>{
 const guide=new FlightGuide(),m=new Match();
 assert.equal(new Set(Object.values(SHOT_PROFILES).map(p=>p.color)).size,Object.keys(SHOT_PROFILES).length);
 for(const shot of shots){m.state.phase='serve';m.input(0,shot);for(let i=0;i<90&&m.state.rally===0;i++)m.step(1/60);
  for(const seat of [0,1] as const){guide.update(m.state,seat,true);assert.ok(guide.root.visible);const line=guide.root.children[0] as Line;assert.equal((line.material as LineDashedMaterial).color.getHex(),SHOT_PROFILES[shotTier(shot)].color);}
  if(shot.critical)assert.equal(((guide.root.children[1] as Mesh).material as MeshBasicMaterial).color.getHex(),0xff453a);
  m.state.phase='point';m.state.pointTimer=0;m.step(1/60);
 }m.dispose();
});
test('the real swipe pipeline still has an in-bounds critical serve window on both service sides',async()=>{
 const {interpretGesture}=await import('../src/input/gesture.js');
 for(const total of [0,1,2,3])for(const [w,h] of [[390,844],[320,568],[844,390]]){
  const m=new Match();m.state.score=[total,0];m.state.phase='point';m.state.pointTimer=0;m.step(1/60);
  const seat=m.state.server,sign=seat===0?1:-1,unit=Math.min(w,h);
  let dy=-240*unit/390;
  const p=m.state.players[seat],c=new PerspectiveCamera();frameMatch(c,w,h,seat,p.x,12.4);
  // Aim at a legal service-box point using the current view. Fixed pixel
  // directions from the old close-up are not the same target in a new camera.
  let dx=0,shot=interpretGesture({dx,dy,duration:100,hold:0,width:w,height:h})!;
  for(const length of [240,210,180,150]){
   dy=-length*unit/390;
   for(let i=0;i<8;i++){
    const from=new Vector3(m.state.ball.x,2.65,m.state.ball.z).project(c);
    const to=new Vector3(-(total%2===0?1:-1)*.2*sign,.12,-sign*shotDepth(shot,true)).project(c);
    dx=-dy*(to.x-from.x)*w/((to.y-from.y)*h);
    shot=interpretGesture({dx,dy,duration:100,hold:0,width:w,height:h})!;
   }
   if(Math.abs(dx)<w-20&&shot.critical)break;
  }
  assert.ok(Math.abs(dx)<w-20,'legal serve can be swiped within the screen');
  assert.equal(shot.critical,true);
  const directionX=swipeDirection(c,{...m.state.ball,y:2.65},dx,dy,w,h,sign,-sign*shotDepth(shot,true));m.input(seat,{...shot,directionX});
  for(let i=0;i<90&&m.state.rally===0;i++)m.step(1/60);
  const landing=predictFlight(m.state.ball).landing;assert.equal(isInServiceBox(landing.x,landing.z,seat,total),true,`${w}x${h} ${total}: ${JSON.stringify(landing)}`);m.dispose();
 }
});

test('downward serve swipes reverse heading while using the actual overhead-serve depth at every pace',async()=>{
 const {shotDirection}=await import('../src/input/aim.js');
 for(const total of [0,1,2,3])for(const source of shots)for(const ratio of [-.3,.3]){
  const m=new Match();m.state.score=[total,0];m.state.phase='point';m.state.pointTimer=0;m.step(1/60);const seat=m.state.server,sign=seat===0?1:-1,p=m.state.players[seat],contact={...m.state.ball,y:2.65},camera=new PerspectiveCamera();frameMatch(camera,390,844,seat,p.x,12.4);
  const shot={...source,slice:true,critical:false};const directionX=shotDirection(camera,contact,shot,-ratio*100,100,390,844,sign,-sign*shotDepth(shot,true));m.input(seat,{...shot,directionX});for(let i=0;i<90&&m.state.rally===0;i++)m.step(1/60);
  const to=predictFlight(m.state.ball).landing,fromScreen=new Vector3(contact.x,contact.y,contact.z).project(camera),toScreen=new Vector3(to.x,to.y,to.z).project(camera);assert.ok(Math.abs((toScreen.x-fromScreen.x)*390/((toScreen.y-fromScreen.y)*844)-ratio)<.00001);assert.equal(m.state.ball.slice,false);m.dispose();
 }
});
