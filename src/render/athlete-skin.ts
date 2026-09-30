import * as T from 'three';
import {handSkinPose} from './hand-skin-pose.js';

/** Retarget the generated bind pose to the same joints that drive racket contact. */
export class AthleteSkin {
  private world=new T.Matrix4();
  private joints:{bone:T.Bone;anchor:T.Object3D;offset:T.Matrix4;forearm?:T.Object3D}[]=[];
  private position=new T.Vector3();private scale=new T.Vector3();
  private rotation=new T.Quaternion();private forearmRotation=new T.Quaternion();
  private continuous=false;
  private anchors:Record<string,T.Object3D>;
  private handRotations:Partial<Record<'L'|'R',T.Quaternion>>={};
  constructor(readonly scene:T.Object3D,torso:T.Object3D,anchors:Record<string,T.Object3D>){
    this.continuous=scene.userData.handFaceRevision===2||scene.userData.jointOptimizationRevision===1;this.anchors=anchors;
    scene.updateMatrixWorld(true);
    const inverse=scene.matrixWorld.clone().invert();
    scene.traverse(o=>{
      if(o instanceof T.SkinnedMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}
      if(!(o instanceof T.Bone))return;
      const bind=inverse.clone().multiply(o.matrixWorld),anchor=anchors[o.name];
      let offset=bind;
      if(anchor){
        const q=new T.Quaternion();bind.decompose(new T.Vector3(),q,new T.Vector3());
        if(/^(Upper|Lower)(Arm|Leg)|^Hand_/.test(o.name)){
          const axis=new T.Vector3(0,1,0).applyQuaternion(q);
          q.premultiply(new T.Quaternion().setFromUnitVectors(axis,new T.Vector3(0,-1,0)));
        }
        offset=new T.Matrix4().makeRotationFromQuaternion(q);
        if(/^(Upper|Lower)Arm_/.test(o.name)){
          const child=o.children.find(b=>b instanceof T.Bone),target=child&&anchors[child.name];
          if(child&&target){
            const end=new T.Vector3().setFromMatrixPosition(inverse.clone().multiply(child.matrixWorld));
            const length=end.distanceTo(new T.Vector3().setFromMatrixPosition(bind));
            // Match bind-segment length to the fixed IK limb length. Otherwise
            // separate elbow/wrist translations stretch blended skin across a gap.
            if(length>1e-6){
              const targetLength=target.position.length();
              offset.scale(new T.Vector3(1,targetLength/length,1));
            }
          }
        }
        if(o.name==='Head'||o.name==='Neck'){offset.copy(bind);offset.elements[13]-=1.5;}
        if(o.name==='Spine')offset.copy(bind);
        if(o.name==='Chest'){offset.copy(bind);offset.elements[13]-=1.25;}
      }
      this.joints.push({bone:o,anchor:anchor??torso,offset,forearm:o.name.startsWith('Hand_')?anchors[o.name.replace('Hand_','LowerArm_')]:undefined});o.matrixAutoUpdate=false;
    });
  }
  update(dt=1/60){
    const handPoses:Partial<Record<'L'|'R',ReturnType<typeof handSkinPose>>>={};
    if(this.continuous)for(const side of ['L','R'] as const){
      const grip=this.anchors['Hand_'+side],elbow=this.anchors['LowerArm_'+side],right=this.anchors.Hand_R;
      const distance=grip.getWorldPosition(new T.Vector3()).distanceTo(right.localToWorld(new T.Vector3(0,-.10,0)));
      const closed=side==='R'?1:1-T.MathUtils.smoothstep(distance,.04,.18);
      const pose=handSkinPose(grip.matrixWorld,elbow.matrixWorld,side,closed,this.handRotations[side],dt,this.scene.userData.jointHandProfile??this.scene.userData.handFaceCharacter,this.scene.userData.bodyProportionRevision===3);
      this.handRotations[side]=pose.rotation.clone();handPoses[side]=pose;
    }
    for(const {bone,anchor,offset,forearm} of this.joints){
      const world=this.world.copy(anchor.matrixWorld);
      if(this.continuous&&/^(Hand|LowerArm)_/.test(bone.name)){
        const side=bone.name.endsWith('_R')?'R':'L';
        const pose=handPoses[side]!;
        world.copy(bone.name.startsWith('Hand')?pose.hand:pose.forearm);
        world.multiply(offset);
        bone.matrix.copy(bone.parent!.matrixWorld).invert().multiply(world);bone.matrixWorld.copy(world);
        continue;
      }
      if(forearm){
        // A racket can rotate much farther than a human wrist. Keep the mesh
        // palm attached to the grip, but do not bend the forearm skin with it.
        world.decompose(this.position,this.rotation,this.scale);
        forearm.getWorldQuaternion(this.forearmRotation);
        const angle=this.forearmRotation.angleTo(this.rotation);
        this.forearmRotation.slerp(this.rotation,Math.min(1,.95/Math.max(angle,1e-8)));
        world.compose(this.position,this.forearmRotation,this.scale);
      }
      world.multiply(offset);
      bone.matrix.copy(bone.parent!.matrixWorld).invert().multiply(world);
      bone.matrixWorld.copy(world);
    }
  }
}
