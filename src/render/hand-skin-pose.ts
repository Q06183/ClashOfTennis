import {Matrix4,MathUtils,Quaternion,Vector3} from 'three';

/** Source hand's palm centre in its retargeted, fingers-down anatomical frame.
 * Grip -Y points to the racket throat: index/thumb stay proximal to that end,
 * unlike the reversed procedural finger row removed in revision 2.
 */
export function handSkinPose(grip:Matrix4,elbow:Matrix4,side:'L'|'R',closed=1,previous?:Quaternion,dt=1/60,character='lin',calibrated=false,elbowToGrip=calibrated?.34:.31){
 const gp=new Vector3(),gq=new Quaternion(),scale=new Vector3();
 grip.decompose(gp,gq,scale);
 const ep=new Vector3().setFromMatrixPosition(elbow);
 const eq=new Quaternion().setFromRotationMatrix(elbow);
 // Fingers continue out from the wrist and curl ACROSS the handle, not along
 // its shaft. Copying the racket quaternion turned the hand into a backwards
 // mitten. Use the forearm direction for wrist extension and the shaft only
 // to choose the thumb/index side (opposite for anatomical left/right).
 const y=gp.clone().sub(ep).normalize().negate();
 const shaft=new Vector3(0,-1,0).applyQuaternion(gq);
 const wristBend=MathUtils.clamp(Math.asin(MathUtils.clamp(shaft.dot(y),-1,1)),-.65,.65)*closed;
 // Source palms lie in their YZ plane (normal X). Finger width is Z, not X.
 // Align that width to the handle, and keep the thumb side toward the throat.
 const z=shaft.addScaledVector(y,-shaft.dot(y));
 const leverage=z.length();
 if(z.lengthSq()<.01)z.set(0,0,1).applyQuaternion(eq).addScaledVector(y,-new Vector3(0,0,1).applyQuaternion(eq).dot(y));
 z.normalize().multiplyScalar(side==='R'?1:-1);
 const x=y.clone().cross(z).normalize();z.copy(x).cross(y).normalize();
 const aligned=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));
 if(character==='mei')aligned.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI));
 // At shaft/forearm collinearity the thumb plane is undefined. Fade to the
 // anatomical forearm frame before that singularity instead of flipping 180°.
 const rotation=eq.clone().slerp(aligned,closed*MathUtils.smoothstep(leverage,.30,.80));
 rotation.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),wristBend*(side==='R'?1:-1)));
 // Unsculpted roster hands retain their original bind-space palm orientation.
 // The three calibrated prototypes use a different palm basis; applying that
 // basis to original hands twists the wrist seam (especially Luca).
 if(character==='original'){
  const angle=eq.angleTo(gq);
  rotation.copy(eq).slerp(gq,Math.min(1,.95/Math.max(angle,1e-8)));
 }
 if(previous){
  const angle=previous.angleTo(rotation),step=Math.max(0,dt)*18;
  rotation.copy(previous.clone().slerp(rotation,Math.min(1,step/Math.max(angle,1e-8))));
 }
 // Wrist is the fixed endpoint of the forearm. Neither racket roll, smoothed
 // palm orientation nor grip target distance may translate this joint. Bind
 // calibration is constant; animation contains only rotation about pivots.
 const forearmLength=elbowToGrip-(calibrated?.052:.054);
 const wrist=ep.clone().add(new Vector3(0,-forearmLength,0).applyQuaternion(eq));
 return {hand:new Matrix4().compose(wrist,rotation,scale),
  forearm:new Matrix4().compose(ep,eq,new Vector3(1,forearmLength/elbowToGrip,1)),
  wrist,palm:gp,rotation};
}
