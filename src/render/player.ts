import * as T from 'three';
import {AthleteSkin} from './athlete-skin.js';
import {side,type PlayerState,type Seat} from '../simulation/types.js';
const material=(color:number)=>new T.MeshStandardMaterial({color,roughness:.72});
const down=new T.Vector3(0,-1,0);
/** Articulated fallback athlete; generated assets must share these contact semantics. */
export class Athlete {
  readonly root=new T.Group();
  private torso=new T.Group();
  private arms=[new T.Group(),new T.Group()];
  private elbows=[new T.Group(),new T.Group()];
  private legs=[new T.Group(),new T.Group()];
  private knees=[new T.Group(),new T.Group()];
  private racket=new T.Group();
  modelSource:'procedural'|'lux3d'='procedural';
  private generated?:AthleteSkin;
  private skin=material(0xd5a07d);
  constructor(readonly seat:Seat){
    const shirt=material(seat===0?0xf2efdf:0xe57141),shorts=material(seat===0?0x173944:0x263543),white=material(0xf9f6e9),hair=material(0x302a25);
    const mesh=(g:T.BufferGeometry,m:T.Material,parent:T.Object3D,x:number,y:number,z:number)=>{
      const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;o.userData.fallbackBody=true;parent.add(o);return o;
    };
    this.root.add(this.torso);
    mesh(new T.CapsuleGeometry(.255,.37,6,16),shirt,this.torso,0,1.19,0).scale.set(1.15,1,.65);
    mesh(new T.SphereGeometry(.26,16,12),shorts,this.torso,0,.88,0).scale.set(1.08,.65,.78);
    mesh(new T.CylinderGeometry(.085,.11,.16,12),this.skin,this.torso,0,1.56,0);
    mesh(new T.SphereGeometry(.21,20,16),this.skin,this.torso,0,1.76,0).scale.set(.87,1.12,.89);
    mesh(new T.SphereGeometry(.044,10,8),this.skin,this.torso,0,1.75,.18).scale.set(.65,1,1.15);
    mesh(new T.SphereGeometry(.214,16,12,0,Math.PI*2,0,Math.PI*.52),hair,this.torso,0,1.81,0).scale.set(.94,1,.96);
    for(const x of [-.182,.182])mesh(new T.SphereGeometry(.044,10,8),this.skin,this.torso,x,1.76,0).scale.set(.6,1,.7);
    mesh(new T.CylinderGeometry(.218,.218,.052,24),shirt,this.torso,0,1.9,0);
    mesh(new T.SphereGeometry(.22,16,8),shirt,this.torso,0,1.88,.145).scale.set(1,.10,1.12);
    for(const x of [-.069,.069]){
      mesh(new T.SphereGeometry(.023,10,8),white,this.torso,x,1.79,.169);
      mesh(new T.SphereGeometry(.012,8,6),hair,this.torso,x,1.79,.189);
    }
    for(let i=0;i<2;i++){
      const sign=i?-1:1,arm=this.arms[i],elbow=this.elbows[i];arm.position.set(sign*.31,1.39,0);this.torso.add(arm);
      mesh(new T.CapsuleGeometry(.107,.10,5,12),shirt,arm,0,-.07,0);
      mesh(new T.CapsuleGeometry(.074,.18,5,12),this.skin,arm,0,-.23,0);
      elbow.position.y=-.36;arm.add(elbow);
      mesh(new T.SphereGeometry(.081,12,8),this.skin,elbow,0,0,0);
      mesh(new T.CapsuleGeometry(.065,.17,5,12),this.skin,elbow,0,-.14,0);
      mesh(new T.CylinderGeometry(.072,.072,.066,12),white,elbow,0,-.245,0);
      mesh(new T.SphereGeometry(.078,12,8),this.skin,elbow,0,-.30,0);
      const leg=this.legs[i],knee=this.knees[i];leg.position.set(sign*.15,.85,0);this.root.add(leg);
      mesh(new T.CapsuleGeometry(.116,.18,5,12),shorts,leg,0,-.1,0);
      mesh(new T.CapsuleGeometry(.085,.18,5,12),this.skin,leg,0,-.26,0);
      knee.position.y=-.37;leg.add(knee);
      mesh(new T.SphereGeometry(.087,12,8),this.skin,knee,0,0,0);
      mesh(new T.CapsuleGeometry(.07,.18,5,12),this.skin,knee,0,-.16,0);
      mesh(new T.CylinderGeometry(.081,.073,.17,12),white,knee,0,-.28,0);
      mesh(new T.SphereGeometry(.128,16,10),white,knee,0,-.39,.063).scale.set(.81,.52,1.65);
      mesh(new T.BoxGeometry(.20,.034,.32),shorts,knee,0,-.44,.075);
    }
    // Distal arm + racket centre is 1 m from elbow. Used by the two-bone IK.
    const racket=this.racket;racket.position.set(0,-.31,0);this.elbows[1].add(racket);
    mesh(new T.CylinderGeometry(.031,.031,.34,12),material(0x172a30),racket,0,-.13,0);
    const hoop=mesh(new T.TorusGeometry(.245,.021,8,32),material(seat?0xf7d08d:0xb2d869),racket,0,-.69,0);hoop.scale.y=1.3;
    const bridge=mesh(new T.CylinderGeometry(.015,.02,.28,8),white,racket,0,-.37,0);bridge.rotation.z=.15;
    const sweet=new T.Object3D();sweet.name='racket-sweet-spot';sweet.position.set(0,-.69,0);racket.add(sweet);
    const pts:number[]=[];
    for(let v=-.18;v<=.18;v+=.045){const end=Math.sqrt(.245**2-v*v);pts.push(v,-.69-end*1.3,0,v,-.69+end*1.3,0,-end,-.69+v*1.3,0,end,-.69+v*1.3,0);}
    racket.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(pts,3)),new T.LineBasicMaterial({color:0xe3e4cf,transparent:true,opacity:.8})));
    racket.traverse(o=>{o.userData.fallbackBody=false;});
    this.root.rotation.y=seat===0?Math.PI:0;
  }
  attachModel(scene:T.Object3D){
    if(this.generated)return;
    const anchors:Record<string,T.Object3D>={};
    for(let i=0;i<2;i++){
      const suffix=i?'R':'L';
      anchors['UpperArm_'+suffix]=this.arms[i];anchors['LowerArm_'+suffix]=this.elbows[i];
      anchors['UpperLeg_'+suffix]=this.legs[i];anchors['LowerLeg_'+suffix]=this.knees[i];
      const foot=new T.Group();foot.position.y=-.37;this.knees[i].add(foot);anchors['Foot_'+suffix]=foot;
      if(i)anchors.Hand_R=this.racket;
      else {const hand=new T.Group();hand.position.y=-.31;this.elbows[i].add(hand);anchors.Hand_L=hand;}
    }
    this.generated=new AthleteSkin(scene,this.torso,anchors);
    this.root.traverse(o=>{if(o.userData.fallbackBody)o.visible=false;});
    this.root.add(scene);this.modelSource='lux3d';
  }
  private reach(worldTarget:T.Vector3){
    this.root.updateMatrixWorld(true);
    const target=this.torso.worldToLocal(worldTarget.clone());
    const shoulder=this.arms[1].position,delta=target.sub(shoulder),distance=delta.length();
    const upper=.36,lower=T.MathUtils.clamp(distance+.27,.4,1),reach=T.MathUtils.clamp(distance,Math.abs(lower-upper)+.001,lower+upper-.001);
    const wristAngle=Math.acos(T.MathUtils.clamp((lower*lower-.31**2-.69**2)/(2*.31*.69),-1,1));
    this.racket.rotation.z=wristAngle;
    const lowerAxis=new T.Vector3(.69*Math.sin(wristAngle),-.31-.69*Math.cos(wristAngle),0).normalize();
    const axis=delta.normalize(),bend=new T.Vector3(-.8,-.25,.5);
    bend.addScaledVector(axis,-bend.dot(axis));
    if(bend.lengthSq()<1e-6)bend.set(0,0,1).addScaledVector(axis,-axis.z);
    bend.normalize();
    const along=(upper*upper+reach*reach-lower*lower)/(2*reach);
    const elbow=axis.clone().multiplyScalar(along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
    this.arms[1].quaternion.setFromUnitVectors(down,elbow.clone().normalize());
    const forearm=axis.multiplyScalar(reach).sub(elbow).normalize().applyQuaternion(this.arms[1].quaternion.clone().invert());
    this.elbows[1].quaternion.setFromUnitVectors(lowerAxis,forearm);
  }
  update(p:PlayerState,time:number){
    this.root.position.set(p.x,0,p.z);
    const stride=p.moving?Math.sin(time*15):0;
    for(let i=0;i<2;i++){const phase=i?stride:-stride;this.legs[i].rotation.x=phase*.58-.10;this.knees[i].rotation.x=Math.max(0,-phase)*.8+.12;}
    this.torso.position.y=p.moving?Math.abs(stride)*.035:Math.sin(time*2)*.008;
    this.torso.rotation.set(.06,0,0);
    this.arms[0].rotation.set(-.3-stride*.45,0,-.15);this.elbows[0].rotation.set(-.55,0,0);
    this.arms[1].rotation.set(-.48+stride*.3,0,.2);this.elbows[1].rotation.set(-.7,0,0);
    this.racket.rotation.z=0;
    if(p.swing>0&&p.contact){
      const t=1-p.swing/.44,sign=side(this.seat),arc=Math.sin(t*Math.PI/2);
      const target=new T.Vector3(p.contact.x,p.contact.y,p.contact.z);
      const across=p.stroke==='backhand'?1:-1;
      if(p.stroke==='serve'){target.y-=arc*1.1;target.z-=sign*arc*.6;this.arms[0].rotation.x=-.3-t*.3;}
      else {target.x+=across*sign*arc*.75;target.y+=arc*.35;target.z-=sign*arc*.35;this.torso.rotation.y=across*arc*.35;}
      this.reach(target);
    }
    if(this.generated){this.root.updateMatrixWorld(true);this.generated.update();}
  }
}
