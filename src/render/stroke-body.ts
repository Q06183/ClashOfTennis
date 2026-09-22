import {serveTossHand} from '../simulation/serve-motion.js';
import {Vector3} from 'three';
import {clamp,type PlayerState} from '../simulation/types.js';
type BodyKey={t:number;drop:number;hips:number;lean:number;bank:number;lift:number;hand:number[];feet:number[][];face:number;elbow:number[];yaw:number[]};
const neutral={drop:.025,hips:0,lean:.035,bank:0,lift:0,hand:[.38,1.15,.36],feet:[[.22,.105,0],[-.22,.105,0]],face:0,elbow:[-.7,-1,.35],yaw:[0,0]};
const key=(t:number,values:Partial<Omit<BodyKey,'t'>>={}):BodyKey=>({t,...neutral,...values});
const smooth=(v:number)=>{const u=clamp(v,0,1);return u*u*(3-2*u);};
function sample(keys:BodyKey[],t:number){let a=keys[0],b=keys.at(-1)!;for(let i=1;i<keys.length;i++)if(t<=keys[i].t){a=keys[i-1];b=keys[i];break;}const u=smooth((t-a.t)/(b.t-a.t));const n=(k:'drop'|'hips'|'lean'|'bank'|'lift'|'face')=>a[k]+(b[k]-a[k])*u;const v=(a:number[],b:number[])=>new Vector3(...a as [number,number,number]).lerp(new Vector3(...b as [number,number,number]),u);return {hipDrop:n('drop'),hipTurn:n('hips'),lean:n('lean'),sideBend:n('bank'),lift:n('lift'),faceRoll:n('face'),freeHand:v(a.hand,b.hand),elbow:v(a.elbow,b.elbow),footYaw:a.yaw.map((x,i)=>x+(b.yaw[i]-x)*u),feet:[v(a.feet[0],b.feet[0]),v(a.feet[1],b.feet[1])]};}
/** Separate kinetic chains. Feet are body-local ankle targets; lift moves the body and take-off feet together. */
export function strokeBody(p:PlayerState){
 const prep=p.preparation,stroke=prep?.stroke??p.stroke,active=!!prep||p.swing>0;
 const t=prep?clamp(prep.progress,0,1):1+clamp(1-p.swing/.44,0,1),bh=stroke==='backhand'||stroke==='slice-backhand'||(stroke==='volley'||stroke==='lob')&&p.backhand;
 const slice=stroke==='slice-forehand'||stroke==='slice-backhand',dir=bh?1:-1;
 let keys:BodyKey[];
 if(stroke==='serve'){
  const stance=[[.22,.105,.18],[-.24,.105,-.23]],flight=[[.22,.305,.18],[-.24,.305,-.20]];
  keys=[key(0),key(.25,{hips:-.55,lean:-.04,hand:[0,1.75,.25],feet:stance,yaw:[-.35,-1.25],elbow:[-1,.2,-.4]}),
   key(.55,{drop:.18,hips:-.65,lean:-.1,bank:.18,hand:[.05,2.03,.25],feet:stance,yaw:[-.35,-1.25],face:-.65,elbow:[-1,.3,-.35]}),
   key(.72,{drop:.1,hips:-.45,lean:-.07,bank:.12,hand:[.1,1.85,.3],feet:stance,yaw:[-.35,-1.25],face:-1.2,elbow:[-1,.45,-.2]}),
   key(1,{drop:.0045,hips:-.1,lift:.2,hand:[.27,1.3,.3],feet:flight,yaw:[-.15,-.7],elbow:[-.8,.25,-.15]}),
   key(1.38,{drop:.085,hips:.32,lean:.18,bank:-.08,hand:[.46,1.2,.05],feet:[[.16,.105,.29],[-.25,.33,-.32]],yaw:[-.1,-.45],face:.95,elbow:[-.6,-.6,.35]}),
   key(1.72,{drop:.05,hips:.12,lean:.08,feet:[[.2,.105,.13],[-.24,.14,-.1]],face:.25}),key(2)];
 }else if(stroke==='smash'){
  keys=[key(0),key(.38,{drop:.075,hips:-.35,lean:-.07,hand:[.22,1.95,.55],feet:[[.25,.105,.12],[-.24,.105,-.15]],elbow:[-1,.25,-.2]}),key(.74,{drop:.055,hips:-.18,hand:[.25,1.75,.5],face:-.7,elbow:[-1,.25,-.2]}),key(1,{drop:.0045,lift:.2,hand:[.3,1.35,.25],feet:[[.23,.305,.1],[-.23,.305,-.1]],elbow:[-.8,.2,-.1]}),key(1.5,{drop:.09,hips:.2,lean:.13,face:.6}),key(2)];
 }else if(stroke==='volley'){
  const step=bh?[[.23,.105,-.08],[-.23,.105,.21]]:[[.23,.105,.21],[-.23,.105,-.08]];
  keys=[key(0),key(.55,{drop:.08,hips:dir*.2,hand:bh?[.5,1.4,.4]:[.55,1.35,.35]}),key(1,{drop:.0045,hips:dir*.1,feet:step}),key(1.5,{drop:.07,hips:dir*.1,feet:step,hand:bh?[.6,1.25,-.05]:[.55,1.25,.3]}),key(2)];
 }else if(slice){
  const stance=bh?[[.27,.105,-.16],[-.25,.105,.2]]:[[.26,.105,.19],[-.28,.105,-.17]];
  keys=[key(0),key(.5,{drop:.09,hips:dir*.45,lean:.02,hand:bh?[.5,1.48,.02]:[.6,1.35,.5],feet:stance,face:-dir*.28}),key(.8,{drop:.06,hips:dir*.35,hand:bh?[.83,1.3,-.43]:[.45,1.35,.4],feet:stance,face:-dir*.22}),key(1,{drop:.0045,hips:dir*.25,hand:bh?[.88,1.28,-.52]:[.4,1.25,.32],feet:stance,face:-dir*.22}),key(1.65,{drop:.055,hips:dir*.28,lean:.08,hand:bh?[.9,1.3,-.55]:[.48,1.35,.15],feet:stance,face:-dir*.15}),key(2)];
 }else{
  const stance=bh?[[.27,.105,-.13],[-.3,.105,.15]]:[[.3,.105,.12],[-.32,.105,-.12]];
  keys=[key(0),key(.5,{drop:bh?.13:.115,hips:dir*.48,lean:.055,hand:[.7,1.38,.65],feet:stance}),key(.8,{drop:.075,hips:dir*.2,hand:[.46,1.4,.42],feet:stance}),key(1,{drop:.0045,hips:dir*.08,hand:[.3,1.28,.36],feet:stance}),key(1.5,{drop:.04,hips:-dir*.36,lean:.07,hand:[.26,1.4,.38],feet:stance,face:-dir*.45}),key(2)];
 }
 const pose=sample(keys,t);if(stroke==='serve'&&prep)pose.freeHand.set(0,serveTossHand(prep.progress),.25);return {...pose,blend:active?1:0};
}
