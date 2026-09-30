import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Box3,SkinnedMesh,PerspectiveCamera,Object3D,Quaternion} from 'three';
import {Athlete} from '../src/render/player.js';
import {victoryPlayer,victoryPose} from '../src/render/victory.js';
import type {MatchState,PlayerState} from '../src/simulation/types.js';
import {disposeTree} from '../src/render/dispose.js';
import {CHARACTERS} from '../src/simulation/characters.js';
import {model} from './helpers/athlete-model.js';
import {App} from '../src/ui/app.js';
import {CourtView} from '../src/render/view.js';

test('both viewers select the authoritative winner for the result celebration without changing match state',()=>{
 const state={winner:1,phase:'over',players:[{characterId:'lin',x:0,z:12},{characterId:'mei',x:2,z:-10}]} as MatchState;
 const before=structuredClone(state);
 assert.equal(victoryPlayer(state)?.seat,1);
 assert.equal(victoryPlayer(state)?.player.characterId,'mei');
 assert.deepEqual(state,before);
 assert.equal(victoryPlayer({...state,phase:'rally'}),null);
});
test('finite step-touch celebration keeps a support foot planted, moves sideways and ends in a held stance',()=>{
 for(const id of ['lin','noah'])for(const seat of [0,1] as const){
  const a=new Athlete(seat),p={characterId:id,x:0,z:seat?-10:10,tx:0,tz:seat?-10:10,stamina:1,stroke:'forehand' as const,swing:0,moving:false};
  const tips:Vector3[]=[],feet:Vector3[][]=[],centres:number[]=[];
  try{
   for(let i=0;i<=420;i++){
    a.update(p,1,1/60,i/60);
    tips.push(a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3()));
    const frame=['foot-0','foot-1'].map(n=>a.root.getObjectByName(n)!.getWorldPosition(new Vector3()));
    feet.push(frame);centres.push(a.root.position.x);
    assert.ok(Math.min(...frame.map(v=>v.y))<.115,`support foot missing at ${i/60}`);
    assert.ok(frame.every(v=>v.y>.08),'soles must stay above court');
    for(let foot=0;foot<2;foot++){
     const ankle=a.root.getObjectByName(`foot-${foot}`)!;
     const up=new Vector3(0,1,0).applyQuaternion(ankle.getWorldQuaternion(new Quaternion()));
     assert.ok(up.y>.995,'level sole, no ankle snapping');
     if(i>0&&frame[foot].y<.108&&feet[i-1][foot].y<.108)
      assert.ok(Math.hypot(frame[foot].x-feet[i-1][foot].x,frame[foot].z-feet[i-1][foot].z)<.009,'planted foot slides');
    }
    if(i>0)assert.ok(tips[i].distanceTo(tips[i-1])<.13,`sudden racket motion at ${i/60}`);
   }
   assert.ok(Math.max(...centres)-Math.min(...centres)>.25,'real weight shift, not just waving arms');
   for(let foot=0;foot<2;foot++)assert.ok(Math.max(...feet.map(f=>f[foot].x))-Math.min(...feet.map(f=>f[foot].x))>.25,'each foot takes a lateral step');
   assert.ok(tips[240].distanceTo(tips[90])>.5,'racket salute differs from side hold');
   assert.ok(tips[360].distanceTo(tips[400])<1e-8,'no infinite dance loop');
   a.update(p,1,1/60);assert.equal(a.root.position.y,0,'new match clears the celebration');
  }finally{disposeTree(a.root);}
 }
});
test('celebration isolates stale serve/running/contact state and holds identically after the final beat',()=>{
 const a=new Athlete(0),b=new Athlete(0);
 const p={characterId:'lin',x:2,z:10,tx:2,tz:10,stamina:1,stroke:'forehand' as const,swing:0,moving:false};
 try{
  for(let i=0;i<360;i++){
   a.update(p,30,1/60,i/60);
   b.update({...p,stroke:'serve',vx:8,vz:5,contact:{x:-5,y:3,z:2}},30,1/60,i/60);
  }
  for(const name of ['racket-sweet-spot','left-hand-grip','foot-0','foot-1','head-tracking']){
   const aa=a.root.getObjectByName(name)!,bb=b.root.getObjectByName(name)!;
   assert.ok(aa.getWorldPosition(new Vector3()).distanceTo(bb.getWorldPosition(new Vector3()))<1e-8,`${name} depends on previous shot`);
  }
 }finally{disposeTree(a.root);disposeTree(b.root);}
});
test('every actual character model can celebrate without exploding or losing its racket',async()=>{
 for(const c of CHARACTERS){
  const a=new Athlete(1);a.attachModel((await model(c.id==='lin'?'athlete':`characters/${c.id}`)).scene);
  try{
   for(let frame=0;frame<180;frame++){
    a.update({characterId:c.id,x:0,z:0,tx:0,tz:0,stamina:1,stroke:'forehand',swing:0,moving:false},1,1/30,frame/30);
    const box=new Box3();
    a.root.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));}});
    const size=box.getSize(new Vector3());
    assert.ok(size.toArray().every(Number.isFinite)&&size.x<3&&size.y<3.4&&size.z<3,c.id);
    assert.ok(box.min.y>-.07,`${c.id} foot penetrates ground: ${box.min.y}`);
    const racket=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
    assert.ok(racket.toArray().every(Number.isFinite)&&racket.length()<3.5);
    const local=a.root.worldToLocal(racket.clone());
    assert.ok(local.x<-.25&&local.z>.25,'racket stays beside/in front of body, not through the torso');
    for(const part of ['racket-grip','left-hand-grip']){
     const hand=a.root.getObjectByName(part)!,elbow=hand.parent!,arm=elbow.parent!;
     assert.ok(Math.abs(hand.getWorldPosition(new Vector3()).distanceTo(elbow.getWorldPosition(new Vector3()))-.31)<1e-8);
     assert.ok(Math.abs(elbow.getWorldPosition(new Vector3()).distanceTo(arm.getWorldPosition(new Vector3()))-.36)<1e-8);
    }
   }
  }finally{disposeTree(a.root);}
 }
});
test('entering the dance blends the previous rig rather than snapping, at 20/30/60FPS',()=>{
 for(const fps of [20,30,60])for(const id of ['lin','noah'])for(const seat of [0,1] as const){
  const a=new Athlete(seat),sign=seat===0?1:-1;
  const p={characterId:id,x:2,z:10*sign,tx:2,tz:10*sign,stamina:1,stroke:'forehand' as const,swing:0,moving:false};
  try{
   a.update(p,35,1/fps);
   const initial=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
   a.update(p,35,1/fps,0);
   assert.ok(a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3()).distanceTo(initial)<1e-8);
   let last=initial,quaternion=a.root.getObjectByName('racket-grip')!.getWorldQuaternion(new Quaternion());
   for(let i=1;i<fps*6;i++){
    a.update(p,35,1/fps,i/fps);
    const tip=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
    const q=a.root.getObjectByName('racket-grip')!.getWorldQuaternion(new Quaternion());
    assert.ok(tip.distanceTo(last)*fps<6,`${id}/${seat}/${fps}/${i}: sudden tip jump`);
    assert.ok(q.angleTo(quaternion)*fps<15,`${id}/${seat}/${fps}/${i}: wrist flip`);
    last=tip;quaternion=q;
   }
  }finally{disposeTree(a.root);}
 }
});
test('choreography has smooth velocity at every phrase boundary and stays still after its ending',()=>{
 const sample=(t:number)=>{const p=victoryPose(t);return [p.rootX,p.drop,p.turn,p.hipTurn,...p.tip.toArray(),...p.hand.toArray(),...p.feet.flatMap(v=>v.toArray())];};
 const dt=.0001;
 for(const t of [.38,.7,1.15,1.25,1.65,1.85,2.3,2.4,2.8,3.05,3.65,4.15,5.2]){
  const a=sample(t-dt),b=sample(t),c=sample(t+dt);
  for(let i=0;i<b.length;i++)assert.ok(Math.abs((c[i]-b[i])/dt-(b[i]-a[i])/dt)<.02,`${t}/${i}: cusp`);
 }
 assert.deepEqual(sample(6),sample(20));
});
test('a win while running or diving settles into the same dance without retaining the prior motion',()=>{
 for(const id of ['lin','noah'])for(const mode of ['running','rescue']){
  const a=new Athlete(0),p:PlayerState={characterId:id,x:0,z:10,tx:3,tz:10,stamina:1,stroke:'forehand',swing:0,moving:true};
  try{
   if(mode==='rescue'){
    p.rescue={startedAt:0,fromX:0,toX:1,fromZ:10,toZ:10,hit:true,stroke:'forehand',contact:{x:1.6,y:1.2,z:9.6}};
    p.x=1;a.update(p,.3,1/60);
   }else for(let i=0;i<30;i++){p.x+=.04;a.update(p,i/60,1/60);}
   const tip=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
   a.update({...p,rescue:undefined,moving:false},35,1/60,0);
   assert.ok(a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3()).distanceTo(tip)<1e-8,'preserve the entry pose');
   for(let i=1;i<=360;i++)a.update({...p,rescue:undefined,moving:false},35,1/60,i/60);
   assert.ok(Math.abs(a.root.position.x-p.x)<1e-8&&a.root.position.y===0);
   assert.ok(['foot-0','foot-1'].every(n=>Math.abs(a.root.getObjectByName(n)!.getWorldPosition(new Vector3()).y-.105)<1e-8));
   a.update({...p,rescue:undefined,moving:false},36,1/60);
   assert.equal(a.root.position.x,p.x);assert.equal(a.root.position.y,0);
  }finally{disposeTree(a.root);}
 }
});
test('result overlay names the actual winning opponent rather than always presenting the local player',()=>{
 const state={phase:'over',winner:1,players:[{characterId:'lin'},{characterId:'mei'}],score:[3,7],maxRally:12,time:85,event:'二跳'} as MatchState;
 const app=Object.assign(Object.create(App.prototype),{remote:state,seat:0,name:'玩家A',room:{seats:[{name:'玩家A'},{name:'赢家B'}]}});
 const html=(App.prototype as any).result.call(app);
 assert.match(html,/赢家B · 梅岚/);assert.match(html,/持拍庆祝/);assert.match(html,/victory-panel/);
 assert.match(html,/data-action="rematch"/);assert.match(html,/data-action="back"/);
});
test('the actual result renderer animates only the server winner on either client and never mutates state',()=>{
 for(const winner of [0,1] as const)for(const viewer of [0,1] as const){
  const p=(x:number,z:number)=>({characterId:'lin',x,z,tx:x,tz:z,stamina:1,stroke:'forehand' as const,swing:0,moving:false});
  const s={phase:'over',winner,players:[p(0,12),p(2,-10)],time:35,ball:{x:0,y:1,z:0,targetX:0,targetZ:0},score:[winner===0?7:3,winner===1?7:3]} as MatchState;
  const before=structuredClone(s),seen:(number|undefined)[]=[];
  const view=Object.assign(Object.create(CourtView.prototype),{
   mode:'result',seat:viewer,surface:'hard',ends:0,doubles:false,celebrationTime:0,size:{w:390,h:844},camera:new PerspectiveCamera(),
   scene:{},setCharacter(){},quality:{level:'balanced'},
   athletes:[0,1].map(i=>({root:new Object3D(),update(_p:unknown,_t:number,_d:number,celebration?:number){seen[i]=celebration;}})),
   contactShadows:[new Object3D(),new Object3D()],ball:new Object3D(),shadow:new Object3D(),target:new Object3D(),marker:new Object3D(),
   trail:[Object.assign(new Object3D(),{material:{color:{setHex(){}}}})],flight:{update(){}},renderer:{render(){},domElement:{dataset:{}}},
  }) as any;
  view.render(s,.1,s);
  assert.equal(view.athletes[winner].root.visible,true);
  assert.equal(view.athletes[winner===0?1:0].root.visible,false);
  assert.equal(seen[winner],.1);assert.equal(seen[winner===0?1:0],undefined);
  assert.deepEqual(s,before);
  for(const [w,h] of [[390,844],[320,568],[844,390]]){
   view.size={w,h};view.render(s,.1,s);
   const p=s.players[winner],foot=new Vector3(p.x,0,p.z).project(view.camera);
   const salute=new Vector3(p.x,2.45,p.z).project(view.camera);
   const fy=(1-foot.y)/2,sy=(1-salute.y)/2;
   if(w<h){assert.ok(fy<.63,'dance feet are hidden by the result panel');assert.ok(sy>.20,'salute overlaps winner title');}
   else{assert.ok((foot.x+1)/2<.59,'landscape result panel hides the dancer');assert.ok(sy>.27&&fy<.93);}
  }
 }
});
