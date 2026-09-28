/** Export actual court and posed athlete geometry through old/new cameras.
 * CPU preview only, no browser access or WebGL required. */
import {Scene,Mesh,SkinnedMesh,Vector3,PerspectiveCamera} from 'three';
import {makeCourt} from '../../src/render/court.js';
import {frameMatch} from '../../src/render/camera.js';
import {Athlete} from '../../src/render/player.js';
import {model} from '../../tests/helpers/athlete-model.js';
import {writeFile,mkdir} from 'node:fs/promises';

Object.defineProperty(globalThis,'document',{value:{createElement:()=>({width:0,height:0,getContext:()=>({fillText(){}})})},configurable:true});
const scene=new Scene();const ends=makeCourt(scene);ends[0].visible=false;
const athletes=[];
for(const seat of [0,1] as const){
 const athlete=new Athlete(seat);athlete.attachModel((await model()).scene);
 const z=seat===0?12.4:-12.4;
 athlete.update({characterId:'lin',x:0,z,tx:0,tz:z,stamina:1,moving:false,stroke:'forehand',swing:0},0,1/60);
 scene.add(athlete.root);athletes.push(athlete);
}
scene.updateMatrixWorld(true);
const cameras=[];
for(const [width,height] of [[390,844],[780,600]]){
 for(const mode of ['before','after','near','far']){
  const camera=new PerspectiveCamera(30,width/height,.1,150);
  if(mode==='before'){camera.position.set(0,6.5,27);camera.lookAt(0,1,3);camera.updateMatrixWorld();}
  else frameMatch(camera,width,height,0,0,12.4,{x:0,z:-12.4},mode==='near'?'near':'far');
  const meshes:any[]=[];
  scene.traverseVisible(o=>{
   if(!(o instanceof Mesh)||!o.geometry.attributes.position)return;
   if(o.geometry.type==='PlaneGeometry')return; // Canvas labels are not decoded offline.
   const points:number[]=[],uv=o.geometry.attributes.uv,vertex=new Vector3();
   for(let i=0;i<o.geometry.attributes.position.count;i++){
    o.getVertexPosition(i,vertex);o.localToWorld(vertex);vertex.project(camera);
    points.push((vertex.x+1)*width/2,(1-vertex.y)*height/2,vertex.z);
   }
   const material=Array.isArray(o.material)?o.material[0]:o.material;
   meshes.push({points,uv:uv?Array.from(uv.array):null,textured:o instanceof SkinnedMesh&&!o.name.includes('sweatband'),
    color:(material as any).color?.toArray()??[.6,.7,.6],
    indices:o.geometry.index?Array.from(o.geometry.index.array):Array.from({length:points.length/3},(_,i)=>i)});
  });
  cameras.push({width,height,mode,meshes});
 }
}
await mkdir('artifacts/court-realism',{recursive:true});
await writeFile('artifacts/court-realism/projected-scene.json',JSON.stringify(cameras));
console.log('Saved old/new actual geometry projections, mobile and landscape.');
