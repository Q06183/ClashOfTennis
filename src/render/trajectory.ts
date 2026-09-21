import * as T from 'three';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {predictFlight} from '../simulation/trajectory.js';
import {SHOT_PROFILES} from '../simulation/shot-profile.js';
import {COURT,isInServiceBox} from '../simulation/rules.js';
import type {MatchState,Seat} from '../simulation/types.js';
export class FlightGuide {
  readonly root=new T.Group();
  private positions=new Float32Array(41*3);
  private line:Line2;
  private ring:T.Mesh;
  private dot:T.Mesh;
  constructor(){
    const geometry=new LineGeometry();geometry.setPositions(this.positions);
    this.line=new Line2(geometry,new LineMaterial({color:0xf2ffa5,linewidth:3,dashed:true,dashSize:.26,gapSize:.17,transparent:true,opacity:.95,depthWrite:false,toneMapped:false}));
    this.line.frustumCulled=false;
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
    const out=f.hitNet||Math.abs(f.landing.x)>COURT.halfWidth||Math.abs(f.landing.z)>COURT.halfLength||(state.rally===1&&!isInServiceBox(f.landing.x,f.landing.z,state.server,state.score[0]+state.score[1]));
    const color=SHOT_PROFILES[state.ball.tier??(state.ball.critical?'critical':'normal')].color;
    this.line.material.color.setHex(color);
    (this.ring.material as T.MeshBasicMaterial).color.setHex(out?0xff453a:color);
    for(let i=0;i<f.points.length;i++){const p=f.points[i];this.positions.set([p.x,p.y,p.z],i*3);}
    this.line.geometry.setPositions(this.positions);this.line.computeLineDistances();
    this.ring.position.set(f.landing.x,.08,f.landing.z);this.dot.position.set(f.landing.x,.085,f.landing.z);
    this.ring.scale.setScalar(1+Math.sin(state.time*7)*.08);
  }
}
