import {PerspectiveCamera,Vector2,Vector3,Raycaster,Plane} from 'three';
import type {Vec} from '../simulation/types.js';
/** Convert a screen-space direction at the ball into a court-space heading. */
export function swipeDirection(camera:PerspectiveCamera,ball:Vec,dx:number,dy:number,width:number,height:number,sign:number){
  const origin=new Vector3(ball.x,0,ball.z),ndc=origin.clone().project(camera);
  const length=Math.hypot(dx,dy)||1;
  const step=Math.min(width,height)*.15;
  const ray=new Raycaster();ray.setFromCamera(new Vector2(ndc.x+dx/length*step/width*2,ndc.y-dy/length*step/height*2),camera);
  const target=new Vector3();
  if(!ray.ray.intersectPlane(new Plane(new Vector3(0,1,0),0),target))return 0;
  const forward=(origin.z-target.z)*sign;
  return forward>.001?(target.x-origin.x)*sign/forward:0;
}
