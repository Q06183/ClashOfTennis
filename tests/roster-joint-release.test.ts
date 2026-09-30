import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Box3,SkinnedMesh,Vector3,Object3D} from 'three';
import type {PlayerState} from '../src/simulation/types.js';
import {getCharacter,handedness} from '../src/simulation/characters.js';
import {model} from './helpers/athlete-model.js';
import {Athlete} from '../src/render/player.js';
import {disposeTree} from '../src/render/dispose.js';
const ids=['rafa','sora','ines','leo','adrian','luca','wuming'];
async function glb(path:string){
 const raw=await readFile(path),size=raw.readUInt32LE(12);
 return {j:JSON.parse(raw.toString('utf8',20,20+size)),bin:raw.subarray(28+size)};
}
for(const id of ids)test(`${id}: production joint upgrade preserves original geometry and material payload`,async()=>{
 const c=getCharacter(id);
 assert.equal(c.model,`/models/releases/joint-pivot-v1/${id}.glb`);
 const src=await glb(`public/models/characters/${id}.glb`),dst=await glb('public'+c.model);
 const payload=(g:typeof src,a:number)=>{
  const v=g.j.bufferViews[g.j.accessors[a].bufferView];
  return g.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
 };
 assert.equal(dst.j.scenes[dst.j.scene??0].extras.jointOptimizationRevision,1);
 assert.deepEqual(dst.j.materials,src.j.materials);assert.deepEqual(dst.j.images,src.j.images);
 assert.deepEqual(dst.j.skins,src.j.skins);
 assert.ok(dst.bin.subarray(0,src.j.buffers[0].byteLength).equals(src.bin.subarray(0,src.j.buffers[0].byteLength)));
 for(let m=0;m<src.j.meshes.length;m++)for(let p=0;p<src.j.meshes[m].primitives.length;p++){
  const a=src.j.meshes[m].primitives[p],b=dst.j.meshes[m].primitives[p];
  for(const attr of ['POSITION','NORMAL','TEXCOORD_0'])if(a.attributes[attr]!==undefined)
   assert.ok(payload(src,a.attributes[attr]).equals(payload(dst,b.attributes[attr])),`${id} altered ${attr}`);
  assert.ok(payload(src,a.indices).equals(payload(dst,b.indices)));
 }
});
for(const id of ids)test(`${id}: both seats retain fixed arm joints, racket contact and bounded skin across actions`,async()=>{
 for(const seat of [0,1] as const){
  const a=new Athlete(seat),reference=new Athlete(seat);
  const {scene}=await model(`releases/joint-pivot-v1/${id}`);a.attachModel(scene);
  reference.attachModel((await model(`characters/${id}`)).scene);
  const sign=seat===0?-1:1,hand=handedness(id);
  try{
   for(const stroke of ['forehand','backhand','serve','volley','smash','slice-backhand','lob'] as const)for(let i=0;i<=24;i++){
    const t=i/12,contact={x:(stroke.includes('backhand')?.65:-.65)*sign*hand,y:stroke==='serve'||stroke==='smash'?2.65:1.2,z:.65*sign};
    const p={characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,shotQueued:true,contact,
     swing:t>=1?(stroke==='serve'?.72:.44)*(2-t):0,preparation:t<1?{stroke,progress:t,contact}:undefined};
    a.update(p,t,1/30);reference.update(p,t,1/30);
    const at=(x:Athlete,n:string)=>x.root.getObjectByName(n)!.getWorldPosition(new Vector3());
    assert.ok(at(a,'racket-sweet-spot').distanceTo(at(reference,'racket-sweet-spot'))<1e-8);
    for(const side of ['L','R']){
     assert.ok(Math.abs(at(a,`UpperArm_${side}`).distanceTo(at(a,`LowerArm_${side}`))-.36)<1e-7);
     assert.ok(Math.abs(at(a,`LowerArm_${side}`).distanceTo(at(a,`Hand_${side}`))-.256)<1e-7);
    }
    const box=new Box3();
    scene.traverse(o=>{if(o instanceof SkinnedMesh){
     o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));
     if(i%6)return;
     const pos=o.geometry.attributes.position,ix=o.geometry.index!;
     const vertices=Array.from({length:pos.count},(_,i)=>o.getVertexPosition(i,new Vector3()));
     for(let j=0;j<ix.count;j+=3)for(let k=0;k<3;k++){
      const u=ix.getX(j+k),v=ix.getX(j+(k+1)%3);
      const rest=new Vector3().fromBufferAttribute(pos,u).distanceTo(new Vector3().fromBufferAttribute(pos,v));
      assert.ok(vertices[u].distanceTo(vertices[v])<Math.max(.15,rest*5),`${id}/${stroke}/${t}: skin ${u}/${v}`);
     }
    }});
    assert.ok(box.min.y>-.16&&box.max.y<3.5);
   }
  }finally{disposeTree(a.root);disposeTree(reference.root);}
 }
});

for(const id of ids)test(`${id}: isolated elbow and wrist rotation keeps shaft skin rigid`,async()=>{
 const {scene}=await model(`releases/joint-pivot-v1/${id}`);scene.updateMatrixWorld(true);
 const probes:{mesh:SkinnedMesh;index:number;part:string;initial?:Vector3}[]=[];
 scene.traverse(o=>{
  if(!(o instanceof SkinnedMesh))return;
  const {position:pos,skinWeight:sw,skinIndex:si}=o.geometry.attributes;
  for(const side of ['L','R'])for(const part of [`UpperArm_${side}`,`LowerArm_${side}`]){
   const bone=scene.getObjectByName(part)!,end=scene.getObjectByName(`${part.startsWith('Upper')?'LowerArm':'Hand'}_${side}`)!;
   const start=bone.getWorldPosition(new Vector3()),axis=end.getWorldPosition(new Vector3()).sub(start);
   for(let i=0;i<pos.count;i++){
    const p=new Vector3().fromBufferAttribute(pos,i),u=p.clone().sub(start).dot(axis)/axis.lengthSq();
    if(u<.25||u>.65||p.distanceTo(start.clone().addScaledVector(axis,u))>.13)continue;
    let assigned=0;for(let k=0;k<4;k++)if(o.skeleton.bones[si.getComponent(i,k)].name===part)assigned+=sw.getComponent(i,k);
    if(assigned>.75)probes.push({mesh:o,index:i,part});
   }
  }
 });
 const a=new Athlete(1);a.attachModel(scene);
 try{
  a.update({characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'forehand',swing:0},0);
  const controls=a as unknown as {elbows:Object3D[];racket:Object3D;generated:{update(dt?:number):void}};
  // Retargeting is canonical; left-hand reflection occurs only after skinning.
  a.root.scale.x=1;a.root.updateMatrixWorld(true);controls.generated.update();
  const capture=(p:typeof probes[number])=>{
   p.mesh.skeleton.update();
   return scene.getObjectByName(p.part)!.worldToLocal(p.mesh.localToWorld(p.mesh.getVertexPosition(p.index,new Vector3())));
  };
  assert.ok(probes.length>20);
  for(const p of probes)p.initial=capture(p);
  for(const angle of [.4,.9,1.4,2]){
   controls.elbows.forEach(e=>e.rotation.x=angle);controls.racket.rotation.z=angle*.4;
   a.root.updateMatrixWorld(true);controls.generated.update();a.root.updateMatrixWorld(true);
   for(const p of probes)assert.ok(capture(p).distanceTo(p.initial!)<.001,`${id}/${p.part}/${p.index}: shaft deformation`);
  }
 }finally{disposeTree(a.root);}
});

for(const id of ids)test(`${id}: run, both rescue recoveries and celebration retain fixed joints and bounded skin`,async()=>{
 for(const seat of [0,1] as const){
  const {scene}=await model(`releases/joint-pivot-v1/${id}`),a=new Athlete(seat);a.attachModel(scene);
  try{
   for(const action of ['run','step-out','supported-fall','victory'] as const)for(let i=0;i<=36;i++){
    const t=i/36,sign=seat===0?-1:1;
    const p:PlayerState={characterId:id,x:action==='run'?t*2:0,z:0,tx:0,tz:0,stamina:1,moving:action==='run',stroke:'forehand',swing:0};
    if(action==='step-out'||action==='supported-fall')p.rescue={startedAt:0,fromX:0,toX:1.2,fromZ:0,toZ:0,contact:{x:-.65*sign*handedness(id),y:1.2,z:.65*sign},hit:t>.3,stroke:'forehand',recovery:action};
    a.update(p,t*1.18,1.18/36,action==='victory'?t*5.2:undefined);
    const at=(n:string)=>scene.getObjectByName(n)!.getWorldPosition(new Vector3());
    for(const s of ['L','R']){
     assert.ok(Math.abs(at(`UpperArm_${s}`).distanceTo(at(`LowerArm_${s}`))-.36)<1e-7);
     assert.ok(Math.abs(at(`LowerArm_${s}`).distanceTo(at(`Hand_${s}`))-.256)<1e-7);
    }
    if(i%6===0)scene.traverse(o=>{
     if(!(o instanceof SkinnedMesh))return;
     o.skeleton.update();const pos=o.geometry.attributes.position,ix=o.geometry.index!;
     const vertices=Array.from({length:pos.count},(_,i)=>o.getVertexPosition(i,new Vector3()));
     for(let j=0;j<ix.count;j+=3)for(let k=0;k<3;k++){
      const u=ix.getX(j+k),v=ix.getX(j+(k+1)%3);
      const rest=new Vector3().fromBufferAttribute(pos,u).distanceTo(new Vector3().fromBufferAttribute(pos,v));
      assert.ok(vertices[u].distanceTo(vertices[v])<Math.max(.15,rest*5),`${id}/${action}/${t}: skin ${u}/${v}`);
     }
    });
   }
  }finally{disposeTree(a.root);}
 }
});
