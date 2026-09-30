import * as T from 'three';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {predictFlight} from '../simulation/trajectory.js';
import {SHOT_PROFILES} from '../simulation/shot-profile.js';
import {COURT,courtHalfWidth,isInServiceBox} from '../simulation/rules.js';
import type {MatchState,Seat} from '../simulation/types.js';
export class FlightGuide {
  readonly root=new T.Group();
  private line:Line2;
  private ring:T.Mesh;
  private dot:T.Mesh;
  constructor(){
    const geometry=new LineGeometry();geometry.setPositions(new Float32Array(41*3));
    this.line=new Line2(geometry,new LineMaterial({color:0xf2ffa5,linewidth:3,dashed:true,dashSize:.26,gapSize:.17,transparent:true,opacity:.95,depthWrite:false,toneMapped:false}));
    this.line.frustumCulled=false;
    this.line.computeLineDistances();
    for(const name of ['instanceStart','instanceDistanceStart'])
      (geometry.attributes[name] as T.InterleavedBufferAttribute).data.setUsage(T.DynamicDrawUsage);
    this.ring=new T.Mesh(new T.RingGeometry(.35,.41,48),new T.MeshBasicMaterial({color:0xf2ffa5,transparent:true,opacity:1,depthWrite:false,toneMapped:false,side:T.DoubleSide}));
    this.ring.rotation.x=-Math.PI/2;
    this.dot=new T.Mesh(new T.CircleGeometry(.09,16),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.8,depthWrite:false}));this.dot.rotation.x=-Math.PI/2;
    this.root.add(this.line,this.ring,this.dot);this.root.visible=false;
  }
  update(draw:MatchState,seat:Seat,visible:boolean,authoritative:MatchState=draw){
    const state=authoritative;
    this.root.visible=visible&&state.phase==='rally'&&state.ball.bounces===0;
    if(!this.root.visible)return;
    const f=predictFlight(state.ball);
    const out=f.hitNet||Math.abs(f.landing.x)>courtHalfWidth(state.mode)||Math.abs(f.landing.z)>COURT.halfLength||(state.rally===1&&!isInServiceBox(f.landing.x,f.landing.z,state.server,state.score[0]+state.score[1],state.ends));
    const color=SHOT_PROFILES[state.ball.tier??(state.ball.critical?'critical':'normal')].color;
    this.line.material.color.setHex(color);
    (this.ring.material as T.MeshBasicMaterial).color.setHex(out?0xff453a:color);
    // Reuse the two GPU buffers. setPositions/computeLineDistances replace
    // attributes and otherwise allocate new WebGL buffers every visible frame.
    const geometry=this.line.geometry;
    const start=geometry.attributes.instanceStart as T.InterleavedBufferAttribute;
    const end=geometry.attributes.instanceEnd as T.InterleavedBufferAttribute;
    const d0=geometry.attributes.instanceDistanceStart as T.InterleavedBufferAttribute;
    const d1=geometry.attributes.instanceDistanceEnd as T.InterleavedBufferAttribute;
    let distance=0;
    for(let i=0;i<f.points.length-1;i++){
      const a=f.points[i],b=f.points[i+1];start.setXYZ(i,a.x,a.y,a.z);end.setXYZ(i,b.x,b.y,b.z);
      d0.setX(i,distance);distance+=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);d1.setX(i,distance);
    }
    start.data.needsUpdate=true;d0.data.needsUpdate=true;
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    this.ring.position.set(f.landing.x,.08,f.landing.z);this.dot.position.set(f.landing.x,.085,f.landing.z);
    this.ring.scale.setScalar(1+Math.sin(state.time*7)*.08);
  }
}
