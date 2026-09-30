import {handedness} from '../simulation/characters.js';
import * as T from 'three';
import {AthleteSkin} from './athlete-skin.js';
import {DirectOriginalSkin,type DirectOriginalProfile} from './direct-original-skin.js';
import {solveGrip} from './grip.js';
import {strokeBody} from './stroke-body.js';
import {strokePose} from './strokes.js';
import {RACKET,contactCrouch} from '../simulation/athlete.js';
import {rescuePose,rescueAge,RESCUE} from '../simulation/rescue.js';
import {rescueStroke} from './rescue-strokes.js';
import {Footwork} from './footwork.js';
import {bodyControls} from './body-controls.js';
import {victoryPose,victoryEase} from './victory.js';
import {type PlayerState,type Seat} from '../simulation/types.js';
const material=(color:number)=>new T.MeshStandardMaterial({color,roughness:.72});
const down=new T.Vector3(0,-1,0);
/** Articulated fallback athlete; generated assets must share these contact semantics. */
export class Athlete {
  readonly root=new T.Group();
  private torso=new T.Group();
  private spine=new T.Group();
  private chest=new T.Group();
  private clavicles=[new T.Group(),new T.Group()];
  private toes=[new T.Group(),new T.Group()];
  private hips=new T.Group();
  private head=new T.Group();
  private arms=[new T.Group(),new T.Group()];
  private elbows=[new T.Group(),new T.Group()];
  private legs=[new T.Group(),new T.Group()];
  private knees=[new T.Group(),new T.Group()];
  private feet=[new T.Group(),new T.Group()];
  private footwork=new Footwork();
  private wasRescuing=false;
  private lastTime=0;
  private hasRendered=false;
  private celebrating=false;
  private celebrationEntry:{node:T.Object3D;position:T.Vector3;rotation:T.Quaternion}[]=[];
  private racket=new T.Group();
  private leftHand=new T.Group();
  modelSource:'procedural'|'lux3d'='procedural';
  private generated?:AthleteSkin|DirectOriginalSkin;
  private directProfile?:DirectOriginalProfile;
  private upperLength=.36;
  private gripLength=.31;
  private legLength=.37;
  private hipHeight=.85;
  private skin=material(0xd5a07d);
  constructor(readonly seat:Seat){
    this.torso.name='athlete-torso';this.leftHand.name='left-hand-grip';this.racket.name='racket-grip';
    const shirt=material(seat===0?0xf2efdf:0xe57141),shorts=material(seat===0?0x173944:0x263543),white=material(0xf9f6e9),hair=material(0x302a25);
    const mesh=(g:T.BufferGeometry,m:T.Material,parent:T.Object3D,x:number,y:number,z:number)=>{
      const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;o.userData.fallbackBody=true;parent.add(o);return o;
    };
    this.root.add(this.torso);this.head.name='head-tracking';this.head.position.y=1.5;this.torso.add(this.head);
    this.spine.name='spine-control';this.torso.add(this.spine);
    this.chest.name='chest-control';this.chest.position.y=1.25;this.torso.add(this.chest);
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
      const sign=i?-1:1,arm=this.arms[i],elbow=this.elbows[i],clavicle=this.clavicles[i];
      clavicle.name=`clavicle-${i?'R':'L'}`;clavicle.position.set(sign*.12,.14,0);this.chest.add(clavicle);
      arm.position.set(sign*.19,0,0);clavicle.add(arm);
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
      const toe=this.toes[i];toe.name=`toe-${i}`;toe.position.set(0,-.035,.11);foot.add(toe);
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
    this.setProportions(false);
    this.root.traverse(o=>{if(o.userData.fallbackBody)o.visible=true;});this.modelSource='procedural';
  }
  private setProportions(calibrated:boolean){
    this.directProfile=undefined;
    this.head.position.y=1.5;
    for(let i=0;i<2;i++)this.clavicles[i].position.set((i?-1:1)*.12,.14,0);
    this.upperLength=calibrated?.33:.36;this.gripLength=calibrated?.34:.31;
    this.legLength=calibrated?.425:.37;this.hipHeight=calibrated?.96:.85;
    for(let i=0;i<2;i++){
      this.elbows[i].position.y=-this.upperLength;this.knees[i].position.y=-this.legLength;
      this.feet[i].position.y=-this.legLength;
    }
    this.racket.position.y=this.leftHand.position.y=-this.gripLength;
    this.hips.position.y=this.hipHeight;
    this.footwork=new Footwork();
  }
  attachModel(scene:T.Object3D){
    this.clearModel();
    this.setProportions(scene.userData.bodyProportionRevision===3);
    this.directProfile=scene.userData.directOriginalRig;
    if(this.directProfile){
      const p=this.directProfile;
      this.hipHeight=p.hipY;
      this.legLength=p.hipY-p.kneeY;
      this.upperLength=p.upperLength;
      // Keep the same authoritative arm-to-grip reach; source skin is mapped
      // along its own segment axes, not rebuilt around old joints.
      this.gripLength=.67-this.upperLength;
      this.head.position.y=p.headY;
      for(let i=0;i<2;i++){
        this.clavicles[i].position.set((i?-1:1)*.12,p.shoulderY-1.25,p.shoulderZ);
        this.arms[i].position.set((i?-1:1)*(p.shoulderX-.12),0,0);
        this.elbows[i].position.y=-this.upperLength;
        this.knees[i].position.y=-this.legLength;
        this.feet[i].position.y=-(p.kneeY-p.ankleY);
      }
      this.hips.position.y=this.hipHeight;
      this.racket.position.y=this.leftHand.position.y=-this.gripLength;
    }
    const anchors:Record<string,T.Object3D>={};
    anchors.Hips=this.hips;anchors.Head=this.head;anchors.Spine=this.spine;anchors.Chest=this.chest;
    // The source Neck also weights the collar and shoulder seam. Keep it on
    // the trunk; ball-tracking head rotation must not pull those vertices.
    for(let i=0;i<2;i++){
      const suffix=i?'R':'L';
      anchors['UpperArm_'+suffix]=this.arms[i];anchors['LowerArm_'+suffix]=this.elbows[i];
      anchors['UpperLeg_'+suffix]=this.legs[i];anchors['LowerLeg_'+suffix]=this.knees[i];
      anchors['Foot_'+suffix]=this.feet[i];
      anchors['Clavicle_'+suffix]=this.clavicles[i];anchors['Toe_'+suffix]=this.toes[i];
      if(i)anchors.Hand_R=this.racket;
      else anchors.Hand_L=this.leftHand;
    }
    this.generated=this.directProfile?new DirectOriginalSkin(scene,this.torso,anchors):new AthleteSkin(scene,this.torso,anchors);
    this.root.traverse(o=>{if(o.userData.fallbackBody)o.visible=false;});
    this.root.add(scene);this.modelSource='lux3d';
  }
  private armTo(index:number,hand:T.Vector3,elbowPole?:T.Vector3,softReach=0){
    this.root.updateMatrixWorld(true);
    const arm=this.arms[index],elbow=this.elbows[index],target=arm.parent!.worldToLocal(hand.clone()).sub(arm.position);
    const reach=target.length(),extension=T.MathUtils.clamp(reach-.56,0,.218);
    // Ease into full extension instead of snapping a bent elbow straight at the reach limit.
    const eased=reach<=.56?reach:.56+extension-extension*extension/.436;
    const d=T.MathUtils.clamp(T.MathUtils.lerp(reach,eased,softReach),.051,.669),axis=target.normalize();
    const pole=elbowPole?.clone()??new T.Vector3(index?-.7:.7,-1,.35);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const along=(this.upperLength**2+d*d-this.gripLength**2)/(2*d),height=Math.sqrt(Math.max(0,this.upperLength**2-along*along));
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
  private legTo(index:number,target:T.Vector3,turn:number,heelRoll=0){
    const leg=this.legs[index],knee=this.knees[index],foot=this.feet[index];
    const flat=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),(this.seat===0?Math.PI:0)+turn);
    const rolled=flat.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),heelRoll));
    // Keep the forefoot contact in world space while the heel rises.
    const pivot=new T.Vector3(0,-.035,.11);
    target=target.clone().add(pivot.clone().applyQuaternion(flat)).sub(pivot.applyQuaternion(rolled));
    const offset=this.root.worldToLocal(target.clone()).sub(leg.position),length=this.legLength;
    const lowerLength=this.directProfile?this.directProfile.kneeY-this.directProfile.ankleY:length;
    const d=T.MathUtils.clamp(offset.length(),Math.abs(length-lowerLength)+.001,length+lowerLength-.001),axis=offset.normalize();
    const pole=new T.Vector3(Math.sin(turn),0,Math.cos(turn));pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const along=(length*length-lowerLength*lowerLength+d*d)/(2*d);
    const upper=axis.clone().multiplyScalar(along).addScaledVector(pole,Math.sqrt(Math.max(0,length*length-along*along)));
    leg.quaternion.setFromUnitVectors(down,upper.clone().normalize());
    const lower=axis.multiplyScalar(d).sub(upper).normalize().applyQuaternion(leg.quaternion.clone().invert());
    knee.quaternion.setFromUnitVectors(down,lower);
    // Keep the ankle level independently of the bending knee.
    foot.quaternion.copy(leg.quaternion).multiply(knee.quaternion).invert()
      .multiply(this.root.quaternion.clone().invert()).multiply(rolled);
    this.toes[index].rotation.x=-heelRoll;
  }
  private celebrate(p:PlayerState,time:number){
    const hand=handedness(p.characterId),yaw=this.seat===0?Math.PI:0;
    this.root.scale.x=1;
    if(!this.celebrating){
      // Return the previous reflected rig to canonical solve space before
      // capturing it. Keep the entry blend independent of stale shot metadata.
      if(hand===-1){this.root.position.x*=-1;this.root.quaternion.y*=-1;this.root.quaternion.z*=-1;}
      this.celebrationEntry=this.hasRendered?[this.root,this.torso,this.spine,this.chest,...this.clavicles,...this.toes,this.hips,this.head,...this.arms,...this.elbows,...this.legs,...this.knees,...this.feet,this.racket,this.leftHand]
        .map(node=>({node,position:node.position.clone(),rotation:node.quaternion.clone()})):[];
      this.celebrating=true;
    }
    const pose=victoryPose(time),station=new T.Vector3(p.x*hand,0,p.z);
    this.root.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),yaw);
    this.root.position.copy(station).add(new T.Vector3(pose.rootX,0,0).applyQuaternion(this.root.quaternion));
    this.hips.position.set(0,this.hipHeight-pose.drop,0);this.hips.rotation.set(0,pose.hipTurn,0);
    this.torso.rotation.set(pose.lean,pose.turn,pose.bank);
    this.spine.rotation.y=-pose.turn*.28;this.chest.quaternion.identity();
    for(const node of [...this.clavicles,...this.toes])node.quaternion.identity();
    for(let i=0;i<2;i++)this.arms[i].position.set((i?-1:1)*(this.directProfile?this.directProfile.shoulderX-.12:.19),0,0);
    const pivot=new T.Vector3(0,.85,0);
    this.torso.position.copy(pivot).sub(pivot.clone().applyQuaternion(this.torso.quaternion));
    this.torso.position.y-=pose.drop;
    this.head.rotation.set(pose.nod,-pose.turn*.35,0);
    this.root.updateMatrixWorld(true);
    for(let i=0;i<2;i++){
      this.legs[i].position.set(i?-.15:.15,0,0).applyAxisAngle(new T.Vector3(0,1,0),pose.hipTurn).add(this.hips.position);
      const foot=pose.feet[i].clone().applyQuaternion(this.root.quaternion).add(station);
      this.legTo(i,foot,0);
    }
    this.racketTo(pose.tip,pose.shaft,false,0,0,new T.Vector3(-.3,-1,.2));
    this.armTo(0,this.root.localToWorld(pose.hand.clone()),new T.Vector3(.3,-1,.15));
    // Stable palm orientation: do not inherit an unrelated serve's wrist fold.
    const palm=this.root.getWorldQuaternion(new T.Quaternion()).multiply(new T.Quaternion().setFromEuler(new T.Euler(.15,0,-.15)));
    this.leftHand.quaternion.copy(this.elbows[0].getWorldQuaternion(new T.Quaternion()).invert().multiply(palm));
    const entry=1-victoryEase(time/.45);
    if(entry>0)for(const from of this.celebrationEntry){
      from.node.position.lerp(from.position,entry);from.node.quaternion.slerp(from.rotation,entry);
    }
    this.root.updateMatrixWorld(true);this.generated?.update();
    this.root.position.x*=hand;
    if(hand===-1){this.root.quaternion.y*=-1;this.root.quaternion.z*=-1;}
    this.root.scale.x=hand;this.root.updateMatrixWorld(true);
    this.hasRendered=true;
  }
  update(p:PlayerState,time:number,deltaTime?:number,celebrationTime?:number){
    if(celebrationTime!==undefined){this.celebrate(p,celebrationTime);return;}
    if(this.celebrating){this.celebrating=false;this.celebrationEntry=[];this.footwork=new Footwork();}
    this.hasRendered=true;
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
    const stepOut=p.rescue?.short||p.rescue?.recovery==='step-out';
    const shortSettle=p.rescue?.short?rescue.recovery:0;
    const yaw=this.seat===0?Math.PI:0;
    this.root.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),yaw);
    if(p.rescue){
      this.root.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(rescue.pitch,0,rescue.roll)));
      const pivot=new T.Vector3(0,.85,0).applyQuaternion(this.root.quaternion);
      this.root.position.set(p.x-pivot.x,rescue.hipHeight-pivot.y,p.z-pivot.z);
    }else this.root.position.set(p.x,0,p.z);
    this.root.updateMatrixWorld(true);
    const groundTarget=(x:number,y:number,z:number)=>new T.Vector3(x,y,z).applyAxisAngle(new T.Vector3(0,1,0),yaw).add(new T.Vector3(p.x,0,p.z));
    const actual=p.rescue?.contact??p.preparation?.contact??p.contact;
    const contact=actual?this.root.worldToLocal(new T.Vector3(actual.x,actual.y,actual.z)):new T.Vector3(-.85,1.1,.65);
    const pose=strokePose(p,contact),active=!!p.rescue||!!p.preparation||p.swing>0;
    const jump=p.rescue?rescueStroke(p,time,contact):undefined;
    if(jump)Object.assign(pose,jump);
    const dt=deltaTime??Math.max(1/60,Math.min(.08,time-this.lastTime));this.lastTime=time;
    // A rescue pivots the visual root around the hip. Its offset is not travel
    // and must not become a phantom running stride on return to standing.
    if(this.wasRescuing&&!p.rescue)this.footwork=new Footwork();
    this.wasRescuing=!!p.rescue;
    const body=strokeBody(p),gait=this.footwork.update(this.root.position,this.root.quaternion,dt),movement=gait.localDirection;
    const stride=Math.sin(gait.phase*Math.PI*2)*Math.min(1,gait.speed/2);
    // The last 120ms of a groundstroke already returns the racket to ready.
    // Release it into the gait over that interval instead of a one-frame
    // switch when swing reaches zero. Contact and the main follow-through
    // stay fully authored, including two-handed backhand support.
    const recoveryRun=p.stroke==='forehand'||p.stroke==='backhand'?1-T.MathUtils.smoothstep(p.swing,0,.12):0;
    const running=T.MathUtils.smoothstep(gait.speed,2.2,4.5)*(p.rescue?0:p.swing>0?recoveryRun:p.preparation?1-T.MathUtils.smoothstep(p.preparation.progress,.2,.55):1);
    const runTurn=gait.turn*.65;
    if(running>0){
      pose.tip.lerp(new T.Vector3(-.4,1.28+stride*.035,.66+stride*.10).applyAxisAngle(new T.Vector3(0,1,0),runTurn),running);
      pose.shaft.lerp(new T.Vector3(-.25,.9,.25).normalize().applyAxisAngle(new T.Vector3(0,1,0),runTurn),running).normalize();
      pose.twoHands=false;pose.support=1-running;
    }
    // Don't freeze the legs in an almost-complete preparation pose while the
    // player is still travelling; even slow adjustment steps need a gait.
    const speedBlend=1-T.MathUtils.smoothstep(gait.speed,.12,.65);
    // Whole-body loading must run during the serve, even though it has no queued return.
    const action=active&&!p.rescue?body.blend:0;
    const lower=action*(p.preparation?.stroke==='serve'?1:speedBlend);
    const contactWeight=p.rescue?T.MathUtils.smoothstep(rescueAge(p,time),0,.10):p.swing>0?Math.min(1,p.swing/.15):p.preparation?T.MathUtils.smoothstep(p.preparation.progress,.8,1):0;
    const contactCrouching=contactCrouch(contact.y)*contactWeight*(p.rescue?1-rescue.recovery:1);
    const hipDrop=p.rescue ? .02*shortSettle :
      T.MathUtils.lerp(gait.hipDrop,body.hipDrop-body.lift,action)+contactCrouching;
    const hipTurn=T.MathUtils.lerp(gait.turn,body.hipTurn,lower)*(1-shortSettle);
    this.hips.position.y=this.hipHeight-hipDrop;this.hips.rotation.y=hipTurn;
    for(let i=0;i<2;i++){
      this.legs[i].position.set((i?-1:1)*.15,this.hipHeight-hipDrop,0).applyAxisAngle(new T.Vector3(0,1,0),hipTurn);
      const posed=this.root.localToWorld(body.feet[i].clone());
      const foot=jump?this.root.localToWorld(jump.feet[i].clone()):
        gait.feet[i].lerp(posed,lower).add(new T.Vector3(0,rescue.lift+rescue.air*(i?.05:.1),0));
      if(jump&&rescue.landing>0){
        const settle=T.MathUtils.smoothstep(rescueAge(p,time),.35,.52);
        const age=rescueAge(p,time);
        const trailing=stepOut&&i===1?.10*(1-T.MathUtils.smoothstep(age,.48,.65)):0;
        const recoveryFoot=groundTarget(i?-.22:.22,.105+trailing,(stepOut?(i?-.14:.17):-.68)*(1-rescue.recovery));
        foot.lerp(recoveryFoot,settle);
      }
      if(shortSettle)foot.lerp(groundTarget(i?-.19:.19,.105,0),shortSettle);
      this.legTo(i,foot,T.MathUtils.lerp(hipTurn*.6,body.footYaw[i],lower),p.rescue?0:gait.heelRoll[i]*(1-lower));
    }
    this.torso.position.y=-hipDrop;
    const motionStrength=p.rescue?contactWeight:action;
    const lean=Math.min(.18,gait.speed*.028)*(1-motionStrength);
    this.torso.rotation.set(T.MathUtils.lerp(.035,body.lean,action)+movement.z*lean,pose.turn+gait.turn*.65*(1-motionStrength)+stride*.045*running,body.sideBend*action-movement.x*lean*.65);
    // Distribute axial rotation through the waist/chest instead of rotating
    // the entire shirt as one rigid segment. Shoulder centres remain on the
    // contact solver's existing reach envelope.
    const controls=bodyControls(p,this.torso.rotation.y,body.feet.map(f=>f.y));
    this.spine.rotation.y=controls.waistCounterTurn;
    this.chest.quaternion.identity();
    for(let i=0;i<2;i++){
      this.clavicles[i].rotation.set(0,controls.shoulderYaw[i],0);
      // Preserve shoulder location and thus authoritative reach while allowing
      // the clavicle skin to protract. Arm IK uses this parent's full transform.
      this.arms[i].position.set((i?-1:1)*(this.directProfile?this.directProfile.shoulderX-.12:.19),0,0).applyQuaternion(this.clavicles[i].quaternion.clone().invert());
      this.toes[i].rotation.x-=controls.toes[i]*lower;
    }
    const serving=(p.preparation?.stroke??p.stroke)==='serve';
    this.head.rotation.set(serving?body.headPitch*action:T.MathUtils.clamp(Math.atan2(1.7-contact.y,Math.max(.7,contact.z)), -.55,.4)*action, -pose.turn*.55*action,0);
    if(p.rescue){
      // The whole body, not just the chest, rotates from side flight to prone.
      this.torso.rotation.x=0;this.torso.rotation.z=0;
      this.torso.rotation.y*=1-rescue.landing;
      this.head.rotation.set(-.12*rescue.landing,0,0);
    }
    this.arms[0].rotation.set(-.45-stride*.3,0,-.3);this.elbows[0].rotation.set(-.6,0,0);this.leftHand.quaternion.identity();
    if(p.rescue&&!stepOut){
      this.root.updateMatrixWorld(true);
      const shoulder=this.root.worldToLocal(this.arms[1].getWorldPosition(new T.Vector3()));
      // Keep the shaft pointing away from the shoulder during the roll to the
      // floor; an overhead shaft passing through the reach-cone antipode flips.
      const reach=pose.tip.clone().sub(shoulder).normalize();
      // Keep a bent-elbow grip through follow-through. A perfectly radial
      // shaft can put the hand at the shoulder when tip distance equals .45m.
      const tangent=new T.Vector3(0,0,1).addScaledVector(reach,-reach.z).normalize();
      reach.multiplyScalar(.8).addScaledVector(tangent,.6).normalize();
      const blend=T.MathUtils.smoothstep(rescueAge(p,time),.23,.32)*(1-rescue.recovery);
      pose.shaft.lerp(reach,blend).normalize();
    }
    const rescuePole=p.rescue?new T.Vector3(-.3,0,-1).lerp(new T.Vector3(-.7,-1,.35),shortSettle):undefined;
    this.racketTo(pose.tip,pose.shaft,pose.twoHands,0,body.faceRoll*action,p.rescue?rescuePole:action?body.elbow:undefined);
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
    if(p.rescue&&!stepOut&&rescueAge(p,time)>.32){
      const plant=T.MathUtils.smoothstep(rescueAge(p,time),.32,RESCUE.riseAt);
      const release=T.MathUtils.smoothstep(rescue.recovery,.48,1);
      for(const i of [0,1]){
        const hand=i===1?this.racket:this.leftHand;
        const orientation=hand.getWorldQuaternion(new T.Quaternion());
        const current=hand.getWorldPosition(new T.Vector3());
        const floor=groundTarget(i===1?-.32:.32,.12,.52);
        const target=floor.lerp(current,release);
        const pole=(i?new T.Vector3(-.3,0,-1):new T.Vector3(.7,-.6,-.2))
          .lerp(new T.Vector3(i?-.3:.8,0,-1),plant*(1-release));
        this.armTo(i,current.lerp(target,plant),pole);
        hand.quaternion.copy(this.elbows[i].getWorldQuaternion(new T.Quaternion()).invert().multiply(orientation));
      }
      const world=this.racket.getWorldQuaternion(new T.Quaternion());
      const shaft=new T.Vector3(0,-1,0).applyQuaternion(world);
      const flat=new T.Vector3(0,0,-1).applyAxisAngle(new T.Vector3(0,1,0),yaw);
      const swing=new T.Quaternion().setFromUnitVectors(shaft,flat);
      swing.slerp(new T.Quaternion(),1-plant*(1-release));
      this.racket.quaternion.copy(this.elbows[1].getWorldQuaternion(new T.Quaternion()).invert().multiply(swing.multiply(world)));
    }
    if(this.generated){this.root.updateMatrixWorld(true);this.generated.update(dt);}
    this.root.position.x=worldX+hand*(this.root.position.x-p.x);
    // S R S: mirroring local scale alone is insufficient once the root banks.
    if(hand===-1){this.root.quaternion.y*=-1;this.root.quaternion.z*=-1;}
    this.root.scale.x=hand;this.root.updateMatrixWorld(true);
  }
}
