import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Bone,SkinnedMesh,Vector3} from 'three';
import {model} from './helpers/athlete-model.js';
import {Athlete} from '../src/render/player.js';

const variants=['athlete',...['mei','rafa','sora','ines','leo','noah','adrian','luca','wuming'].map(n=>`characters/${n}`)];
const added=['Chest','Clavicle_L','Clavicle_R','Toe_L','Toe_R'];
for(const id of variants)test(`${id}: 21 real joints, useful new weights and unchanged bind silhouette`,async()=>{
 const {scene}=await model(id);scene.updateMatrixWorld(true);
 const bones:Bone[]=[];scene.traverse(o=>{if(o instanceof Bone)bones.push(o);});
 assert.equal(bones.length,21);
 const totals=new Map(added.map(n=>[n,0]));
 scene.traverse(o=>{
  if(!(o instanceof SkinnedMesh))return;
  o.skeleton.update();
  const g=o.geometry,p=g.attributes.position,w=g.attributes.skinWeight,s=g.attributes.skinIndex;
  for(let i=0;i<p.count;i++){
   let sum=0;
   for(let k=0;k<4;k++){
    const weight=w.getComponent(i,k);
    const name:string=o.skeleton.bones[s.getComponent(i,k)]?.name;
    assert.ok(name);assert.ok(weight>=0&&Number.isFinite(weight));sum+=weight;
    if(totals.has(name))totals.set(name,totals.get(name)!+weight);
   }
   assert.ok(Math.abs(sum-1)<1e-5);
   const rest=new Vector3().fromBufferAttribute(p,i);
   assert.ok(o.applyBoneTransform(i,rest.clone()).distanceTo(rest)<2e-5,`${id} changed neutral vertex ${i}`);
  }
 });
 for(const [name,total] of totals)assert.ok(total>1,`${id}/${name} is cosmetic, no useful deformation weights`);
 assert.equal(scene.getObjectByName('UpperArm_L')!.parent!.name,'Clavicle_L');
 assert.equal(scene.getObjectByName('Toe_L')!.parent!.name,'Foot_L');
});

test('chest, clavicle and toe controls are connected to actual skinned vertices',async()=>{
 const {scene}=await model(),a=new Athlete(1);a.attachModel(scene);
 a.update({x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'forehand',swing:0},0);
 for(const name of ['chest-control','clavicle-L','toe-0']){
  const control=a.root.getObjectByName(name);
  assert.ok(control,`missing ${name}`);
  const capture=()=>{
   const points:Vector3[]=[];
   scene.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++)points.push(o.getVertexPosition(i,new Vector3()));}});
   return points;
  };
  const before=capture();control.rotation.x+=.2;a.root.updateMatrixWorld(true);
  (a as unknown as {generated:{update():void}}).generated.update();
  const after=capture();
  assert.ok(after.some((p,i)=>p.distanceTo(before[i])>.003),`${name} did not deform any vertex`);
  control.rotation.x-=.2;a.root.updateMatrixWorld(true);
  (a as unknown as {generated:{update():void}}).generated.update();
 }
});

test('shoulder and toe controls articulate during a stroke rather than remaining empty adapters',()=>{
 const a=new Athlete(1),contact={x:-.65,y:1.2,z:.65};
 a.update({x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'forehand',swing:.22,contact},0);
 assert.ok(a.root.getObjectByName('clavicle-R')!.rotation.y!==0,'shoulder should protract through the stroke');
 assert.ok(a.root.getObjectByName('toe-1')!.rotation.x!==0,'rear foot should release through the toe');
});
