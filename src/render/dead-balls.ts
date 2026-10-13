import {Group,Mesh,SphereGeometry,CircleGeometry,MeshStandardMaterial,MeshBasicMaterial} from 'three';
import type {DeadBallState} from '../simulation/types.js';
import {deadBallOpacity} from '../simulation/dead-balls.js';
import {disposeTree} from './dispose.js';

/** Cosmetic balls remain visible even when the active ball resets or celebrates. */
export class DeadBallView {
  readonly root=new Group();
  private meshes=new Map<number,{ball:Mesh;shadow:Mesh;age:number}>();
  constructor(){this.root.name='dead-ball-motion';}
  update(states:readonly DeadBallState[],visible:boolean,dt:number){
    this.root.visible=visible;
    const ids=new Set(states.map(b=>b.id));
    for(const [id,meshes] of this.meshes)if(!ids.has(id)){
      disposeTree(meshes.ball);disposeTree(meshes.shadow);
      this.root.remove(meshes.ball,meshes.shadow);this.meshes.delete(id);
    }
    for(const b of states){
      let meshes=this.meshes.get(b.id);
      if(!meshes){
        const ball=new Mesh(new SphereGeometry(.075,14,10),new MeshStandardMaterial({color:0xe4ff3a,emissive:0x717a03,emissiveIntensity:.35,roughness:.7,transparent:true}));
        const shadow=new Mesh(new CircleGeometry(.24,20),new MeshBasicMaterial({color:0x132f29,transparent:true,opacity:.38,depthWrite:false}));
        ball.castShadow=true;shadow.rotation.x=-Math.PI/2;
        meshes={ball,shadow,age:b.age};this.meshes.set(b.id,meshes);this.root.add(ball,shadow);
      }
      meshes.ball.position.set(b.x,b.y,b.z);
      meshes.shadow.position.set(b.x,.07,b.z);meshes.shadow.scale.setScalar(1+b.y*.09);
      const opacity=deadBallOpacity(b);
      (meshes.ball.material as MeshStandardMaterial).opacity=opacity;
      (meshes.shadow.material as MeshBasicMaterial).opacity=.38*opacity;
      meshes.ball.castShadow=opacity>.5;
      if(!b.settled&&b.age>meshes.age)meshes.ball.rotation.z+=Math.hypot(b.vx,b.vz)*Math.min(dt,b.age-meshes.age);
      meshes.age=b.age;
    }
  }
  dispose(){disposeTree(this.root);this.meshes.clear();}
}
