import {test} from 'node:test';import assert from 'node:assert/strict';import {Box3,Vector3} from 'three';
import {Athlete} from '../src/render/player.js';import {strokePose} from '../src/render/strokes.js';
const base={x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'backhand' as const,swing:0,shotQueued:true};
test('racket has adult proportions relative to the unscaled athlete',()=>{
 const a=new Athlete(1),r=a.root.getObjectByName('racket-grip')!;r.quaternion.identity();a.root.updateMatrixWorld(true);
 // Geometry bounds transformed into the grip coordinate frame, excluding the arm.
 const box=new Box3();r.traverse(o=>{if('geometry' in o){const m=o as import('three').Mesh;m.geometry.computeBoundingBox();const b=m.geometry.boundingBox!.clone();b.applyMatrix4(m.matrixWorld.clone().premultiply(r.matrixWorld.clone().invert()));box.union(b);}});
 const size=box.getSize(new Vector3());assert.ok(size.y>.66&&size.y<.71,`racket length ${size.y}`);assert.ok(size.x>.26&&size.x<.30,`head width ${size.x}`);
});
test('backhand maintains shoulder turn at contact and extends before wrapping over the right shoulder',()=>{
 const c=new Vector3(.65,1.1,.58),hit=strokePose({...base,swing:.44},c),extension=strokePose({...base,swing:.44*(1-.23)},c),finish=strokePose({...base,swing:.132},c);
 assert.ok(hit.turn>.4,'shoulders open too early');assert.ok(extension.tip.z>c.z+.12,'missing forward extension');assert.ok(finish.tip.x<-.3&&finish.tip.y>1.7);
});
test('both backhand hands stay on the same handle throughout preparation and follow-through',()=>{
 for(const seat of [0,1] as const){const a=new Athlete(seat),contact={x:seat===0?-.65:.65,y:1.1,z:seat===0?-.58:.58};
 for(let i=0;i<=72;i++){const t=i/50;a.update({...base,contact,swing:t>=1?Math.max(0,1.44-t):0,preparation:t<1?{stroke:'backhand',progress:t,contact}:undefined},t,1/60);a.root.updateMatrixWorld(true);
  const grip=a.root.getObjectByName('racket-grip')!,left=a.root.getObjectByName('left-hand-grip')!.getWorldPosition(new Vector3());
  const upper=grip.localToWorld(new Vector3(0,-.10,0));assert.ok(left.distanceTo(upper)<.025,`hand detached at ${seat}/${t}: ${left.distanceTo(upper)}`);
 }
 }
});
test('legal high backhands and lobs keep both hands attached throughout the finish',()=>{
 for(const seat of [0,1] as const)for(const stroke of ['backhand','lob'] as const){
  const a=new Athlete(seat),sign=seat===0?-1:1,contact={x:.1*sign,y:2.3,z:.2*sign};
  for(let i=0;i<=44;i++){a.update({...base,stroke,backhand:true,contact,swing:.44-i*.01},i/60,1/60);
   const grip=a.root.getObjectByName('racket-grip')!,left=a.root.getObjectByName('left-hand-grip')!.getWorldPosition(new Vector3());
   assert.ok(left.distanceTo(grip.localToWorld(new Vector3(0,-.1,0)))<.025,`high ${stroke} ${i} detached`);
  }
 }
});
test('short-racket eligibility and rendered impact agree for low, high, late and wide shots',async()=>{
 const {canReachContact}=await import('../src/simulation/athlete.js');let samples=0;
 for(const seat of [0,1] as const)for(const stroke of ['forehand','backhand','volley','lob'] as const){
  const a=new Athlete(seat),sign=seat===0?-1:1;
  for(const x of [-.9,-.55,-.1,.1,.55,.9])for(const y of [.35,1.1,2.1])for(const z of [-.3,.2,.7]){
   const backhand=x>0;if(stroke==='backhand'&&!backhand||stroke==='forehand'&&backhand||!canReachContact(x,y,z,backhand))continue;
   const contact={x:x*sign,y,z:z*sign};a.update({...base,stroke,backhand,contact,swing:.44},1,1/60);
   const sweet=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
   assert.ok(sweet.distanceTo(new Vector3(contact.x,contact.y,contact.z))<.015,`${seat}/${stroke} misses ${x}/${y}/${z}`);samples++;
  }
 }
 assert.ok(samples>50);
});
