import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3,SkinnedMesh,Vector3,type BufferAttribute,type InterleavedBufferAttribute} from 'three';
import {disposeTree} from '../src/render/dispose.js';
import {Athlete} from '../src/render/player.js';
async function model(){
  const raw=await readFile(new URL('../public/models/athlete.glb',import.meta.url));
  const length=raw.readUInt32LE(12),json=JSON.parse(raw.toString('utf8',20,20+length));
  // Keep actual mesh/skin/bind matrices; omit image decoding in this Node test.
  json.materials=[{pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}];
  delete json.images;delete json.textures;delete json.samplers;
  for(const m of json.meshes)for(const p of m.primitives)p.material=0;
  const text=Buffer.from(JSON.stringify(json)),pad=(4-text.length%4)%4,j=Buffer.concat([text,Buffer.alloc(pad,32)]);
  const bin=raw.subarray(20+length),out=Buffer.alloc(20+j.length+bin.length);raw.copy(out,0,0,12);out.writeUInt32LE(out.length,8);out.writeUInt32LE(j.length,12);out.writeUInt32LE(0x4e4f534a,16);j.copy(out,20);bin.copy(out,20+j.length);
  return new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');
}
test('generated athlete loads a real skin and animates without missing weights or explosive bounds',async()=>{
  const gltf=await model(),a=new Athlete(0);a.attachModel(gltf.scene);
  assert.equal(a.modelSource,'lux3d');
  a.root.traverse(o=>{if(o instanceof SkinnedMesh){const p=o.geometry.attributes.position,w=o.geometry.attributes.skinWeight;for(let i=0;i<p.count;i++){const sum=w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i);assert.ok(Math.abs(sum-1)<1e-5);if(Math.abs(p.getX(i))<.2&&p.getY(i)<1.2){const joints:BufferAttribute|InterleavedBufferAttribute=o.geometry.attributes.skinIndex;for(let k=0;k<4;k++)if(w.getComponent(i,k)>.001)assert.ok(!/Arm|Hand/.test(o.skeleton.bones[joints.getComponent(i,k)].name),'arm weights must not pull torso or shorts');}}}});
  for(const stroke of ['forehand','backhand','serve','volley'] as const)for(const frame of [0,.32,.52,.64,.85,.99,1,1.14,1.34]){
    const swing=frame>=1?1.44-frame:0,contact={x:1.3,y:stroke==='serve'?2.65:1.2,z:9.8};
    a.update({x:1,z:10,tx:1,tz:10,stamina:1,moving:false,stroke,swing,contact,shotQueued:true,preparation:frame<1?{stroke,progress:frame,contact}:undefined},1);
    a.root.updateMatrixWorld(true);
    let skins=0;const box=new Box3();
    a.root.traverse(o=>{if(o instanceof SkinnedMesh){skins++;o.skeleton.update();o.computeBoundingBox();
      const pos=o.geometry.attributes.position,idx=o.geometry.index!;
      for(let i=0;i<idx.count;i+=3)for(let edge=0;edge<3;edge++){
        const u=idx.getX(i+edge),v=idx.getX(i+(edge+1)%3),from=new Vector3().fromBufferAttribute(pos,u),to=new Vector3().fromBufferAttribute(pos,v);
        const before=from.distanceTo(to);o.applyBoneTransform(u,from);o.applyBoneTransform(v,to);
        assert.ok(from.distanceTo(to)<Math.max(.15,before*5),`stretched mesh edge ${stroke} ${swing} ${u}/${v}: ${before} -> ${from.distanceTo(to)}`);
      }
      box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));}});
    assert.ok(skins>0);const size=box.getSize(new Vector3());assert.ok(size.y>1.6&&size.y<3,`${stroke} ${swing}: ${size.toArray()}`);
    assert.ok(size.x<3&&size.z<3);assert.ok(box.min.y>-.25,'feet should remain near ground');
  }
});

test('generated skin disposal releases shared PBR textures and each skeleton exactly once',async()=>{
  const {scene}=await model();let mesh:SkinnedMesh;scene.traverse(o=>{if(o instanceof SkinnedMesh)mesh=o;});
  const {Texture,MeshStandardMaterial}=await import('three');const map=new Texture(),pbr=new Texture();
  mesh!.material=new MeshStandardMaterial({map,roughnessMap:pbr,metalnessMap:pbr});mesh!.skeleton.computeBoneTexture();
  const counts={map:0,pbr:0,bone:0};map.addEventListener('dispose',()=>counts.map++);pbr.addEventListener('dispose',()=>counts.pbr++);mesh!.skeleton.boneTexture!.addEventListener('dispose',()=>counts.bone++);
  disposeTree(scene);assert.deepEqual(counts,{map:1,pbr:1,bone:1});
});
