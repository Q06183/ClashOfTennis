import * as T from 'three';
import {AthleteSkin} from './athlete-skin.js';
import {strokePose} from './strokes.js';
import {type PlayerState,type Seat} from '../simulation/types.js';
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
  private leftHand=new T.Group();
  modelSource:'procedural'|'lux3d'='procedural';
  private generated?:AthleteSkin;
  private skin=material(0xd5a07d);
  constructor(readonly seat:Seat){
    this.torso.name='athlete-torso';this.leftHand.name='left-hand-grip';this.racket.name='racket-grip';
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
    this.leftHand.position.y=-.31;this.elbows[0].add(this.leftHand);
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
      else anchors.Hand_L=this.leftHand;
    }
    this.generated=new AthleteSkin(scene,this.torso,anchors);
    this.root.traverse(o=>{if(o.userData.fallbackBody)o.visible=false;});
    this.root.add(scene);this.modelSource='lux3d';
  }
  private armTo(index:number,hand:T.Vector3){
    this.root.updateMatrixWorld(true);
    const arm=this.arms[index],elbow=this.elbows[index],target=this.torso.worldToLocal(hand.clone()).sub(arm.position);
    const d=T.MathUtils.clamp(target.length(),.051,.669),axis=target.normalize();
    const pole=new T.Vector3(index?-.7:.7,-1,.35);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const along=(.36**2+d*d-.31**2)/(2*d),height=Math.sqrt(Math.max(0,.36**2-along*along));
    const upper=axis.clone().multiplyScalar(along).addScaledVector(pole,height);
    arm.quaternion.setFromUnitVectors(down,upper.clone().normalize());
    const lower=axis.multiplyScalar(d).sub(upper).normalize().applyQuaternion(arm.quaternion.clone().invert());
    elbow.quaternion.setFromUnitVectors(down,lower);
    this.root.updateMatrixWorld(true);
  }
  private racketTo(tipLocal:T.Vector3,shaftLocal:T.Vector3,twoHands:boolean){
    this.root.updateMatrixWorld(true);
    const tip=this.root.localToWorld(tipLocal.clone()),rootQ=this.root.getWorldQuaternion(new T.Quaternion());
    const shoulder=this.arms[1].getWorldPosition(new T.Vector3()),axis=tip.clone().sub(shoulder),d=axis.length();axis.normalize();
    let shaft=shaftLocal.clone().applyQuaternion(rootQ).normalize(),hand=tip.clone().addScaledVector(shaft,-.69);
    // Choose a wrist on the intersection of arm reach and racket-length spheres.
    // This keeps the racket head on the ball without folding the wrist backwards.
    const armReach=T.MathUtils.clamp(hand.distanceTo(shoulder),Math.min(.667,Math.abs(d-.69)+.002),.667);
    const along=(d*d+armReach*armReach-.69**2)/(2*Math.max(d,.001));
    const radial=hand.clone().sub(shoulder).addScaledVector(axis,-hand.clone().sub(shoulder).dot(axis));
    if(radial.lengthSq()<1e-5)radial.set(0,-1,0).addScaledVector(axis,axis.y);
    radial.normalize();hand=shoulder.clone().addScaledVector(axis,along).addScaledVector(radial,Math.sqrt(Math.max(0,armReach*armReach-along*along)));
    this.armTo(1,hand);
    const actualHand=this.racket.getWorldPosition(new T.Vector3());shaft=tip.clone().sub(actualHand).normalize();
    const y=shaft.clone().negate(),normal=new T.Vector3(0,0,1).applyQuaternion(rootQ);normal.addScaledVector(y,-normal.dot(y)).normalize();
    const x=y.clone().cross(normal).normalize(),z=x.clone().cross(y).normalize();
    const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
    this.racket.quaternion.copy(this.elbows[1].getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
    this.root.updateMatrixWorld(true);
    if(twoHands){
      this.armTo(0,actualHand.clone().addScaledVector(shaft,.12));
      this.leftHand.quaternion.copy(this.elbows[0].getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
    }
  }
  update(p:PlayerState,time:number){
    this.root.position.set(p.x,0,p.z);this.root.updateMatrixWorld(true);
    const actual=p.preparation?.contact??p.contact;
    const contact=actual?this.root.worldToLocal(new T.Vector3(actual.x,actual.y,actual.z)):new T.Vector3(-.85,1.1,.65);
    const pose=strokePose(p,contact),active=!!p.preparation||p.swing>0;
    const movement=new T.Vector3(p.tx-p.x,0,p.tz-p.z).applyQuaternion(this.root.quaternion.clone().invert()).normalize();
    const stride=p.moving?Math.sin(time*12):0,hipDrop=.74*(1-Math.cos(pose.knee/2));
    for(let i=0;i<2;i++){
      const phase=i?stride:-stride;
      this.legs[i].position.y=.85-hipDrop;
      this.legs[i].rotation.set(phase*.38*movement.z-pose.knee/2,0,(i?-1:1)*.15+phase*.2*movement.x);
      this.knees[i].rotation.x=Math.max(0,-phase)*.65+pose.knee;
    }
    this.torso.position.y=-hipDrop+(p.moving?Math.abs(stride)*.02:0);
    this.torso.rotation.set(.035,pose.turn,0);
    this.arms[0].rotation.set(-.45-stride*.3,0,-.3);this.elbows[0].rotation.set(-.6,0,0);this.leftHand.quaternion.identity();
    this.racketTo(pose.tip,pose.shaft,pose.twoHands);
    if(pose.toss>0){
      const hand=this.root.localToWorld(new T.Vector3(.22,1.2+pose.toss*.88,.25));this.armTo(0,hand);
    }else if(active&&!pose.twoHands){
      const hand=this.root.localToWorld(new T.Vector3(.38,1.15,.36));this.armTo(0,hand);
    }
    if(this.generated){this.root.updateMatrixWorld(true);this.generated.update();}
  }
}
