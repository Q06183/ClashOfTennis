import {Vector3} from 'three';
import {RACKET} from '../simulation/athlete.js';

/** Closest racket shaft direction inside both arms' reach cones. Continuous
 * spherical-cap projection replaces discrete arm-length candidates that popped
 * the wrist between solutions even when the racket head moved smoothly. */
export function solveGrip(tip:Vector3,preferredShaft:Vector3,shoulder:Vector3,supportShoulder?:Vector3){
 const caps:{normal:Vector3;bound:number}[]=[];
 for(const [centre,radius,length] of [[shoulder,.667,RACKET.sweet],...(supportShoulder?[[supportShoulder,.665,RACKET.sweet-RACKET.secondHand]]:[])] as [Vector3,number,number][]){
  const normal=tip.clone().sub(centre),distance=normal.length();
  if(distance<1e-8){if(length>radius)return;continue;}
  const bound=(distance*distance+length*length-radius*radius)/(2*distance*length);
  if(bound>1+1e-8)return;
  if(bound>-1)caps.push({normal:normal.divideScalar(distance),bound:Math.min(1,bound)});
 }
 const wanted=preferredShaft.clone().normalize();
 const valid=(v:Vector3)=>caps.every(c=>v.dot(c.normal)>=c.bound-1e-8);
 if(valid(wanted))return tip.clone().addScaledVector(wanted,-RACKET.sweet);
 const candidates:Vector3[]=[];
 for(const {normal,bound} of caps){
  const tangent=wanted.clone().addScaledVector(normal,-wanted.dot(normal));
  if(tangent.lengthSq()<1e-12)tangent.crossVectors(normal,Math.abs(normal.y)<.9?new Vector3(0,1,0):new Vector3(1,0,0));
  candidates.push(normal.clone().multiplyScalar(bound).addScaledVector(tangent.normalize(),Math.sqrt(Math.max(0,1-bound*bound))));
 }
 if(caps.length===2){
  const [a,b]=caps,dot=a.normal.dot(b.normal),denominator=1-dot*dot;
  if(denominator>1e-10){
   const base=a.normal.clone().multiplyScalar((a.bound-dot*b.bound)/denominator).addScaledVector(b.normal,(b.bound-dot*a.bound)/denominator);
   const height=1-base.lengthSq();
   if(height>=-1e-8){
    const normal=new Vector3().crossVectors(a.normal,b.normal).normalize().multiplyScalar(Math.sqrt(Math.max(0,height)));
    candidates.push(base.clone().add(normal),base.clone().sub(normal));
   }
  }
 }
 let best:Vector3|undefined,score=-Infinity;
 for(const direction of candidates)if(valid(direction)&&direction.dot(wanted)>score){best=direction;score=direction.dot(wanted);}
 return best?tip.clone().addScaledVector(best,-RACKET.sweet):undefined;
}
