/** Export actual runtime-skinned rescue poses for offline visual inspection. */
import {writeFile,mkdir} from 'node:fs/promises';
import {Vector3,Mesh,SkinnedMesh} from 'three';
import {model} from '../../tests/helpers/athlete-model.js';
import {Athlete} from '../../src/render/player.js';
import {disposeTree} from '../../src/render/dispose.js';
import {initPhysics} from '../../src/simulation/physics.js';
import {Match} from '../../src/simulation/match.js';
import {handedness} from '../../src/simulation/characters.js';

await initPhysics();
const out=process.env.POSE_PREVIEW_DIR??'artifacts/jump-rescue';
const rows=[];
for(const id of ['lin','noah']){
for(const stroke of ['forehand','backhand','volley','smash'] as const){
 const a=new Athlete(1);a.attachModel((await model(id==='lin'?'athlete':`characters/${id}`)).scene);
 const match=new Match([id,id],()=>0),p=match.state.players[1];
 match.state.phase='rally';match.state.rally=2;match.step(.08);
 const depth=stroke==='volley'?4:10;
 Object.assign(p,{x:0,z:-depth,tx:0,tz:-depth,vx:0,vz:0,stamina:.08});
 match.physics.place({x:(stroke==='backhand'?2.65:-2.65)*handedness(id),y:stroke==='smash'?2.9:stroke==='volley'?1.9:1.2,z:-(depth-1.8)},{x:0,y:0,z:-10});
 Object.assign(match.state.ball,match.physics.read(),{hitter:0,bounces:stroke==='forehand'||stroke==='backhand'?1:0});
 match.input(1,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
 if(!p.rescue)throw Error(`No rescue: ${id}/${stroke}`);
 const start=p.rescue.startedAt,tx=p.rescue.toX;const frames=[];
 for(const age of [.18,.42,.68,.93,1.20]){
  while(match.state.time<start+age){match.step(1/1000);a.update(p,match.state.time,.001);}
  a.root.updateMatrixWorld(true);
  const meshes:any[]=[];
  a.root.traverse(o=>{
   if(!(o instanceof Mesh)||!o.visible||!o.geometry.attributes.position)return;
   const pos=o.geometry.attributes.position,points:number[]=[],point=new Vector3();
   for(let i=0;i<pos.count;i++){
    o.getVertexPosition(i,point);o.localToWorld(point);point.x-=tx;point.z+=depth;points.push(...point.toArray());
   }
   const uv=o.geometry.attributes.uv;
   const material=Array.isArray(o.material)?o.material[0]:o.material;
   meshes.push({name:o.name,points,uv:uv?Array.from(uv.array):null,indices:o.geometry.index?Array.from(o.geometry.index.array):Array.from({length:pos.count},(_,i)=>i),
    textured:o instanceof SkinnedMesh&&!o.name.includes('sweatband'),color:(material as any).color?.toArray()??[.8,.8,.8]});
  });
  const contact=p.rescue?.contact??p.contact;
  frames.push({age,meshes,contact:contact?{...contact,x:contact.x-tx,z:contact.z+depth}:undefined});
 }
 rows.push({stroke:`${id}-${stroke}`,frames});disposeTree(a.root);match.dispose();
}
}
await mkdir(out,{recursive:true});
await writeFile(`${out}/poses.json`,JSON.stringify(rows));
console.log('Exported right/left-handed actual simulated rescue poses across five phases.');
