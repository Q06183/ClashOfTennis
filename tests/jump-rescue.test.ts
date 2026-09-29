import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {rescueTarget,RESCUE,canReachRescue,moveRescue} from '../src/simulation/rescue.js';
import {handedness,CHARACTERS} from '../src/simulation/characters.js';
import {side,type Seat,type RescueStroke} from '../src/simulation/types.js';
import {Athlete} from '../src/render/player.js';
import {Vector3,Box3,SkinnedMesh} from 'three';
import {model} from './helpers/athlete-model.js';
import {disposeTree} from '../src/render/dispose.js';
import {rescueIncoming} from './helpers/rescue-incoming.js';

before(initPhysics);
const shot={type:'shot' as const,aim:0,depth:.55,power:.8,lob:false};
function incoming(kind:RescueStroke,seat:Seat,id='lin',random=()=>0){
 const m=new Match([id,id],random),sign=side(seat),hand=handedness(id),p=m.state.players[seat];
 m.state.phase='rally';m.state.rally=2;m.step(.08);
 const depth=kind==='volley'?4:10;
 Object.assign(p,{x:0,z:depth*sign,tx:0,tz:depth*sign,vx:0,vz:0,stamina:.08});
 const backhand=kind==='backhand';
 rescueIncoming(m,seat,kind);
 return m;
}
test('jump candidates cover both wings, above-waist volleys and high overheads even when tired',()=>{
 for(const kind of ['forehand','backhand','volley','smash'] as const)
 for(const id of ['lin','noah'])for(const seat of [0,1] as Seat[]){
  const m=incoming(kind,seat,id);
  try{
   const p=m.state.players[seat],target=rescueTarget(m.state.ball,p,seat);
   assert.ok(target,`${kind}/${id}/${seat} needs a reachable jump candidate`);
   assert.equal(target.stroke,kind);
   assert.equal(target.backhand,kind==='backhand');
   assert.ok(Math.hypot(target.x-p.x,target.z-p.z)<=RESCUE.reach);
  }finally{m.dispose();}
 }
});
test('a successful stamina lottery can physically save all four unreachable shots, once per incoming flight',()=>{
 for(const kind of ['forehand','backhand','volley','smash'] as const)
 for(const seat of [0,1] as Seat[])for(const id of ['lin','noah']){
  let rolls=0;
  const m=incoming(kind,seat,id,()=>{rolls++;return 0;}),p=m.state.players[seat],a=new Athlete(seat);
  try{
   m.input(seat,shot);let sawJump=false,maxLift=0;
   for(let i=0;i<60&&m.state.rally===2&&m.state.phase==='rally';i++){
    const before={x:p.x,z:p.z};m.step(1/60);a.update(p,m.state.time,1/60);
    assert.ok(Math.hypot(p.x-before.x,p.z-before.z)<.65,'no teleport');
    sawJump||=!!p.rescue;maxLift=Math.max(maxLift,a.root.position.y);
   }
   assert.ok(sawJump,`${kind}/${id}/${seat} jump starts`);
   assert.equal(m.state.ball.hitter,seat,`${kind}/${id}/${seat} hits`);
   assert.equal(m.state.ball.rescue,true);assert.equal(p.rescue?.stroke,kind);
   assert.equal(p.stroke,kind);
   assert.ok(maxLift>.22,`${kind} must be visible`);
   assert.equal(rolls,3,'one chance plus two scatter samples');
   assert.ok(canReachRescue({...m.state.ball,...p.contact!},p,seat,m.state.time));
   const sweet=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
   assert.ok(sweet.distanceTo(new Vector3(p.contact!.x,p.contact!.y,p.contact!.z))<.1,`${kind}/${id}/${seat} racket misses actual ball: ${sweet.distanceTo(new Vector3(p.contact!.x,p.contact!.y,p.contact!.z))}`);
   for(let i=0;i<Math.ceil((RESCUE.duration+.1)*60);i++){m.step(1/60);a.update(p,m.state.time,1/60);}
   assert.equal(p.rescue,undefined);assert.equal(a.root.position.y,0);
  }finally{m.dispose();disposeTree(a.root);}
 }
});
test('low-total-stamina lottery is exactly 10 of 100 equally spaced draws and cannot be farmed by swipes',()=>{
 let jumped=0;
 for(let n=0;n<100;n++){
  let draws=0;const m=incoming('backhand',0,'lin',()=>{draws++;return (n+.5)/100;});
  m.state.players[0].totalStamina=.2;
  try{
   for(let i=0;i<45&&m.state.rally===2&&m.state.phase==='rally';i++){m.input(0,shot);m.step(1/60);}
   if(m.state.ball.rescue)jumped++;
   assert.equal(draws,n<10?3:1);
  }finally{m.dispose();}
 }
 assert.equal(jumped,10);
});
test('four rescue styles have distinct preparation and follow-through, with continuous racket travel',()=>{
 const signatures:string[]=[];
 for(const kind of ['forehand','backhand','volley','smash'] as const){
  const m=incoming(kind,0),a=new Athlete(0),p=m.state.players[0];
  try{
   m.input(0,shot);for(let i=0;i<30&&!p.rescue;i++)m.step(1/60);
   assert.ok(p.rescue);
   const r=structuredClone(p.rescue),contact={x:r.toX+.4,y:kind==='smash'?2.9:kind==='volley'?1.8:1.2,z:r.toZ-.25};
   Object.assign(p,{x:r.toX,z:r.toZ,rescue:{...r,contact,hit:false},contact,stroke:kind});
   a.update(p,r.startedAt+.04,1/60);
   const prep=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
   assert.ok(prep.distanceTo(new Vector3(contact.x,contact.y,contact.z))>.12,`${kind} needs a real windup, not a static reach`);
   p.rescue!.hit=true;
   a.update(p,r.startedAt+.42,1/60);
   const tip=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
   const free=a.root.getObjectByName('left-hand-grip')!.getWorldPosition(new Vector3());
   signatures.push([...tip.toArray(),...free.toArray()].map(n=>n.toFixed(2)).join(','));
  }finally{m.dispose();disposeTree(a.root);}
 }
 assert.equal(new Set(signatures).size,4,'forehand/backhand/volley/smash must not use one shared pose');
});

test('actual roster skins keep four jump types bounded with racket contact and clean landing',async()=>{
 for(const c of CHARACTERS)for(const seat of [0,1] as Seat[]){
  const {scene}=await model(c.id==='lin'?'athlete':`characters/${c.id}`),a=new Athlete(seat);
  a.attachModel(scene);
  try{
   for(const kind of ['forehand','backhand','volley','smash'] as const){
    const m=incoming(kind,seat,c.id),p=m.state.players[seat];
    try{
     m.input(seat,shot);let maxLift=0;
     for(let i=0;i<60&&m.state.rally===2;i++){
      m.step(1/60);a.update(p,m.state.time,1/60);maxLift=Math.max(maxLift,a.root.position.y);
     }
     assert.equal(m.state.ball.rescue,true,`${c.id}/${seat}/${kind}`);
     const sweet=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3()),hit=p.contact!;
     assert.ok(sweet.distanceTo(new Vector3(hit.x,hit.y,hit.z))<.1,`${c.id}/${seat}/${kind} real skin contact`);
     assert.ok(maxLift>.22);
     for(let frame=0;frame<Math.ceil((RESCUE.duration+.1)*60);frame++){
      m.step(1/60);a.update(p,m.state.time,1/60);a.root.updateMatrixWorld(true);
      if(frame%6)continue;
      // A rotated local AABB contains empty corners below ground. Measure the
      // actual deformed vertices for a horizontal/prone body instead.
      const box=new Box3();a.root.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();for(let v=0;v<o.geometry.attributes.position.count;v++)box.expandByPoint(o.localToWorld(o.getVertexPosition(v,new Vector3())));}});
      const size=box.getSize(new Vector3());
      assert.ok(size.toArray().every(Number.isFinite)&&size.x<3.5&&size.y<3.5&&size.z<3.5,`${c.id}/${kind} skin exploded`);
      assert.ok(box.min.y>-.12,`${c.id}/${kind} below ground ${box.min.y}`);
     }
     assert.equal(p.rescue,undefined);assert.equal(a.root.position.y,0);
    }finally{m.dispose();}
   }
  }finally{disposeTree(a.root);}
 }
});

test('jump motion is continuous at contact and blends back instead of snapping the racket',()=>{
 for(const kind of ['forehand','backhand','volley','smash'] as const){
  const m=incoming(kind,0),p=m.state.players[0],a=new Athlete(0);
  try{
   m.input(0,shot);for(let i=0;i<30&&!p.rescue;i++)m.step(1/60);
   assert.ok(p.rescue);const start=p.rescue.startedAt;
   let previous:Vector3|undefined;
   for(let i=1;i<=Math.ceil((RESCUE.duration+.1)*1000);i++){
    const time=start+i/1000;moveRescue(p,time,.001);
    if(p.rescue&&i>=150)p.rescue.hit=true;
    a.update(p,time,.001);
    const tip=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
    if(previous)assert.ok(tip.distanceTo(previous)<.09,`${kind} jump at ${i}: ${tip.distanceTo(previous)}`);
    previous=tip;
   }
  }finally{m.dispose();disposeTree(a.root);}
 }
});
