import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion,Matrix4,SkinnedMesh,Object3D} from 'three';
import {model} from './helpers/athlete-model.js';
import {Athlete} from '../src/render/player.js';
import {handSkinPose} from '../src/render/hand-skin-pose.js';
import {disposeTree} from '../src/render/dispose.js';

test('turning the wrist cannot rescale or change the length of the forearm',()=>{
 const elbow=new Matrix4().makeTranslation(0,0,0);
 let reference:number|undefined,referenceScale:Vector3|undefined;
 for(let i=0;i<=120;i++){
  const grip=new Matrix4().compose(new Vector3(0,-.34,0),new Quaternion().setFromAxisAngle(new Vector3(1,.2,.3).normalize(),i/120*Math.PI*2),new Vector3(1,1,1));
  const pose=handSkinPose(grip,elbow,'R',1,undefined,1/60,'lin',true);
  const length=pose.wrist.length(),scale=new Vector3().setFromMatrixScale(pose.forearm);
  reference??=length;referenceScale??=scale;
  assert.ok(Math.abs(length-reference)<1e-8,`wrist rotation stretches forearm: ${length} vs ${reference}`);
  assert.ok(scale.distanceTo(referenceScale)<1e-8,'forearm scale depends on wrist angle');
 }
});

test('wrist pivot is invariant even when desired grip rotation and distance change',()=>{
 const eq=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.7);
 const elbow=new Matrix4().compose(new Vector3(.2,1.1,.1),eq,new Vector3(1,1,1));
 const expected=new Vector3(0,-.288,0).applyQuaternion(eq).add(new Vector3(.2,1.1,.1));
 for(const side of ['L','R'] as const)for(const reach of [.28,.34,.4])for(const roll of [-1,0,1]){
  const grip=new Matrix4().compose(new Vector3(.2,1.1-reach,.1),new Quaternion().setFromAxisAngle(new Vector3(0,0,1),roll),new Vector3(1,1,1));
  const pose=handSkinPose(grip,elbow,side,1,undefined,1/60,'lin',true);
  assert.ok(pose.wrist.distanceTo(expected)<1e-10);
  const endpoint=new Vector3(0,-.34,0).applyMatrix4(pose.forearm);
  assert.ok(endpoint.distanceTo(pose.wrist)<1e-10,'forearm endpoint and wrist must coincide');
 }
});

test('hand turns around its wrist while a zero-delta repeat preserves the pose',()=>{
 const elbow=new Matrix4().compose(new Vector3(0,1,0),
  new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-.8),new Vector3(1,1,1));
 const position=new Vector3(0,-.34,0).applyMatrix4(elbow);
 const at=(angle:number,previous?:Quaternion,dt=1/60)=>handSkinPose(
  new Matrix4().compose(position,new Quaternion().setFromAxisAngle(new Vector3(0,0,1),angle),new Vector3(1,1,1)),
  elbow,'R',1,previous,dt,'lin',true);
 const a=at(-.5),b=at(.5);
 assert.ok(a.rotation.angleTo(b.rotation)>.1,'hand must rotate, not simply ignore wrist controls');
 assert.ok(a.wrist.distanceTo(b.wrist)<1e-10,'rotation moved the pivot');
 const frozen=at(.5,a.rotation,0);
 assert.ok(frozen.rotation.angleTo(a.rotation)<1e-7,'zero-delta update advances smoothing');
 assert.ok(frozen.wrist.distanceTo(a.wrist)<1e-10);
});

test('isolated elbow/wrist rotations leave actual shaft skin rigid outside joint zones',async()=>{
 for(const id of ['lin','mei','noah']){
  const {scene}=await model(`prototypes/${id}`);scene.updateMatrixWorld(true);
  const probes:{mesh:SkinnedMesh;index:number;part:string;initial?:Vector3}[]=[];
  scene.traverse(o=>{
   if(!(o instanceof SkinnedMesh))return;
   const pos=o.geometry.attributes.position,sw=o.geometry.attributes.skinWeight,si=o.geometry.attributes.skinIndex;
   for(const part of ['UpperArm_R','LowerArm_R']){
    const bone=scene.getObjectByName(part)!,child=scene.getObjectByName(part==='UpperArm_R'?'LowerArm_R':'Hand_R')!;
    const start=bone.getWorldPosition(new Vector3()),axis=child.getWorldPosition(new Vector3()).sub(start);
    for(let i=0;i<pos.count;i++){
     const p=new Vector3().fromBufferAttribute(pos,i),u=p.clone().sub(start).dot(axis)/axis.lengthSq();
     if(u<.25||u>.65||p.distanceTo(start.clone().addScaledVector(axis,u))>.1)continue;
     let assigned=0;for(let k=0;k<4;k++)if(o.skeleton.bones[si.getComponent(i,k)].name===part)assigned+=sw.getComponent(i,k);
     if(assigned>.75)probes.push({mesh:o,index:i,part});
    }
   }
  });
  assert.ok(probes.length>20);
  const a=new Athlete(1);a.attachModel(scene);
  try{
   a.update({characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'forehand',swing:0},0);
   const controls=a as unknown as {elbows:Object3D[];racket:Object3D;generated:{update(dt?:number):void}};
   const capture=(probe:typeof probes[number])=>{
    probe.mesh.skeleton.update();
    const world=probe.mesh.localToWorld(probe.mesh.getVertexPosition(probe.index,new Vector3()));
    return scene.getObjectByName(probe.part)!.worldToLocal(world);
   };
   for(const p of probes)p.initial=capture(p);
   for(const angle of [.4,.9,1.4,2.0]){
    controls.elbows[1].rotation.x=angle;
    controls.racket.rotation.z=angle*.4;
    a.root.updateMatrixWorld(true);controls.generated.update(1/60);a.root.updateMatrixWorld(true);
    for(const p of probes)assert.ok(capture(p).distanceTo(p.initial!)<.001,
     `${id}/${p.part}/${p.index}: joint rotation deforms shaft by ${capture(p).distanceTo(p.initial!)}`);
   }
  }finally{disposeTree(a.root);}
 }
});

for(const id of ['lin','mei','noah'])for(const seat of [0,1] as const)test(`${id}/${seat}: actual skin bones pivot with invariant lengths through all strokes`,async()=>{
 const {scene}=await model(`prototypes/${id}`),a=new Athlete(seat);a.attachModel(scene);
 const lengths=new Map<string,number>(),scales=new Map<string,Vector3>();
 try{
  for(const stroke of ['forehand','backhand','serve','volley'] as const)for(let i=0;i<=120;i++){
   const t=i/60,contact={x:(stroke==='backhand'?.65:-.65)*(id==='noah'?-1:1),y:stroke==='serve'?2.65:1.2,z:.65};
   a.update({characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,contact,shotQueued:true,
    swing:t>=1?(stroke==='serve'?.72:.44)*(2-t):0,preparation:t<1?{stroke,progress:t,contact}:undefined},t,1/60);
   for(const side of ['L','R'])for(const [part,end] of [['UpperArm','LowerArm'],['LowerArm','Hand']]){
    const name=`${part}_${side}`,bone=scene.getObjectByName(name)!,child=scene.getObjectByName(`${end}_${side}`)!;
    const length=bone.getWorldPosition(new Vector3()).distanceTo(child.getWorldPosition(new Vector3()));
    const scale=new Vector3().setFromMatrixScale(bone.matrixWorld);
    if(!lengths.has(name)){lengths.set(name,length);scales.set(name,scale);}
    assert.ok(Math.abs(length-lengths.get(name)!)<1e-7,`${id}/${stroke}/${t}/${name} changes length`);
    assert.ok(scale.distanceTo(scales.get(name)!)<1e-7,`${name} animated scale`);
   }
  }
 }finally{disposeTree(a.root);}
});

test('wrist rotation preserves hand skin shape and does not drift its pivot',async()=>{
 for(const id of ['lin','mei','noah']){
  const {scene}=await model(`prototypes/${id}`),a=new Athlete(1);a.attachModel(scene);
  try{
   a.update({characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'forehand',swing:0},0);
   const controls=a as unknown as {racket:Object3D;generated:{update(dt?:number):void}};
   // Use canonical unreflected coordinates, as in the production skin pass.
   a.root.scale.x=1;a.root.updateMatrixWorld(true);controls.generated.update();
   const bone=scene.getObjectByName('Hand_R')!;
   const initialPivot=bone.getWorldPosition(new Vector3());
   const probes:{mesh:SkinnedMesh;index:number;initial:Vector3}[]=[];
   const position=(mesh:SkinnedMesh,i:number)=>{
    mesh.skeleton.update();
    return bone.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i,new Vector3())));
   };
   scene.traverse(o=>{
    if(!(o instanceof SkinnedMesh))return;
    const si=o.geometry.attributes.skinIndex,sw=o.geometry.attributes.skinWeight;
    for(let i=0;i<si.count;i++){
     let w=0;for(let k=0;k<4;k++)if(o.skeleton.bones[si.getComponent(i,k)].name==='Hand_R')w+=sw.getComponent(i,k);
     if(w===1)probes.push({mesh:o,index:i,initial:position(o,i)});
    }
   });
   assert.ok(probes.length>10);
   for(let i=0;i<=90;i++){
    controls.racket.rotation.z=-.6+i/75;
    a.root.updateMatrixWorld(true);controls.generated.update(1/60);a.root.updateMatrixWorld(true);
    assert.ok(bone.getWorldPosition(new Vector3()).distanceTo(initialPivot)<1e-8,'wrist moved when rotating hand');
    for(const p of probes)assert.ok(position(p.mesh,p.index).distanceTo(p.initial)<1e-6,'hand mesh stretched');
   }
  }finally{disposeTree(a.root);}
 }
});
