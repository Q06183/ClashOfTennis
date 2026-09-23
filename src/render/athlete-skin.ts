import * as T from 'three';

/** Retarget the generated bind pose to the same joints that drive racket contact. */
export class AthleteSkin {
  private world=new T.Matrix4();
  private joints:{bone:T.Bone;anchor:T.Object3D;offset:T.Matrix4;forearm?:T.Object3D}[]=[];
  private position=new T.Vector3();private scale=new T.Vector3();
  private rotation=new T.Quaternion();private forearmRotation=new T.Quaternion();
  constructor(readonly scene:T.Object3D,torso:T.Object3D,anchors:Record<string,T.Object3D>){
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
            if(length>1e-6)offset.scale(new T.Vector3(1,target.position.length()/length,1));
          }
        }
        if(o.name==='Head'||o.name==='Neck'){offset.copy(bind);offset.elements[13]-=1.5;}
      }
      this.joints.push({bone:o,anchor:anchor??torso,offset,forearm:o.name.startsWith('Hand_')?anchors[o.name.replace('Hand_','LowerArm_')]:undefined});o.matrixAutoUpdate=false;
    });
  }
  update(){
    for(const {bone,anchor,offset,forearm} of this.joints){
      const world=this.world.copy(anchor.matrixWorld);
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
