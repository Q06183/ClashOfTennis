import {test} from 'node:test';import assert from 'node:assert/strict';import {Quaternion,Vector3} from 'three';
import {Footwork} from '../src/render/footwork.js';
test('support feet stay planted while the body travels across them',()=>{
 const gait=new Footwork(),q=new Quaternion();let previous=gait.update(new Vector3(),q,1/60),samples=0;
 for(let i=1;i<240;i++){const current=gait.update(new Vector3(0,0,i*3/60),q,1/60);
  for(let j=0;j<2;j++)if(current.planted[j]&&previous.planted[j]){assert.ok(current.feet[j].distanceTo(previous.feet[j])<.005);samples++;}
  previous=current;
 }assert.ok(samples>40);
});
test('foot cadence follows actual travel and settles when the player stops',()=>{
 const gait=new Footwork(),q=new Quaternion();gait.update(new Vector3(),q,1/60);
 for(let i=1;i<=120;i++)gait.update(new Vector3(i*2/60,0,0),q,1/60);
 const a=gait.update(new Vector3(4,0,0),q,1/60);assert.ok(a.phase>2);
 let b=a;for(let i=0;i<120;i++)b=gait.update(new Vector3(4,0,0),q,1/60);
 assert.equal(b.phase,a.phase);assert.ok(b.speed<.01);assert.ok(b.feet.every(f=>Math.abs(f.y-.105)<.001));
});
test('point-reset teleports reset the feet instead of generating a sprint',()=>{
 const gait=new Footwork(),q=new Quaternion();gait.update(new Vector3(),q,1/60);
 const pose=gait.update(new Vector3(5,0,12),q,1/60);assert.equal(pose.phase,0);assert.equal(pose.speed,0);
 assert.ok(pose.feet.every(f=>f.distanceTo(new Vector3(5,0,12))<.3));
});


test('stopping adjusts one foot with lift while the other remains planted',()=>{
 const gait=new Footwork(),q=new Quaternion();let p=new Vector3(),previous=gait.update(p,q,1/60);
 for(let i=1;i<=38;i++){p=new Vector3(i*3/60,0,0);previous=gait.update(p,q,1/60);}
 let airborne=0;
 for(let i=0;i<120;i++){
  const current=gait.update(p,q,1/60);
  for(let j=0;j<2;j++){
   if(current.planted[j]&&previous.planted[j])assert.ok(current.feet[j].distanceTo(previous.feet[j])<.005,'grounded foot slides after stopping');
   if(current.feet[j].y>.13)airborne++;
  }
  assert.ok(current.planted.some(Boolean),'at least one support foot during stopping');previous=current;
 }
 assert.ok(airborne>0);assert.ok(previous.feet.every(f=>Math.abs(f.y-.105)<.001));
});
