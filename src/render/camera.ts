import type {PerspectiveCamera} from 'three';
import {clamp,side,type Seat} from '../simulation/types.js';

/** Close, slightly following view. Physical court/player dimensions stay intact. */
export function frameMatch(camera:PerspectiveCamera,w:number,h:number,seat:Seat,x:number,depth:number){
 const sign=side(seat),retreat=clamp(depth-11,0,5.5)*.9;
 camera.aspect=w/h;
 camera.fov=h<690?37:30;
 camera.position.set(x*.8,20,(40+retreat)*sign);
 camera.lookAt(x*.45,.7,(2.8+retreat)*sign);
 camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
