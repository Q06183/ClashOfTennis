import {handedness} from '../simulation/characters.js';
import * as T from 'three';
import {AthleteSkin} from './athlete-skin.js';
import {solveGrip} from './grip.js';
import {strokeBody} from './stroke-body.js';
import {strokePose} from './strokes.js';
import {RACKET,contactCrouch} from '../simulation/athlete.js';
import {rescuePose} from '../simulation/rescue.js';
import {rescueStroke} from './rescue-strokes.js';
import {Footwork} from './footwork.js';
import {type PlayerState,type Seat} from '../simulation/types.js';
const material=(color:number)=>new T.MeshStandardMaterial({color,roughness:.72});
const down=new T.Vector3(0,-1,0);
/** Articulated fallback athlete; generated assets must share these contact semantics. */
export class Athlete {
  readonly root=new T.Group();
  private torso=new T.Group();
  private hips=new T.Group();
  private head=new T.Group();
  private arms=[new T.Group(),new T.Group()];
  private elbows=[new T.Group(),new T.Group()];
  private legs=[new T.Group(),new T.Group()];
  private knees=[new T.Group(),new T.Group()];
  private feet=[new T.Group(),new T.Group()];
  private footwork=new Footwork();
  private lastTime=0;
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
    this.root.add(this.torso);this.head.name='head-tracking';this.head.position.y=1.5;this.torso.add(this.head);
    this.hips.position.y=.85;this.root.add(this.hips);
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
    for(const part of [...this.torso.children])if(part instanceof T.Mesh&&part.position.y>=1.56){part.position.y-=1.5;this.head.add(part);}
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
      const foot=this.feet[i];foot.name=`foot-${i}`;foot.position.y=-.37;knee.add(foot);
      mesh(new T.SphereGeometry(.128,16,10),white,foot,0,-.02,.063).scale.set(.81,.52,1.65);
      mesh(new T.BoxGeometry(.20,.034,.32),shorts,foot,0,-.07,.075);
    }
    const racket=this.racket;racket.position.set(0,-.31,0);this.elbows[1].add(racket);
    mesh(new T.CylinderGeometry(.021,.023,.22,12),material(0x172a30),racket,0,-.05,0);
    const hoop=mesh(new T.TorusGeometry(RACKET.headRadius,RACKET.rim,8,32),material(seat?0xf7d08d:0xb2d869),racket,0,-RACKET.sweet,0);hoop.scale.y=RACKET.headStretch;
    for(const sign of [-1,1]){const bridge=mesh(new T.CylinderGeometry(.009,.012,.16,8),white,racket,sign*.035,-.23,0);bridge.rotation.z=sign*.35;}
    const sweet=new T.Object3D();sweet.name='racket-sweet-spot';sweet.position.set(0,-RACKET.sweet,0);racket.add(sweet);
    const pts:number[]=[];
    for(let v=-.108;v<=.109;v+=.022){const end=Math.sqrt(RACKET.headRadius**2-v*v);pts.push(v,-RACKET.sweet-end*RACKET.headStretch,0,v,-RACKET.sweet+end*RACKET.headStretch,0,-end,-RACKET.sweet+v*RACKET.headStretch,0,end,-RACKET.sweet+v*RACKET.headStretch,0);}
    racket.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(pts,3)),new T.LineBasicMaterial({color:0xe3e4cf,transparent:true,opacity:.8})));
    racket.traverse(o=>{o.userData.fallbackBody=false;});
    this.leftHand.position.y=-.31;this.elbows[0].add(this.leftHand);
    this.root.rotation.y=seat===0?Math.PI:0;
  }
  clearModel(){
    if(this.generated){this.generated.scene.removeFromParent();this.generated.scene.traverse(o=>{if(o instanceof T.SkinnedMesh)o.skeleton.dispose();});this.generated=undefined;}
    this.root.traverse(o=>{if(o.userData.fallbackBody)o.visible=true;});this.modelSource='procedural';
  }
  attachModel(scene:T.Object3D){
    this.clearModel();
    const anchors:Record<string,T.Object3D>={};
    anchors.Hips=this.hips;anchors.Head=this.head;
    // The source Neck also weights the collar and shoulder seam. Keep it on
    // the trunk; ball-tracking head rotation must not pull those vertices.
    for(let i=0;i<2;i++){
      const suffix=i?'R':'L';
      anchors['UpperArm_'+suffix]=this.arms[i];anchors['LowerArm_'+suffix]=this.elbows[i];
      anchors['UpperLeg_'+suffix]=this.legs[i];anchors['LowerLeg_'+suffix]=this.knees[i];
      anchors['Foot_'+suffix]=this.feet[i];
      if(i)anchors.Hand_R=this.racket;
      else anchors.Hand_L=this.leftHand;
    }
    this.generated=new AthleteSkin(scene,this.torso,anchors);
    this.root.traverse(o=>{if(o.userData.fallbackBody)o.visible=false;});
    this.root.add(scene);this.modelSource='lux3d';
  }
  private armTo(index:number,hand:T.Vector3,elbowPole?:T.Vector3,softReach=0){
    this.root.updateMatrixWorld(true);
    const arm=this.arms[index],elbow=this.elbows[index],target=this.torso.worldToLocal(hand.clone()).sub(arm.position);
    const reach=target.length(),extension=T.MathUtils.clamp(reach-.56,0,.218);
    // Ease into full extension instead of snapping a bent elbow straight at the reach limit.
    const eased=reach<=.56?reach:.56+extension-extension*extension/.436;
    const d=T.MathUtils.clamp(T.MathUtils.lerp(reach,eased,softReach),.051,.669),axis=target.normalize();
    const pole=elbowPole?.clone()??new T.Vector3(index?-.7:.7,-1,.35);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const along=(.36**2+d*d-.31**2)/(2*d),height=Math.sqrt(Math.max(0,.36**2-along*along));
    const upper=axis.clone().multiplyScalar(along).addScaledVector(pole,height);
    arm.quaternion.setFromUnitVectors(down,upper.clone().normalize());
    const lower=axis.multiplyScalar(d).sub(upper).normalize().applyQuaternion(arm.quaternion.clone().invert());
    elbow.quaternion.setFromUnitVectors(down,lower);
    this.root.updateMatrixWorld(true);
  }
  private racketTo(tipLocal:T.Vector3,shaftLocal:T.Vector3,twoHands:boolean,adjustment=0,faceRoll=0,elbowPole?:T.Vector3){
    this.root.updateMatrixWorld(true);
    const tip=this.root.localToWorld(tipLocal.clone()),rootQ=this.root.getWorldQuaternion(new T.Quaternion());
    const shoulder=this.arms[1].getWorldPosition(new T.Vector3()),axis=tip.clone().sub(shoulder),d=axis.length();axis.normalize();
    let shaft=shaftLocal.clone().applyQuaternion(rootQ).normalize(),hand=tip.clone().addScaledVector(shaft,-RACKET.sweet);
    // Solve continuous arm-reach constraints while keeping the head on the ball.
    const solved=solveGrip(tip,shaft,shoulder,twoHands?this.arms[0].getWorldPosition(new T.Vector3()):undefined);
    if(solved)hand.copy(solved);
    if(!solved){
      if(twoHands&&adjustment<8){
        // Beyond reach during preparation/follow-through, preserve the shared
        // grip by bringing the racket back towards the two-hand ready space.
        this.racketTo(tipLocal.clone().lerp(new T.Vector3(0,1.45,.55),.25),shaftLocal,true,adjustment+1,faceRoll,elbowPole);return;
      }
      // Predicted preparation points can be unreachable; keep the racket close
      // until the runner arrives. Actual impact eligibility uses physical reach.
      hand.copy(shoulder).addScaledVector(axis,Math.min(.667,Math.max(.1,d-RACKET.sweet)));
    }
    this.armTo(1,hand,elbowPole);
    const actualHand=this.racket.getWorldPosition(new T.Vector3());shaft=tip.clone().sub(actualHand).normalize();
    const y=shaft.clone().negate(),normal=new T.Vector3(0,0,1).applyQuaternion(rootQ);normal.addScaledVector(y,-normal.dot(y)).normalize().applyAxisAngle(shaft,faceRoll);
    const x=y.clone().cross(normal).normalize(),z=x.clone().cross(y).normalize();
    const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
    this.racket.quaternion.copy(this.elbows[1].getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
    this.root.updateMatrixWorld(true);
    if(twoHands){
      this.armTo(0,actualHand.clone().addScaledVector(shaft,RACKET.secondHand));
      this.leftHand.quaternion.copy(this.elbows[0].getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
    }
  }
  private legTo(index:number,target:T.Vector3,turn:number){
    const leg=this.legs[index],knee=this.knees[index],foot=this.feet[index];
    const offset=this.root.worldToLocal(target.clone()).sub(leg.position),length=.37;
    const d=T.MathUtils.clamp(offset.length(),.08,.739),axis=offset.normalize();
    const pole=new T.Vector3(Math.sin(turn),0,Math.cos(turn));pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const upper=axis.clone().multiplyScalar(d/2).addScaledVector(pole,Math.sqrt(Math.max(0,length*length-d*d/4)));
    leg.quaternion.setFromUnitVectors(down,upper.clone().normalize());
    const lower=axis.multiplyScalar(d).sub(upper).normalize().applyQuaternion(leg.quaternion.clone().invert());
    knee.quaternion.setFromUnitVectors(down,lower);
    // Keep the ankle level independently of the bending knee.
    foot.quaternion.copy(leg.quaternion).multiply(knee.quaternion).invert().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),turn));
  }
  update(p:PlayerState,time:number,deltaTime?:number){
    const hand=handedness(p.characterId),worldX=p.x;
    // Solve IK with a proper (non-reflected) transform. Reflect the finished
    // skeleton as one unit, so wrist/ankle quaternions never see negative scale.
    this.root.scale.x=1;
    if(hand===-1){
      const point=(v:{x:number;y:number;z:number})=>({...v,x:-v.x});
      p={...p,x:-p.x,tx:-p.tx,vx:-(p.vx??0),
        serveCourt:p.serveCourt===undefined?undefined:p.serveCourt==='ad'?'deuce':'ad',
        contact:p.contact?point(p.contact):undefined,
        preparation:p.preparation?{...p.preparation,contact:point(p.preparation.contact)}:undefined,
        rescue:p.rescue?{...p.rescue,fromX:-p.rescue.fromX,toX:-p.rescue.toX,contact:point(p.rescue.contact)}:undefined};
    }
    const rescue=rescuePose(p,time);
    this.root.position.set(p.x,rescue.lift,p.z);this.root.updateMatrixWorld(true);
    const actual=p.rescue?.contact??p.preparation?.contact??p.contact;
    const contact=actual?this.root.worldToLocal(new T.Vector3(actual.x,actual.y,actual.z)):new T.Vector3(-.85,1.1,.65);
    const pose=strokePose(p,contact),active=!!p.rescue||!!p.preparation||p.swing>0;
    const jump=p.rescue?rescueStroke(p,time,contact):undefined;
    if(jump)Object.assign(pose,jump);
    const dt=deltaTime??Math.max(1/60,Math.min(.08,time-this.lastTime));this.lastTime=time;
    const body=strokeBody(p),gait=this.footwork.update(this.root.position,this.root.quaternion,dt),movement=gait.localDirection;
    const stride=Math.sin(gait.phase*Math.PI*2)*Math.min(1,gait.speed/2);
    const running=T.MathUtils.smoothstep(gait.speed,2.2,4.5)*(p.rescue||p.swing>0?0:p.preparation?1-T.MathUtils.smoothstep(p.preparation.progress,.2,.55):1);
    const runTurn=gait.turn*.65;
    if(running>0){
      pose.tip.lerp(new T.Vector3(-.4,1.28+stride*.035,.66+stride*.10).applyAxisAngle(new T.Vector3(0,1,0),runTurn),running);
      pose.shaft.lerp(new T.Vector3(-.25,.9,.25).normalize().applyAxisAngle(new T.Vector3(0,1,0),runTurn),running).normalize();
      pose.twoHands=false;pose.support=1-running;
    }
    const speedBlend=1-T.MathUtils.smoothstep(gait.speed,1.5,4.5);
    // Whole-body loading must run during the serve, even though it has no queued return.
    const action=active&&!p.rescue?body.blend:0;
    const lower=action*(p.stroke==='serve'||p.preparation?.stroke==='serve'?1:speedBlend);
    const contactWeight=p.rescue?T.MathUtils.smoothstep(time-p.rescue.startedAt,0,.10):p.swing>0?Math.min(1,p.swing/.15):p.preparation?T.MathUtils.smoothstep(p.preparation.progress,.8,1):0;
    const contactCrouching=contactCrouch(contact.y)*contactWeight*(p.rescue?1-rescue.recovery:1);
    const hipDrop=(p.rescue?T.MathUtils.lerp(gait.hipDrop,.74*(1-Math.cos(pose.knee/2)),contactWeight):T.MathUtils.lerp(gait.hipDrop,body.hipDrop-body.lift,action))+contactCrouching+rescue.crouch;
    const hipTurn=T.MathUtils.lerp(gait.turn,body.hipTurn,lower);
    this.hips.position.y=.85-hipDrop;this.hips.rotation.y=hipTurn;
    for(let i=0;i<2;i++){
      this.legs[i].position.set((i?-1:1)*.15,.85-hipDrop,0).applyAxisAngle(new T.Vector3(0,1,0),hipTurn);
      const posed=this.root.localToWorld(body.feet[i].clone());
      const foot=jump?this.root.localToWorld(jump.feet[i].clone()):
        gait.feet[i].lerp(posed,lower).add(new T.Vector3(0,rescue.lift+rescue.air*(i?.05:.1),0));
      this.legTo(i,foot,T.MathUtils.lerp(hipTurn*.6,body.footYaw[i],lower));
    }
    this.torso.position.y=-hipDrop;
    const motionStrength=p.rescue?contactWeight:action;
    const lean=Math.min(.18,gait.speed*.028)*(1-motionStrength);
    this.torso.rotation.set(T.MathUtils.lerp(.035,body.lean,action)+movement.z*lean,pose.turn+gait.turn*.65*(1-motionStrength)+stride*.045*running,body.sideBend*action-movement.x*lean*.65);
    const serving=(p.preparation?.stroke??p.stroke)==='serve';
    this.head.rotation.set(serving?body.headPitch*action:T.MathUtils.clamp(Math.atan2(1.7-contact.y,Math.max(.7,contact.z)), -.55,.4)*action, -pose.turn*.55*action,0);
    if(p.rescue){
      const direction=new T.Vector3(p.rescue.toX-p.rescue.fromX,0,p.rescue.toZ-p.rescue.fromZ).applyQuaternion(this.root.quaternion.clone().invert()).normalize();
      this.torso.rotation.x+=direction.z*rescue.lean;this.torso.rotation.z-=direction.x*rescue.lean;
      if(jump){this.torso.rotation.x+=jump.lean*rescue.air;this.torso.rotation.z+=jump.bank*rescue.air;this.head.rotation.x=jump.head*rescue.air;}
      this.torso.rotation.x+=.38*rescue.landing;
    }
    this.arms[0].rotation.set(-.45-stride*.3,0,-.3);this.elbows[0].rotation.set(-.6,0,0);this.leftHand.quaternion.identity();
    this.racketTo(pose.tip,pose.shaft,pose.twoHands,0,body.faceRoll*action,action?body.elbow:undefined);
    if((active||running>0)&&!pose.twoHands){
      const free=body.freeHand.clone();
      if(jump){
        free.copy(jump.free);
      }else if(running>0)free.lerp(new T.Vector3(.36,1.13+stride*.045,.18-stride*.22).applyAxisAngle(new T.Vector3(0,1,0),runTurn),running);
      const hand=this.root.localToWorld(free);
      const tossing=p.preparation?.stroke==='serve';
      const gripBlend=p.swing>0&&!p.rescue?1-T.MathUtils.smoothstep(p.swing,0,serving?.24:.12):0;
      const support=Math.max(gripBlend,pose.support??0);
      if(support){const grip=this.racket.localToWorld(new T.Vector3(0,-RACKET.secondHand,0));hand.lerp(grip,support);}
      const leftPole=serving?new T.Vector3(1,0,-.2).lerp(new T.Vector3(.7,-1,.35),gripBlend):new T.Vector3(.7,-.6,-.2);
      // Keep the running elbow tucked beside the ribcage rather than flared
      // sideways like a stroke's counterbalance arm.
      if(running>0&&!serving)leftPole.lerp(new T.Vector3(.2,-1,-.3),running);
      this.armTo(0,hand,leftPole,serving?1-gripBlend:0);
      if(serving){
        // Keep the open tossing palm steady instead of inheriting the IK
        // forearm's axial twist; fold it toward the trunk after release.
        const fold=T.MathUtils.smoothstep(p.preparation?.progress??1,.56,1);
        const q=this.root.getWorldQuaternion(new T.Quaternion()).multiply(new T.Quaternion().setFromEuler(new T.Euler(-1.1+.65*fold,.3*fold,-.2)));
        this.leftHand.quaternion.copy(this.elbows[0].getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
      }
      if(!tossing&&!serving)this.leftHand.rotation.y=-.5;
      if(support){const gripQ=this.elbows[0].getWorldQuaternion(new T.Quaternion()).invert().multiply(this.racket.getWorldQuaternion(new T.Quaternion()));this.leftHand.quaternion.slerp(gripQ,support);}
    }
    if(this.generated){this.root.updateMatrixWorld(true);this.generated.update();}
    this.root.position.x=worldX;this.root.scale.x=hand;this.root.updateMatrixWorld(true);
  }
}
