import {Vector3,type PerspectiveCamera} from 'three';
import {clamp,side,type Seat} from '../simulation/types.js';

export type CameraDistance='near'|'far';
export const cameraDistance=(value:unknown):CameraDistance=>value==='far'?'far':'near';
/** Elevated centred rear framing: regulation court and runoff stay visible.
 * Physical player/court scale is unchanged; only perspective and framing change. */
export function frameMatch(camera:PerspectiveCamera,w:number,h:number,seat:Seat,x:number,depth:number,opponent?:{x:number;z:number},distance:CameraDistance='far'){
 const sign=side(seat),d=clamp(depth,1.1,16.5);
 camera.clearViewOffset();camera.zoom=1;camera.aspect=w/h;camera.fov=35;
 camera.position.set(0,17,34*sign);
 camera.lookAt(0,.6,(2+(d-12.4)*.025)*sign);
 camera.updateProjectionMatrix();camera.updateMatrixWorld();
 const points:Vector3[]=[];
 for(const px of [-5.8,5.8])for(const pz of [-14.7,14.7])points.push(new Vector3(px,0,pz));
 for(const py of [0,2.6])points.push(new Vector3(x,py,d*sign));
 if(opponent)for(const y of [0,2.6])points.push(new Vector3(opponent.x,y,opponent.z));
 const bounds=()=>{
  const projected=points.map(p=>p.clone().project(camera));
  return {left:Math.min(...projected.map(p=>p.x)),right:Math.max(...projected.map(p=>p.x)),bottom:Math.min(...projected.map(p=>p.y)),top:Math.max(...projected.map(p=>p.y))};
 };
 const b=bounds(),fit=Math.max(Math.max(Math.abs(b.left),Math.abs(b.right))/.92,(b.top-b.bottom)/1.32);
 camera.fov=2*Math.atan(Math.tan(camera.fov*Math.PI/360)*fit)*180/Math.PI;
 camera.updateProjectionMatrix();
 const fitted=bounds(),cy=(fitted.bottom+fitted.top)/2;
 // Shift vertically for framing, never sideways: the net stays level and the
 // centre service line remains on screen centre even when players run wide.
 camera.setViewOffset(w,h,0,-cy*h/2,w,h);
 if(distance==='near'){
  // Uniform zoom/crop, not a second camera angle. Every projected length has
  // the same factor, so player/court proportions match the far preset.
  camera.zoom=1.9;camera.updateProjectionMatrix();
  const player=new Vector3(x,.8,d*sign).project(camera);
  camera.setViewOffset(w,h,player.x*w/(2*camera.zoom),-cy*h/2,w,h);
 }
}

/** Same perspective and 1.9x close-up as singles, fitted to ALL four athletes
 * rather than following one player's horizontal crop. In near mode empty
 * sideline/runoff can leave the frame; players cannot. Far keeps the full court. */
export function frameDoublesMatch(camera:PerspectiveCamera,w:number,h:number,seat:Seat,x:number,depth:number,players:readonly {x:number;z:number}[],distance:CameraDistance='near'){
 frameMatch(camera,w,h,seat,x,depth,undefined,'far');
 const points:Vector3[]=[];
 for(const p of players)for(const dx of [-.55,.55])for(const y of [0,2.6]){
  points.push(new Vector3(p.x+dx,y,p.z));
 }
 // Retain court depth even when all four players approach the net.
 for(const z of [-11.885,11.885]){
  points.push(new Vector3(0,0,z));
  if(distance==='far'||players.length===0)for(const px of [-5.8,5.8])points.push(new Vector3(px,0,z));
 }
 const projected=points.map(p=>p.clone().project(camera));
 const left=Math.min(...projected.map(p=>p.x)),right=Math.max(...projected.map(p=>p.x));
 const bottom=Math.min(...projected.map(p=>p.y)),top=Math.max(...projected.map(p=>p.y));
 // Leave HUD space above/below and a body-width margin at either side.
 // The scoreboard is ~80px tall even on a short landscape screen.
 const safeTop=Math.min(.68,1-180/h),safeBottom=-.76;
 const zoom=Math.min(distance==='near'?1.9:1,1.8/(right-left),(safeTop-safeBottom)/(top-bottom));
 camera.clearViewOffset();camera.zoom=zoom;camera.updateProjectionMatrix();
 const fitted=points.map(p=>p.clone().project(camera));
 const cx=(Math.min(...fitted.map(p=>p.x))+Math.max(...fitted.map(p=>p.x)))/2;
 const cy=(Math.min(...fitted.map(p=>p.y))+Math.max(...fitted.map(p=>p.y)))/2;
 camera.setViewOffset(w,h,cx*w/2,-(cy-(safeTop+safeBottom)/2)*h/2,w,h);
}
