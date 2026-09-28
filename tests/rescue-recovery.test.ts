import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {RESCUE,rescuePose,moveRescue,canReachRescue} from '../src/simulation/rescue.js';
import {Athlete} from '../src/render/player.js';
import {disposeTree} from '../src/render/dispose.js';
import type {PlayerState} from '../src/simulation/types.js';

before(initPhysics);
const rescued=():PlayerState=>({characterId:'lin',x:1,z:10,tx:1,tz:10,stamina:.8,stroke:'forehand',swing:0,moving:false,
 rescue:{startedAt:0,fromX:0,fromZ:10,toX:1,toZ:10,contact:{x:1.6,y:1.2,z:9.6},hit:true,stroke:'forehand'}});
test('rescue lands, absorbs impact, rises, and only then releases the movement lock',()=>{
 const p=rescued();
 assert.ok(RESCUE.duration>=1.1);
 assert.ok(rescuePose(p,.24).lift>.2);
 const landing=rescuePose(p,.62),rising=rescuePose(p,.88);
 assert.equal(landing.lift,0);
 assert.ok(landing.crouch>.20);
 assert.ok(rising.crouch<landing.crouch&&rising.crouch>0);
 const before={x:p.x,z:p.z};
 assert.equal(moveRescue(p,.9,1/60),true);assert.ok(p.rescue);assert.equal(p.vx,0);assert.equal(p.vz,0);
 assert.deepEqual({x:p.x,z:p.z},before);
 moveRescue(p,RESCUE.duration+.001,1/60);assert.equal(p.rescue,undefined);
});
test('late incoming ball cannot be hit while getting up, even with repeated swipes',()=>{
 const m=new Match(),p=m.state.players[0];
 try{
  m.state.phase='rally';m.state.rally=4;m.step(.08);m.state.time=.7;
  Object.assign(p,rescued());p.rescue!.startedAt=0;
  m.physics.place({x:1.6,y:1.2,z:9.6},{x:0,y:0,z:3});Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:1});
  m.input(0,{type:'move',x:4,z:10});m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
  m.step(1/60);
  assert.equal(m.state.rally,4);assert.equal(p.x,1);assert.equal(p.z,10);assert.ok(p.rescue);
  assert.equal(canReachRescue(m.state.ball,{...p,rescue:{...p.rescue!,hit:false}},0,.7),false,'landing/get-up pose cannot hit');
 }finally{m.dispose();}
});
test('actual hips sink on landing and rise gradually, even if the point finishes during the leap',()=>{
 const m=new Match(),a=new Athlete(0),p=m.state.players[0];
 try{
  Object.assign(p,rescued());m.state.phase='rally';m.state.rally=3;m.state.time=.3;
  const internal=m as unknown as {award:(seat:0|1,reason:string)=>void};
  internal.award(1,'出界');
  assert.ok(p.rescue,'point end must not erase an airborne pose');
  m.step(.32);a.update(p,m.state.time,1/60);
  const low=a.root.getObjectByName('athlete-torso')!.position.y;
  assert.ok(low<-.2,'visible landing crouch');
  m.step(.3);a.update(p,m.state.time,1/60);
  const high=a.root.getObjectByName('athlete-torso')!.position.y;
  assert.ok(high>low&&high<0,'visible get-up');
  m.step(.35);a.update(p,m.state.time,1/60);
  assert.equal(p.rescue,undefined);
  assert.ok(a.root.getObjectByName('foot-0')!.getWorldPosition(new Vector3()).y<.3);
 }finally{m.dispose();disposeTree(a.root);}
});
