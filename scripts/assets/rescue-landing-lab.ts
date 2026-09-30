import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {Athlete} from '../../src/render/player.js';
import {getCharacter} from '../../src/simulation/characters.js';
import {RESCUE} from '../../src/simulation/rescue.js';
import type {PlayerState,BallState,Seat} from '../../src/simulation/types.js';

type Clip={id:string;seat:Seat;short:boolean;move:boolean;launch:NonNullable<PlayerState['rescue']>;contact:number;unlock:number;frames:{time:number;player:PlayerState;ball:BallState}[]};
const clips:Clip[]=await (await fetch('/artifacts/rescue-landing/clips.json')).json();
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas')!,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xdbe5df);renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x789282,2.4));
for(const [x,z] of [[4,4],[-4,-2]]){const light=new T.DirectionalLight(0xffffff,2);light.position.set(x,6,z);scene.add(light);}
const camera=new T.PerspectiveCamera(34,1,.01,100);
const floor=new T.Mesh(new T.PlaneGeometry(18,18),new T.MeshStandardMaterial({color:0x6e9a86,roughness:1}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.01;scene.add(floor);
const grid=new T.GridHelper(18,18,0xbfd3c2,0x88ac97);scene.add(grid);
function ring(color:number){
 const m=new T.Mesh(new T.RingGeometry(.21,.28,48),new T.MeshBasicMaterial({color,side:T.DoubleSide}));
 m.rotation.x=-Math.PI/2;m.position.y=.005;scene.add(m);return m;
}
const start=ring(0xef9c36),finish=ring(0x147bd1);
const ball=new T.Mesh(new T.SphereGeometry(.12,24,16),new T.MeshStandardMaterial({color:0xe2f544}));scene.add(ball);
const path=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0x245f85}));scene.add(path);
const select=document.querySelector<HTMLSelectElement>('#case')!,slider=document.querySelector<HTMLInputElement>('#phase')!;
const status=document.querySelector('#status')!,time=document.querySelector('#time')!,play=document.querySelector<HTMLButtonElement>('#play')!;
const cache=new Map<string,T.Object3D>();let athlete:Athlete,clip=clips[0],frame=0,playing=false,elapsed=0,loadToken=0;
clips.forEach((c,i)=>select.add(new Option(`${c.short?'小跳 · 无惩罚':'大跳 · 起身 0.5s'} / ${getCharacter(c.id).name} / ${c.seat===0?'近端':'远端'} / ${c.move?'新点移动':'留在落点'}`,String(i))));
async function load(index:number){
 const token=++loadToken;playing=false;play.textContent='播放';clip=clips[index];
 const modelUrl=getCharacter(clip.id).model;
 if(!cache.has(modelUrl))cache.set(modelUrl,(await new GLTFLoader().loadAsync(modelUrl)).scene);
 if(token!==loadToken)return;
 if(athlete)scene.remove(athlete.root);
 athlete=new Athlete(clip.seat);athlete.attachModel(clone(cache.get(modelUrl)!));scene.add(athlete.root);
 const r=clip.launch,mid=(r.fromX+r.toX)/2;
 floor.position.set(mid,-.01,r.toZ);grid.position.set(mid,0,r.toZ);
 camera.position.set(mid+3.2,3,r.toZ+(clip.seat===0?6:-6));camera.lookAt(mid,.8,r.toZ);
 start.position.set(r.fromX,.008,r.fromZ);finish.position.set(r.toX,.008,r.toZ);
 path.geometry.dispose();path.geometry=new T.BufferGeometry().setFromPoints([new T.Vector3(r.fromX,.012,r.fromZ),new T.Vector3(r.toX,.012,r.toZ)]);
 slider.max=String(clip.frames.length-1);seek(0);
}
function render(){
 const f=clip.frames[frame];athlete.update(f.player,f.time,1/120);ball.position.set(f.ball.x,f.ball.y,f.ball.z);
 slider.value=String(frame);time.textContent=`${(f.time-clip.launch.startedAt).toFixed(3)}s`;
 const r=f.player.rescue,phase=r?(f.time<clip.contact?'起跳接近':f.time<clip.launch.startedAt+clip.launch.travel!+.28?'触球后下降':clip.short?'脚落地':'倒地 / 起身'):'已解锁';
 status.textContent=`${getCharacter(clip.id).name} · 正式 GLB · ${phase} | x=${f.player.x.toFixed(3)}m / 落点=${clip.launch.toX.toFixed(3)}m | ${clip.short?'小跳落地即移动':'大跳保留 0.5s 起身'}`;
 renderer.render(scene,camera);
}
function seek(next:number){
 frame=0;
 // Reset footwork by passing a neutral state before replaying sequential frames.
 const first=clip.frames[0];athlete.update({...first.player,rescue:undefined,swing:0},first.time,1/120);
 for(;frame<next;frame++)athlete.update(clip.frames[frame].player,clip.frames[frame].time,1/120);
 render();
}
function jump(t:number){playing=false;play.textContent='播放';seek(Math.max(0,clip.frames.findIndex(f=>f.time>=t)));}
select.onchange=()=>void load(Number(select.value));
slider.oninput=()=>{playing=false;play.textContent='播放';seek(Number(slider.value));};
play.onclick=()=>{playing=!playing;play.textContent=playing?'暂停':'播放';if(frame===clip.frames.length-1)seek(0);};
document.querySelector<HTMLButtonElement>('#contact')!.onclick=()=>jump(clip.contact);
document.querySelector<HTMLButtonElement>('#land')!.onclick=()=>jump(clip.launch.startedAt+clip.launch.travel!+RESCUE.landAt-RESCUE.travel);
document.querySelector<HTMLButtonElement>('#rise')!.onclick=()=>jump(clip.launch.startedAt+clip.launch.travel!+RESCUE.riseAt-RESCUE.travel+.25);
document.querySelector<HTMLButtonElement>('#free')!.onclick=()=>jump(clip.unlock+.25);
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();if(athlete)render();}
addEventListener('resize',resize);resize();await load(0);
let previous=performance.now();
function tick(now:number){
 const dt=Math.min(.1,(now-previous)/1000);previous=now;
 if(playing){elapsed+=dt;while(elapsed>=1/120&&frame<clip.frames.length-1){elapsed-=1/120;frame++;render();}if(frame===clip.frames.length-1){playing=false;play.textContent='播放';}}
 requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
