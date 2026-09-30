import {Group,Mesh,RingGeometry,MeshBasicMaterial,DoubleSide,Shape,ShapeGeometry,Vector3,type PerspectiveCamera} from 'three';
import type {MatchState,Seat} from '../simulation/types.js';
import {disposeTree} from './dispose.js';

/** One local-only, non-interactive marker; never attached to an end-specific rig. */
export class SelfMarker {
 readonly root=new Group();
 readonly ring=new Mesh(new RingGeometry(.40,.57,48),new MeshBasicMaterial({color:0xc4ff00,side:DoubleSide,depthWrite:false,toneMapped:false}));
 readonly arrow=new Group();
 private rim=new Mesh(new RingGeometry(.37,.61,48),new MeshBasicMaterial({color:0x102524,side:DoubleSide,depthWrite:false,toneMapped:false}));
 private point=new Vector3();
 constructor(){
  this.root.name='self-player-marker';this.arrow.name='self-overhead-arrow';this.root.visible=false;
  this.rim.name='self-ring-rim';this.rim.renderOrder=10;this.ring.renderOrder=11;
  this.ring.rotation.x=this.rim.rotation.x=-Math.PI/2;
  const triangle=new Shape();triangle.moveTo(-.65,.5);triangle.lineTo(.65,.5);triangle.lineTo(0,-.5);triangle.closePath();
  const border=new Mesh(new ShapeGeometry(triangle),new MeshBasicMaterial({color:0x102524,side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}));
  const fill=new Mesh(new ShapeGeometry(triangle),new MeshBasicMaterial({color:0xc4ff00,side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}));
  fill.scale.setScalar(.72);fill.position.y=.03;fill.renderOrder=102;border.renderOrder=101;
  this.arrow.add(border,fill);this.root.add(this.rim,this.ring,this.arrow);
 }
 update(state:MatchState,seat:Seat,camera:PerspectiveCamera,height:number,visible:boolean){
  const p=state.players[seat];this.root.visible=visible&&!!p;
  if(!this.root.visible)return;
  this.rim.position.set(p.x,.077,p.z);this.ring.position.set(p.x,.082,p.z);
  this.arrow.position.set(p.x,2.35,p.z);this.arrow.quaternion.copy(camera.quaternion);
  // Constant CSS-pixel height, including zoomed near-camera views.
  const depth=-this.point.copy(this.arrow.position).applyMatrix4(camera.matrixWorldInverse).z;
  const scale=14*2*Math.max(.1,depth)*Math.tan(camera.fov*Math.PI/360)/(Math.max(1,height)*camera.zoom);
  this.arrow.scale.setScalar(scale);
 }
 dispose(){disposeTree(this.root);}
}
