/** Export actual runtime-skinned rescue poses for offline visual inspection. */
import {writeFile,mkdir} from 'node:fs/promises';
import {Vector3,Mesh,SkinnedMesh} from 'three';
import {model} from '../../tests/helpers/athlete-model.js';
import {Athlete} from '../../src/render/player.js';
import {disposeTree} from '../../src/render/dispose.js';
import {moveRescue} from '../../src/simulation/rescue.js';
import type {PlayerState} from '../../src/simulation/types.js';

const rows=[];
for(const stroke of ['forehand','backhand','volley','smash'] as const){
 const a=new Athlete(1);a.attachModel((await model()).scene);
 const backhand=stroke==='backhand',tx=backhand?-.95:1.0;
 const p:PlayerState={characterId:'lin',x:0,z:0,tx,tz:0,stamina:.8,moving:false,stroke,swing:0,
  rescue:{startedAt:0,fromX:0,fromZ:0,toX:tx,toZ:0,stroke,backhand,contact:{x:tx+(backhand?.5:-.6),y:stroke==='smash'?2.85:stroke==='volley'?1.8:1.2,z:.4},hit:false}};
 let previous=0;const frames=[];
 for(const age of [.18,.48,.62,.88,1.20]){
  moveRescue(p,age,Math.max(.001,age-previous));previous=age;
  if(p.rescue)p.rescue.hit=age>=.18;
  a.update(p,age,1/60);a.root.updateMatrixWorld(true);
  const meshes:any[]=[];
  a.root.traverse(o=>{
   if(!(o instanceof Mesh)||!o.visible||!o.geometry.attributes.position)return;
   const pos=o.geometry.attributes.position,points:number[]=[],point=new Vector3();
   for(let i=0;i<pos.count;i++){
    o.getVertexPosition(i,point);o.localToWorld(point);point.x-=tx;points.push(...point.toArray());
   }
   const uv=o.geometry.attributes.uv;
   const material=Array.isArray(o.material)?o.material[0]:o.material;
   meshes.push({name:o.name,points,uv:uv?Array.from(uv.array):null,indices:o.geometry.index?Array.from(o.geometry.index.array):Array.from({length:pos.count},(_,i)=>i),
    textured:o instanceof SkinnedMesh&&!o.name.includes('sweatband'),color:(material as any).color?.toArray()??[.8,.8,.8]});
  });
  const contact=p.rescue?.contact??p.contact;
  frames.push({age,meshes,contact:contact?{...contact,x:contact.x-tx}:undefined});
 }
 rows.push({stroke,frames});disposeTree(a.root);
}
await mkdir('artifacts/jump-rescue',{recursive:true});
await writeFile('artifacts/jump-rescue/poses.json',JSON.stringify(rows));
console.log('Exported four actual runtime poses across five phases.');
