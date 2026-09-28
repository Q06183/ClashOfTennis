import {shotDepth} from '../simulation/shot-profile.js';
import {directionToLanding} from '../simulation/shot-aim.js';
import {PerspectiveCamera,Vector2,Vector3,Raycaster,Plane,Matrix4} from 'three';
import type {Vec,Shot,PlayerState,SwipeAim} from '../simulation/types.js';
/** Convert a screen-space direction at the ball into a court-space heading. */
export function swipeDirection(camera:PerspectiveCamera,ball:Vec,dx:number,dy:number,width:number,height:number,sign:number,landingZ?:number){
  if(landingZ!==undefined){
    // A serve starts above the head, not on the court. Intersect the swipe's
    // screen plane with the actual landing-height/depth line.
    const origin=new Vector3(ball.x,ball.y,ball.z),ndc=origin.clone().project(camera),eye=camera.getWorldPosition(new Vector3());
    const length=Math.hypot(dx,dy)||1,step=Math.min(width,height)*.15;
    const along=new Vector3(ndc.x+dx/length*step/width*2,ndc.y-dy/length*step/height*2,.5).unproject(camera);
    const normal=origin.clone().sub(eye).cross(along.sub(eye));
    if(Math.abs(normal.x)<1e-9)return 0;
    const x=(normal.dot(eye)-normal.y*.12-normal.z*landingZ)/normal.x;
    return (x-ball.x)*sign/Math.max(.001,Math.abs(landingZ-ball.z));
  }
  const origin=new Vector3(ball.x,0,ball.z),ndc=origin.clone().project(camera);
  const length=Math.hypot(dx,dy)||1;
  const step=Math.min(width,height)*.15;
  const ray=new Raycaster();ray.setFromCamera(new Vector2(ndc.x+dx/length*step/width*2,ndc.y-dy/length*step/height*2),camera);
  const target=new Vector3();
  if(!ray.ray.intersectPlane(new Plane(new Vector3(0,1,0),0),target))return 0;
  const forward=(origin.z-target.z)*sign;
  return forward>.001?(target.x-origin.x)*sign/forward:0;
}

/** Slice reverses the screen gesture before projecting through either player's camera. */
export function shotDirection(camera:PerspectiveCamera,ball:Vec,shot:Shot,dx:number,dy:number,width:number,height:number,sign:number,landingZ?:number){
 const reverse=shot.slice?-1:1;return swipeDirection(camera,ball,dx*reverse,dy*reverse,width,height,sign,landingZ);
}

/** Serve and rally use the same visible contact-to-landing direction contract. */
export function serveDirection(camera:PerspectiveCamera,ball:Vec,player:PlayerState,shot:Shot,dx:number,dy:number,width:number,height:number,sign:number){
 return directionToLanding(captureSwipeAim(camera,shot,dx,dy,width,height),
  {...ball,y:2.65},-sign*shotDepth(shot,true),0,sign);
}

/** Keep the gesture and input camera basis until the authority knows contact. */
export function captureSwipeAim(camera:PerspectiveCamera,shot:Shot,dx:number,dy:number,width:number,height:number):SwipeAim{
 const e=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).elements,reverse=shot.slice?-1:1;
 return {projection:[e[0],e[8],e[12],e[1],e[9],e[13],e[3],e[11],e[15]],elevation:[e[4],e[5],e[7]],dx:dx/width*reverse,dy:-dy/height*reverse};
}
