import {SERVE_RECOVERY} from '../src/simulation/serve-motion.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {model} from './helpers/athlete-model.js';
import {Box3,SkinnedMesh,Vector3,Quaternion,type BufferAttribute,type InterleavedBufferAttribute} from 'three';
import {disposeTree} from '../src/render/dispose.js';
import {Athlete} from '../src/render/player.js';
const variants=['athlete','characters/mei','characters/rafa','characters/sora','characters/ines','characters/leo','characters/noah','characters/adrian','characters/luca','characters/wuming'];

for(const id of variants)test(`generated ${id} loads a real skin and animates without missing weights or explosive bounds`,async()=>{
  const gltf=await model(id),a=new Athlete(0);a.attachModel(gltf.scene);
  assert.equal(a.modelSource,'lux3d');
  a.root.traverse(o=>{if(o instanceof SkinnedMesh){const p=o.geometry.attributes.position,w=o.geometry.attributes.skinWeight;for(let i=0;i<p.count;i++){const sum=w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i);assert.ok(Math.abs(sum-1)<1e-5);if(Math.abs(p.getX(i))<.2&&p.getY(i)<1.2){const joints:BufferAttribute|InterleavedBufferAttribute=o.geometry.attributes.skinIndex;for(let k=0;k<4;k++)if(w.getComponent(i,k)>.001)assert.ok(!/Arm|Hand/.test(o.skeleton.bones[joints.getComponent(i,k)].name),'arm weights must not pull torso or shorts');}}}});
  const characterId=id==='athlete'?'lin':id.split('/')[1];
  for(const stroke of ['forehand','backhand','serve','volley','smash','slice-forehand','slice-backhand','lob'] as const)for(const frame of stroke==='serve'?[0,.32,.52,.64,.8,.9,.99,1,1.14,1.34,1.52,1.7]:[0,.32,.52,.64,.85,.99,1,1.14,1.34]){
    const swing=frame>=1?(stroke==='serve'?SERVE_RECOVERY:.44)-(frame-1):0,contact={x:1.3,y:stroke==='serve'||stroke==='smash'?2.65:1.2,z:9.8};
    a.update({characterId,x:1,z:10,tx:1,tz:10,stamina:1,moving:false,stroke,swing,contact,shotQueued:true,preparation:frame<1?{stroke,progress:frame,contact}:undefined},1);
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


for(const id of variants)test(`running ${id} skin stays grounded and bounded through side runs, backpedal, and cuts`,async()=>{
  const {scene}=await model(id),a=new Athlete(1);a.attachModel(scene);
  const p={characterId:id==='athlete'?'lin':id.split('/')[1],x:0,z:-9,tx:0,tz:-9,stamina:1,moving:true,stroke:'forehand' as const,swing:0};
  let frame=0;
  for(const [vx,vz] of [[4,0],[-4,0],[0,3],[0,-3],[0,0]])for(let i=0;i<45;i++){
    p.x+=vx/60;p.z+=vz/60;a.update(p,++frame/60,1/60);a.root.updateMatrixWorld(true);
    const box=new Box3();a.root.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));}});
    const size=box.getSize(new Vector3());
    assert.ok(box.min.y>-.12&&box.min.y<.28,`feet leave ground during ${vx}/${vz}: ${box.min.y}`);
    assert.ok(size.y>1.5&&size.y<2.2&&size.x<2&&size.z<2,`running skin bounds ${size.toArray()}`);
    for(const foot of ['foot-0','foot-1']){
      const ankle=a.root.getObjectByName(foot)!;
      const up=new Vector3(0,1,0).applyQuaternion(ankle.getWorldQuaternion(new Quaternion()));
      assert.ok(up.y>.999,'support/swing soles must not inherit knee rotation');
    }
  }
});

test('all generated characters stay finite and bounded through rescue leap and landing',async()=>{
 const {moveRescue,RESCUE}=await import('../src/simulation/rescue.js');
 for(const id of variants){
  const {scene}=await model(id),a=new Athlete(0);a.attachModel(scene);
  const p:import('../src/simulation/types.js').PlayerState={characterId:id==='athlete'?'lin':id.split('/')[1],x:0,z:10,tx:1.5,tz:10,stamina:.8,moving:true,stroke:'forehand',swing:0,rescue:{startedAt:0,fromX:0,fromZ:10,toX:1.5,toZ:10.4,hit:false,contact:{x:2.1,y:1,z:10}}};
  for(let i=1;i<=Math.ceil((RESCUE.duration+.1)*60);i++){
   moveRescue(p,i/60,1/60);a.update(p,i/60,1/60);a.root.updateMatrixWorld(true);
   if(i%5)continue;
   const box=new Box3();a.root.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));}});
   const size=box.getSize(new Vector3());assert.ok(size.toArray().every(Number.isFinite));assert.ok(size.x<3&&size.y>1&&size.y<3&&size.z<3,`${id}: ${size.toArray()}`);assert.ok(box.min.y>-.2);
  }
  assert.equal(p.rescue,undefined);assert.equal(a.root.position.y,0);disposeTree(a.root);
 }
});
