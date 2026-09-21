import {test} from 'node:test';import assert from 'node:assert/strict';import {Vector3} from 'three';
import {strokePose} from '../src/render/strokes.js';import {Athlete} from '../src/render/player.js';import type {PlayerState} from '../src/simulation/types.js';
const base:PlayerState={x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'forehand',swing:0,shotQueued:true};
test('groundstrokes prepare behind the body and finish across the opposite shoulder',()=>{
 for(const stroke of ['forehand','backhand'] as const){const sign=stroke==='forehand'?-1:1,c=new Vector3(sign*.8,1.1,.65);
 const back=strokePose({...base,preparation:{stroke,progress:.52,contact:{x:c.x,y:c.y,z:c.z}}},c);
 const finish=strokePose({...base,stroke,swing:.132},c);
 assert.ok(back.tip.z<0);assert.ok(back.turn*sign>.6);assert.ok(finish.tip.x*sign<0);assert.ok(finish.tip.y>1.7);assert.equal(finish.twoHands,stroke==='backhand');}
});
test('volley has short preparation and follow-through while serve has a racket drop',()=>{
 const c=new Vector3(-.6,1.4,.65),volley=strokePose({...base,stroke:'volley',swing:.132},c);
 assert.ok(volley.tip.distanceTo(c)<.35);
 const serve=strokePose({...base,preparation:{stroke:'serve',progress:.64,contact:{x:0,y:2.65,z:.25}}},new Vector3(0,2.65,.25));
 assert.ok(serve.shaft.y<-.9);assert.ok(serve.tip.z<-.5);assert.ok(serve.toss>.9);
});
test('backhand uses both hands on the handle and the strings face forward at contact',()=>{
 const a=new Athlete(1);a.update({...base,stroke:'backhand',swing:.44,contact:{x:.7,y:1.1,z:.65}},1);a.root.updateMatrixWorld(true);
 const sweet=a.root.getObjectByName('racket-sweet-spot')!,racket=sweet.parent!;
 const z=new Vector3(0,0,1).transformDirection(racket.matrixWorld);assert.ok(z.z>.8);
 const right=racket.getWorldPosition(new Vector3()),left=a.root.getObjectByName('left-hand-grip')!.getWorldPosition(new Vector3());
 assert.ok(left.distanceTo(right)<.16);assert.ok(left.distanceTo(right)>.08);
});
test('racket shaft stays outside the torso through both groundstroke preparation paths',()=>{
 for(const stroke of ['forehand','backhand'] as const)for(const z of [-.5,.65]){const a=new Athlete(1),contact={x:(stroke==='forehand'?-1:1)*(z<0?.65:.8),y:1.1,z};
  for(let i=0;i<=40;i++){
   a.update({...base,preparation:{stroke,progress:i/40,contact}},i/60);
   const racket=a.root.getObjectByName('racket-grip')!,torso=a.root.getObjectByName('athlete-torso')!;
   for(let j=1;j<=12;j++){
    const v=torso.worldToLocal(racket.localToWorld(new Vector3(0,-j*.069,0)));
    const outside=(v.x/.29)**2+((v.y-1.2)/.36)**2+(v.z/.2)**2;
    assert.ok(outside>1,`${stroke} ${i}/40: shaft intersected torso`);
   }
  }
 }
});
test('chasing a contact behind the body keeps the racket in front until the player gets set',()=>{
 for(const stroke of ['forehand','backhand'] as const)for(const progress of [.35,.6,.85,1]){
  const contact=new Vector3(stroke==='forehand'?-1.6:1.6,1.1,-1.6);
  const pose=strokePose({...base,moving:true,preparation:{stroke,progress,contact:{x:contact.x,y:contact.y,z:contact.z}}},contact);
  assert.ok(pose.tip.z>.45,`${stroke} ${progress}: racket went behind the torso`);
  assert.ok(Math.abs(pose.turn)<.2,'running back must not force a full hitting turn');assert.equal(pose.twoHands,true);
 }
});
test('a reachable late contact stays continuous from preparation into impact',()=>{
 for(const stroke of ['forehand','backhand'] as const){
  const contact=new Vector3(stroke==='forehand'?-.65:.65,1.1,-.5);
  const p={...base,moving:true,stroke};
  const impact=strokePose({...p,swing:.44},contact);
  const before=strokePose({...p,preparation:{stroke,progress:1,contact:{x:contact.x,y:contact.y,z:contact.z}}},contact);
  assert.ok(before.tip.distanceTo(impact.tip)<.01,'reachable late ball must not snap from ready to behind the body');
 }
});
