import * as T from 'three';
import {predictFlight} from '../simulation/trajectory.js';
import {COURT} from '../simulation/rules.js';
import type {MatchState,Seat} from '../simulation/types.js';
export class FlightGuide {
  readonly root=new T.Group();
  private positions=new Float32Array(41*3);
  private line:T.Line;
  private ring:T.Mesh;
  private dot:T.Mesh;
  constructor(){
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(this.positions,3));
    this.line=new T.Line(geometry,new T.LineDashedMaterial({color:0xf2ffa5,dashSize:.26,gapSize:.17,transparent:true,opacity:.75,depthWrite:false}));
    this.line.frustumCulled=false;
    this.ring=new T.Mesh(new T.RingGeometry(.35,.41,48),new T.MeshBasicMaterial({color:0xf2ffa5,transparent:true,opacity:.9,depthWrite:false,side:T.DoubleSide}));
    this.ring.rotation.x=-Math.PI/2;
    this.dot=new T.Mesh(new T.CircleGeometry(.09,16),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.8,depthWrite:false}));this.dot.rotation.x=-Math.PI/2;
    this.root.add(this.line,this.ring,this.dot);this.root.visible=false;
  }
  update(draw:MatchState,seat:Seat,visible:boolean,authoritative:MatchState=draw){
    const state=authoritative;
    this.root.visible=visible&&state.phase==='rally'&&state.ball.bounces===0;
    if(!this.root.visible)return;
    const f=predictFlight(state.ball);
    const out=f.hitNet||Math.abs(f.landing.x)>COURT.halfWidth||Math.abs(f.landing.z)>COURT.halfLength;
    const color=out?0xff9a69:state.ball.hitter===seat?0xeaff91:0x9eeaff;
    (this.line.material as T.LineDashedMaterial).color.setHex(color);
    (this.ring.material as T.MeshBasicMaterial).color.setHex(color);
    for(let i=0;i<f.points.length;i++){const p=f.points[i];this.positions.set([p.x,p.y,p.z],i*3);}
    this.line.geometry.attributes.position.needsUpdate=true;this.line.computeLineDistances();
    this.ring.position.set(f.landing.x,.08,f.landing.z);this.dot.position.set(f.landing.x,.085,f.landing.z);
    this.ring.scale.setScalar(1+Math.sin(state.time*7)*.08);
  }
}
