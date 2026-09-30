import {MathUtils,Quaternion,Vector3} from 'three';
import {clamp} from '../simulation/types.js';
/** Feet are planted in world space; stride phase advances with travelled distance. */
export class Footwork {
 private last:Vector3|null=null;
 private phase=0;
 private speed=0;
 private turn=0;
 private feet=[0,1].map(()=>({at:new Vector3(),start:new Vector3(),origin:new Vector3(),landing:new Vector3(),planted:true,settle:0}));
 private direction=new Vector3(0,0,1);
 update(position:Vector3,rotation:Quaternion,dt:number){
  dt=clamp(dt,1/240,.08);
  const delta=this.last?position.clone().sub(this.last):new Vector3();delta.y=0;
  const distance=delta.length(),reset=!this.last||distance>Math.max(1,dt*12);
  let stanceRotation=rotation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),this.turn));
  const neutral=(i:number)=>new Vector3(i?-.19:.19,.105,0).applyQuaternion(stanceRotation).add(position);
  if(reset){this.phase=0;this.speed=0;this.turn=0;this.direction.set(0,0,1).applyQuaternion(rotation);stanceRotation=rotation.clone();this.feet.forEach((f,i)=>{f.at.copy(neutral(i));f.start.copy(f.at);f.landing.copy(f.at);f.planted=true;f.settle=0;});}
  const rawSpeed=reset?0:distance/dt;
  this.speed+=(rawSpeed-this.speed)*(1-Math.exp(-dt*15));
  if(distance>.0001&&!reset)this.direction.copy(delta).normalize();
  const localDirection=this.direction.clone().applyQuaternion(rotation.clone().invert());
  const desiredTurn=Math.atan2(localDirection.x,Math.max(.35,Math.abs(localDirection.z)))*clamp((this.speed-2)/2,0,1);
  this.turn+=(desiredTurn-this.turn)*(1-Math.exp(-dt*10));
  stanceRotation=rotation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),this.turn));
  const stride=Math.max(.45,this.speed/(1.5+this.speed*.13));
  const halfStep=Math.min(.28,stride*.24),stance=clamp(2*halfStep/stride,.18,.58);
  if(!reset)this.phase+=distance/stride;
  const resting=rawSpeed<.12;
  let adjusting=this.feet.findIndex(f=>f.settle>0);
  if(resting&&adjusting<0){
   // Finish an airborne step first, then adjust one grounded foot at a time.
   adjusting=this.feet.findIndex(f=>f.at.y>.115);
   if(adjusting<0)adjusting=this.feet.findIndex((f,i)=>f.at.distanceTo(neutral(i))>.035);
  }
  for(let i=0;i<2;i++){
   const f=this.feet[i],phase=(this.phase+i*.5)%1;
   if(resting){
    if(i===adjusting){
     if(f.settle===0){f.start.copy(f.at);f.landing.copy(neutral(i));}
     f.settle=Math.min(1,f.settle+dt/.2);const u=f.settle,ease=u*u*(3-2*u);
     f.at.lerpVectors(f.start,f.landing,ease);f.at.y+=Math.sin(Math.PI*u)*.09;f.planted=false;
     if(u===1){f.at.copy(f.landing);f.settle=0;f.planted=true;}
    }else f.planted=true;
   }else if(phase<stance){
    f.settle=0;
    if(!f.planted)f.planted=true;
    // A sharp cut may invalidate a planted step. Replant before stretching a leg.
    if(Math.hypot(f.at.x-position.x,f.at.z-position.z)>.57){f.at.copy(neutral(i));}
    f.at.y=.105;
   }else{
    f.settle=0;
    if(f.planted){f.start.copy(f.at);f.origin.copy(position);f.planted=false;}
    const u=(phase-stance)/(1-stance),ease=u*u*(3-2*u);
    // Author swing in body-relative space: predicting the full remaining
    // travel used to stretch the ankle beyond the leg and create a march.
    const startOffset=f.start.clone().sub(f.origin);
    f.landing.copy(neutral(i)).sub(position).addScaledVector(this.direction,halfStep);
    f.at.copy(startOffset).lerp(f.landing,ease).add(position);
    f.at.y=.105+Math.sin(Math.PI*u)*(.055+.018*Math.min(this.speed,6));
   }
  }
  this.last=position.clone();
  const moving=clamp(this.speed/1.5,0,1);
  const hipDrop=.02+moving*(.05+.012*Math.cos(this.phase*Math.PI*4));
  // Roll over the ball of the foot near toe-off. Backpedal/side adjustment
  // retain their own level support; do not fake a forward heel roll there.
  const heelRoll=this.feet.map((f,i)=>{
   const phase=(this.phase+i*.5)%1;
   if(resting)return 0;
   const envelope=phase<stance?MathUtils.smoothstep(phase,stance*.25,stance):
    1-MathUtils.smoothstep((phase-stance)/(1-stance),0,.55);
   return .28*envelope*
    MathUtils.smoothstep(localDirection.z,.3,.85)*moving;
  });
  return {feet:this.feet.map(f=>f.at.clone()),planted:this.feet.map(f=>f.planted),heelRoll,phase:this.phase,speed:this.speed,hipDrop,localDirection,turn:this.turn};
 }
}
