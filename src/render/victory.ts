import {Vector3,type PerspectiveCamera} from 'three';
import type {MatchState} from '../simulation/types.js';

export function victoryPlayer(state:MatchState){
 if(state.phase!=='over'||state.winner===null)return null;
 return {seat:state.winner,player:state.players[state.winner]};
}
/** Fit the complete dance into the free area between the title and result
 * card. The play camera is deliberately unaffected by this framing. */
export function frameVictory(camera:PerspectiveCamera,w:number,h:number,p:{x:number;z:number},sign:number){
 camera.clearViewOffset();camera.zoom=1;camera.aspect=w/h;camera.fov=38;
 camera.position.set(p.x,2.5,p.z-7*sign);camera.lookAt(p.x,1.25,p.z);
 camera.updateProjectionMatrix();camera.updateMatrixWorld();
 const points:Vector3[]=[];
 for(const x of [-1,1])for(const y of [0,2.55])for(const z of [-.45,.45])points.push(new Vector3(p.x+x,y,p.z+z));
 const bounds=()=>{
  const ndc=points.map(v=>v.clone().project(camera));
  return {left:Math.min(...ndc.map(v=>v.x)),right:Math.max(...ndc.map(v=>v.x)),bottom:Math.min(...ndc.map(v=>v.y)),top:Math.max(...ndc.map(v=>v.y))};
 };
 const [left,right,top,bottom]=w<h?[.08,.92,.22,.62]:[.08,.58,.29,.90];
 let b=bounds();
 camera.zoom=Math.min(2*(right-left)/(b.right-b.left),2*(bottom-top)/(b.top-b.bottom));
 camera.updateProjectionMatrix();b=bounds();
 const cx=(b.left+b.right)/2,cy=(b.bottom+b.top)/2,targetX=left+right-1,targetY=1-top-bottom;
 camera.setViewOffset(w,h,(cx-targetX)*w/(2*camera.zoom),-(cy-targetY)*h/(2*camera.zoom),w,h);
 camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
export const VICTORY_DURATION=5.2;
export const victoryEase=(u:number)=>{u=Math.max(0,Math.min(1,u));return u*u*u*(u*(u*6-15)+10);};
type Key={at:number;x:number;drop:number;hips:number;turn:number;bank:number;lean:number;nod:number;tip:number[];hand:number[]};
const key=(at:number,values:Partial<Key>={}):Key=>({
 at,x:0,drop:.045,hips:0,turn:0,bank:0,lean:.025,nod:0,
 tip:[-.58,1.38,.62],hand:[.43,1.05,.22],...values,
});
// One phrase: settle/fist pump, step-touch left and right, salute, finish.
// Pauses separate the gestures; no independent oscillators fighting each other.
const keys:Key[]=[
 key(0),
 key(.38,{drop:.075,turn:-.08,nod:.07,hand:[.43,1.51,.35]}),
 key(.70,{drop:.06,turn:.04,hand:[.48,1.30,.34]}),
 key(1.15,{x:.18,drop:.11,hips:.08,turn:-.10,bank:-.035,hand:[.48,1.34,.34]}),
 key(1.25,{x:.28,drop:.07,hips:.09,turn:.10,bank:-.02,hand:[.49,1.26,.33]}),
 key(1.65,{x:.32,drop:.055,hips:.04,turn:.12,bank:-.025,hand:[.48,1.39,.36]}),
 key(1.85,{x:.32,drop:.08,turn:-.04,hand:[.48,1.30,.33]}),
 key(2.30,{x:.15,drop:.11,hips:-.08,turn:.10,bank:.035,hand:[.48,1.34,.34]}),
 key(2.40,{x:.04,drop:.07,hips:-.09,turn:-.10,bank:.02,hand:[.49,1.26,.33]}),
 key(2.80,{drop:.055,hips:-.04,turn:-.12,bank:.025,hand:[.48,1.39,.36]}),
 key(3.05,{drop:.045,turn:0,hand:[.43,1.18,.27]}),
 key(3.65,{drop:.025,turn:-.10,tip:[-.67,2.24,.42],hand:[.45,1.07,.24],nod:-.05}),
 key(4.15,{drop:.025,turn:-.10,tip:[-.67,2.24,.42],hand:[.45,1.07,.24],nod:-.05}),
 key(VICTORY_DURATION),
];
/** Ankle targets relative to the original station, not moving hips. Each
 * swing starts/ends with zero vertical velocity; the other foot stays planted. */
function step(from:number,to:number,start:number,end:number,time:number){
 const u=Math.max(0,Math.min(1,(time-start)/(end-start))),s= Math.sin(Math.PI*u);
 return new Vector3(from+(to-from)*victoryEase(u),.105+.105*s*s,0);
}
export function victoryPose(time:number){
 const t=Number.isFinite(time)?Math.max(0,Math.min(VICTORY_DURATION,time)):0;
 const i=Math.max(0,keys.findIndex(k=>k.at>=t)-1),a=keys[i],b=keys[i+1];
 const u=victoryEase((t-a.at)/(b.at-a.at)),mix=(name:'x'|'drop'|'hips'|'turn'|'bank'|'lean'|'nod')=>a[name]+(b[name]-a[name])*u;
 const vector=(name:'tip'|'hand')=>new Vector3().fromArray(a[name]).lerp(new Vector3().fromArray(b[name]),u);
 const feet=[t<2.40?step(.24,.65,.70,1.15,t):step(.65,.24,2.40,2.80,t),
  t<1.85?step(-.24,.20,1.25,1.65,t):step(.20,-.24,1.85,2.30,t)];
 return {lift:0,rootX:mix('x'),drop:mix('drop'),hipTurn:mix('hips'),turn:mix('turn'),bank:mix('bank'),lean:mix('lean'),nod:mix('nod'),
  tip:vector('tip'),shaft:new Vector3(-.18,.93,.32).normalize(),hand:vector('hand'),feet};
}
