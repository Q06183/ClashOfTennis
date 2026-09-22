import {test} from 'node:test';import assert from 'node:assert/strict';import {Vector3} from 'three';
import {strokePose} from '../src/render/strokes.js';import {strokeBody} from '../src/render/stroke-body.js';
import type {PlayerState} from '../src/simulation/types.js';
for(const characterId of ['lin','adrian','noah','luca'])for(const stroke of ['forehand','backhand','volley','slice-forehand','slice-backhand','lob','smash'] as const){
 test(`${characterId}/${stroke} keeps continuous velocity through pose keys and impact`,()=>{
  const c=new Vector3(stroke.includes('backhand')?.65:-.65,stroke==='smash'?2.5:1.2,.65),contact={x:c.x,y:c.y,z:c.z};
  const at=(t:number)=>{const p:PlayerState={characterId,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,swing:t>=1?.44-(t-1)*.65:0,shotQueued:true,contact,preparation:t<1?{stroke,progress:t,contact}:undefined};return {pose:strokePose(p,c),body:strokeBody(p)};};
  const h=1e-5;
  for(const t of [.26,.32,.48,.5,.52,.55,.68,.74,.78,.8,1,1.2]){
   const a=at(t-h),b=at(t),c=at(t+h);
   const before=b.pose.tip.clone().sub(a.pose.tip).divideScalar(h),after=c.pose.tip.clone().sub(b.pose.tip).divideScalar(h);
   assert.ok(before.distanceTo(after)<.05,`${t}: racket velocity jump ${before.distanceTo(after)}`);
   assert.ok(Math.abs((b.body.hipTurn-a.body.hipTurn)/h-(c.body.hipTurn-b.body.hipTurn)/h)<.05,`${t}: hips jump`);
  }
  assert.ok(at(1-h).pose.tip.distanceTo(at(1+h).pose.tip)>h*.1,'do not stop the racket at impact');
 });
}
