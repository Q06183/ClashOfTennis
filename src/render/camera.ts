import {Vector3,type PerspectiveCamera} from 'three';
import {clamp,side,type Seat} from '../simulation/types.js';

export type CameraDistance='near'|'far';
export const cameraDistance=(value:unknown):CameraDistance=>value==='far'?'far':'near';
/** Elevated centred rear framing: regulation court and runoff stay visible.
 * Physical player/court scale is unchanged; only perspective and framing change. */
export function frameMatch(camera:PerspectiveCamera,w:number,h:number,seat:Seat,x:number,depth:number,opponent?:{x:number;z:number},distance:CameraDistance='far'){
 const sign=side(seat),d=clamp(depth,1.1,16.5);
 camera.clearViewOffset();camera.aspect=w/h;camera.fov=35;
 if(distance==='near'){
  const follow=clamp(x,-6.4,6.4)*.8;
  camera.fov=32;
  camera.position.set(follow,8.5,(d+17)*sign);
  camera.lookAt(follow,1,(d-8)*sign);
  camera.updateProjectionMatrix();camera.updateMatrixWorld();
  let fit=1;
  for(const player of [{x,z:d*sign},...(opponent?[opponent]:[])]){
   for(const y of [0,2.2]){
    const p=new Vector3(player.x,y,player.z).project(camera);
    fit=Math.max(fit,Math.abs(p.x)/.9,Math.abs(p.y)/.78);
   }
  }
  if(fit>1){camera.fov=2*Math.atan(Math.tan(camera.fov*Math.PI/360)*fit)*180/Math.PI;camera.updateProjectionMatrix();}
  return;
 }
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
}
