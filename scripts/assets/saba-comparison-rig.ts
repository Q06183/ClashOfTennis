import * as T from 'three';

/** Demo-only pose transfer. Source assets/weights are not modified on disk.
 * The two figures receive the same match joint targets; Blender's bind rotation
 * is retained on B, and B-only skirt helpers inherit the animated pelvis.
 */
export class ComparisonRig {
  private bindings:{bone:T.Bone;rest:T.Matrix4;inverse:T.Matrix4;point:T.Vector3;axis:T.Vector3;length:number;child?:string}[]=[];
  private sourceProfile:any;
  constructor(readonly target:T.Object3D,readonly source:T.Object3D){
    source.updateMatrixWorld(true);target.updateMatrixWorld(true);
    this.sourceProfile=source.userData.directOriginalRig;
    const definitions=new Map<string,any>(this.sourceProfile.joints.map((j:any)=>[j.name,j]));
    target.traverse(o=>{
      if(!(o instanceof T.Bone))return;
      const rest=o.matrixWorld.clone(),point=new T.Vector3().setFromMatrixPosition(rest);
      const children:Record<string,string>={
        UpperArm_L:'LowerArm_L',UpperArm_R:'LowerArm_R',LowerArm_L:'Hand_L',LowerArm_R:'Hand_R',
        UpperLeg_L:'LowerLeg_L',UpperLeg_R:'LowerLeg_R',LowerLeg_L:'Foot_L',LowerLeg_R:'Foot_R',
      };
      const child=children[o.name],endpoint=child?target.getObjectByName(child)!.getWorldPosition(new T.Vector3()):null;
      const definition=definitions.get(o.name);
      const axis=endpoint?endpoint.clone().sub(point):definition?
        new T.Vector3().fromArray(definition.tail).sub(new T.Vector3().fromArray(definition.at)):new T.Vector3(0,1,0);
      const length=axis.length();axis.normalize();
      this.bindings.push({bone:o,rest,inverse:rest.clone().invert(),point,axis,length,child});
      o.matrixAutoUpdate=false;
    });
  }
  restore(){
    for(const b of this.bindings){
      b.bone.matrixWorld.copy(b.rest);
      b.bone.matrix.copy(b.bone.parent!.matrixWorld).invert().multiply(b.rest);
    }
    this.target.updateMatrixWorld(true);
  }
  update(){
    const sourceDefs=new Map<string,any>(this.sourceProfile.joints.map((j:any)=>[j.name,j]));
    const deltas=new Map<string,T.Matrix4>();
    for(const b of this.bindings){
      const src=this.source.getObjectByName(b.bone.name);
      let world:T.Matrix4;
      if(src&&sourceDefs.has(b.bone.name)){
        const j=sourceDefs.get(b.bone.name);
        const at=src.getWorldPosition(new T.Vector3());
        let rotation=src.getWorldQuaternion(new T.Quaternion()),lengthRatio=1;
        if(b.child){
          const end=this.source.getObjectByName(b.child)!.getWorldPosition(new T.Vector3());
          const axis=end.sub(at),length=axis.length();axis.normalize();
          const sourceAxis=new T.Vector3().fromArray(j.tail).sub(new T.Vector3().fromArray(j.at)).normalize();
          // Match limb direction plus roll from the actual match source.
          rotation.multiply(new T.Quaternion().setFromUnitVectors(b.axis,sourceAxis));
          rotation.premultiply(new T.Quaternion().setFromUnitVectors(b.axis.clone().applyQuaternion(rotation),axis));
          lengthRatio=length/b.length;
        }
        const stretch=new T.Matrix4(),a=b.axis.toArray(),e=stretch.elements;
        if(b.child)for(let row=0;row<3;row++)for(let col=0;col<3;col++)
          e[col*4+row]+=(lengthRatio-1)*a[row]*a[col];
        const delta=new T.Matrix4().compose(at,rotation,new T.Vector3(1,1,1))
          .multiply(stretch).multiply(new T.Matrix4().makeTranslation(-b.point.x,-b.point.y,-b.point.z));
        world=delta.clone().multiply(b.rest);deltas.set(b.bone.name,delta);
      }else{
        // These eight helper bones belong only to the prototype skirt.
        const delta=deltas.get('Hips')??new T.Matrix4();
        world=delta.clone().multiply(b.rest);
      }
      b.bone.matrix.copy(b.bone.parent!.matrixWorld).invert().multiply(world);
      b.bone.matrixWorld.copy(world);
    }
    this.target.updateMatrixWorld(true);
  }
}
