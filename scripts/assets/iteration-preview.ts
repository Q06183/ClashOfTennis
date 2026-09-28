import {Mesh,SkinnedMesh,Vector3} from 'three';
import {model} from '../../tests/helpers/athlete-model.js';
import {Athlete} from '../../src/render/player.js';
import {disposeTree} from '../../src/render/dispose.js';
import {mkdir,writeFile} from 'node:fs/promises';

const rows=[];
for(const mode of ['victory','prepared-run'] as const){
 const a=new Athlete(1);a.attachModel((await model()).scene);const frames=[];
 for(const time of [.1,.35,.6,.85,1.1]){
  const p={characterId:'lin',x:mode==='prepared-run'?time*1.8:0,z:0,tx:3,tz:0,stamina:1,stroke:'backhand' as const,swing:0,moving:mode==='prepared-run',
   preparation:mode==='prepared-run'?{stroke:'backhand' as const,progress:.95,contact:{x:time*1.8+.4,y:1.2,z:.5}}:undefined,shotQueued:mode==='prepared-run'};
  a.update(p,time,.05,mode==='victory'?time:undefined);a.root.updateMatrixWorld(true);
  const meshes:any[]=[];
  a.root.traverseVisible(o=>{
   if(!(o instanceof Mesh)||!o.geometry.attributes.position)return;
   const g=o.geometry,pos=g.attributes.position,point=new Vector3(),points:number[]=[];
   for(let i=0;i<pos.count;i++){o.getVertexPosition(i,point);o.localToWorld(point);point.x-=p.x;points.push(...point.toArray());}
   const mat=Array.isArray(o.material)?o.material[0]:o.material;
   meshes.push({points,indices:g.index?Array.from(g.index.array):Array.from({length:pos.count},(_,i)=>i),
    uv:g.attributes.uv?Array.from(g.attributes.uv.array):null,textured:o instanceof SkinnedMesh&&!o.name.includes('sweatband'),color:(mat as any).color?.toArray()??[1,1,1]});
  });
  frames.push({age:time,meshes});
 }
 rows.push({stroke:mode,frames});disposeTree(a.root);
}
await mkdir('artifacts/six-fixes',{recursive:true});
await writeFile('artifacts/six-fixes/poses.json',JSON.stringify(rows));
