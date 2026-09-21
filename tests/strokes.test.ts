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
 const right=(a as any).racket.getWorldPosition(new Vector3()),left=(a as any).leftHand.getWorldPosition(new Vector3());
 assert.ok(left.distanceTo(right)<.16);assert.ok(left.distanceTo(right)>.08);
});
