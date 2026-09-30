import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Athlete} from '../src/render/player.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3,SkinnedMesh} from 'three';

const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
test('all ten preserve original geometry/image bytes and recorded source identity',async()=>{
 const manifest=JSON.parse(await readFile('assets/athlete/control-rig-manifest.json','utf8'));
 for(const entry of manifest.models){
  const raw=await readFile(entry.output),jl=raw.readUInt32LE(12),j=JSON.parse(raw.toString('utf8',20,20+jl));
  const original=execFileSync('git',['show',`4699074:${entry.output}`],{maxBuffer:8*1024*1024});
  assert.equal(hash(original),entry.sourceHash);
  const ol=original.readUInt32LE(12),o=JSON.parse(original.toString('utf8',20,20+ol));
  const bin=raw.subarray(28+jl),old=original.subarray(28+ol,28+ol+o.buffers[0].byteLength);
  assert.deepEqual(bin.subarray(0,old.length),old,'original mesh/UV/image buffer bytes changed');
  for(const field of ['materials','textures','images','samplers'])assert.deepEqual(j[field],o[field]);
  for(let m=0;m<o.meshes.length;m++)for(let p=0;p<o.meshes[m].primitives.length;p++){
   const a=o.meshes[m].primitives[p],b=j.meshes[m].primitives[p];
   assert.equal(a.indices,b.indices);
   for(const key of Object.keys(a.attributes).filter(k=>!k.startsWith('JOINTS')&&!k.startsWith('WEIGHTS')))
    assert.deepEqual(j.accessors[b.attributes[key]],o.accessors[a.attributes[key]]);
  }
  assert.equal(hash(raw),entry.outputHash);
 }
});

test('historical 16-bone skin still loads and follows the control rig',async()=>{
 const raw=execFileSync('git',['show','4699074:public/models/athlete.glb'],{maxBuffer:8*1024*1024});
 const jl=raw.readUInt32LE(12),j=JSON.parse(raw.toString('utf8',20,20+jl));
 // No image decoder in Node; all actual geometry/weights/bind matrices remain.
 delete j.images;delete j.textures;delete j.samplers;j.materials=[{}];
 for(const m of j.meshes)for(const p of m.primitives)p.material=0;
 const text=Buffer.from(JSON.stringify(j)),json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);
 const header=Buffer.from(raw.subarray(0,20)),bin=raw.subarray(20+jl);
 header.writeUInt32LE(20+json.length+bin.length,8);header.writeUInt32LE(json.length,12);
 const buffer=Buffer.concat([header,json,bin]);
 const {scene}=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.length),'');
 const a=new Athlete(1);a.attachModel(scene);
 for(const stroke of ['forehand','backhand','serve'] as const)for(const progress of [.2,.6,1]){
  const contact={x:stroke==='backhand'?.65:-.65,y:stroke==='serve'?2.65:1.2,z:.65};
  a.update({x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,swing:0,shotQueued:true,preparation:{stroke,progress,contact}},progress);
  const box=new Box3();scene.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox!);}});
  assert.ok(Number.isFinite(box.max.y)&&box.max.y<3.5&&box.min.y>-.25);
 }
});
