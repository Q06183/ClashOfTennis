import {Vector3,type PerspectiveCamera} from 'three';
import type {BallState,Vec} from '../../src/simulation/types.js';

/** Visible placement direction; it must not depend on when a snapshot arrives. */
export function projectedLandingAngle(camera:PerspectiveCamera,contact:Vec,ball:BallState,width:number,height:number){
 const from=new Vector3(contact.x,contact.y,contact.z).project(camera);
 const to=new Vector3(ball.targetX,.12,ball.targetZ).project(camera);
 return Math.atan2((to.x-from.x)*width,(to.y-from.y)*height);
}
