import * as T from 'three';
import type { PlayerState, Seat } from '../simulation/types.js';

const material=(color:number)=>new T.MeshStandardMaterial({color,roughness:.85});
export class Athlete {
  readonly root=new T.Group();
  private torso=new T.Group();
  private arms=[new T.Group(),new T.Group()];
  private legs=[new T.Group(),new T.Group()];
  private skin=material(0xdba177);
  constructor(readonly seat:Seat){
    const shirt=material(seat===0?0xecebdc:0xe97648),shorts=material(seat===0?0x153f45:0x324352),white=material(0xf9f6e9),hair=material(0x382b25);
    const mesh=(g:T.BufferGeometry,m:T.Material,parent:T.Object3D,x:number,y:number,z:number)=>{
      const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;
    };
    this.root.add(this.torso);
    const body=mesh(new T.CapsuleGeometry(.28,.38,4,10),shirt,this.torso,0,1.2,0);body.scale.z=.7;
    mesh(new T.SphereGeometry(.26,12,8),shorts,this.torso,0,.89,0).scale.set(1.1,.62,.85);
    mesh(new T.CylinderGeometry(.09,.1,.15,8),this.skin,this.torso,0,1.56,0);
    mesh(new T.SphereGeometry(.215,14,10),this.skin,this.torso,0,1.77,0).scale.set(.9,1.1,.9);
    const hairMesh=mesh(new T.SphereGeometry(.222,12,8,0,Math.PI*2,0,Math.PI*.52),hair,this.torso,0,1.8,0);hairMesh.scale.set(.95,1,.95);
    mesh(new T.CylinderGeometry(.22,.22,.062,16),shirt,this.torso,0,1.88,0);
    const brim=mesh(new T.SphereGeometry(.23,12,6),shirt,this.torso,0,1.87,.13);brim.scale.set(1,.11,1.1);
    for(const x of [-.075,.075])mesh(new T.SphereGeometry(.023,6,4),hair,this.torso,x,1.79,.18);
    for(let i=0;i<2;i++){
      const sign=i?1:-1;
      const arm=this.arms[i];arm.position.set(sign*.31,1.39,0);this.torso.add(arm);
      mesh(new T.CapsuleGeometry(.108,.17,3,8),shirt,arm,0,-.08,0);
      mesh(new T.CapsuleGeometry(.08,.32,3,8),this.skin,arm,0,-.36,.025);
      mesh(new T.CylinderGeometry(.086,.086,.075,8),white,arm,0,-.5,.025);
      mesh(new T.SphereGeometry(.09,8,6),this.skin,arm,0,-.57,.045);
      const leg=this.legs[i];leg.position.set(sign*.145,.85,0);this.root.add(leg);
      mesh(new T.CapsuleGeometry(.125,.22,3,8),shorts,leg,0,-.1,0);
      mesh(new T.CapsuleGeometry(.082,.32,3,8),this.skin,leg,0,-.43,0);
      mesh(new T.CylinderGeometry(.09,.084,.2,8),white,leg,0,-.61,0);
      const shoe=mesh(new T.SphereGeometry(.13,10,6),white,leg,0,-.75,.075);shoe.scale.set(.8,.55,1.8);
    }
    const racket=new T.Group();racket.position.set(0,-.58,.05);racket.rotation.x=.3;this.arms[1].add(racket);
    mesh(new T.CylinderGeometry(.037,.037,.33,8),material(0x162a30),racket,0,-.15,0);
    const hoop=mesh(new T.TorusGeometry(.245,.023,6,20),material(seat?0xf9eac1:0xc9e978),racket,0,-.55,0);hoop.scale.y=1.3;
    const pts:number[]=[];
    for(let v=-.18;v<=.18;v+=.06){
      const end=Math.sqrt(.245**2-v*v);
      pts.push(v,-.55-end*1.3,0,v,-.55+end*1.3,0);
      pts.push(-end,-.55+v*1.3,0,end,-.55+v*1.3,0);
    }
    racket.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(pts,3)),new T.LineBasicMaterial({color:0xd9dfcc,transparent:true,opacity:.75})));
    this.root.rotation.y=seat===0?Math.PI:0;
  }
  update(p:PlayerState,time:number){
    this.root.position.set(p.x,0,p.z);
    const run=p.moving?Math.sin(time*15)*.62:Math.sin(time*2)*.02;
    this.legs[0].rotation.x=run;this.legs[1].rotation.x=-run;
    this.torso.position.y=p.moving?Math.abs(Math.sin(time*15))*.065:0;
    this.arms[0].rotation.set(-.15-run*.65,0,-.13);
    this.arms[1].rotation.set(-.28+run*.6,0,.18);
    this.torso.rotation.y=0;
    if(p.swing>0){
      const t=1-p.swing/.44,arc=Math.sin(t*Math.PI);
      if(p.stroke==='serve'){this.arms[1].rotation.x=-2.7*arc;this.arms[0].rotation.x=-2.4*arc;}
      else {
        this.arms[1].rotation.x=-.5-arc*1.4;
        this.arms[1].rotation.z=p.stroke==='backhand'?arc*1.5:-arc*1.3;
        this.torso.rotation.y=Math.sin(t*Math.PI*2)*.4;
      }
    }
  }
}
