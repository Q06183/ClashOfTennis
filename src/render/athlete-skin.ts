import * as T from 'three';

/** Retarget the generated bind pose to the same joints that drive racket contact. */
export class AthleteSkin {
  private joints:{bone:T.Bone;anchor:T.Object3D;offset:T.Matrix4}[]=[];
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
        if(!o.name.startsWith('Foot')){
          const axis=new T.Vector3(0,1,0).applyQuaternion(q);
          q.premultiply(new T.Quaternion().setFromUnitVectors(axis,new T.Vector3(0,-1,0)));
        }
        offset=new T.Matrix4().makeRotationFromQuaternion(q);
      }
      this.joints.push({bone:o,anchor:anchor??torso,offset});o.matrixAutoUpdate=false;
    });
  }
  update(){
    for(const {bone,anchor,offset} of this.joints){
      const world=anchor.matrixWorld.clone().multiply(offset);
      bone.matrix.copy(bone.parent!.matrixWorld).invert().multiply(world);
      bone.matrixWorld.copy(world);
    }
  }
}
