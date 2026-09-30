import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Box3,SkinnedMesh} from 'three';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {RESCUE,moveRescue,rescuePose,rescueTarget} from '../src/simulation/rescue.js';
import {movePlayer} from '../src/simulation/movement.js';
import {CHARACTERS,handedness} from '../src/simulation/characters.js';
import {side,other,type PlayerState,type Seat,type RescueStroke} from '../src/simulation/types.js';
import {Athlete} from '../src/render/player.js';
import {disposeTree} from '../src/render/dispose.js';
import {rescueIncoming} from './helpers/rescue-incoming.js';
import {model} from './helpers/athlete-model.js';
import {SnapshotPlayback} from '../src/network/playback.js';

before(initPhysics);
const shot={type:'shot' as const,aim:0,depth:.5,power:.5,lob:false};
function incoming(seat:Seat,id:string,short:boolean){
 const m=new Match([id,id],()=>0),p=m.state.players[seat],sign=side(seat),hand=handedness(id);
 m.state.phase='rally';m.state.rally=2;m.step(.08);
 Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,vx:0,vz:0,stamina:.08,totalStamina:1,preparation:undefined,backhand:false});
 if(short){
  Object.assign(p,{tx:1.15*sign*hand,vx:-3*sign*hand,stamina:.15,totalStamina:.15});
  m.physics.place({x:1.15*sign*hand,y:1.7,z:5.95*sign},{x:0,y:1,z:9*sign});
  Object.assign(m.state.ball,m.physics.read(),{hitter:other(seat),bounces:1});
 }else rescueIncoming(m,seat);
 m.input(seat,shot);
 for(let i=0;i<90&&!p.rescue;i++)m.step(1/120);
 assert.ok(p.rescue,`${id}/${seat}/${short}: real incoming ball must launch a rescue ${JSON.stringify(m.rescueDiagnostics)}`);
 assert.equal(p.rescue.short,short);
 return m;
}
const fixture=(short:boolean,stroke:RescueStroke='forehand',travel=.4):PlayerState=>({
 x:0,z:10,tx:short?.8:2.5,tz:10,stamina:1,moving:false,swing:0,stroke,
 rescue:{startedAt:0,fromX:0,fromZ:10,toX:short?.8:2.5,toZ:10,
  contact:{x:short?1.4:3.1,y:stroke==='smash'?2.6:1.2,z:9.7},hit:true,
  travel,natural:true,short,stroke,recovery:short?'step-out':'supported-fall'},
});

test('real rescues replace stale targets and remain at the landing site after unlocking',()=>{
 for(const seat of [0,1] as const)for(const id of ['lin','noah'])for(const short of [true,false]){
  const m=incoming(seat,id,short),p=m.state.players[seat],r={...p.rescue!};
  try{
   assert.equal(p.tx,r.toX,'launch must discard the pre-dive target');
   assert.equal(p.tz,r.toZ);
   for(let i=0;i<240&&p.rescue;i++)m.step(1/120);
   assert.equal(p.rescue,undefined);assert.equal(m.state.ball.rescue,true);
   assert.equal(p.x,r.toX);assert.equal(p.z,r.toZ);
   for(let i=0;i<60;i++)m.step(1/120);
   assert.equal(m.state.phase,'rally','check before a point reset can hide the return');
   assert.equal(p.x,r.toX,'must not run back to launch after landing');
   assert.equal(p.z,r.toZ);
  }finally{m.dispose();}
 }
});

test('a fresh movement command during a real rescue survives and starts from its landing',()=>{
 for(const seat of [0,1] as const)for(const short of [true,false]){
  const m=incoming(seat,'lin',short),p=m.state.players[seat],r={...p.rescue!};
  try{
   const target=r.toX+side(seat)*1.5;
   m.input(seat,{type:'move',x:target,z:p.z});
   for(let i=0;i<240&&p.rescue;i++)m.step(1/120);
   assert.equal(p.x,r.toX);assert.equal(p.tx,target);
   m.step(1/120);
   assert.ok((p.x-r.toX)*side(seat)>0,'first free tick follows the new target');
   assert.ok(Math.abs(p.x-r.toX)<.01,'no teleport at release');
  }finally{m.dispose();}
 }
});

test('short jumps unlock on the exact landing boundary at every travel time, not after a recovery penalty',()=>{
 for(const stroke of ['forehand','backhand','volley','smash'] as const)for(const travel of [.16,.2,.4,.9]){
  const p=fixture(true,stroke,travel),r={...p.rescue!},land=travel+RESCUE.landAt-RESCUE.travel;
  moveRescue(p,land-1e-5,1/120);assert.ok(p.rescue,'airborne movement stays locked');
  moveRescue(p,land,1/120);
  assert.equal(p.rescue,undefined,`${stroke}/${travel}: landing is immediately free`);
  assert.equal(p.x,r.toX);assert.equal(p.z,r.toZ);
  p.tx=p.x+1;movePlayer(p,0,1/120);assert.ok(p.x>r.toX);
 }
});

test('long jumps stay prone and retain the full half-second get-up at the displaced position',()=>{
 for(const travel of [.2,.52,.9]){
  const p=fixture(false,'forehand',travel),r={...p.rescue!};
  const rise=travel+RESCUE.riseAt-RESCUE.travel,end=travel+RESCUE.duration-RESCUE.travel;
  assert.ok(Math.abs(end-rise-.5)<1e-9);
  const low=rescuePose(p,rise),half=rescuePose(p,rise+.25);
  assert.ok(low.pitch>1.5&&low.hipHeight<.3);
  assert.ok(half.pitch<low.pitch&&half.pitch>0);
  p.tx=-3;
  for(const time of [rise,rise+.25,end-1e-5]){
   moveRescue(p,time,1/120);assert.ok(p.rescue);assert.equal(p.x,r.toX);assert.equal(p.z,r.toZ);
  }
  moveRescue(p,end,1/120);assert.equal(p.rescue,undefined);assert.equal(p.tx,-3);
 }
});

test('short landing is upright and completes its pose before movement unlocks',()=>{
 const p=fixture(true),land=.4+RESCUE.landAt-RESCUE.travel;
 for(let age=0;age<land;age+=.005){
  const pose=rescuePose(p,age);
  assert.ok(pose.pitch<.3,'never prone');assert.ok(pose.hipHeight>.6);
 }
 const pose=rescuePose(p,land);
 assert.ok(Math.abs(pose.lift)<1e-8);assert.ok(Math.abs(pose.pitch)<1e-8);
 assert.ok(pose.recovery>1-1e-8,'no remaining get-up animation');
 assert.ok(pose.hipHeight>.8);
});

test('near overhead rescue is classified by distance rather than forcing a big fall',()=>{
 for(const seat of [0,1] as const){
  const sign=side(seat),p=fixture(true,'smash');p.z=p.tz=10*sign;p.vx=2*sign;p.rescue=undefined;
  const b={x:1.1*sign,y:2.6,z:9.65*sign,vx:0,vy:1,vz:1.8*sign,bounces:1,hitter:other(seat),targetX:0,targetZ:0};
  const target=rescueTarget(b,p,seat);
  assert.ok(target);assert.equal(target.stroke,'smash');assert.ok(Math.abs(target.x-p.x)<=1.2);
  assert.equal(target.short,true,'short lateral overhead lands on feet too');
 }
});

test('real launches use the 1.2m split even for a high contact previously allowed to step out',()=>{
 for(const seat of [0,1] as const)for(const gap of [1.8,1.81,1.95]){
  const m=new Match(['lin','lin'],()=>0),p=m.state.players[seat],sign=side(seat);
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:0,z:10*sign,tx:gap*sign,tz:10*sign,vx:-3*sign,vz:0,stamina:.15,totalStamina:.15,preparation:undefined,backhand:false});
   m.physics.place({x:gap*sign,y:1.7,z:5.95*sign},{x:0,y:1,z:9*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:other(seat),bounces:1});
   m.input(seat,shot);
   assert.ok(p.rescue);assert.ok(p.rescue.contact.y>.85);
   assert.equal(p.rescue.short,gap===1.8);
   assert.equal(p.rescue.recovery,gap===1.8?'step-out':'supported-fall');
  }finally{m.dispose();}
 }
});

test('landing releases the next shot for small jumps but not for big jumps still getting up',()=>{
 for(const short of [true,false]){
  const m=new Match(),p=m.state.players[0];
  try{
   m.state.phase='rally';m.state.rally=4;m.step(.08);
   Object.assign(p,fixture(short));p.rescue!.startedAt=m.state.time;
   const landing=m.state.time+.4+RESCUE.landAt-RESCUE.travel;
   m.state.time=landing;moveRescue(p,landing,1/120);
   m.physics.place({x:p.x+.4,y:1.2,z:p.z-.3},{x:0,y:0,z:4});
   Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:1});
   m.input(0,shot);
   assert.equal(m.state.rally,short?5:4);
   assert.equal(!!p.rescue,!short);
  }finally{m.dispose();}
 }
});

test('short-jump renderer stays anchored and does not pop hands, racket or feet at release',()=>{
 for(const seat of [0,1] as const)for(const id of ['lin','noah'])for(const stroke of ['forehand','backhand','volley','smash'] as const){
  const a=new Athlete(seat),p=fixture(true,stroke),sign=side(seat),hand=handedness(id);
  p.characterId=id;p.z=p.tz=p.rescue!.fromZ=p.rescue!.toZ=10*sign;
  p.tx=p.rescue!.toX*=sign*hand;p.rescue!.contact.x*=sign*hand;p.rescue!.contact.z*=sign;
  const names=['foot-0','foot-1','racket-sweet-spot','racket-grip','left-hand-grip'];
  let previous:Vector3[]|undefined;
  try{
   for(let i=0;i<=90;i++){
    const t=i/120;moveRescue(p,t,1/120);a.update(p,t,1/120);
    const hip=a.root.localToWorld(new Vector3(0,.85,0));
    assert.ok(Math.abs(hip.x-p.x)<1e-8&&Math.abs(hip.z-p.z)<1e-8,'root remains on authoritative position');
    const points=names.map(n=>a.root.getObjectByName(n)!.getWorldPosition(new Vector3()));
    if(previous&&t>.6)for(let j=0;j<points.length;j++)
     assert.ok(points[j].distanceTo(previous[j])<.085,`${id}/${seat}/${stroke}/${t}/${names[j]}: pose discontinuity`);
    previous=points;
   }
   assert.equal(p.rescue,undefined);
  }finally{disposeTree(a.root);}
 }
});

test('all released skins land short jumps without ground penetration or a release pop at 20/30/60fps',async()=>{
 for(const c of CHARACTERS)for(const fps of [20,30,60]){
  const a=new Athlete(0),p=fixture(true),r=p.rescue!,hand=handedness(c.id);
  p.characterId=c.id;p.tx=r.toX*=hand;r.contact.x*=hand;
  a.attachModel((await model(c.model.replace('/models/','').replace('.glb',''))).scene);
  try{
   let previous:Vector3[]|undefined;
   for(let frame=0;frame<=fps;frame++){
    const t=frame/fps;moveRescue(p,t,1/fps);a.update(p,t,1/fps);
    const box=new Box3();
    a.root.traverse(o=>{
     if(o instanceof SkinnedMesh){
      o.skeleton.update();
      for(let i=0;i<o.geometry.attributes.position.count;i++)box.expandByPoint(o.localToWorld(o.getVertexPosition(i,new Vector3())));
     }
    });
    const size=box.getSize(new Vector3());
    assert.ok(size.toArray().every(Number.isFinite)&&Math.max(size.x,size.y,size.z)<3.5);
    assert.ok(box.min.y>-.12,`${c.id}/${fps}/${t}: skin penetrates ground ${box.min.y}`);
    const joints=['foot-0','foot-1','racket-grip','left-hand-grip','racket-sweet-spot'].map(n=>a.root.getObjectByName(n)!.getWorldPosition(new Vector3()));
    if(previous&&t>.6)for(let i=0;i<joints.length;i++)
     assert.ok(joints[i].distanceTo(previous[i])<7/fps,`${c.id}/${fps}/${t}: release pop`);
    previous=joints;
   }
   assert.equal(p.rescue,undefined);assert.equal(p.x,r.toX);assert.equal(p.z,r.toZ);
  }finally{disposeTree(a.root);}
 }
});

test('20Hz snapshot playback preserves landing position through both animation release boundaries',()=>{
 for(const short of [true,false]){
  const m=incoming(0,'lin',short),p=m.state.players[0],r={...p.rescue!},playback=new SnapshotPlayback(),a=new Athlete(0);
  let free=false;
  try{
   for(let frame=0;frame<270;frame++){
    m.step(1/120);
    if(frame%6===0)playback.push(structuredClone(m.state),m.state.time*1000);
    const draw=playback.sample(m.state.time*1000);if(!draw)continue;
    a.update(draw.players[0],draw.time,1/120);
    if(draw.time>r.startedAt+r.travel!+.15){
     assert.equal(draw.players[0].x,r.toX,'interpolation cannot rewind to launch');
     const hip=a.root.localToWorld(new Vector3(0,.85,0));
     assert.ok(Math.abs(hip.x-r.toX)<1e-8);
    }
    free||=!draw.players[0].rescue;
   }
   assert.ok(free);assert.equal(p.x,r.toX);
  }finally{m.dispose();disposeTree(a.root);}
 }
});
