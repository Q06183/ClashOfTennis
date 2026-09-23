import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Matrix4,Bone,SkinnedMesh} from 'three';
import {Athlete} from '../src/render/player.js';
import {model} from './helpers/athlete-model.js';

test('retargeted arm skin endpoints meet elbows and wrists instead of stretching the seam',async()=>{
 const {scene}=await model(),lengths=new Map<string,number>();scene.updateMatrixWorld(true);
 for(const suffix of ['L','R'])for(const part of ['UpperArm','LowerArm']){
  const name=part+'_'+suffix,bone=scene.getObjectByName(name)!,child=bone.children.find(o=>o instanceof Bone)!;
  lengths.set(name,bone.getWorldPosition(new Vector3()).distanceTo(child.getWorldPosition(new Vector3())));
 }
 const a=new Athlete(1);a.attachModel(scene);
 for(const stroke of ['forehand','backhand','serve'] as const)for(const phase of [.3,.6,1,1.6]){
  const contact={x:stroke==='backhand'?.65:-.65,y:stroke==='serve'?2.65:1.2,z:.65};
  a.update({x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,shotQueued:true,swing:phase>=1?(stroke==='serve'?.72:.44)*(2-phase):0,preparation:phase<1?{stroke,progress:phase,contact}:undefined,contact},phase);
  for(const [name,length] of lengths){
   const bone=scene.getObjectByName(name)!,child=bone.children.find(o=>o instanceof Bone)!;
   assert.ok(bone.localToWorld(new Vector3(0,length,0)).distanceTo(child.getWorldPosition(new Vector3()))<.002,`${name} leaves a skin gap during ${stroke}/${phase}`);
  }
 }
});
test('looking at the ball cannot twist the collar and shoulder weights with the head',async()=>{
 const {scene}=await model(),a=new Athlete(1);a.attachModel(scene);
 const p={x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'forehand' as const,shotQueued:true,swing:.44,contact:{x:-.65,y:1.2,z:.65}};
 a.update(p,1);const torso=a.root.getObjectByName('athlete-torso')!,neck=scene.getObjectByName('Neck')!;
 const relative=new Matrix4().copy(torso.matrixWorld).invert().multiply(neck.matrixWorld);
 a.update({...p,stroke:'backhand',contact:{x:.65,y:1.2,z:.65}},2);
 const next=new Matrix4().copy(torso.matrixWorld).invert().multiply(neck.matrixWorld);
 assert.ok(relative.elements.every((v,i)=>Math.abs(v-next.elements[i])<1e-6),'collar should follow torso, not ball-tracking head rotation');
});

test('both hands move continuously during double backhands, including the wrist constraint transition',()=>{
 for(const characterId of ['lin','noah']){
  const a=new Athlete(1),contact={x:characterId==='noah'?-.65:.65,y:1.2,z:.65};let previous:Vector3[]|undefined;
  for(let i=0;i<=2000;i++){
   const t=i/1000;a.update({characterId,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'backhand',shotQueued:true,swing:t>=1?.44*(2-t):0,contact,preparation:t<1?{stroke:'backhand',progress:t,contact}:undefined},t,.001);
   const hands=['racket-grip','left-hand-grip'].map(n=>a.root.getObjectByName(n)!.getWorldPosition(new Vector3()));
   if(previous)hands.forEach((p,j)=>assert.ok(p.distanceTo(previous![j])<.02,`${characterId} wrist jumped at ${t}`));
   previous=hands;
  }
 }
});

test('all nine cloth sweatbands remain rigid and on the racket forearm after handedness mirroring',async()=>{
 for(const id of ['lin','mei','rafa','sora','ines','leo','noah','adrian','luca']){
  const {scene}=await model(id==='lin'?'athlete':`characters/${id}`),a=new Athlete(1);a.attachModel(scene);
  const cuff=scene.getObjectByName(id+'-sweatband') as import('three').SkinnedMesh;
  assert.ok(cuff?.isSkinnedMesh,`${id} needs its bound cloth accessory`);
  const w=cuff.geometry.attributes.skinWeight,idx=cuff.geometry.attributes.skinIndex;
  for(let i=0;i<w.count;i++){
   assert.equal(w.getX(i),1);
   assert.equal(cuff.skeleton.bones[idx.getX(i)].name,'LowerArm_R');
  }
  let rest:number|undefined;
  for(const phase of [.2,.6,1,1.6]){
   const contact={x:['noah','luca'].includes(id)?-.65:.65,y:1.2,z:.65};
   a.update({characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'backhand',shotQueued:true,swing:phase>=1?.44*(2-phase):0,contact,preparation:phase<1?{stroke:'backhand',progress:phase,contact}:undefined},phase);
   cuff.skeleton.update();
   const pos=cuff.geometry.attributes.position;
   const p=cuff.applyBoneTransform(0,new Vector3().fromBufferAttribute(pos,0)),q=cuff.applyBoneTransform(12,new Vector3().fromBufferAttribute(pos,12));
   const length=p.distanceTo(q);rest??=length;
   assert.ok(Math.abs(length-rest)<1e-5,`${id} cuff stretches across the wrist`);
  }
 }
});

// Guard actual skinned triangles, not just skeleton positions or total bounds.
test('refined arm weights avoid the severe stretched triangles in the original nine models',async()=>{
 for(const id of ['lin','mei','rafa','sora','ines','leo','noah','adrian','luca']){
  const {scene}=await model(id==='lin'?'athlete':`characters/${id}`),a=new Athlete(1);a.attachModel(scene);
  const meshes:{mesh:SkinnedMesh;edges:[number,number,number][]}[]=[];
  scene.traverse(o=>{if(!(o instanceof SkinnedMesh))return;
   const g=o.geometry,idx=g.index!,pos=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,edges:[number,number,number][]=[];
   for(let j=0;j<idx.count;j+=3)for(let k=0;k<3;k++){
    const u=idx.getX(j+k),v=idx.getX(j+(k+1)%3);
    if(![0,1,2,3].some(k=>sw.getComponent(u,k)>.15&&/Arm|Hand/.test(o.skeleton.bones[si.getComponent(u,k)].name)))continue;
    edges.push([u,v,Math.max(.025,new Vector3().fromBufferAttribute(pos,u).distanceTo(new Vector3().fromBufferAttribute(pos,v)))]);
   }
   meshes.push({mesh:o,edges});
  });
  for(const stroke of ['forehand','backhand','serve','volley','slice-backhand','smash'] as const)for(let i=0;i<=20;i++){
   const t=i/10,contact={x:(stroke.includes('backhand')?.65:-.65)*(['noah','luca'].includes(id)?-1:1),y:stroke==='serve'||stroke==='smash'?2.65:1.2,z:.65};
   a.update({characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,shotQueued:true,contact,swing:t>=1?(stroke==='serve'?.72:.44)*(2-t):0,preparation:t<1?{stroke,progress:t,contact}:undefined},t,.01);
   for(const {mesh,edges} of meshes){
    mesh.skeleton.update();const pos=mesh.geometry.attributes.position;
    const points=Array.from({length:pos.count},(_,j)=>mesh.applyBoneTransform(j,new Vector3().fromBufferAttribute(pos,j)));
    for(const [u,v,rest] of edges)assert.ok(points[u].distanceTo(points[v])/rest<4,`${id}/${stroke}/${t}: stretched arm edge ${u}/${v}`);
   }
  }
 }
});
