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

/** Independent expected visible angle after pace assistance. Never undo the
 * actual trajectory: intersect the finger's camera ray plane, soft-map its
 * destination, then project that physical outgoing displacement. */
export function expectedControlledAngle(camera:PerspectiveCamera,contact:Vec,ball:BallState,width:number,height:number,ratio:number){
 const assist=ball.placementAssist??0;
 if(!assist)return Math.atan(ratio);
 const g=flightGravity(ball),duration=(ball.targetZ-contact.z)/ball.vz,dt=Math.min(.1,duration*.5);
 const vy=(.12-contact.y+g*duration*duration/2)/duration;
 const origin=new Vector3(contact.x,contact.y,contact.z),from=origin.clone().project(camera);
 const eye=camera.getWorldPosition(new Vector3());
 const through=new Vector3(from.x+ratio*100/width*2,from.y+100/height*2,.5).unproject(camera);
 const plane=origin.clone().sub(eye).cross(through.sub(eye));
 const y=contact.y+vy*dt-g*dt*dt/2,z=contact.z+ball.vz*dt;
 const x=(plane.dot(eye)-plane.y*y-plane.z*z)/plane.x;
 const raw=contact.x+(x-contact.x)*duration/dt,magnitude=Math.abs(raw);
 const safe=magnitude<=2.6?raw:Math.sign(raw)*(2.6+1.3*(1-Math.exp(-(magnitude-2.6)/1.3)));
 const target=raw+(safe-raw)*assist;
 const to=new Vector3(contact.x+(target-contact.x)*dt/duration,y,z).project(camera);
 return Math.atan2((to.x-from.x)*width,(to.y-from.y)*height);
}
