import {singleBackhand} from '../simulation/characters.js';
import {motionValue} from './motion-curve.js';
import {preparationPhase} from './motion-phase.js';
import {servePhase} from '../simulation/serve-motion.js';
import {contactTurn} from '../simulation/athlete.js';
import {Vector3,Euler,Quaternion} from 'three';
import {strokeBody} from './stroke-body.js';
import type {PlayerState} from '../simulation/types.js';
type Key={t:number;tip:number[];shaft:number[];turn:number;knee:number};
export type StrokePose={tip:Vector3;shaft:Vector3;turn:number;knee:number;twoHands:boolean;toss:number;support?:number};
const ready:Key={t:0,tip:[-.05,1.42,.78],shaft:[-.15,.85,.35],turn:0,knee:.22};
const v=(a:number[])=>new Vector3(a[0],a[1],a[2]);
const ease=(t:number)=>t*t*(3-2*t);
function interpolate(keys:Key[],t:number){
 const n=(f:(k:Key)=>number)=>motionValue(keys,t,f);
 return {tip:new Vector3(n(k=>k.tip[0]),n(k=>k.tip[1]),n(k=>k.tip[2])),shaft:new Vector3(n(k=>k.shaft[0]),n(k=>k.shaft[1]),n(k=>k.shaft[2])).normalize(),turn:n(k=>k.turn),knee:n(k=>k.knee)};
}

function servicePose(p:PlayerState,contact:Vector3){
 // Wrist stays beside the throwing shoulder; the racket loops behind the
 // rotating trunk, rather than tracing a circle independently of the body.
 const court=p.serveCourt==='ad'?.12:-.12;
 const armKey=(t:number,hand:number[],shaft:number[],turn:number,knee:number):Key=>{
  const yaw=turn+court*Math.sin(Math.PI*Math.min(1,t));
  const body=strokeBody({...p,preparation:{stroke:'serve',progress:t,contact:{x:0,y:2.65,z:.25}}});
  const rotation=new Quaternion().setFromEuler(new Euler(body.lean,yaw,body.sideBend));
  const s=v(shaft).normalize().applyQuaternion(rotation),w=v(hand).applyQuaternion(rotation);w.y+=body.lift-body.hipDrop;
  return {t,tip:w.addScaledVector(s,.45).toArray(),shaft:s.toArray(),turn:yaw,knee};
 };
 const keys:Key[]=[ready,
  armKey(.16,[-.6,.92,.25],[-.5,.1,.85],-.65,.25),
  armKey(.32,[-.65,1.5,-.12],[-.1,1,.02],-1.2,.4),
  armKey(.54,[-.56,1.85,-.15],[-.1,1,.08],-1.6,.7),
  armKey(.70,[-.5,1.81,-.22],[.15,.7,-.7],-1.5,.52),
  armKey(.80,[-.45,1.67,-.30],[.1,-.3,-.95],-1.18,.3),
  armKey(.86,[-.42,1.73,-.26],[.1,-.97,-.18],-.8,.12),
  armKey(.90,[-.43,1.9,-.16],[-.4,-.5,-.75],-.55,.06),
  {t:.94,tip:[-.58,2.3,-.15],shaft:[.25,.8,-.5],turn:-.35,knee:.05},
  {t:.97,tip:[-.12,2.59,.05],shaft:[.35,.93,.1],turn:-.08,knee:.04},
  {t:1,tip:contact.toArray(),shaft:[0,1,0],turn:0,knee:.05},
  {t:1.08,tip:[-.65,2.12,.9],shaft:[-.15,.98,.15],turn:.12,knee:.1},
  {t:1.2,tip:[.45,.85,.85],shaft:[.7,-.6,.2],turn:.38,knee:.18},
  {t:1.36,tip:[.22,1.03,.72],shaft:[.25,.45,.4],turn:.18,knee:.25},
  {...ready,t:1.6}];
 const t=servePhase(p.preparation?.progress,p.swing),n=(f:(k:Key)=>number)=>motionValue(keys,t,f);
 const hand=new Vector3(...[0,1,2].map(i=>n(k=>k.tip[i]-v(k.shaft).normalize().getComponent(i)*.45)) as [number,number,number]);
 const shaft=new Vector3(...[0,1,2].map(i=>n(k=>k.shaft[i])) as [number,number,number]).normalize();
 const tip=hand.addScaledVector(shaft,.45);
 return {tip,shaft,turn:n(k=>k.turn),knee:n(k=>k.knee),twoHands:false,toss:p.preparation?ease(Math.max(0,Math.min(1,t/.32,(1-t)/.4))):0};
}

/** Body-local key poses: +Z faces the net, -X is the athlete's right side. */
export function strokePose(p:PlayerState,contact:Vector3):StrokePose{
 const preparing=p.preparation,stroke=preparing?.stroke??p.stroke;
 if(stroke==='serve'&&(preparing||p.swing>0))return servicePose(p,contact);
 const slice=stroke==='slice-forehand'||stroke==='slice-backhand';
 const bh=stroke==='backhand'||stroke==='slice-backhand'||((stroke==='volley'||stroke==='lob')&&!!p.backhand),dir=bh?1:-1;
 const one=bh&&singleBackhand(p.characterId);
 const lob=stroke==='lob',volley=stroke==='volley',smash=stroke==='smash',serve=stroke==='serve'||smash;
 const impact:Key={t:1,tip:contact.toArray(),shaft:serve?[0,1,0]:volley?[dir*.4,.85,.1]:[dir*.96,.2,-.25],turn:serve?0:contactTurn(contact.x,contact.z,bh),knee:serve?.05:.22};
 if(!serve&&!volley){
  const late=ease(Math.max(0,Math.min(1,-contact.z/.5)));
  impact.shaft=v(impact.shaft).lerp(new Vector3(dir*.5,.15,-.85),late).toArray();

 }
 const back:Key={t:.52,tip:volley?[dir*.65,1.65,.2]:[dir*.98,1.18,-.18],shaft:volley?[dir*.35,.9,0]:[dir*.85,.15,-.5],turn:dir*(volley?.24:.78),knee:volley?.24:.38};
 let pose;
 {
  const sliceKeys:Key[]=[ready,{t:.48,tip:[dir*.7,1.85,.12],shaft:[dir*.6,.75,-.05],turn:dir*.7,knee:.3},{t:.78,tip:[contact.x,contact.y+.25,contact.z-.12],shaft:impact.shaft,turn:dir*.4,knee:.25},impact];
  const smashKeys:Key[]=[ready,{t:.32,tip:[-.75,1.98,.08],shaft:[-.2,.96,.05],turn:-.45,knee:.25},{t:.55,tip:[-.66,2.18,-.22],shaft:[-.1,.97,-.2],turn:-.8,knee:.3},{t:.78,tip:[-.44,1.5,-.52],shaft:[.1,-.8,-.6],turn:-.5,knee:.18},{t:.9,tip:[-.45,2.1,.08],shaft:[.1,.96,.22],turn:-.18,knee:.08},impact];
  const lobKeys:Key[]=[ready,{t:.45,tip:[dir*.65,1.3,.6],shaft:[dir*.6,.3,.15],turn:dir*.45,knee:.4},{t:.78,tip:[dir*.7,.55,.4],shaft:[dir*.65,.1,.2],turn:dir*.25,knee:.5},impact];
  // These are still canonical right-handed coordinates. Athlete reflects the
  // complete skeleton once; never reflect individual wrists or contact again.
  const forehandKeys:Key[]=[ready,
   {t:.26,tip:[-.78,1.65,.48],shaft:[-.5,.82,.08],turn:-.48,knee:.3},
   {t:.52,tip:[-.94,1.34,-.25],shaft:[-.7,.38,-.6],turn:-1.02,knee:.42},
   {t:.76,tip:[-1.02,.78,.25],shaft:[-.91,-.18,-.25],turn:-.60,knee:.34},impact];
  const doubleKeys:Key[]=[ready,
   {t:.26,tip:[.62,1.48,.37],shaft:[.65,.7,-.08],turn:.65,knee:.3},
   {t:.52,tip:[.70,1.16,-.16],shaft:[.85,.05,-.5],turn:1.14,knee:.41},
   {t:.76,tip:[.78,.83,.26],shaft:[.97,-.18,.05],turn:.83,knee:.34},impact];
  const singleKeys:Key[]=[ready,
   {t:.26,tip:[.62,1.7,.38],shaft:[.4,.9,-.1],turn:.72,knee:.3},
   {t:.52,tip:[.78,1.55,-.26],shaft:[.62,.7,-.35],turn:1.22,knee:.42},
   {t:.76,tip:[.9,.74,.22],shaft:[.95,-.2,-.12],turn:.96,knee:.34},impact];
  const keys=lob?lobKeys:slice?sliceKeys:smash?smashKeys:volley?[ready,back,impact]:bh?(one?singleKeys:doubleKeys):forehandKeys;
  const finish:Key={t:serve?.4:.7,tip:serve?[.45,.85,.85]:volley?contact.clone().add(new Vector3(0,.07,.3)).toArray():[-dir*.5,1.92,.65],shaft:serve?[.7,-.6,.2]:volley?impact.shaft:[-dir*.75,.6,-.12],turn:serve?.38:volley?-dir*.15:-dir*.6,knee:.18};
  const extension:Key={t:.23,tip:[contact.x-.10,Math.min(1.85,contact.y+.18),contact.z+.20],shaft:[.85,.42,.08],turn:.35,knee:.2};
  const sliceFinish:Key={t:.7,tip:[dir*.95,.82,Math.max(.98,contact.z+.42)],shaft:[dir*.8,-.35,.2],turn:dir*.18,knee:.28};
  const lobFinish:Key={t:.65,tip:[dir*.5,2.05,.9],shaft:[dir*.4,.8,.3],turn:-dir*.15,knee:.15};
  const serveExtension:Key={t:.16,tip:[-.65,2.12,.9],shaft:[-.15,.98,.15],turn:.12,knee:.1};
  const oneExtension:Key={t:.25,tip:[contact.x-.1,contact.y+.22,contact.z+.3],shaft:[.85,.5,.1],turn:impact.turn,knee:.17};
  const forehandFollow:Key[]=[
   {t:.3,tip:[-.35,Math.min(1.8,contact.y+.35),Math.max(1.1,contact.z+.35)],shaft:[-.55,.6,.35],turn:.08,knee:.17},
   {t:.65,tip:[.65,2.06,.48],shaft:[.68,.7,-.12],turn:.68,knee:.18},
   {t:.82,tip:[.45,1.86,.46],shaft:[.5,.8,.08],turn:.42,knee:.2},{...ready,t:1}];
  const singleFollow:Key[]=[oneExtension,
   {t:.65,tip:[-.88,2.12,.6],shaft:[-.58,.79,.18],turn:.12,knee:.18},
   {t:.82,tip:[-.78,1.94,.68],shaft:[-.5,.84,.15],turn:.08,knee:.2},{...ready,t:1}];
  const doubleFollow:Key[]=[extension,
   {t:.67,tip:[-.43,2.0,.6],shaft:[-.35,.9,-.2],turn:-.75,knee:.18},
   {t:.83,tip:[-.35,1.8,.62],shaft:[-.35,.9,.1],turn:-.45,knee:.2},{...ready,t:1}];
  const follow=serve?[serveExtension,finish,{...ready,t:1}]:lob?[lobFinish,{...ready,t:1}]:slice?[sliceFinish,{...ready,t:1}]:bh&&!volley?(one?singleFollow:doubleFollow):volley?[finish,{...ready,t:1}]:forehandFollow;
  // One curve crosses impact. .65 s preparation and .44 s recovery share a
  // clock, so the racket no longer brakes to a stop at every pose or impact.
  const recovery=.44/.65;
  const timeline=[...keys,...follow.map(k=>({...k,t:1+k.t*recovery}))];
  const t=preparing?preparationPhase(p):p.swing>0?1+(1-p.swing/.44)*recovery:0;
  pose=interpolate(timeline,t);
 }
 // Charged topspin retains the same contact, with a deeper drop and upward brushing extension.
 if((stroke==='forehand'||stroke==='backhand')&&(p.shotQueued||p.swing>0)){
  const spin=Math.max(0,Math.min(1,p.strokeSpin??0));
  if(preparing)pose.tip.y-=spin*.2*Math.sin(Math.PI*Math.max(0,Math.min(1,(preparing.progress-.5)/.5)))**2;
  else if(p.swing>0){const u=1-p.swing/.44;pose.tip.y+=spin*.18*Math.sin(Math.PI*u)**2;}
 }
 // A predicted contact can still be behind a retreating player. Do not drag
 // the racket toward it until the player has caught up and can set the feet.
 let set=preparing&&!serve?ease(Math.max(0,Math.min(1,(contact.z+.05)/.4,(1.85-Math.hypot(contact.x,contact.z))/.5))):1;
 if(preparing&&!serve&&(p.shotQueued||stroke==='forehand'||stroke==='backhand')){
  const reach=contact.distanceTo(new Vector3(-.31,1.39,.08));
  const reachable=ease(Math.max(0,Math.min(1,(1.5-reach)/.22)));
  set=Math.max(set,reachable*ease(Math.max(0,Math.min(1,(preparing.progress-.55)/.45))));
 }
 if(set<1){pose.tip.lerp(v(ready.tip),1-set);pose.shaft.lerp(v(ready.shaft).normalize(),1-set).normalize();pose.turn*=set;pose.knee=.3+(pose.knee-.3)*set;}
 const support=one&&!slice&&!volley&&preparing?1-ease(Math.max(0,Math.min(1,(preparationPhase(p)-.52)/.2))):0;
 const toss=serve&&!smash&&preparing?ease(Math.max(0,Math.min(1,preparing.progress/.32,(1-preparing.progress)/.4))):0;
 return {...pose,support,twoHands:set<.5||support===1||bh&&!volley&&!slice&&!singleBackhand(p.characterId)||(!preparing&&!p.swing),toss};
}
