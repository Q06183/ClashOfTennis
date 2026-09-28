import {Vector3,type PerspectiveCamera} from 'three';
import {swipeDirection} from '../../src/input/aim.js';
import type {BallState,Vec} from '../../src/simulation/types.js';

/** Visible placement direction; it must not depend on when a snapshot arrives. */
export function projectedLandingAngle(camera:PerspectiveCamera,contact:Vec,ball:BallState,width:number,height:number){
 if(ball.aimOrigin){
  const body=ball.aimOrigin,sign=ball.targetZ<body.z?1:-1;
  // Undo the intentional forward-convergence compensation, then independently
  // project the body-centred placement back to the original gesture angle.
  const forward=swipeDirection(camera,body,0,-100,width,height,sign,ball.targetZ);
  const rawX=ball.targetX+forward*Math.abs(ball.targetZ-body.z)*sign;
  const from=new Vector3(body.x,body.y,body.z).project(camera);
  const to=new Vector3(rawX,.12,ball.targetZ).project(camera);
  return Math.atan2((to.x-from.x)*width,(to.y-from.y)*height);
 }
 const from=new Vector3(contact.x,contact.y,contact.z).project(camera);
 const to=new Vector3(ball.targetX,.12,ball.targetZ).project(camera);
 return Math.atan2((to.x-from.x)*width,(to.y-from.y)*height);
}
