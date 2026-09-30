import {clamp,type Vec,type PlayerState} from './types.js';
/** Swept conservative torso capsule. It deliberately excludes racket/arms;
 * a held rescue is resolved by its existing contact gate instead. */
export function bodyContactTime(from:Vec,to:Vec,p:PlayerState):number|null{
 if(p.rescue)return null;
 const dx=to.x-from.x,dz=to.z-from.z,ox=from.x-p.x,oz=from.z-p.z;
 const a=dx*dx+dz*dz,r=.29;
 const t=a>1e-9?clamp(-(ox*dx+oz*dz)/a,0,1):0;
 if((ox+dx*t)**2+(oz+dz*t)**2>r*r)return null;
 const y=from.y+(to.y-from.y)*t;
 return y>=.45&&y<=1.8?t:null;
}
