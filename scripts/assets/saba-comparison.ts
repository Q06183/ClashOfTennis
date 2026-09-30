import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Athlete} from '../../src/render/player.js';
import {AthleteWardrobe} from '../../src/render/athlete-wardrobe.js';
import {disposeTree} from '../../src/render/dispose.js';
import type {PlayerState} from '../../src/simulation/types.js';
import {RESCUE} from '../../src/simulation/rescue.js';
import {SERVE_RECOVERY} from '../../src/simulation/serve-motion.js';
import {ComparisonRig} from './saba-comparison-rig.js';

declare global {
  interface Window {sabaAssets:{original:string;prototype:string};sabaDemo:any}
}
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('canvas'),stage=$<HTMLElement>('stage');
const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
renderer.setClearColor(0xe4e9e8);
const scenes=[new T.Scene(),new T.Scene()];
for(const scene of scenes){
  scene.add(new T.HemisphereLight(0xffffff,0x839493,2));
  for(const [x,y,z,power] of [[3,5,4,2.3],[-3,3,1,1.1],[0,4,-3,1.6]]){
    const l=new T.DirectionalLight(0xffffff,power);l.position.set(x,y,z);scene.add(l);
  }
  const floor=new T.Mesh(new T.CircleGeometry(3,80),new T.MeshStandardMaterial({color:0xc5d1ce,roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.02;scene.add(floor);
  const grid=new T.GridHelper(6,24,0xa9bbb6,0xbbcac5);grid.position.y=-.015;scene.add(grid);
}
const camera=new T.PerspectiveCamera(34,1,.01,100);
camera.position.set(.25,1.65,5.7);
const controls=new OrbitControls(camera,stage);controls.target.set(0,1.42,0);
controls.enableDamping=true;controls.minDistance=1;controls.maxDistance=8;
const action=$<HTMLSelectElement>('action'),speed=$<HTMLSelectElement>('speed'),outfit=$<HTMLSelectElement>('outfit');
const scrub=$<HTMLInputElement>('scrub'),skeletonToggle=$<HTMLInputElement>('skeleton');
let actor:Athlete,original:T.Object3D,prototype:T.Object3D,wardrobe:AthleteWardrobe,transfer:ComparisonRig;
let helpers:T.SkeletonHelper[]=[];let proxyRacket:T.Object3D;
let mode='split',playing=false,frame=0,duration=2,totalFrames=120,accumulator=0,ready=false;
let lastState:PlayerState|undefined;
const bindNodes:{node:T.Object3D;position:T.Vector3;quaternion:T.Quaternion;scale:T.Vector3;auto:boolean}[]=[];
window.sabaDemo={ready:false,errors:[],frames:0};

async function parse(value:string){
  const raw=atob(value),data=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
  return (await new GLTFLoader().parseAsync(data.buffer,'')).scene;
}
function restoreOriginal(){
  for(const b of bindNodes){
    b.node.position.copy(b.position);b.node.quaternion.copy(b.quaternion);b.node.scale.copy(b.scale);
    b.node.matrixAutoUpdate=b.auto;b.node.updateMatrix();
    if(b.node instanceof T.Mesh&&b.node.morphTargetInfluences)b.node.morphTargetInfluences.fill(0);
  }
  original.updateMatrixWorld(true);
}
function resetActor(){
  if(actor){
    original.removeFromParent();
    scenes[0].remove(actor.root);disposeTree(actor.root);
  }
  restoreOriginal();
  actor=new Athlete(1);actor.attachModel(original);scenes[0].add(actor.root);
  frame=0;accumulator=0;lastState=undefined;
  if(proxyRacket){scenes[1].remove(proxyRacket);proxyRacket=undefined!;}
  const racket=actor.root.getObjectByName('racket-grip')!;
  proxyRacket=racket.clone(true);proxyRacket.matrixAutoUpdate=false;scenes[1].add(proxyRacket);
  window.sabaDemo.actor=actor;
}
function changeAction(){
  const name=action.value;
  duration=name==='serve'?1.2+SERVE_RECOVERY+.5:name==='rescue'?RESCUE.duration+.45:name==='run'?3.2:name==='victory'?3:2;
  totalFrames=Math.round(duration*60);scrub.max=String(totalFrames);
  resetActor();pose(0);
  playing=name!=='bind';syncUI();
}
function stateAt(t:number):PlayerState{
  const name=action.value;
  const stroke=(['idle','bind','run','rescue','victory'].includes(name)?'forehand':name) as PlayerState['stroke'];
  const contact={x:stroke==='backhand'?.65:-.65,y:stroke==='serve'?2.65:1.2,z:.65};
  const p:PlayerState={x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,swing:0,contact};
  if(name==='run'){
    p.x=Math.sin(t/duration*Math.PI*2)*.65;p.tx=p.x+.3;p.moving=true;
  }else if(name==='rescue'){
    const u=T.MathUtils.clamp(t/RESCUE.travel,0,1),x=.8*u*u*(3-2*u);
    p.x=x;p.tx=.8;
    if(t<RESCUE.duration)p.rescue={startedAt:0,fromX:0,fromZ:0,toX:.8,toZ:0,hit:t>.22,contact:{x:1.45,y:1,z:.35}};
    else p.x=.8;
  }else if(!['idle','victory','bind'].includes(name)){
    const impact=name==='serve'?1.2:1,recovery=name==='serve'?SERVE_RECOVERY:.44;
    p.shotQueued=t<impact+recovery;
    if(t<impact)p.preparation={stroke,progress:t/impact,contact};
    else p.swing=Math.max(0,recovery-(t-impact));
  }
  return p;
}
function pose(nextFrame:number){
  frame=nextFrame;const t=frame/60;
  if(action.value==='bind'){
    // Restore the actual stored neutral pose, not a posed approximation.
    restoreOriginal();actor.root.position.set(0,0,0);actor.root.rotation.set(0,0,0);
    original.updateMatrixWorld(true);transfer.restore();
    actor.root.getObjectByName('racket-grip')!.visible=false;proxyRacket.visible=false;
  }else{
    const p=stateAt(t);lastState=p;
    actor.update(p,t,1/60,action.value==='victory'?t:undefined);
    actor.root.updateMatrixWorld(true);transfer.update();
    const racket=actor.root.getObjectByName('racket-grip')!;
    racket.visible=true;proxyRacket.visible=true;proxyRacket.matrix.copy(racket.matrixWorld);
  }
  scenes.forEach(s=>s.updateMatrixWorld(true));
  window.sabaDemo.frame=frame;window.sabaDemo.action=action.value;
  window.sabaDemo.frames++;
  window.sabaDemo.state=lastState?structuredClone(lastState):null;
  syncUI();
}
function seek(target:number){
  const n=Math.max(0,Math.min(totalFrames,Math.round(target)));
  playing=false;
  if(n<frame||action.value==='bind')resetActor();
  if(frame===0)pose(0);
  for(let i=frame+1;i<=n;i++)pose(i);
  syncUI();
}
function syncUI(){
  scrub.value=String(frame);
  $('clock').textContent=`${(frame/60).toFixed(2)} / ${duration.toFixed(2)} s`;
  $('frame').textContent=`第 ${frame} 帧`;
  $('play').textContent=playing?'暂停':'播放';
  $('play').setAttribute('aria-label',playing?'暂停同步动作':'播放同步动作');
  window.sabaDemo.playing=playing;window.sabaDemo.outfit=outfit.value;window.sabaDemo.mode=mode;
}
function setMode(value:string){
  mode=['original','prototype'].includes(value)?value:'split';
  stage.dataset.mode=mode;
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>{
    b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
  });
  resize();syncUI();
}
function resize(){
  const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height,false);
}
function draw(){
  const w=stage.clientWidth,h=stage.clientHeight;
  const panels=mode==='split'?[
    {s:0,x:0,width:w/2},{s:1,x:w/2,width:w/2},
  ]:[{s:mode==='original'?0:1,x:0,width:w}];
  renderer.setScissorTest(true);
  for(const p of panels){
    renderer.setViewport(p.x,0,p.width,h);renderer.setScissor(p.x,0,p.width,h);
    camera.aspect=p.width/h;camera.updateProjectionMatrix();
    renderer.render(scenes[p.s],camera);
  }
  renderer.setScissorTest(false);
}
const views:Record<string,[number,number,number]>={
  front:[0,1.65,5.7],back:[0,1.65,-5.7],left:[5.7,1.65,0],right:[-5.7,1.65,0],
  three:[3.2,1.8,4.9],
};
$('play').onclick=()=>{if(!ready)return;playing=!playing;if(frame>=totalFrames){resetActor();pose(0);}syncUI();};
$('prev').onclick=()=>seek(frame-1);$('next').onclick=()=>seek(frame+1);
$('restart').onclick=()=>{resetActor();pose(0);syncUI();};
scrub.oninput=()=>seek(Number(scrub.value));
action.onchange=()=>changeAction();
outfit.onchange=()=>{wardrobe.setOutfit(outfit.value);syncUI();};
skeletonToggle.onchange=()=>helpers.forEach(h=>h.visible=skeletonToggle.checked);
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{
  camera.position.set(...views[b.dataset.view!]);controls.target.set(0,1.42,0);controls.update();
});
$('closeup').onclick=()=>{camera.position.set(.25,1.55,2.45);controls.target.set(0,1.50,0);controls.update();};
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.onclick=()=>{
  history.replaceState(null,'',`#${b.dataset.mode}`);setMode(b.dataset.mode!);
});
window.addEventListener('hashchange',()=>setMode(location.hash.slice(1)));
window.addEventListener('keydown',e=>{
  if(/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName))return;
  if(e.code==='Space'){e.preventDefault();$('play').click();}
  if(e.code==='ArrowRight'){e.preventDefault();seek(frame+1);}
  if(e.code==='ArrowLeft'){e.preventDefault();seek(frame-1);}
});
new ResizeObserver(resize).observe(stage);

async function start(){
  [original,prototype]=await Promise.all([parse(window.sabaAssets.original),parse(window.sabaAssets.prototype)]);
  original.traverse(node=>bindNodes.push({node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone(),auto:node.matrixAutoUpdate}));
  scenes[1].add(prototype);
  let rig:T.Object3D|undefined;prototype.traverse(o=>{if(o.userData.wardrobe)rig=o;});
  if(!rig)throw Error('工作原型缺少换装标识');
  wardrobe=new AthleteWardrobe(rig);
  transfer=new ComparisonRig(prototype,original);
  resetActor();
  helpers=[new T.SkeletonHelper(original),new T.SkeletonHelper(prototype)];
  helpers.forEach((helper,i)=>{helper.visible=false;scenes[i].add(helper);});
  window.sabaDemo={...window.sabaDemo,ready:true,original,prototype,wardrobe,seek,
    camera,renderer,transfer,actor,assets:Object.keys(window.sabaAssets)};
  window.sabaDemo.sample=()=>{
    const meshes=(root:T.Object3D)=>{
      const samples:{name:string;visible:boolean;points:number[][]}[]=[];
      root.traverse(o=>{
        if(!(o instanceof T.SkinnedMesh))return;
        o.skeleton.update();
        const count=o.geometry.attributes.position.count;
        samples.push({name:o.name,visible:o.visible,points:[0,Math.floor(count/3),Math.floor(count*2/3),count-1]
          .map(i=>o.localToWorld(o.getVertexPosition(i,new T.Vector3())).toArray())});
      });
      return samples;
    };
    const joints=['Hips','Head','UpperArm_L','LowerArm_L','Hand_L','UpperArm_R','LowerArm_R','Hand_R','Foot_L','Foot_R'];
    return {frame,action:action.value,playing,
      joints:joints.map(name=>({name,a:original.getObjectByName(name)!.getWorldPosition(new T.Vector3()).toArray(),
        b:prototype.getObjectByName(name)!.getWorldPosition(new T.Vector3()).toArray()})),
      original:meshes(original),prototype:meshes(prototype)};
  };
  ready=true;setMode(location.hash.slice(1));
  action.value='forehand';changeAction();
  $('loading').hidden=true;
  $('status').textContent='两种方案已载入 · 同一动作输入 / 同一时刻 / 同一镜头';
  document.querySelectorAll<HTMLButtonElement|HTMLSelectElement|HTMLInputElement>('[data-wait]').forEach(e=>e.disabled=false);
}
let last=performance.now();
renderer.setAnimationLoop(ms=>{
  const elapsed=Math.min(.05,(ms-last)/1000);last=ms;
  if(ready&&playing&&action.value!=='bind'){
    accumulator+=elapsed*Number(speed.value);
    while(accumulator>=1/60){
      accumulator-=1/60;
      if(frame>=totalFrames){resetActor();pose(0);}
      else pose(frame+1);
    }
  }
  controls.update();draw();
});
void start().catch(e=>{
  window.sabaDemo.errors.push(String(e));$('loading').textContent=`加载失败：${String(e)}`;
  $('status').textContent='加载失败，详情见中间提示';console.error(e);
});
