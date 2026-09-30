import {Vector3,MathUtils} from 'three';
import {RESCUE,rescuePose,rescueAge} from '../simulation/rescue.js';
import type {PlayerState,RescueStroke} from '../simulation/types.js';

/** Authored tennis rescue gestures; canonical right-handed body space.
 * Normal strokes use their usual grip. A desperate backhand releases the
 * support hand for reach; volley keeps a short block, smash uses scissors. */
export function rescueStroke(p:PlayerState,time:number,contact:Vector3){
 const r=p.rescue!,age=rescueAge(p,time);
 const kind:RescueStroke=r.stroke??'forehand',bh=r.backhand??kind==='backhand';
 const load=1-MathUtils.smoothstep(age,0,.105);
 const follow=r.hit?MathUtils.smoothstep(age,.23,.53):0;
 const recover=r.short?rescuePose(p,time).recovery:MathUtils.smoothstep(age,RESCUE.riseAt,RESCUE.duration);
 const landing=rescuePose(p,time).landing;
 const reachSide=bh?1:-1;
 const windup=kind==='smash'?new Vector3(-.35,-.55,-.45):
  kind==='volley'?new Vector3(reachSide*.10,.12,-.18):
  new Vector3(reachSide*.36,-.18,-.48);
 const finish=kind==='smash'?new Vector3(.35,1.10,.85):
  kind==='volley'?new Vector3(reachSide*.30,1.32,.85):
  kind==='backhand'?new Vector3(.85,1.75,.45):new Vector3(.35,1.85,.45);
 const tip=contact.clone().addScaledVector(windup,load).lerp(finish,follow)
  .lerp(new Vector3(-.18,.92,.72),MathUtils.smoothstep(age,.38,.58))
  .lerp(new Vector3(-.05,1.42,.78),recover);
 const shaft=kind==='smash'?new Vector3(-.1,.97,.2):
  kind==='volley'?new Vector3(reachSide*.45,.3,.72):
  kind==='backhand'?new Vector3(.78,.30,.35):new Vector3(-.8,.15,.3);
 if(r.short)shaft.normalize().lerp(new Vector3(-.15,.85,.35).normalize(),recover).normalize();
 const turn=(bh?.38:-.10)*(1-recover)+
  (kind==='smash'?-.55:kind==='backhand'?.5:-.45)*load+
  (kind==='forehand'?.38:kind==='backhand'?-.20:kind==='smash'?.22:0)*follow*(1-recover);
 const free=kind==='smash'?new Vector3(.26,1.75-load*.15,.35):
  kind==='backhand'?new Vector3(.70,1.28,-.45):
  kind==='volley'?new Vector3(.5,1.3,.2):new Vector3(.45,1.24,.24);
 free.lerp(new Vector3(.4,r.recovery==='step-out'?1.12:.82,.28),landing).lerp(new Vector3(.38,1.15,.36),recover);
 const flight=Math.sin(Math.PI*MathUtils.clamp(age/.48,0,1));
 const scissors=kind==='smash'?Math.sin(Math.PI*2*MathUtils.clamp(age/.48,0,1))*.24:0;
 const feet=kind==='smash'?[new Vector3(.18,.10+flight*.10,scissors),new Vector3(-.18,.10+flight*.14,-scissors)]:
  kind==='volley'?[new Vector3(.23,.10+flight*.06,.12),new Vector3(-.23,.10+flight*.09,-.12)]:
  kind==='backhand'?[new Vector3(.25,.10+flight*.09,-.14),new Vector3(-.20,.10+flight*.18,.17)]:
  [new Vector3(.22,.10+flight*.17,.13),new Vector3(-.25,.10+flight*.08,-.17)];
 feet.forEach((foot,i)=>foot.lerp(new Vector3((i?-1:1)*(r.short?.19:.22),.105,0),recover));
 return {tip,shaft:shaft.normalize(),turn,knee:.38,twoHands:false,support:r.short?recover:0,toss:0,
  free,feet,lean:kind==='smash'?-.08:kind==='volley'?.08:.04,
  bank:kind==='backhand'?-.12:kind==='volley'?.08:kind==='smash'?.02:.12,
  head:kind==='smash'?-.5:0};
}
