import {before,test} from 'node:test';import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';import {initPhysics} from '../src/simulation/physics.js';import {interpretGesture} from '../src/input/gesture.js';import {predictFlight} from '../src/simulation/trajectory.js';import {side,type Seat} from '../src/simulation/types.js';
before(initPhysics);
const shot={type:'shot' as const,aim:0,depth:.65,power:.75,lob:false};
function incoming(seat:Seat,x:number,y:number,z:number,vy=0){
 const m=new Match(['lin','lin'],()=>1),sign=side(seat);m.state.phase='rally';m.state.rally=2;
 Object.assign(m.state.players[seat],{x:0,z:z*sign,tx:0,tz:z*sign,vx:0,vz:0});m.input(seat,{type:'move',x:0,z:z*sign});
 m.physics.place({x:x*sign,y,z:(z-.25)*sign},{x:0,y:vy,z:4*sign});Object.assign(m.state.ball,m.physics.read(),{bounces:0,hitter:seat===0?1:0});return m;
}
test('holding charges topspin instead of accidentally turning a swipe into a lob',()=>{
 const gesture={dx:30,dy:-180,duration:1100,hold:850,width:390,height:844};const s=interpretGesture(gesture)!;
 assert.equal(s.lob,false);assert.ok((s.topspin??0)>.8);assert.equal(interpretGesture({...gesture,hold:0,duration:250})!.topspin,0);
});
test('a descending reachable high ball becomes a smash at both ends',()=>{
 for(const seat of [0,1] as Seat[]){const m=incoming(seat,.25,2.55,3,-.5);m.input(seat,shot);
  for(let i=0;i<15&&m.state.rally===2;i++)m.step(1/60);
  assert.equal(m.state.rally,3);assert.equal(m.state.players[seat].stroke,'smash');assert.equal(m.state.ball.skill,'smash');assert.equal(m.state.ball.tier,'smash');assert.ok(m.state.ball.vy<0);assert.ok(Math.hypot(m.state.ball.vx,m.state.ball.vz)>20);assert.equal(predictFlight(m.state.ball).hitNet,false);m.dispose();
 }
});
test('one-handed backhand volley can reach a ball outside a two-hand groundstroke grip',()=>{
 for(const seat of [0,1] as Seat[]){const m=incoming(seat,-.68,1.4,3);m.input(seat,shot);for(let i=0;i<6&&m.state.rally===2;i++)m.step(1/60);
  assert.equal(m.state.rally,3);assert.equal(m.state.players[seat].stroke,'volley');assert.equal(m.state.ball.skill,'volley');m.dispose();
 }
});
test('a player just behind the old six-metre threshold can legally volley',()=>{
 const m=incoming(0,.5,1.4,6.6);m.input(0,shot);for(let i=0;i<12&&m.state.rally===2;i++)m.step(1/60);
 assert.equal(m.state.rally,3);assert.equal(m.state.players[0].stroke,'volley');m.dispose();
});
import {Athlete} from '../src/render/player.js';import {Vector3} from 'three';
test('smash uses an overhead contact pose with racket on the actual ball at both ends',()=>{
 for(const seat of [0,1] as Seat[]){const m=incoming(seat,.25,2.55,3,-.5);m.input(seat,shot);const a=new Athlete(seat);
  for(let i=0;i<15&&m.state.rally===2;i++){m.step(1/60);a.update(m.state.players[seat],m.state.time,1/60);}
  assert.equal(m.state.players[seat].stroke,'smash');a.root.updateMatrixWorld(true);const c=m.state.players[seat].contact!;
  const tip=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());assert.ok(tip.distanceTo(new Vector3(c.x,c.y,c.z))<.09,`smash contact ${tip.distanceTo(new Vector3(c.x,c.y,c.z))}`);m.dispose();
 }
});
function spinServe(topspin:number){const m=new Match(['lin','lin'],()=>1);m.input(0,{...shot,power:.55,depth:.5,topspin});for(let i=0;i<60&&m.state.phase==='serve';i++)m.step(1/60);return m;}
test('topspin visibly bends more and actual landing follows its preview, then kicks forward on bounce',()=>{
 const flat=spinServe(0),spin=spinServe(1),f=predictFlight(flat.state.ball),t=predictFlight(spin.state.ball);
 assert.equal(spin.state.ball.tier,'topspin');assert.ok(t.points[20].y>f.points[20].y+.2);assert.ok(Math.abs(t.landing.x-spin.state.ball.targetX)<.001);assert.ok(Math.abs(t.landing.z-spin.state.ball.targetZ)<.001);
 let previous={...spin.state.ball};for(let i=0;i<180&&spin.state.ball.bounces===0;i++){previous={...spin.state.ball};spin.step(1/60);}
 assert.equal(spin.state.ball.bounces,1);assert.equal(spin.state.phase,'rally');assert.ok(Math.hypot(spin.state.ball.x-t.landing.x,spin.state.ball.z-t.landing.z)<.45);
 assert.ok(Math.hypot(spin.state.ball.vx,spin.state.ball.vz)>Math.hypot(previous.vx,previous.vz)*1.10);assert.equal(spin.state.ball.topspin,.55);flat.dispose();spin.dispose();
});
test('spin input is bounded and cannot turn illegal values into serves',()=>{
 for(const value of [NaN,Infinity,'1',null]){const m=new Match();m.input(0,{...shot,topspin:value} as any);m.step(.1);assert.equal(m.state.players[0].preparation,undefined);m.dispose();}
 const m=spinServe(50);assert.equal(m.state.ball.topspin,1);m.state.phase='point';m.state.pointTimer=0;m.step(1/60);assert.equal(m.state.ball.topspin,0);assert.equal(m.state.ball.skill,undefined);m.dispose();
});
test('receiving a serve still requires a bounce even for a high ball near the net',()=>{
 const m=spinServe(0);Object.assign(m.state.players[1],{x:0,z:-3,tx:0,tz:-3});m.physics.place({x:-.25,y:2.55,z:-2.75},{x:0,y:-.5,z:-4});Object.assign(m.state.ball,m.physics.read(),{bounces:0});m.input(1,shot);for(let i=0;i<10;i++)m.step(1/60);assert.equal(m.state.ball.hitter,0);assert.notEqual(m.state.players[1].stroke,'smash');m.dispose();
});
import {strokePose} from '../src/render/strokes.js';
test('smash raises the racket overhead then follows down without a service toss',()=>{
 const contact={x:.25,y:2.45,z:.1},base={x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'smash' as const,swing:0,shotQueued:true,contact};
 const ready=strokePose({...base,preparation:{stroke:'smash',progress:.32,contact}},new Vector3(.25,2.45,.1));assert.ok(ready.tip.y>1.85);assert.equal(ready.toss,0);
 const follow=strokePose({...base,swing:.15},new Vector3(.25,2.45,.1));assert.ok(follow.tip.y<1.6);assert.equal(follow.twoHands,false);
});

import {canVolley} from '../src/simulation/skills.js';import {canReachContact} from '../src/simulation/athlete.js';
test('one-hand volley removes the second-hand limit while keeping racket reach bounded',()=>{
 const m=incoming(0,-.1,1.3,3);const p=m.state.players[0],b={...m.state.ball,x:-.1,y:1.3,z:p.z-.96};
 assert.equal(canReachContact(.1,1.3,.96,true),false);assert.equal(canVolley(b,p,0),true);assert.equal(canVolley({...b,x:-3},p,0),false);m.dispose();
});

test('an airborne rescue remains a weak rescue rather than displaying the volley skill',()=>{
 const m=new Match(['lin','lin'],()=>0);m.state.phase='rally';m.state.rally=2;Object.assign(m.state.players[0],{x:0,z:10,tx:0,tz:10});m.input(0,{type:'move',x:0,z:10});m.physics.place({x:2.1,y:1,z:7.8},{x:0,y:.5,z:10});Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:0});m.input(0,shot);
 for(let i=0;i<60&&m.state.rally===2;i++)m.step(1/60);assert.equal(m.state.ball.rescue,true);assert.equal(m.state.ball.skill,undefined);assert.equal(m.state.event,'极限救球');m.dispose();
});
