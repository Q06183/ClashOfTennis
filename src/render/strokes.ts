import {contactTurn} from '../simulation/athlete.js';
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
 const slice=stroke==='slice-forehand'||stroke==='slice-backhand';
 const bh=stroke==='backhand'||stroke==='slice-backhand'||((stroke==='volley'||stroke==='lob')&&!!p.backhand),dir=bh?1:-1;
 const lob=stroke==='lob',volley=stroke==='volley',smash=stroke==='smash',serve=stroke==='serve'||smash;
 const impact:Key={t:1,tip:contact.toArray(),shaft:serve?[0,1,0]:volley?[dir*.4,.85,.1]:[dir*.96,.2,-.25],turn:serve?0:contactTurn(contact.x,contact.z,bh),knee:serve?.05:.22};
 if(!serve&&!volley){
  const late=ease(Math.max(0,Math.min(1,-contact.z/.5)));
  impact.shaft=v(impact.shaft).lerp(new Vector3(dir*.5,.15,-.85),late).toArray();

 }
 const back:Key={t:.52,tip:volley?[dir*.65,1.65,.2]:[dir*.98,1.18,-.18],shaft:volley?[dir*.35,.9,0]:[dir*.85,.15,-.5],turn:dir*(volley?.24:.78),knee:volley?.24:.38};
 let pose;
 if(preparing){
  const t=preparing.progress;
  const outside:Key={t:.26,tip:[dir*.85,1.5,.52],shaft:[dir*.65,.6,.1],turn:dir*.35,knee:.3};
  const forward:Key={t:.78,tip:[dir*1.02,.98,.4],shaft:[dir*.98,.1,.05],turn:dir*.32,knee:.3};
  const bhKeys:Key[]=[ready,
   {t:.26,tip:[.58,1.62,.35],shaft:[.45,.86,-.12],turn:.65,knee:.3},
   {t:.52,tip:[.72,1.22,-.20],shaft:[.85,.05,-.5],turn:1.10,knee:.38},
   {t:.78,tip:[.78,.86,.28],shaft:[.97,-.18,.05],turn:.85,knee:.34},impact];
  const sliceKeys:Key[]=[ready,{t:.48,tip:[dir*.7,1.85,.12],shaft:[dir*.6,.75,-.05],turn:dir*.7,knee:.3},{t:.78,tip:[contact.x,contact.y+.25,contact.z-.12],shaft:impact.shaft,turn:dir*.4,knee:.25},impact];
  const smashKeys:Key[]=[ready,{t:.32,tip:[-.75,1.98,.08],shaft:[-.2,.96,.05],turn:-.45,knee:.25},{t:.68,tip:[-.55,1.75,-.26],shaft:[-.2,.9,-.25],turn:-.4,knee:.28},impact];
  const lobKeys:Key[]=[ready,{t:.45,tip:[dir*.65,1.3,.6],shaft:[dir*.6,.3,.15],turn:dir*.45,knee:.4},{t:.78,tip:[dir*.7,.55,.4],shaft:[dir*.65,.1,.2],turn:dir*.25,knee:.5},impact];
  const keys=lob?lobKeys:slice?sliceKeys:smash?smashKeys:serve?[ready,{t:.16,tip:[-.75,1.02,.22],shaft:[-.55,.35,.4],turn:-.45,knee:.25},{t:.32,tip:[-.8,1.8,-.05],shaft:[-.25,.95,.02],turn:-.8,knee:.4},{t:.52,tip:[-.65,2.14,-.25],shaft:[.02,1,.02],turn:-.95,knee:.7},{t:.72,tip:[-.68,1.23,-.7],shaft:[.12,-1,.01],turn:-.8,knee:.55},{t:.88,tip:[-.45,2.28,.05],shaft:[.5,.85,.1],turn:-.3,knee:.2},{t:.96,tip:[-.16,2.59,.28],shaft:[.35,.92,.05],turn:-.08,knee:.08},impact]:volley?[ready,back,impact]:bh?bhKeys:[ready,outside,back,forward,impact];
  pose=interpolate(keys,serve?t:p.shotQueued?t:Math.min(t,.6));
 }else if(p.swing>0){
  const t=Math.max(0,Math.min(1,1-p.swing/.44));
  const finish:Key={t:serve?.4:.7,tip:serve?[.45,.85,.85]:volley?contact.clone().add(new Vector3(0,.07,.3)).toArray():[-dir*.5,1.92,.65],shaft:serve?[.7,-.6,.2]:volley?impact.shaft:[-dir*.75,.6,-.12],turn:serve?.38:volley?-dir*.15:-dir*.6,knee:.18};
  const extension:Key={t:.23,tip:[contact.x-.10,Math.min(1.85,contact.y+.18),contact.z+.20],shaft:[.85,.42,.08],turn:.35,knee:.2};
  const bhFinish:Key={t:.7,tip:[-.43,2.02,.6],shaft:[-.35,.9,-.2],turn:-.7,knee:.18};
  const sliceFinish:Key={t:.7,tip:[dir*.95,.82,Math.max(.98,contact.z+.42)],shaft:[dir*.8,-.35,.2],turn:dir*.18,knee:.28};
  const lobFinish:Key={t:.65,tip:[dir*.5,2.05,.9],shaft:[dir*.4,.8,.3],turn:-dir*.15,knee:.15};
  const serveExtension:Key={t:.16,tip:[-.65,2.12,.9],shaft:[-.15,.98,.15],turn:.12,knee:.1};
  pose=interpolate(serve?[{...impact,t:0},serveExtension,finish,{...ready,t:1}]:lob?[{...impact,t:0},lobFinish,{...ready,t:1}]:slice?[{...impact,t:0},sliceFinish,{...ready,t:1}]:bh&&!volley?[{...impact,t:0},extension,bhFinish,{...ready,t:1}]:[{...impact,t:0},finish,{...ready,t:1}],t);
 }else pose=interpolate([ready,{...ready,t:1}],0);
 // Charged topspin retains the same contact, with a deeper drop and upward brushing extension.
 if((stroke==='forehand'||stroke==='backhand')&&(p.shotQueued||p.swing>0)){
  const spin=Math.max(0,Math.min(1,p.strokeSpin??0));
  if(preparing)pose.tip.y-=spin*.2*Math.sin(Math.PI*Math.max(0,Math.min(1,(preparing.progress-.5)/.5)));
  else if(p.swing>0){const u=1-p.swing/.44;pose.tip.y+=spin*.18*Math.sin(Math.PI*u);}
 }
 // A predicted contact can still be behind a retreating player. Do not drag
 // the racket toward it until the player has caught up and can set the feet.
 let set=preparing&&!serve?ease(Math.max(0,Math.min(1,(contact.z+.05)/.4,(1.85-Math.hypot(contact.x,contact.z))/.5))):1;
 if(preparing&&!serve&&p.shotQueued){
  const reach=contact.distanceTo(new Vector3(-.31,1.39,.08));
  const reachable=ease(Math.max(0,Math.min(1,(1.5-reach)/.22)));
  set=Math.max(set,reachable*ease(Math.max(0,Math.min(1,(preparing.progress-.55)/.45))));
 }
 if(set<1){pose.tip.lerp(v(ready.tip),1-set);pose.shaft.lerp(v(ready.shaft).normalize(),1-set).normalize();pose.turn*=set;pose.knee=.3+(pose.knee-.3)*set;}
 const toss=serve&&!smash&&preparing?ease(Math.max(0,Math.min(1,preparing.progress/.32,(1-preparing.progress)/.4))):0;
 return {...pose,twoHands:set<.5||bh&&!volley&&!slice||(!preparing&&!p.swing),toss};
}
