import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Vector3,SkinnedMesh,Box3,Mesh} from 'three';
import {model} from './helpers/athlete-model.js';
import {Athlete} from '../src/render/player.js';
import {disposeTree} from '../src/render/dispose.js';

for(const id of ['lin','mei','noah'])test(`${id}: continuous hand skin has wrist/palm separation and bounded skin`,async()=>{
 const bytes=await readFile(`public/models/prototypes/${id}.glb`);
 assert.ok(bytes.length>10000);
 const {scene}=await model(`prototypes/${id}`);
 assert.equal(scene.userData.handFaceRevision,2);
 const a=new Athlete(1);a.attachModel(scene);
 try{
  for(const stroke of ['forehand','backhand','serve'] as const)for(const t of [.3,.54,1,1.3,1.65]){
   const hand=id==='noah'?-1:1,contact={x:(stroke==='backhand'?.65:-.65)*hand,y:stroke==='serve'?2.65:1.2,z:.65};
   a.update({characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,swing:t>=1?(stroke==='serve'?.72:.44)*(2-t):0,shotQueued:true,contact,preparation:t<1?{stroke,progress:t,contact}:undefined},t,.016);
   const grip=a.root.getObjectByName('racket-grip')!.getWorldPosition(new Vector3());
   const wrist=scene.getObjectByName('Hand_R')!.getWorldPosition(new Vector3());
   assert.ok(wrist.distanceTo(grip)>.045&&wrist.distanceTo(grip)<.10,'wrist must not be the palm centre');
   const elbow=scene.getObjectByName('LowerArm_R')!.getWorldPosition(new Vector3());
   assert.ok(wrist.distanceTo(elbow)<.29,'do not stretch the deform forearm to the palm');
   assert.equal(a.root.getObjectByName('articulated-hands'),undefined,'no detached elbow, palm or finger props');
   const box=new Box3();
   scene.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));}});
   const size=box.getSize(new Vector3());assert.ok(size.toArray().every(Number.isFinite)&&Math.max(size.x,size.y,size.z)<3.5);
  }
 }finally{disposeTree(a.root);}
});

test('three hand prototypes preserve exact racket path, handedness and two-hand support at 20/30/60 fps',async()=>{
 for(const id of ['lin','mei','noah'])for(const seat of [0,1] as const){
  const a=new Athlete(seat),legacy=new Athlete(seat);a.attachModel((await model(`prototypes/${id}`)).scene);
  const hand=id==='noah'?-1:1,sign=seat===0?-1:1;
  try{
   for(const fps of [20,30,60])for(const stroke of ['forehand','backhand','serve'] as const){
    for(let i=0;i<=fps*2;i++){
     const t=i/fps,contact={x:(stroke==='backhand'?.65:stroke==='serve'?0:-.65)*sign*hand,y:stroke==='serve'?2.65:1.2,z:.65*sign};
     const p={characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,shotQueued:true,contact,swing:t>=1?(stroke==='serve'?.72:.44)*(2-t):0,preparation:t<1?{stroke,progress:t,contact}:undefined};
     a.update(p,t,1/fps);legacy.update(p,t,1/fps);
     const get=(athlete:Athlete,n:string)=>athlete.root.getObjectByName(n)!.getWorldPosition(new Vector3());
     assert.ok(get(a,'racket-sweet-spot').distanceTo(get(legacy,'racket-sweet-spot'))<1e-8);
     assert.equal(a.root.scale.x,hand);
     const grip=get(a,'racket-grip'),wrist=get(a,'Hand_R');
     assert.ok(wrist.distanceTo(grip)>.045&&wrist.distanceTo(grip)<.10);
     if(stroke==='backhand'&&t>.4&&t<1.8)assert.ok(get(a,'left-hand-grip').distanceTo(grip)<.13,'support palm separates');
     for(const bone of ['Hand_R','Hand_L','LowerArm_R','LowerArm_L'])
      assert.ok(a.root.getObjectByName(bone)!.matrixWorld.elements.every(Number.isFinite));
    }
   }
   a.clearModel();assert.equal(a.root.getObjectByName('articulated-hands'),undefined);
  }finally{disposeTree(a.root);disposeTree(legacy.root);}
 }
});
