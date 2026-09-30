import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bone, BoxGeometry, Group, MeshStandardMaterial, Skeleton, SkinnedMesh} from 'three';
import {AthleteWardrobe} from '../src/render/athlete-wardrobe.js';

function fixture(){
  const root=new Group();root.userData.wardrobe={character:'bob',rig:'bob-rig-v1'};
  const bone=new Bone();bone.name='Hips';root.add(bone);
  const skeleton=new Skeleton([bone]);
  const make=(name:string,metadata:Record<string,string>)=>{
    const mesh=new SkinnedMesh(new BoxGeometry(),new MeshStandardMaterial());
    mesh.name=name;mesh.userData={...metadata,character:'bob',rig:'bob-rig-v1'};
    root.add(mesh);mesh.bind(skeleton);return mesh;
  };
  const body=make('Body',{role:'body'});
  const original=make('Polo',{role:'garment',outfit:'reference',slot:'top'});
  const training=make('TrainingTop',{role:'garment',outfit:'training',slot:'top'});
  const shoes=make('Shoes',{role:'garment',outfit:'shared',slot:'shoes'});
  return {root,body,original,training,shoes};
}

test('wardrobe swaps separate meshes without hiding or replacing body and common skeleton',()=>{
  const {root,body,original,training,shoes}=fixture();
  const wardrobe=new AthleteWardrobe(root);
  assert.deepEqual(wardrobe.outfits,['reference','training']);
  assert.equal(original.visible,true);assert.equal(training.visible,false);
  const skeleton=body.skeleton;
  wardrobe.setOutfit('training');
  assert.equal(original.visible,false);assert.equal(training.visible,true);
  assert.equal(body.visible,true);assert.equal(shoes.visible,true);
  assert.equal(body.skeleton,skeleton);assert.equal(training.skeleton,skeleton);
  wardrobe.setOutfit('reference');
  assert.equal(original.visible,true);assert.equal(training.visible,false);
});

test('invalid outfit leaves current outfit and visibility unchanged',()=>{
  const {root,original,training}=fixture();const wardrobe=new AthleteWardrobe(root);
  assert.throws(()=>wardrobe.setOutfit('unknown'),/Unknown outfit/);
  assert.equal(wardrobe.currentOutfit,'reference');
  assert.equal(original.visible,true);assert.equal(training.visible,false);
});

test('wardrobe rejects incompatible garments before changing visibility',()=>{
  const {root,training}=fixture();training.userData.rig='other-rig';
  assert.throws(()=>new AthleteWardrobe(root),/incompatible/i);
  assert.equal(training.visible,true);
});

test('wardrobe rejects separate bone identities despite matching labels',()=>{
  const {root,training}=fixture();const alien=new Bone();alien.name='Hips';
  training.bind(new Skeleton([alien]));
  assert.throws(()=>new AthleteWardrobe(root),/skeleton/i);
});

test('individual outfit slots and shared accessories can be toggled reversibly',()=>{
  const {root,body,original,training,shoes}=fixture();const wardrobe=new AthleteWardrobe(root);
  wardrobe.setSlotVisible('top',false);
  assert.equal(original.visible,false);assert.equal(training.visible,false);
  wardrobe.setOutfit('training');assert.equal(training.visible,false);
  wardrobe.setSlotVisible('top',true);assert.equal(training.visible,true);
  wardrobe.setSlotVisible('shoes',false);assert.equal(shoes.visible,false);
  assert.equal(body.visible,true);
  assert.throws(()=>wardrobe.setSlotVisible('missing',false),/Unknown slot/);
});

test('covered body sections reappear when their garment slot is removed',()=>{
  const {root,body,original}=fixture();
  const patch=body.clone();patch.name='CoveredTorso';patch.userData={...body.userData,coveredBy:['top']};
  root.add(patch);
  const wardrobe=new AthleteWardrobe(root);
  assert.equal(patch.visible,false);assert.equal(body.visible,true);
  wardrobe.setSlotVisible('top',false);
  assert.equal(original.visible,false);assert.equal(patch.visible,true);
  wardrobe.setOutfit('training');assert.equal(patch.visible,true);
  wardrobe.setSlotVisible('top',true);assert.equal(patch.visible,false);
});

test('body coverage metadata rejects nonexistent slots instead of creating holes',()=>{
  const {root,body}=fixture();body.userData.coveredBy=['unknown'];
  assert.throws(()=>new AthleteWardrobe(root),/coverage/i);
});
