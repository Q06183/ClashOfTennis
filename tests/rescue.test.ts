import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {initPhysics} from '../src/simulation/physics.js';
import {Match} from '../src/simulation/match.js';
import {side,type Seat} from '../src/simulation/types.js';
import {rescueChance,RESCUE} from '../src/simulation/rescue.js';
import {effectiveStamina} from '../src/simulation/stamina.js';
import {rescueIncoming} from './helpers/rescue-incoming.js';
before(initPhysics);
const shot={type:'shot' as const,aim:.25,depth:.6,power:1,lob:false,critical:true};
function incoming(random:()=>number,seat:Seat=0){
 const m=new Match(['lin','lin'],random),s=m.state,sign=side(seat),p=s.players[seat];
 s.phase='rally';s.rally=2;
 Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,vx:0,vz:0,preparation:undefined});
 m.input(seat,{type:'move',x:0,z:10*sign});
 rescueIncoming(m,seat);
 return m;
}
test('a successful rescue physically jumps into reach on either side and returns a slower scattered ball',()=>{
 for(const seat of [0,1] as Seat[]){
  let draws=0;const m=incoming(()=>[0,1,1][draws++]??1,seat);m.input(seat,shot);
  const p=m.state.players[seat];let sawMotion=false;
  for(let i=0;i<40&&m.state.ball.hitter!==seat;i++){const oldX=p.x,oldZ=p.z;m.step(1/60);sawMotion||=!!p.rescue;assert.ok(Math.hypot(p.x-oldX,p.z-oldZ)<.5,'no teleport');}
  assert.ok(sawMotion,'jump must begin');assert.equal(m.state.ball.hitter,seat);assert.equal(m.state.ball.rescue,true);assert.equal(m.state.ball.critical,true);assert.equal(m.state.event,'极限救球');
  assert.ok(Math.hypot(m.state.ball.vx,m.state.ball.vz)<22,'rescue slowdown still applies');assert.ok(Math.abs(m.state.ball.targetX-.25*4.45*side(seat))>1,'scatter changes real target');assert.equal(draws,3);
  assert.ok(p.stamina<.91);for(let i=0;i<Math.ceil((RESCUE.duration+.1)*60);i++)m.step(1/60);assert.equal(p.rescue,undefined);m.dispose();
 }
});
test('failed rescue rolls only once per incoming ball despite repeated swipes',()=>{
 let draws=0;const m=incoming(()=>{draws++;return .99;});
 for(let i=0;i<35;i++){m.input(0,shot);m.step(1/60);}
 assert.equal(draws,1);assert.equal(m.state.ball.hitter,1);assert.equal(m.state.players[0].rescue,undefined);m.dispose();
});
test('distant ball and second-bounce loss cannot invoke rescue',()=>{
 for(const mode of ['distant','second-bounce']){
  let draws=0;const m=incoming(()=>{draws++;return 0;});
  if(mode==='distant'){m.physics.place({x:6,y:1,z:8.4},{x:0,y:.5,z:10});Object.assign(m.state.ball,m.physics.read());}
  if(mode==='second-bounce'){m.physics.place({x:2.1,y:.13,z:10},{x:0,y:-3,z:10});Object.assign(m.state.ball,m.physics.read());}
  m.input(0,shot);
  for(let i=0;i<15;i++)m.step(1/60);
  assert.equal(draws,0,mode);assert.notEqual(m.state.ball.rescue,true);m.dispose();
 }
});

import {Athlete} from '../src/render/player.js';
import {Vector3} from 'three';
test('rescue animation lifts both feet, meets the ball and returns to ground',()=>{
 const m=incoming(()=>0);m.input(0,shot);let maxLift=0;const athlete=new Athlete(0);
 for(let i=0;i<60&&m.state.ball.hitter!==0;i++){
  m.step(1/60);athlete.update(m.state.players[0],m.state.time,1/60);maxLift=Math.max(maxLift,athlete.root.position.y);
 }
 assert.ok(maxLift>.08,'visible leap');
 const contact=m.state.players[0].contact!;athlete.root.updateMatrixWorld(true);
 const sweet=athlete.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
 assert.ok(sweet.distanceTo(new Vector3(contact.x,contact.y,contact.z))<.09,'racket physically meets rescue contact');
 for(let i=0;i<Math.ceil((RESCUE.duration+.1)*60);i++){m.step(1/60);athlete.update(m.state.players[0],m.state.time,1/60);}
 assert.equal(athlete.root.position.y,0);m.dispose();
});

test('serve return cannot rescue before its legal first bounce',()=>{
 let draws=0;const m=new Match(['lin','lin'],()=>{draws++;return 0;});m.input(0,shot);
 for(let i=0;i<90&&m.state.phase==='serve';i++)m.step(1/60);
 const p=m.state.players[1];Object.assign(p,{x:0,z:-10,tx:0,tz:-10,vx:0,vz:0});
 m.input(1,{type:'move',x:0,z:-10});m.physics.place({x:-2.1,y:1,z:-7.8},{x:0,y:.5,z:-10});Object.assign(m.state.ball,m.physics.read(),{bounces:0});
 m.input(1,shot);for(let i=0;i<12;i++)m.step(1/60);
 assert.equal(draws,0);assert.equal(p.rescue,undefined);assert.equal(m.state.ball.hitter,0);m.dispose();
});
test('rescue rolls against pre-jump stamina and ordinary reachable returns never roll',()=>{
 for(const stamina of [1,.8,2/3,.5,1/3,.1])for(const succeeds of [false,true]){
  let m:Match,draws=0,chance=0,atRoll=0;
  m=incoming(()=>{
   if(draws++===0){atRoll=m.state.players[0].totalStamina!;chance=rescueChance(atRoll);return succeeds?chance-1e-7:chance;}
   return .5;
  });
  m.state.players[0].stamina=stamina;m.state.players[0].totalStamina=stamina;m.input(0,shot);
  for(let i=0;i<60&&m.state.rally===2;i++)m.step(1/60);
  assert.ok(draws>0,`eligible stamina ${stamina}`);
  assert.equal(!!m.state.ball.rescue,succeeds,`stamina ${stamina}, chance ${chance}`);
  assert.ok(atRoll>stamina-.01,'chance sampled before the .1 takeoff cost');
  assert.equal(draws,succeeds?3:1);m.dispose();
 }
 let draws=0;const m=new Match(['lin','lin'],()=>{draws++;return 0;});m.state.phase='rally';m.state.rally=2;m.step(.08);
 Object.assign(m.state.players[0],{x:1.5,tx:1.5,z:10,tz:10});
 m.physics.place({x:2.1,y:1.2,z:9.6},{x:0,y:0,z:4});Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:1});
 m.input(0,shot);
 for(let i=0;i<60&&m.state.ball.hitter!==0;i++)m.step(1/60);
 assert.equal(m.state.ball.hitter,0);assert.equal(draws,0);assert.equal(m.state.ball.rescue,false);m.dispose();
});
test('scattered rescue may land out and next point clears its ball and player flags',()=>{
 let n=0;const m=incoming(()=>[0,1,1][n++]??1);m.input(0,{...shot,aim:1.1});
 for(let i=0;i<60&&m.state.ball.hitter!==0;i++)m.step(1/60);
 assert.ok(m.state.ball.targetX>4.115);assert.equal(m.state.ball.rescue,true);
 for(let i=0;i<400&&m.state.phase==='rally';i++)m.step(1/60);
 assert.equal(m.state.event,'出界');assert.deepEqual(m.state.score,[0,1]);
 for(let i=0;i<120&&m.state.phase==='point';i++)m.step(1/60);
 assert.equal(m.state.ball.rescue,false);assert.equal(m.state.players[0].rescue,undefined);m.dispose();
});

test('a future normal window suppresses a currently feasible jump without drawing RNG',()=>{
 for(const seat of [0,1] as Seat[])for(const sample of [{x:.9,y:1,vy:0,vz:10},{x:1.2,y:1.5,vy:0,vz:5}]){
  const sign=side(seat);let draws=0;const m=incoming(()=>{draws++;return 0;},seat);
  m.physics.place({x:sample.x*sign,y:sample.y,z:8*sign},{x:0,y:sample.vy,z:sample.vz*sign});Object.assign(m.state.ball,m.physics.read());
  m.input(seat,shot);let jumped=false;
  for(let i=0;i<60&&m.state.phase==='rally'&&m.state.ball.hitter!==seat;i++){m.step(1/60);jumped||=!!m.state.players[seat].rescue;}
  assert.equal(m.state.ball.hitter,seat,'return succeeds');assert.equal(jumped,false,'normal return takes priority');assert.equal(draws,0);assert.equal(m.state.ball.rescue,false);m.dispose();
 }
});

test('upcoming running and volley windows avoid the rescue lottery on both sides',()=>{
 for(const seat of [0,1] as Seat[])for(const kind of ['running','volley']){
  const sign=side(seat),z=(kind==='volley'?3:10)*sign;let draws=0;
  const m=incoming(()=>{draws++;return 0;},seat),p=m.state.players[seat];Object.assign(p,{x:0,z,tx:0,tz:z});
  m.input(seat,{type:'move',x:kind==='running'?1.5*sign:0,z});
  m.physics.place({x:(kind==='running'?1.8:.9)*sign,y:kind==='running'?1.5:1,z:z-2*sign},{x:0,y:0,z:(kind==='running'?5:10)*sign});
  Object.assign(m.state.ball,m.physics.read(),{bounces:kind==='volley'?0:1});m.input(seat,shot);
  for(let i=0;i<90&&m.state.phase==='rally'&&m.state.ball.hitter!==seat;i++)m.step(1/60);
  assert.equal(m.state.ball.hitter,seat,kind);assert.equal(m.state.ball.rescue,false,kind);assert.equal(draws,0,kind);m.dispose();
 }
});

test('automatic positioning forecasts the new ball position before moving, just like a real tick',()=>{
 for(const seat of [0,1] as Seat[]){
  const sign=side(seat);let draws=0;const m=new Match(['lin','lin'],()=>{draws++;return 0;});m.state.phase='rally';m.state.rally=2;
  Object.assign(m.state.players[seat],{x:1.6880609533*sign,z:9.1569666094*sign,tx:-.6138001657*sign,tz:9.1569666094*sign,vx:0,vz:0});
  m.physics.place({x:1.0594274453*sign,y:2.0692738906,z:1.0028849477*sign},{x:-.7330817170*sign,y:2.0434809271,z:8.2048775163*sign});
  Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});m.input(seat,shot);
  for(let i=0;i<70&&m.state.phase==='rally'&&m.state.ball.hitter!==seat;i++)m.step(1/60);
  assert.equal(m.state.ball.hitter,seat);assert.equal(m.state.ball.rescue,false);assert.equal(draws,0);m.dispose();
 }
});
