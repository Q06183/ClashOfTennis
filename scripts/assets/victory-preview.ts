/** Export the actual skinned dance (and timed frames for an offline flipbook). */
import {Mesh,SkinnedMesh,Vector3} from 'three';
import {model} from '../../tests/helpers/athlete-model.js';
import {Athlete} from '../../src/render/player.js';
import {disposeTree} from '../../src/render/dispose.js';
import {mkdir,writeFile} from 'node:fs/promises';

const output=process.env.POSE_PREVIEW_DIR??'artifacts/victory-dance';
const rows=[];
const animated=process.env.VICTORY_ANIMATED==='1';
for(const id of ['lin','noah']){
 const a=new Athlete(1);a.attachModel((await model(id==='lin'?'athlete':`characters/${id}`)).scene);
 const frames=[];
 const p={characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,stroke:'forehand' as const,swing:0,moving:false};
 a.update(p,30,1/60);
 const times=animated?Array.from({length:91},(_,i)=>i/15):[0,.4,.9,1.45,2.05,2.6,3.65,5.5];
 for(const time of times){
  a.update(p,30,1/60,time);a.root.updateMatrixWorld(true);
  const meshes:any[]=[];
  a.root.traverseVisible(o=>{
   if(!(o instanceof Mesh)||!o.geometry.attributes.position)return;
   if(o instanceof SkinnedMesh)o.skeleton.update();
   const g=o.geometry,pos=g.attributes.position,point=new Vector3(),points:number[]=[];
   for(let i=0;i<pos.count;i++){o.getVertexPosition(i,point);o.localToWorld(point);points.push(...point.toArray());}
   const mat=Array.isArray(o.material)?o.material[0]:o.material;
   meshes.push({points,indices:g.index?Array.from(g.index.array):Array.from({length:pos.count},(_,i)=>i),
    uv:g.attributes.uv?Array.from(g.attributes.uv.array):null,textured:o instanceof SkinnedMesh&&!o.name.includes('sweatband'),color:(mat as any).color?.toArray()??[1,1,1]});
  });
  frames.push({age:time,meshes});
 }
 rows.push({stroke:`${id}-victory`,frames});disposeTree(a.root);
}
await mkdir(output,{recursive:true});
await writeFile(`${output}/poses.json`,JSON.stringify(rows));
console.log(`Exported ${animated?'animated':'key-pose'} actual dance frames.`);
