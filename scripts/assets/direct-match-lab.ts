import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {Athlete} from '../../src/render/player.js';
import type {PlayerState} from '../../src/simulation/types.js';
import {RESCUE} from '../../src/simulation/rescue.js';

const canvas=document.querySelector('canvas')!;
const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0xdce6e9);renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0xa6afb5,2));
for(const [x,y,z,power] of [[2,4,4,2.5],[-3,2,1,1.4],[1,4,-3,1.5]]){
  const l=new T.DirectionalLight(0xffffff,power);l.position.set(x,y,z);scene.add(l);
}
const camera=new T.PerspectiveCamera(32,1,.01,100);camera.position.set(.1,1.2,4.4);
const orbit=new OrbitControls(camera,canvas);orbit.target.set(0,1,0);orbit.enableDamping=true;
const floor=new T.Mesh(new T.PlaneGeometry(8,8),new T.MeshStandardMaterial({color:0xb8ccce,roughness:1}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.005;scene.add(floor);
const character=document.getElementById('character') as HTMLSelectElement;
const action=document.getElementById('action') as HTMLSelectElement;
const phase=document.getElementById('phase') as HTMLInputElement;
const play=document.getElementById('play') as HTMLInputElement;
const bones=document.getElementById('bones') as HTMLInputElement;
let athlete:Athlete,model:T.Object3D,template:T.Object3D,helper:T.SkeletonHelper,clock=0,token=0;
const rest=new Map<T.Bone,T.Matrix4>();
async function load(){
  const id=++token;
  const g=await new GLTFLoader().loadAsync(`/models/characters/${character.value}.glb`);
  if(id!==token)return;
  template=g.scene;reset();
  document.getElementById('status')!.textContent=`${character.value} · 原始外观直接绑定 · ${model.userData.directOriginalRig.schema}`;
  (window as any).directLab={loaded:character.value,error:'',athlete,model};
}
function reset(){
  if(athlete)scene.remove(athlete.root);if(helper)scene.remove(helper);
  athlete=new Athlete(1);scene.add(athlete.root);model=clone(template);athlete.attachModel(model);
  rest.clear();model.traverse(o=>{if(o instanceof T.Bone){o.updateMatrix();rest.set(o,o.matrix.clone());}});
  helper=new T.SkeletonHelper(model);helper.visible=bones.checked;scene.add(helper);
  clock=0;
  if((window as any).directLab)Object.assign((window as any).directLab,{athlete,model});
}
character.onchange=()=>void load();action.onchange=()=>reset();phase.oninput=()=>{play.checked=false;reset();};
bones.onchange=()=>{helper.visible=bones.checked;};
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{
  camera.position.set(...({front:[0,1.15,4.4],back:[0,1.15,-4.4],side:[4.4,1.15,0]}[b.dataset.view!] as [number,number,number]));
  orbit.target.set(0,1,0);orbit.update();
});
new ResizeObserver(()=>{
  renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
}).observe(canvas);
function update(t:number,dt:number){
  if(!athlete)return;
  const mode=action.value;
  if(mode==='bind'){
    athlete.root.position.set(0,0,0);athlete.root.rotation.set(0,0,0);
    for(const [bone,matrix] of rest){bone.matrix.copy(matrix);bone.matrixWorldNeedsUpdate=true;}
    athlete.root.updateMatrixWorld(true);
    athlete.root.traverse(o=>{if(o.userData.fallbackBody)o.visible=false;});
    athlete.root.getObjectByName('racket-grip')!.visible=false;
    return;
  }
  athlete.root.getObjectByName('racket-grip')!.visible=true;
  const stroke=(['idle','run','rescue','victory'].includes(mode)?'forehand':mode) as PlayerState['stroke'];
  const contact={x:mode==='backhand'?.65:-.65,y:mode==='serve'||mode==='smash'?2.65:1.2,z:.65};
  const p:PlayerState={x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,swing:0,contact};
  if(mode==='run'){p.x=Math.sin(clock)*.8;p.tx=p.x+.5;p.moving=true;}
  else if(mode==='rescue'){
    p.rescue={startedAt:0,fromX:0,fromZ:0,toX:1.5,toZ:.4,hit:false,contact:{x:2.1,y:1,z:0}};
    athlete.update(p,Math.min(t,RESCUE.duration),dt);return;
  }else if(mode==='victory'){athlete.update(p,clock,dt,t);return;}
  else if(mode!=='idle'){
    p.shotQueued=true;
    if(t<1)p.preparation={stroke,progress:t,contact};
    else p.swing=(stroke==='serve'?.72:.44)*(2-t);
  }
  athlete.update(p,clock,dt);
}
let previous=performance.now();
renderer.setAnimationLoop(ms=>{
  const dt=Math.min(.04,(ms-previous)/1000);previous=ms;clock+=dt;
  if(play.checked)phase.value=String((Number(phase.value)+dt*.55)%2);
  const t=Number(phase.value);document.getElementById('time')!.textContent=t.toFixed(2);
  update(t,dt);orbit.update();renderer.render(scene,camera);
});
void load();
