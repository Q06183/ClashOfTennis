import {clamp,type SwipeAim,type Vec} from './types.js';
/** Snapshot the input view, not a direction evaluated at the incoming ball.
 * Only aiming data crosses the protocol; movement/contact remain authoritative. */
export function validateSwipeAim(value:unknown):SwipeAim|undefined{
 if(!value||typeof value!=='object')return;
 const v=value as SwipeAim;
 if(!Array.isArray(v.projection)||v.projection.length!==9||!v.projection.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e4))return;
 if(typeof v.dx!=='number'||typeof v.dy!=='number'||!Number.isFinite(v.dx)||!Number.isFinite(v.dy)||Math.abs(v.dx)>1e4||Math.abs(v.dy)>1e4)return;
 const length=Math.hypot(v.dx,v.dy);if(length<1e-6)return;
 return {projection:[...v.projection],dx:v.dx/length,dy:v.dy/length};
}
/** Projective ground-plane direction at the actual contact x/z. This preserves
 * the user's screen-space aim as the receiving position changes before impact. */
export function directionAtContact(aim:SwipeAim,contact:Vec,fallback:number,sign:number){
 const [xx,xz,xc,yx,yz,yc,wx,wz,wc]=aim.projection,{x,z}=contact;
 const w=wx*x+wz*z+wc;if(Math.abs(w)<1e-8)return fallback;
 const sx=(xx*x+xz*z+xc)/w,sy=(yx*x+yz*z+yc)/w;
 const nx=aim.dy*(xx-sx*wx)-aim.dx*(yx-sy*wx),nz=aim.dy*(xz-sx*wz)-aim.dx*(yz-sy*wz);
 if(Math.abs(nx)<1e-8)return fallback;
 const raw=nz/nx,direction=clamp(raw,-4,4);
 const aligned=(d:number)=>{
  const screenX=((xx-sx*wx)*d-(xz-sx*wz))*sign/w;
  const screenY=((yx-sy*wx)*d-(yz-sy*wz))*sign/w;
  return screenX*aim.dx+screenY*aim.dy>0;
 };
 // A projected line has two directions. Very sideways swipes in an oblique
 // camera can select its backwards half; never reverse the user's intention.
 return aligned(raw)&&aligned(direction)?direction:0;
}
