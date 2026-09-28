import {clamp,type SwipeAim,type Vec} from './types.js';
/** Snapshot the input view, not a direction evaluated at the incoming ball.
 * Only aiming data crosses the protocol; movement/contact remain authoritative. */
export function validateSwipeAim(value:unknown):SwipeAim|undefined{
 if(!value||typeof value!=='object')return;
 const v=value as SwipeAim;
 if(!Array.isArray(v.projection)||v.projection.length!==9||!v.projection.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e4))return;
 if(v.elevation!==undefined&&(!Array.isArray(v.elevation)||v.elevation.length!==3||!v.elevation.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e4)))return;
 if(typeof v.dx!=='number'||typeof v.dy!=='number'||!Number.isFinite(v.dx)||!Number.isFinite(v.dy)||Math.abs(v.dx)>1e4||Math.abs(v.dy)>1e4)return;
 const length=Math.hypot(v.dx,v.dy);if(length<1e-6)return;
 return {projection:[...v.projection],...(v.elevation?{elevation:[...v.elevation]}:{}),dx:v.dx/length,dy:v.dy/length};
}
/** Intersect the swipe's screen plane with the actual landing-height/depth line.
 * Direction is placement intent, not a velocity sample that changes with pace,
 * gravity or time. Old clients without elevation retain ground-plane mapping. */
export function directionToLanding(aim:SwipeAim,start:Vec,targetZ:number,fallback:number,sign:number){
 const legacy=directionAtContact(aim,start,fallback,sign);
 if(!aim.elevation)return legacy;
 const [xx,xz,xc,yx,yz,yc,wx,wz,wc]=aim.projection,[xy,yy,wy]=aim.elevation;
 const project=(p:Vec)=>{
  const w=wx*p.x+wy*p.y+wz*p.z+wc;
  return w>1e-8?{x:(xx*p.x+xy*p.y+xz*p.z+xc)/w,y:(yx*p.x+yy*p.y+yz*p.z+yc)/w}:null;
 };
 const from=project(start),distance=Math.abs(targetZ-start.z);
 if(!from||distance<1e-6)return legacy;
 const nx=aim.dy*(xx-from.x*wx)-aim.dx*(yx-from.y*wx);
 const ny=aim.dy*(xy-from.x*wy)-aim.dx*(yy-from.y*wy);
 const nz=aim.dy*(xz-from.x*wz)-aim.dx*(yz-from.y*wz);
 if(Math.abs(nx)<1e-8)return legacy;
 const targetX=start.x-(ny*(.12-start.y)+nz*(targetZ-start.z))/nx;
 const raw=(targetX-start.x)/distance*sign,direction=clamp(raw,-4,4);
 const aligned=(d:number)=>{
  const to=project({x:start.x+d*distance*sign,y:.12,z:targetZ});
  return to&&(to.x-from.x)*aim.dx+(to.y-from.y)*aim.dy>0;
 };
 return Number.isFinite(raw)&&aligned(raw)&&aligned(direction)?direction:0;
}
/** Body-centred directional control. Remove the screen motion of a straight
 * court-forward shot before adding the user's lateral intent. This prevents
 * perspective convergence and forehand/backhand contact offsets from steering
 * a vertical swipe sideways. The physical ball still starts at racket contact. */
export function bodyAimTarget(aim:SwipeAim,body:{x:number;z:number},targetZ:number,sign:number){
 const bodyPoint={x:body.x,y:1.1,z:body.z};
 const aimed=directionToLanding(aim,bodyPoint,targetZ,0,sign);
 const forward=directionToLanding({...aim,dx:0,dy:Math.abs(aim.dy)||1},bodyPoint,targetZ,0,sign);
 return body.x+(aimed-forward)*Math.abs(targetZ-body.z)*sign;
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
