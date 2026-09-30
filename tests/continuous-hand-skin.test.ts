import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SkinnedMesh,Vector3,Quaternion,Matrix4} from 'three';
import {model} from './helpers/athlete-model.js';
import {Athlete} from '../src/render/player.js';
import {handSkinPose} from '../src/render/hand-skin-pose.js';

const glb=async(path:string)=>{
 const b=await readFile(path),l=b.readUInt32LE(12),j=JSON.parse(b.toString('utf8',20,20+l));
 return {j,bin:b.subarray(28+l)};
};
const accessor=(g:Awaited<ReturnType<typeof glb>>,i:number)=>{
 const a=g.j.accessors[i],v=g.j.bufferViews[a.bufferView];
 return g.bin.subarray((v.byteOffset??0)+(a.byteOffset??0),(v.byteOffset??0)+v.byteLength);
};
for(const id of ['lin','mei','noah'])test(`${id}: original textured arm/hand topology survives with no geometric replacement`,async()=>{
 const src=await glb(`public/models/${id==='lin'?'athlete':`characters/${id}`}.glb`);
 const dst=await glb(`public/models/prototypes/${id}.glb`);
 for(let m=0;m<src.j.meshes.length;m++)for(let p=0;p<src.j.meshes[m].primitives.length;p++){
  const a=src.j.meshes[m].primitives[p],b=dst.j.meshes[m].primitives[p];
  assert.ok(accessor(dst,b.indices).equals(accessor(src,a.indices)),'do not cut off skin at elbow or wrist');
  if(a.attributes.TEXCOORD_0!==undefined)assert.ok(accessor(dst,b.attributes.TEXCOORD_0).equals(accessor(src,a.attributes.TEXCOORD_0)),'keep skin UVs');
 }
 const {scene}=await model(`prototypes/${id}`),athlete=new Athlete(1);athlete.attachModel(scene);
 assert.equal(athlete.root.getObjectByName('articulated-hands'),undefined,'no lathe/sphere hand replacement');
 let handWeight=0;
 scene.traverse(o=>{if(o instanceof SkinnedMesh){
  const si=o.geometry.attributes.skinIndex,w=o.geometry.attributes.skinWeight;
  for(let i=0;i<w.count;i++)for(let k=0;k<4;k++)if(o.skeleton.bones[si.getComponent(i,k)].name==='Hand_R')handWeight+=w.getComponent(i,k);
 }});
 assert.ok(handWeight>30,'original skin must still deform with the actual hand bone');
});

test('grip frame maps anatomical thumb side toward throat without reversing left/right',()=>{
 const grip=new Matrix4().makeTranslation(0,0,0),elbow=new Matrix4().makeTranslation(0,.06,-.3);
 for(const side of ['L','R'] as const){
  const pose=handSkinPose(grip,elbow,side);
  const thumbDirection=new Vector3(0,0,side==='R'?1:-1).applyQuaternion(pose.rotation);
  assert.ok(thumbDirection.dot(new Vector3(0,-1,0))>0,'thumb/index side must face racket throat');
  const palmNormal=new Vector3(side==='R'?1:-1,0,0).applyQuaternion(pose.rotation);
  assert.ok(palmNormal.toArray().every(Number.isFinite));
 }
});

test('skin hand matrices stay continuous through groundstroke and serve paths',async()=>{
 const a=new Athlete(1);a.attachModel((await model('prototypes/lin')).scene);
 for(const stroke of ['forehand','backhand','serve'] as const){
  let previous:Quaternion[]|undefined;
  for(let i=0;i<=400;i++){
   const t=i/200,contact={x:stroke==='backhand'?.65:-.65,y:stroke==='serve'?2.65:1.2,z:.65};
   a.update({x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,shotQueued:true,contact,swing:t>=1?(stroke==='serve'?.72:.44)*(2-t):0,preparation:t<1?{stroke,progress:t,contact}:undefined},t,.005);
   const q=['Hand_L','Hand_R'].map(n=>a.root.getObjectByName(n)!.getWorldQuaternion(new Quaternion()));
   if(previous)for(let h=0;h<2;h++)assert.ok(q[h].angleTo(previous[h])<.35,`${stroke}/${t}/${h}: sudden wrist flip`);
   previous=q;
  }
 }
});
