import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

async function glb(path:string){
 const bytes=await readFile(path),length=bytes.readUInt32LE(12);
 return {bytes,json:JSON.parse(bytes.toString('utf8',20,20+length)),bin:bytes.subarray(28+length)};
}
test('black-gold derivative preserves every original geometry, joint and weight byte',async()=>{
 const source=await glb('public/models/athlete.glb'),target=await glb('public/models/characters/wuming.glb');
 assert.deepEqual(target.json.skins,source.json.skins);
 // Wuming has an extra image bufferView, so appended rig accessors have
 // different storage offsets. Compare the actual accessor payloads, not IDs.
 const payload=(g:Awaited<ReturnType<typeof glb>>,index:number)=>{
  const a=g.json.accessors[index],v=g.json.bufferViews[a.bufferView];
  return {type:a.type,count:a.count,componentType:a.componentType,bytes:g.bin.subarray((v.byteOffset??0)+(a.byteOffset??0),(v.byteOffset??0)+v.byteLength)};
 };
 for(let m=0;m<source.json.meshes.length;m++)for(let p=0;p<source.json.meshes[m].primitives.length;p++){
  const a=source.json.meshes[m].primitives[p],b=target.json.meshes[m].primitives[p];
  assert.deepEqual(payload(target,b.indices),payload(source,a.indices));
  for(const name of Object.keys(a.attributes))assert.deepEqual(payload(target,b.attributes[name]),payload(source,a.attributes[name]),name);
 }
 assert.deepEqual(payload(target,target.json.skins[0].inverseBindMatrices),payload(source,source.json.skins[0].inverseBindMatrices));
 assert.notEqual(target.json.images[0].bufferView,source.json.images[0].bufferView);
 assert.equal(target.json.images[0].mimeType,'image/png');
 assert.ok(target.json.materials.some((m:any)=>m.name==='wuming-sweatband-knit'));
 const portrait=await readFile('public/portraits/wuming.png');
 assert.equal(portrait.toString('hex',0,8),'89504e470d0a1a0a');
 assert.equal(portrait.readUInt32BE(16),256);assert.equal(portrait.readUInt32BE(20),320);
 const report=JSON.parse(await readFile('assets/characters/wuming/provenance.json','utf8'));
 assert.equal(report.rigMigration.sourceSha256,createHash('sha256').update(source.bytes).digest('hex'));
 assert.equal(report.rigMigration.modelSha256,createHash('sha256').update(target.bytes).digest('hex'));
});
