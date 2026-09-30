/** Lossless appearance migration: append joints/weights, never re-export mesh or images.
 * node --import tsx scripts/assets/upgrade-rig.ts [athlete characters/noah ...]
 * Inputs are immutable local legacy snapshots; output is deterministic and repeatable.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname} from 'node:path';
import {Matrix4,Quaternion,Vector3} from 'three';
const base='artifacts/reference-motion-2026-09-29';
const ids=process.argv.slice(2);
const variants=ids.length?ids:['athlete',...['mei','rafa','sora','ines','leo','noah','adrian','luca','wuming'].map(n=>`characters/${n}`)];
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const reports=[];
for(const id of variants){
 const input=`${base}/legacy-models/${id}.glb`,output=`public/models/${id}.glb`;
 if(!existsSync(input)){
  mkdirSync(dirname(input),{recursive:true});
  writeFileSync(input,execFileSync('git',['show',`4699074:${output}`],{maxBuffer:8*1024*1024}));
 }
 const raw=readFileSync(input);
 const jl=raw.readUInt32LE(12),j=JSON.parse(raw.toString('utf8',20,20+jl)),original=raw.subarray(28+jl,28+jl+j.buffers[0].byteLength);
 if(j.skins.length!==1||j.skins[0].joints.length!==16)throw Error(`${id}: expected untouched 16-joint input`);
 let bin=Buffer.from(original);
 const components:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
 const bytes:Record<number,number>={5121:1,5123:2,5125:4,5126:4};
 const read=(index:number)=>{
  const a=j.accessors[index],v=j.bufferViews[a.bufferView],n=components[a.type],size=bytes[a.componentType];
  if(a.sparse||!size||a.normalized)throw Error('unsupported sparse/normalized input');
  return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>{
   const offset=(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??n*size)+k*size;
   return a.componentType===5126?bin.readFloatLE(offset):bin.readUIntLE(offset,size);
  }));
 };
 const append=(rows:number[][],type:string,componentType=5126)=>{
  const n=components[type],size=bytes[componentType],pad=(4-bin.length%4)%4;
  const data=Buffer.alloc(rows.length*n*size);
  rows.forEach((row,i)=>row.forEach((x,k)=>componentType===5126?data.writeFloatLE(x,(i*n+k)*size):data.writeUIntLE(x,(i*n+k)*size,size)));
  const view=j.bufferViews.length;j.bufferViews.push({buffer:0,byteOffset:bin.length+pad,byteLength:data.length});
  bin=Buffer.concat([bin,Buffer.alloc(pad),data]);
  const a=j.accessors.length;j.accessors.push({bufferView:view,componentType,count:rows.length,type});return a;
 };
 const worlds=new Map<number,Matrix4>(),parents=new Map<number,number>();
 const local=(n:any)=>n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3().fromArray(n.translation??[0,0,0]),new Quaternion().fromArray(n.rotation??[0,0,0,1]),new Vector3().fromArray(n.scale??[1,1,1]));
 const visit=(i:number,m:Matrix4)=>{const w=m.clone().multiply(local(j.nodes[i]));worlds.set(i,w);for(const c of j.nodes[i].children??[]){parents.set(c,i);visit(c,w);}};
 for(const i of j.scenes[j.scene??0].nodes)visit(i,new Matrix4());
 const skin=j.skins[0],oldBind=read(skin.inverseBindMatrices);
 const node=(name:string)=>{const i=j.nodes.findIndex((n:any)=>n.name===name);if(i<0)throw Error(`missing ${name}`);return i;};
 const setLocal=(i:number,m:Matrix4)=>{
  const p=new Vector3(),q=new Quaternion(),s=new Vector3();m.decompose(p,q,s);
  delete j.nodes[i].matrix;Object.assign(j.nodes[i],{translation:p.toArray(),rotation:q.toArray(),scale:s.toArray()});
 };
 const add=(name:string,parent:number,world:Matrix4,children:number[]=[])=>{
  const i=j.nodes.length;j.nodes.push({name,children:[]});worlds.set(i,world);setLocal(i,worlds.get(parent)!.clone().invert().multiply(world));
  (j.nodes[parent].children??=[]).push(i);
  for(const c of children){
   const prev=parents.get(c)!;j.nodes[prev].children=j.nodes[prev].children.filter((n:number)=>n!==c);
   j.nodes[i].children.push(c);setLocal(c,world.clone().invert().multiply(worlds.get(c)!));
  }
  skin.joints.push(i);oldBind.push(world.clone().invert().elements);return i;
 };
 const chest=add('Chest',node('Spine'),new Matrix4().makeTranslation(0,1.25,0),[node('Neck')]);
 for(const suffix of ['L','R']){
  const sign=suffix==='L'?1:-1;
  add(`Clavicle_${suffix}`,chest,new Matrix4().makeTranslation(sign*.12,1.39,0),[node(`UpperArm_${suffix}`)]);
  const foot=worlds.get(node(`Foot_${suffix}`))!,pos=new Vector3().setFromMatrixPosition(foot).add(new Vector3(0,-.035,.11));
  add(`Toe_${suffix}`,node(`Foot_${suffix}`),foot.clone().setPosition(pos));
 }
 const joint=(name:string)=>skin.joints.indexOf(node(name));
 const meshNodes=new Map<number,number>();j.nodes.forEach((n:any,i:number)=>{if(n.mesh!==undefined)meshNodes.set(n.mesh,i);});
 const beforeAppearance=JSON.stringify({materials:j.materials,images:j.images,textures:j.textures,samplers:j.samplers});
 for(let mi=0;mi<j.meshes.length;mi++)for(const prim of j.meshes[mi].primitives){
  const attr=prim.attributes;if(attr.JOINTS_0===undefined)continue;
  const positions=read(attr.POSITION),indices=read(attr.JOINTS_0),weights=read(attr.WEIGHTS_0),resultI:number[][]=[],resultW:number[][]=[];
  for(let v=0;v<positions.length;v++){
   const p=new Vector3().fromArray(positions[v]).applyMatrix4(worlds.get(meshNodes.get(mi)!)!);
   const w=new Map<number,number>();indices[v].forEach((n,k)=>w.set(n,(w.get(n)??0)+weights[v][k]));
   const transfer=(from:string,to:string,mix:number)=>{const a=joint(from),b=joint(to),amount=(w.get(a)??0)*mix;w.set(a,(w.get(a)??0)-amount);w.set(b,(w.get(b)??0)+amount);};
   transfer('Spine','Chest',smooth(1.06,1.40,p.y));
   for(const suffix of ['L','R']){
    const side=suffix==='L'?1:-1;
    const shoulder=smooth(.18,.29,p.x*side)*(1-smooth(.32,.48,p.x*side))*smooth(1.22,1.38,p.y)*(1-smooth(1.46,1.58,p.y))*.60;
    for(const from of ['Spine','Chest',`UpperArm_${suffix}`])transfer(from,`Clavicle_${suffix}`,shoulder);
    transfer(`Foot_${suffix}`,`Toe_${suffix}`,smooth(.055,.19,p.z)*(1-smooth(.14,.22,p.y)));
   }
   const sorted=[...w].filter(([,x])=>x>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((s,[,x])=>s+x,0);
   if(sum<.99)throw Error(`${id}: excessive influence truncation at ${v}: ${sum}`);
   while(sorted.length<4)sorted.push([0,0]);
   resultI.push(sorted.map(([i])=>i));resultW.push(sorted.map(([,x])=>x/sum));
  }
  attr.JOINTS_0=append(resultI,'VEC4',5123);attr.WEIGHTS_0=append(resultW,'VEC4');
 }
 skin.inverseBindMatrices=append(oldBind,'MAT4');
 j.buffers[0].byteLength=bin.length;j.asset.extras={...j.asset.extras,rigSchema:'tennis-21-v1'};
 const json=Buffer.from(JSON.stringify(j)),jp=Buffer.alloc((4-json.length%4)%4,32),bp=Buffer.alloc((4-bin.length%4)%4);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+jp.length+bin.length+bp.length,8);header.writeUInt32LE(json.length+jp.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length+bp.length,0);bh.writeUInt32LE(0x004e4942,4);
 const out=Buffer.concat([header,json,jp,bh,bin,bp]);
 if(!bin.subarray(0,original.length).equals(original)||beforeAppearance!==JSON.stringify({materials:j.materials,images:j.images,textures:j.textures,samplers:j.samplers}))throw Error('appearance data changed');
 writeFileSync(output,out);
 reports.push({id,input,output,sourceHash:hash(raw),outputHash:hash(out),originalPayloadHash:hash(original),appearancePayloadUnchanged:true,joints:skin.joints.map((i:number)=>j.nodes[i].name)});
 console.log(`${id}: 16 -> ${skin.joints.length}, geometry/UV/texture bytes preserved`);
}
mkdirSync(`${base}/rig`,{recursive:true});writeFileSync(`${base}/rig/migration-${ids.length?'prototype':'all'}.json`,JSON.stringify(reports,null,2)+'\n');
if(!ids.length){
 writeFileSync('assets/athlete/control-rig-manifest.json',JSON.stringify({schema:'tennis-21-v1',externalCredits:0,models:reports},null,2)+'\n');
 const path='assets/characters/wuming/provenance.json',provenance=JSON.parse(readFileSync(path,'utf8'));
 provenance.rigMigration={schema:'tennis-21-v1',sourceSha256:reports.find(r=>r.id==='athlete')!.outputHash,modelSha256:reports.find(r=>r.id==='characters/wuming')!.outputHash,manifest:'assets/athlete/control-rig-manifest.json',editable:'assets/characters/wuming/athlete-control-rig.blend'};
 writeFileSync(path,JSON.stringify(provenance,null,2)+'\n');
}
