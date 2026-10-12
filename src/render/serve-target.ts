import {Group,Mesh,PlaneGeometry,MeshBasicMaterial,EdgesGeometry,LineSegments,LineBasicMaterial,DoubleSide} from 'three';
import {COURT} from '../simulation/rules.js';
import {side,type MatchState,type Seat} from '../simulation/types.js';
import {disposeTree} from './dispose.js';

/** The regulation diagonal box, not an aim correction or landing prediction. */
export class ServeTarget {
  readonly root=new Group();
  constructor(){
    this.root.name='legal-serve-target';
    const geometry=new PlaneGeometry(COURT.halfWidth,COURT.service);
    const fill=new Mesh(geometry,new MeshBasicMaterial({color:0xe3f5a9,transparent:true,opacity:.32,depthWrite:false,side:DoubleSide,toneMapped:false}));
    const outline=new LineSegments(new EdgesGeometry(geometry),new LineBasicMaterial({color:0xe9ffae,transparent:true,opacity:1,depthWrite:false,toneMapped:false}));
    this.root.add(fill,outline);this.root.rotation.x=-Math.PI/2;
  }
  update(state:MatchState,seat:Seat,active:boolean){
    this.root.visible=active&&state.phase==='serve'&&state.server===seat&&!state.players[seat]?.preparation;
    if(!this.root.visible)return;
    const sign=side(seat,state),half=sign*((state.score[0]+state.score[1])%2===0?1:-1);
    this.root.position.set(-half*COURT.halfWidth/2,.075,-sign*COURT.service/2);
  }
  dispose(){disposeTree(this.root);}
}
