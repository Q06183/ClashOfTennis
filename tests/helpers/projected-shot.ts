import {Vector3,type PerspectiveCamera} from 'three';
import {flightGravity} from '../../src/simulation/flight.js';
import type {BallState,Vec} from '../../src/simulation/types.js';

/** Measure real outgoing motion, without undoing or compensating the aim.
 * Reconstruct launch velocity from delayed pre-bounce snapshots. */
export function projectedOutgoingAngle(camera:PerspectiveCamera,contact:Vec,ball:BallState,width:number,height:number){
 const gravity=flightGravity(ball),elapsed=(ball.z-contact.z)/ball.vz;
 const vy=ball.vy+gravity*elapsed;
 const duration=(ball.targetZ-contact.z)/ball.vz,dt=Math.min(.1,duration*.5);
 const from=new Vector3(contact.x,contact.y,contact.z).project(camera);
 const to=new Vector3(contact.x+ball.vx*dt,contact.y+vy*dt-gravity*dt*dt/2,contact.z+ball.vz*dt).project(camera);
 return Math.atan2((to.x-from.x)*width,(to.y-from.y)*height);
}
