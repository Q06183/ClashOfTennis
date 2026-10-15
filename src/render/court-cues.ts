import {Group,Mesh,PlaneGeometry,RingGeometry,EdgesGeometry,LineSegments,LineBasicMaterial,MeshBasicMaterial,DoubleSide} from 'three';
import type {MatchState,Seat} from '../simulation/types.js';
import type {TargetZone} from '../ui/target-drill.js';
import {disposeTree} from './dispose.js';

/**
 * Presentation-only court cues added by the designer review:
 * - target zone for the “目标区” practice drill (G5)
 * - red miss ring where a failed tutorial ball ended (U3)
 * - shrinking timing ring at the receiver's feet while the ball is in reach (G2)
 * None of these change rules or contact; they only read state.
 */
export class CourtCues {
  readonly root=new Group();
  private zone=new Group();
  private zoneFill:Mesh;
  private miss:Mesh;
  private timing:Mesh;
  private pulse=0;
  constructor(){
    this.root.name='court-cues';
    const geometry=new PlaneGeometry(1,1);
    this.zoneFill=new Mesh(geometry,new MeshBasicMaterial({color:0xffd64d,transparent:true,opacity:.28,depthWrite:false,side:DoubleSide,toneMapped:false}));
    const outline=new LineSegments(new EdgesGeometry(geometry),new LineBasicMaterial({color:0xffe98a,transparent:true,opacity:1,depthWrite:false,toneMapped:false}));
    this.zone.add(this.zoneFill,outline);this.zone.rotation.x=-Math.PI/2;this.zone.visible=false;this.zone.name='target-zone';
    this.miss=new Mesh(new RingGeometry(.32,.48,32),new MeshBasicMaterial({color:0xff4d5e,transparent:true,opacity:.9,depthWrite:false,side:DoubleSide,toneMapped:false}));
    this.miss.rotation.x=-Math.PI/2;this.miss.visible=false;this.miss.name='tutorial-miss';
    this.timing=new Mesh(new RingGeometry(.9,1,48),new MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.7,depthWrite:false,side:DoubleSide,toneMapped:false}));
    this.timing.rotation.x=-Math.PI/2;this.timing.visible=false;this.timing.name='timing-ring';this.timing.renderOrder=9;
    this.root.add(this.zone,this.miss,this.timing);
  }
  setZone(zone:TargetZone|null){
    this.zone.visible=!!zone;
    if(!zone)return;
    this.zone.position.set(zone.x,.078,zone.z);this.zone.scale.set(zone.halfWidth*2,zone.halfDepth*2,1);
  }
  setMiss(point:{x:number;z:number}|null){
    this.miss.visible=!!point&&Number.isFinite(point.x)&&Number.isFinite(point.z);
    if(point&&this.miss.visible)this.miss.position.set(point.x,.081,point.z);
  }
  /** Ring closes in as the incoming ball nears the predicted contact. */
  update(state:MatchState,seat:Seat,active:boolean,dt:number){
    const p=state.players[seat],b=state.ball,prep=p?.preparation;
    const show=active&&!!p&&state.phase==='rally'&&b.hitter!==seat&&!!prep&&prep.stroke!=='serve'&&!state.rescueWindow;
    this.timing.visible=show;
    if(!show){this.pulse=0;return;}
    const progress=Math.max(0,Math.min(1,prep!.progress));
    this.pulse+=dt;
    const scale=1.6-1.0*progress;
    this.timing.position.set(p.x,.083,p.z);this.timing.scale.setScalar(scale);
    const material=this.timing.material as MeshBasicMaterial;
    material.color.setHex(progress>.72?0xc4ff00:p.shotQueued?0x7ae2ff:0xffffff);
    material.opacity=.45+.4*progress;
    if(this.miss.visible)(this.miss.material as MeshBasicMaterial).opacity=.6+.3*Math.sin(this.pulse*6);
  }
  dispose(){disposeTree(this.root);}
}
