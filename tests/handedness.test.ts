import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {getCharacter,handedness} from '../src/simulation/characters.js';
import {canReturnNormally,airInterception} from '../src/simulation/skills.js';
import {reception} from '../src/simulation/reception.js';
import {Athlete} from '../src/render/player.js';
import {strokePose} from '../src/render/strokes.js';
import {side,type Seat,type PlayerState} from '../src/simulation/types.js';
before(initPhysics);
test('all styles mirror actual reach and automatic reception for both seats',()=>{
 for(const seat of [0,1] as Seat[])for(const ids of [['lin','noah'],['adrian','luca']]){
  const m=new Match([ids[0],ids[1]]),p={...m.state.players[seat],characterId:ids[0] as any,x:0,z:10*side(seat),tz:10*side(seat)};
  const left={...p,characterId:ids[1] as any};
  for(const x of [-1,-.6,0,.6,1])for(const y of [.3,1.1,2.2]){
   const b={...m.state.ball,x,y,z:p.z-.3*side(seat),vx:1,vy:-1,vz:3*side(seat),bounces:1};
   const reflected={...b,x:-x,vx:-1};
   assert.equal(canReturnNormally(b,p,seat),canReturnNormally(reflected,left,seat));
   for(const fn of [reception,airInterception]){const r=fn(b,p,seat),l=fn(reflected,left,seat);assert.equal(r.backhand,l.backhand);assert.ok(Math.abs(r.x+l.x)<1e-8);assert.equal(r.z,l.z);}
  }m.dispose();
 }
});
test('left handed strokes hold racket in the left hand and meet actual world ball',()=>{
 for(const id of ['lin','noah','adrian','luca'])for(const seat of [0,1] as Seat[])for(const stroke of ['forehand','backhand','slice-forehand','slice-backhand','volley','lob','smash','serve'] as PlayerState['stroke'][]){
  const m=new Match([id,id]),p=m.state.players[seat],a=new Athlete(seat),sign=side(seat),hand=handedness(p.characterId),over=stroke==='serve'||stroke==='smash',bh=stroke==='backhand'||stroke==='slice-backhand';
  Object.assign(p,{x:0,z:10*sign,stroke,swing:stroke==='serve'?.72:.44,backhand:bh,contact:{x:(over?0:bh?-.6:.65)*sign*hand,y:over?2.65:1.15,z:10*sign-.3*sign}});
  a.update(p,1);a.root.updateMatrixWorld(true);
  const sweet=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
  assert.ok(sweet.distanceTo(new Vector3(p.contact!.x,p.contact!.y,p.contact!.z))<.03,`${id}/${seat}/${stroke}: ${sweet.toArray()}`);
  assert.equal(a.root.scale.x,hand);assert.equal(a.root.position.x,p.x);m.dispose();
 }
});
test('single backhand releases its support hand and extends independently',()=>{
 for(const id of ['adrian','luca']){
  assert.equal(getCharacter(id).backhandStyle,'one-handed');const m=new Match([id,id]);
  const p={...m.state.players[0],stroke:'backhand' as const,swing:.44};
  assert.equal(strokePose(p,new Vector3(.6,1.15,.4)).twoHands,false);
  assert.equal(strokePose({...p,characterId:'lin'},new Vector3(.6,1.15,.4)).twoHands,true);m.dispose();
 }
});
