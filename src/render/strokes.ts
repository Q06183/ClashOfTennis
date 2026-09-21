import {Vector3} from 'three';
import type {PlayerState} from '../simulation/types.js';
type Key={t:number;tip:number[];shaft:number[];turn:number;knee:number};
export type StrokePose={tip:Vector3;shaft:Vector3;turn:number;knee:number;twoHands:boolean;toss:number};
const ready:Key={t:0,tip:[-.05,1.42,.78],shaft:[-.15,.85,.35],turn:0,knee:.22};
const v=(a:number[])=>new Vector3(a[0],a[1],a[2]);
const ease=(t:number)=>t*t*(3-2*t);
function interpolate(keys:Key[],t:number){
 let a=keys[0],b=keys[keys.length-1];for(let i=1;i<keys.length;i++)if(t<=keys[i].t){a=keys[i-1];b=keys[i];break;}
 const u=ease(Math.max(0,Math.min(1,(t-a.t)/Math.max(.0001,b.t-a.t))));
 return {tip:v(a.tip).lerp(v(b.tip),u),shaft:v(a.shaft).lerp(v(b.shaft),u).normalize(),turn:a.turn+(b.turn-a.turn)*u,knee:a.knee+(b.knee-a.knee)*u};
}
/** Body-local key poses: +Z faces the net, -X is the athlete's right side. */
export function strokePose(p:PlayerState,contact:Vector3):StrokePose{
 const preparing=p.preparation,stroke=preparing?.stroke??p.stroke;
 const bh=stroke==='backhand'||((stroke==='volley'||stroke==='lob')&&p.backhand),dir=bh?1:-1;
 const volley=stroke==='volley',serve=stroke==='serve';
 const impact:Key={t:1,tip:contact.toArray(),shaft:serve?[0,1,0]:volley?[dir*.4,.85,.1]:[dir*.96,.2,.08],turn:0,knee:serve?.05:.22};
 if(!serve&&!volley){
  const late=ease(Math.max(0,Math.min(1,-contact.z/.5)));
  impact.shaft=v(impact.shaft).lerp(new Vector3(dir*.5,.15,-.85),late).toArray();
  impact.turn=dir*.55*late;
 }
 const back:Key={t:.52,tip:volley?[dir*.65,1.65,.2]:[dir*.98,1.18,-.18],shaft:volley?[dir*.35,.9,0]:[dir*.85,.15,-.5],turn:dir*(volley?.24:.78),knee:volley?.24:.38};
 let pose;
 if(preparing){
  const t=preparing.progress;
  const outside:Key={t:.26,tip:[dir*.85,1.5,.52],shaft:[dir*.65,.6,.1],turn:dir*.35,knee:.3};
  const forward:Key={t:.78,tip:[dir*1.02,.98,.4],shaft:[dir*.98,.1,.05],turn:dir*.32,knee:.3};
  const keys=serve?[ready,{t:.32,tip:[-.65,2.13,-.25],shaft:[-.1,.95,-.1],turn:-.65,knee:.52},{t:.64,tip:[-.4,1.25,-.66],shaft:[.1,-1,0],turn:-.65,knee:.5},{t:.84,tip:[-.28,2.2,-.2],shaft:[0,.95,.1],turn:-.25,knee:.2},impact]:volley?[ready,back,impact]:[ready,outside,back,forward,impact];
  pose=interpolate(keys,serve?t:p.shotQueued?t:Math.min(t,.6));
 }else if(p.swing>0){
  const t=Math.max(0,Math.min(1,1-p.swing/.44));
  const finish:Key={t:.7,tip:serve?[.45,.85,.5]:volley?contact.clone().add(new Vector3(0,.07,.3)).toArray():[-dir*.5,1.92,.2],shaft:serve?[.7,-.6,.2]:volley?impact.shaft:[-dir*.75,.6,-.12],turn:serve?.38:volley?-dir*.15:-dir*.6,knee:.18};
  pose=interpolate([{...impact,t:0},finish,{...ready,t:1}],t);
 }else pose=interpolate([ready,{...ready,t:1}],0);
 // A predicted contact can still be behind a retreating player. Do not drag
 // the racket toward it until the player has caught up and can set the feet.
 let set=preparing&&!serve?ease(Math.max(0,Math.min(1,(contact.z+.05)/.4,(1.85-Math.hypot(contact.x,contact.z))/.5))):1;
 if(preparing&&!serve&&p.shotQueued){
  const reach=contact.distanceTo(new Vector3(-.31,1.39,.08));
  const reachable=ease(Math.max(0,Math.min(1,(1.5-reach)/.22)));
  set=Math.max(set,reachable*ease(Math.max(0,Math.min(1,(preparing.progress-.55)/.45))));
 }
 if(set<1){pose.tip.lerp(v(ready.tip),1-set);pose.shaft.lerp(v(ready.shaft).normalize(),1-set).normalize();pose.turn*=set;pose.knee=.3+(pose.knee-.3)*set;}
 const toss=serve&&preparing?ease(Math.max(0,Math.min(1,preparing.progress/.32,(1-preparing.progress)/.4))):0;
 return {...pose,twoHands:set<.5||bh&&!volley||(!preparing&&!p.swing),toss};
}
