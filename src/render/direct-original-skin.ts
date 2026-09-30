import * as T from 'three';

type Joint={name:string;at:number[];tail:number[];parent?:string};
export type DirectOriginalProfile={
  schema:'direct-original-v1';character:string;scale:number;offset:number[];
  joints:Joint[];hipY:number;kneeY:number;ankleY:number;headY:number;neckY:number;
  shoulderX:number;shoulderY:number;shoulderZ:number;
  upperLength:number;forearmLength:number;palmOffset:number;gripLength:number;
  palmCenter:number[];
};

/** Retarget a translation-only source skeleton without assuming Blender bone axes.
 * Every bone world transform maps ORIGINAL mesh coordinates into match space.
 * The common unit transform remains on the source parent; bind data is untouched.
 */
export class DirectOriginalSkin {
  private joints:{bone:T.Bone;definition:Joint;bindAxis:T.Vector3}[]=[];
  private profile:DirectOriginalProfile;
  private meshes:T.SkinnedMesh[]=[];
  constructor(readonly scene:T.Object3D,private torso:T.Object3D,private anchors:Record<string,T.Object3D>){
    this.profile=scene.userData.directOriginalRig;
    for(const definition of this.profile.joints){
      const bone=scene.getObjectByName(definition.name);
      if(!(bone instanceof T.Bone))throw new Error(`Missing direct-rig bone ${definition.name}`);
      const bindAxis=new T.Vector3().fromArray(definition.tail).sub(new T.Vector3().fromArray(definition.at)).normalize();
      this.joints.push({bone,definition,bindAxis});bone.matrixAutoUpdate=false;
    }
    scene.traverse(o=>{if(o instanceof T.SkinnedMesh){o.frustumCulled=false;o.castShadow=true;o.receiveShadow=true;this.meshes.push(o);}});
  }
  update(){
    const parent=this.scene.parent!;
    const torsoRotation=this.torso.getWorldQuaternion(new T.Quaternion());
    const s=this.profile.scale;
    const uniformScale=parent.getWorldScale(new T.Vector3()).multiplyScalar(s);
    const worldByName=new Map<string,T.Matrix4>();
    const hands=new Map<string,{position:T.Vector3;rotation:T.Quaternion}>();
    for(const side of ['L','R']){
      const j=this.profile.joints.find(j=>j.name===`Hand_${side}`)!;
      const forearm=this.anchors[`LowerArm_${side}`],grip=this.anchors[`Hand_${side}`];
      const bindAxis=new T.Vector3().fromArray(j.tail).sub(new T.Vector3().fromArray(j.at)).normalize();
      const rotation=forearm.getWorldQuaternion(new T.Quaternion())
        .multiply(new T.Quaternion().setFromUnitVectors(bindAxis,new T.Vector3(0,-1,0)));
      const palm=new T.Vector3().fromArray(this.profile.palmCenter);
      if(side==='R')palm.x*=-1;
      const offset=palm.sub(new T.Vector3().fromArray(j.at)).applyQuaternion(rotation);
      hands.set(j.name,{rotation,position:grip.getWorldPosition(new T.Vector3()).sub(offset)});
    }
    for(const {bone,definition:j,bindAxis} of this.joints){
      const anchor=this.anchors[j.name];
      let position=new T.Vector3(),rotation=new T.Quaternion(),stretch=1;
      const localAt=new T.Vector3().fromArray(j.at);
      if(/^(Upper|Lower)(Arm|Leg)_/.test(j.name)){
        if(!anchor)throw new Error(`Missing match anchor ${j.name}`);
        position.copy(anchor.getWorldPosition(new T.Vector3()));
        const axis=new T.Vector3(0,-1,0);
        const align=new T.Quaternion().setFromUnitVectors(bindAxis,axis);
        rotation.copy(anchor.getWorldQuaternion(new T.Quaternion())).multiply(align);
        const childName=j.name.replace('UpperArm','LowerArm').replace('UpperLeg','LowerLeg')
          .replace(/^LowerArm/,'Hand').replace(/^LowerLeg/,'Foot');
        // Upper segments use the actual elbow/knee anchor.
        const endName=j.name.startsWith('UpperArm')?j.name.replace('UpperArm','LowerArm'):
          j.name.startsWith('UpperLeg')?j.name.replace('UpperLeg','LowerLeg'):childName;
        const end=this.anchors[endName];
        if(end){
          const endPosition=j.name.startsWith('LowerArm')?hands.get(endName)!.position:
            end.getWorldPosition(new T.Vector3());
          const targetAxis=endPosition.clone().sub(position).normalize();
          const currentAxis=bindAxis.clone().applyQuaternion(rotation);
          rotation.premultiply(new T.Quaternion().setFromUnitVectors(currentAxis,targetAxis));
          const length=endPosition.distanceTo(position);
          const sourceLength=new T.Vector3().fromArray(j.tail).distanceTo(localAt);
          stretch=length/sourceLength;
        }
      }else if(j.name.startsWith('Hand_')){
        position.copy(hands.get(j.name)!.position);
        rotation.copy(hands.get(j.name)!.rotation);
      }else if(j.name.startsWith('Foot_')){
        position.copy(anchor.getWorldPosition(new T.Vector3()));
        rotation.copy(anchor.getWorldQuaternion(new T.Quaternion()));
      }else if(j.name.startsWith('Toe_')){
        const footName=j.name.replace('Toe_','Foot_'),foot=worldByName.get(footName)!;
        const parentDef=this.profile.joints.find(p=>p.name===footName)!;
        position.copy(new T.Vector3().fromArray(j.at).sub(new T.Vector3().fromArray(parentDef.at)))
          .applyQuaternion(this.anchors[footName].getWorldQuaternion(new T.Quaternion()))
          .add(new T.Vector3().setFromMatrixPosition(foot));
        rotation.copy(this.anchors[footName].getWorldQuaternion(new T.Quaternion()));
      }else if(j.name==='Hips'){
        position.copy(anchor.getWorldPosition(new T.Vector3()));
        rotation.copy(anchor.getWorldQuaternion(new T.Quaternion()));
      }else if(j.name.startsWith('Clavicle_')){
        const shoulder=this.anchors[j.name.replace('Clavicle','UpperArm')];
        const delta=localAt.sub(new T.Vector3().fromArray(j.tail)).applyQuaternion(torsoRotation);
        position.copy(shoulder.getWorldPosition(new T.Vector3())).add(delta);rotation.copy(torsoRotation);
      }else{
        position.copy(this.torso.localToWorld(localAt));
        rotation.copy(torsoRotation);
        if(j.name==='Head'){
          rotation.copy(this.anchors.Head.getWorldQuaternion(new T.Quaternion()));
        }else if(j.name==='Spine'){
          rotation.copy(this.anchors.Spine.getWorldQuaternion(new T.Quaternion()));
        }
      }
      // Scale along the SOURCE segment axis, not glTF Y or Blender local Y.
      const scaleMatrix=new T.Matrix4().identity();
      if(stretch!==1){
        const a=bindAxis.toArray(),e=scaleMatrix.elements;
        for(let row=0;row<3;row++)for(let col=0;col<3;col++)
          e[col*4+row]+=(stretch-1)*a[row]*a[col];
      }
      const world=new T.Matrix4().compose(position,rotation,uniformScale).multiply(scaleMatrix);
      bone.matrix.copy(bone.parent!.matrixWorld).invert().multiply(world);
      bone.matrixWorld.copy(world);worldByName.set(j.name,world);
    }
    const right=this.anchors.Hand_R.getWorldPosition(new T.Vector3());
    const left=this.anchors.Hand_L.getWorldPosition(new T.Vector3());
    const support=1-T.MathUtils.smoothstep(left.distanceTo(right),.13,.24);
    for(const mesh of this.meshes){
      const dict=mesh.morphTargetDictionary,weights=mesh.morphTargetInfluences;
      if(!dict||!weights)continue;
      if(dict.Grip_R!==undefined)weights[dict.Grip_R]=1;
      if(dict.Grip_L!==undefined)weights[dict.Grip_L]=support;
    }
  }
}
