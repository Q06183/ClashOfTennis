import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export async function model(id='athlete'){
  const raw=await readFile(new URL(`../../public/models/${id}.glb`,import.meta.url));
  const length=raw.readUInt32LE(12),json=JSON.parse(raw.toString('utf8',20,20+length));
  // Keep actual mesh/skin/bind matrices; omit image decoding in this Node test.
  json.materials=[{pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}];
  delete json.images;delete json.textures;delete json.samplers;
  for(const m of json.meshes)for(const p of m.primitives)p.material=0;
  const text=Buffer.from(JSON.stringify(json)),pad=(4-text.length%4)%4,j=Buffer.concat([text,Buffer.alloc(pad,32)]);
  const bin=raw.subarray(20+length),out=Buffer.alloc(20+j.length+bin.length);raw.copy(out,0,0,12);out.writeUInt32LE(out.length,8);out.writeUInt32LE(j.length,12);out.writeUInt32LE(0x4e4f534a,16);j.copy(out,20);bin.copy(out,20+j.length);
  return new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');
}
