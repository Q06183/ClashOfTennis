import {Vector3,type PerspectiveCamera} from 'three';
import {clamp,side,type Seat} from '../simulation/types.js';

/** A lower courtside view doubles the near player without changing physical dimensions. */
export function frameMatch(camera:PerspectiveCamera,w:number,h:number,seat:Seat,x:number,depth:number,opponent?:{x:number;z:number}){
 const sign=side(seat),d=clamp(depth,1.1,16.5),behind=14.6,focus=d-9.4;
 camera.aspect=w/h;camera.fov=h<690?37:30;
 // Continue the line from the opposite baseline through the player. This keeps
 // both ends visible when following a wide ball instead of pointing off court.
 camera.position.set(x*(1+behind/(d+11)),6.5,(d+behind)*sign);
 camera.lookAt(x*(focus+11)/(d+11),1,focus*sign);
 camera.updateProjectionMatrix();camera.updateMatrixWorld();
 // Preserve the close baseline view, widening only when an actual opponent
 // approaches the edges during net play or a wide-ball chase.
 if(opponent){
  let fit=1;
  for(const y of [0,2.05]){const p=new Vector3(opponent.x,y,opponent.z).project(camera);fit=Math.max(fit,Math.abs(p.x)/.88,Math.abs(p.y)/.82);}
  if(fit>1){camera.fov=2*Math.atan(Math.tan(camera.fov*Math.PI/360)*fit)*180/Math.PI;camera.updateProjectionMatrix();}
 }
}
