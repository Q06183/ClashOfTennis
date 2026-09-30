import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bone,SkinnedMesh,Vector3} from 'three';
import {model} from './helpers/athlete-model.js';
import {Athlete} from '../src/render/player.js';
import {disposeTree} from '../src/render/dispose.js';

for(const id of ['lin','mei','noah'])test(`${id}: calibrated limbs have coherent upper/lower and leg/torso ratios`,async()=>{
 const {scene}=await model(`prototypes/${id}`);scene.updateMatrixWorld(true);
 assert.equal(scene.userData.bodyProportionRevision,3);
 const hip=scene.getObjectByName('Hips')!.getWorldPosition(new Vector3());
 assert.ok(Math.abs(hip.y-.96)<.002,'hips must not remain at short-leg .85m baseline');
 for(const side of ['L','R']){
  const thigh=scene.getObjectByName('UpperLeg_'+side)!,knee=scene.getObjectByName('LowerLeg_'+side)!,foot=scene.getObjectByName('Foot_'+side)!;
  const l=thigh.getWorldPosition(new Vector3()).distanceTo(knee.getWorldPosition(new Vector3()));
  const r=knee.getWorldPosition(new Vector3()).distanceTo(foot.getWorldPosition(new Vector3()));
  assert.ok(l>.42&&l<.44&&r>.42&&r<.44,`${l}/${r}`);
 }
 const a=new Athlete(1);a.attachModel(scene);
 try{
  a.update({characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'forehand',swing:0},0);
  const grip=a.root.getObjectByName('racket-grip')!,elbow=grip.parent!,shoulder=elbow.parent!;
  assert.ok(Math.abs(shoulder.getWorldPosition(new Vector3()).distanceTo(elbow.getWorldPosition(new Vector3()))-.33)<1e-6);
  assert.ok(Math.abs(grip.getWorldPosition(new Vector3()).distanceTo(elbow.getWorldPosition(new Vector3()))-.34)<1e-6);
 }finally{disposeTree(a.root);}
});

test('upper-arm midshaft skin cannot be bent by lower-arm weights',async()=>{
 for(const id of ['lin','mei','noah']){
  const {scene}=await model(`prototypes/${id}`);scene.updateMatrixWorld(true);
  let samples=0;
  scene.traverse(o=>{
   if(!(o instanceof SkinnedMesh)||o.name.includes('sweatband'))return;
   const pos=o.geometry.attributes.position,si=o.geometry.attributes.skinIndex,sw=o.geometry.attributes.skinWeight;
   for(const side of ['L','R']){
    const start=scene.getObjectByName('UpperArm_'+side)!.getWorldPosition(new Vector3());
    const end=scene.getObjectByName('LowerArm_'+side)!.getWorldPosition(new Vector3()),axis=end.clone().sub(start);
    for(let i=0;i<pos.count;i++){
     const p=new Vector3().fromBufferAttribute(pos,i),u=p.clone().sub(start).dot(axis)/axis.lengthSq();
     const distance=p.distanceTo(start.clone().addScaledVector(axis,u));
     if(u<.28||u>.65||distance>.09)continue;
     let upper=0,lower=0;
     for(let k=0;k<4;k++){const name=o.skeleton.bones[si.getComponent(i,k)].name,w=sw.getComponent(i,k);if(name==='UpperArm_'+side)upper+=w;if(name==='LowerArm_'+side||name==='Hand_'+side)lower+=w;}
     if(upper>.5){samples++;assert.ok(lower<.03,`${id}/${side}/${i}: middle upper arm pulled by lower arm ${lower}`);}
    }
   }
  });
  assert.ok(samples>10,`${id}: no anatomical upper arm samples`);
  disposeTree(scene);
 }
});

test('calibrated upper-arm section centres track one straight humerus axis',async()=>{
 for(const id of ['lin','mei','noah']){
  const {scene}=await model(`prototypes/${id}`);scene.updateMatrixWorld(true);
  let checked=0;
  scene.traverse(o=>{
   if(!(o instanceof SkinnedMesh)||o.name.includes('sweatband'))return;
   const pos=o.geometry.attributes.position,si=o.geometry.attributes.skinIndex,sw=o.geometry.attributes.skinWeight;
   for(const side of ['L','R']){
    const a=scene.getObjectByName('UpperArm_'+side)!.getWorldPosition(new Vector3());
    const axis=scene.getObjectByName('LowerArm_'+side)!.getWorldPosition(new Vector3()).sub(a);
    for(const section of [.45,.6,.75]){
     const points:Vector3[]=[];
     for(let i=0;i<pos.count;i++){
      let weight=0;for(let k=0;k<4;k++)if(o.skeleton.bones[si.getComponent(i,k)].name==='UpperArm_'+side)weight+=sw.getComponent(i,k);
      const p=new Vector3().fromBufferAttribute(pos,i),u=p.clone().sub(a).dot(axis)/axis.lengthSq();
      if(weight>.85&&Math.abs(u-section)<.07)points.push(p.sub(a.clone().addScaledVector(axis,u)));
     }
     if(points.length<8)continue;
     const centre=points.reduce((sum,p)=>sum.add(p),new Vector3()).divideScalar(points.length);
     assert.ok(centre.length()<.035,`${id}/${side}/${section}: bowed upper-arm centre ${centre.length()}`);
     checked++;
    }
   }
  });
  assert.ok(checked>=2,`${id}: missing upper-arm cross sections`);disposeTree(scene);
 }
});

test('prototype dimensions reset when switching back to an unmodified character',async()=>{
 const a=new Athlete(1);a.attachModel((await model('prototypes/lin')).scene);
 a.clearModel();
 const grip=a.root.getObjectByName('racket-grip')!;
 assert.equal(grip.position.y,-.31);
 assert.equal(grip.parent!.position.y,-.36);
 assert.equal(a.root.getObjectByName('foot-0')!.position.y,-.37);
 disposeTree(a.root);
});

test('longer-leg prototypes keep actual skin above court through gait, strokes and rescue',async()=>{
 const {Box3}=await import('three');
 for(const id of ['lin','mei','noah'])for(const seat of [0,1] as const){
  const {scene}=await model(`prototypes/${id}`),a=new Athlete(seat);a.attachModel(scene);
  const sign=seat===0?-1:1,hand=id==='noah'?-1:1;
  try{
   for(const mode of ['run','forehand','backhand','serve','rescue'] as const)for(let i=0;i<=30;i++){
    const t=i/15,x=mode==='run'?t*2:0;
    const contact={x:x+(mode==='backhand'?.65:-.65)*sign*hand,y:mode==='serve'?2.65:1.2,z:.65*sign};
    const stroke=mode==='run'||mode==='rescue'?'forehand':mode;
    const p:import('../src/simulation/types.js').PlayerState={characterId:id,x,z:0,tx:x,tz:0,stamina:1,moving:mode==='run',
     stroke,shotQueued:true,contact,swing:t>=1?(mode==='serve'?.72:.44)*(2-t):0,
     preparation:t<1&&mode!=='run'&&mode!=='rescue'?{stroke,progress:t,contact}:undefined,
     rescue:mode==='rescue'?{startedAt:0,fromX:0,fromZ:0,toX:1,toZ:0,contact,hit:t>.2,stroke:'forehand',recovery:'step-out'}:undefined};
    a.update(p,mode==='rescue'?t*.59:t,1/30);
    const box=new Box3();
    scene.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));}});
    const size=box.getSize(new Vector3());
    assert.ok(size.toArray().every(Number.isFinite)&&Math.max(size.x,size.y,size.z)<3.5,`${id}/${seat}/${mode} skin bounds`);
    assert.ok(box.min.y>-.15,`${id}/${seat}/${mode}/${t}: below court ${box.min.y}`);
   }
  }finally{disposeTree(a.root);}
 }
});

test('calibrated bind matrices preserve the authored surface and limbs avoid stretched triangles',async()=>{
 for(const id of ['lin','mei','noah']){
  const {scene}=await model(`prototypes/${id}`);scene.updateMatrixWorld(true);
  const meshes:SkinnedMesh[]=[];scene.traverse(o=>{if(o instanceof SkinnedMesh)meshes.push(o);});
  for(const mesh of meshes){
   mesh.skeleton.update();const p=mesh.geometry.attributes.position;
   for(let i=0;i<p.count;i++){
    const rest=new Vector3().fromBufferAttribute(p,i);
    assert.ok(mesh.applyBoneTransform(i,rest.clone()).distanceTo(rest)<.00002,`${id} bind mismatch at ${i}`);
   }
  }
  const a=new Athlete(1);a.attachModel(scene);
  try{
   for(const stroke of ['forehand','backhand','serve'] as const)for(const t of [.2,.54,.85,1,1.4,1.7]){
    const contact={x:(stroke==='backhand'?.65:-.65)*(id==='noah'?-1:1),y:stroke==='serve'?2.65:1.2,z:.65};
    a.update({characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,shotQueued:true,contact,
     swing:t>=1?(stroke==='serve'?.72:.44)*(2-t):0,preparation:t<1?{stroke,progress:t,contact}:undefined},t,1/60);
    for(const mesh of meshes){
     mesh.skeleton.update();const p=mesh.geometry.attributes.position,index=mesh.geometry.index!;
     const deformed=Array.from({length:p.count},(_,i)=>mesh.getVertexPosition(i,new Vector3()));
     for(let i=0;i<index.count;i+=3)for(let k=0;k<3;k++){
      const u=index.getX(i+k),v=index.getX(i+(k+1)%3);
      const rest=new Vector3().fromBufferAttribute(p,u).distanceTo(new Vector3().fromBufferAttribute(p,v));
      assert.ok(deformed[u].distanceTo(deformed[v])<Math.max(.15,rest*5),`${id}/${stroke}/${t}: stretched skin ${u}/${v}`);
     }
    }
   }
  }finally{disposeTree(a.root);}
 }
});
