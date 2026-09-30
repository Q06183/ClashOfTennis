import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SkinnedMesh,Vector3,Box3} from 'three';
import {model} from './helpers/athlete-model.js';
import {Athlete} from '../src/render/player.js';

for(const name of ['bob','saba'])test(`${name}: direct binding preserves all original appearance bytes and bind pose`,async()=>{
  const source=await readFile(`artifacts/bob-saba-2026-09-30/original/${name}_glb.glb`);
  const target=await readFile(`public/models/characters/${name}.glb`);
  const parse=(b:Buffer)=>{const n=b.readUInt32LE(12);return {json:JSON.parse(b.toString('utf8',20,20+n)),bin:b.subarray(28+n)};};
  const a=parse(source),b=parse(target);
  assert.ok(b.bin.subarray(0,a.json.buffers[0].byteLength).equals(a.bin.subarray(0,a.json.buffers[0].byteLength)));
  for(const field of ['materials','images','textures','samplers'])assert.deepEqual(b.json[field],a.json[field]);
  const old=a.json.meshes[0].primitives[0],current=b.json.meshes[0].primitives[0];
  assert.equal(current.indices,old.indices);
  for(const [key,value] of Object.entries(old.attributes))assert.equal(current.attributes[key],value);
  const {scene}=await model(`characters/${name}`);scene.updateMatrixWorld(true);
  let count=0;
  scene.traverse(o=>{
    if(!(o instanceof SkinnedMesh))return;
    o.skeleton.update();
    const p=o.geometry.attributes.position,w=o.geometry.attributes.skinWeight;
    for(let i=0;i<p.count;i++){
      assert.ok(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-6);
      const original=new Vector3().fromBufferAttribute(p,i);
      assert.ok(o.getVertexPosition(i,new Vector3()).distanceTo(original)<2e-7);
    }
    count++;
  });
  assert.equal(count,1);
  assert.equal(scene.userData.directOriginalRig.schema,'direct-original-v1');
});

for(const name of ['bob','saba'])test(`${name}: original rig follows actual match controls, stays grounded and finite`,async()=>{
  const {scene}=await model(`characters/${name}`),athlete=new Athlete(1);
  athlete.attachModel(scene);
  const rest=new Map<string,Vector3>();
  scene.traverse(o=>{if(o.type==='Bone')rest.set(o.name,o.getWorldPosition(new Vector3()));});
  let moved=false;
  for(const stroke of ['forehand','backhand','serve','volley','smash','slice-backhand'] as const){
    for(let frame=0;frame<=45;frame++){
      const t=frame/30,contact={x:stroke.includes('backhand')?.65:-.65,y:stroke==='serve'||stroke==='smash'?2.65:1.2,z:.65};
      athlete.update({x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,shotQueued:true,
        preparation:t<1?{stroke,progress:t,contact}:undefined,
        swing:t>=1?(stroke==='serve'?.72:.44)*(2-t):0,contact},t,1/30);
      athlete.root.updateMatrixWorld(true);
      const bounds=new Box3();
      scene.traverse(o=>{
        if(o instanceof SkinnedMesh){o.skeleton.update();o.computeBoundingBox();bounds.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));}
      });
      const size=bounds.getSize(new Vector3());
      assert.ok(size.toArray().every(Number.isFinite));
      assert.ok(size.y>1.45&&size.y<3,`${name} ${stroke} ${frame}: ${size.toArray()}`);
      assert.ok(size.x<3&&size.z<3);
      assert.ok(bounds.min.y>-.14,`${name} ${stroke} feet: ${bounds.min.y}`);
      const hand=scene.getObjectByName('Hand_R')!.getWorldPosition(new Vector3());
      const grip=athlete.root.getObjectByName('racket-grip')!.getWorldPosition(new Vector3());
      const profile=scene.userData.directOriginalRig;
      const def=profile.joints.find((j:{name:string})=>j.name==='Hand_R');
      const palm=new Vector3().fromArray(profile.palmCenter);palm.x*=-1;
      // Bone position is the wrist; compare the calibrated palm point, not an
      // arbitrary maximum wrist-to-grip distance that varies with hand size.
      const palmRaw=palm.sub(new Vector3().fromArray(def.at)).divideScalar(profile.scale);
      const actualPalm=scene.getObjectByName('Hand_R')!.localToWorld(palmRaw);
      assert.ok(actualPalm.distanceTo(grip)<2e-5,`${name} palm detached from racket: ${actualPalm.distanceTo(grip)}`);
      for(const side of ['L','R']){
        const segment=profile.joints.find((j:{name:string})=>j.name===`LowerArm_${side}`);
        const axis=new Vector3().fromArray(segment.tail).sub(new Vector3().fromArray(segment.at)).divideScalar(profile.scale);
        const endpoint=scene.getObjectByName(`LowerArm_${side}`)!.localToWorld(axis);
        const wrist=scene.getObjectByName(`Hand_${side}`)!.getWorldPosition(new Vector3());
        assert.ok(endpoint.distanceTo(wrist)<2e-5,`${name} wrist skin joints separate at ${stroke}/${frame}`);
      }
      moved||=hand.distanceTo(rest.get('Hand_R')!)>.15;
    }
  }
  assert.ok(moved);
});
