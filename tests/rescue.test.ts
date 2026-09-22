import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {initPhysics} from '../src/simulation/physics.js';
import {Match} from '../src/simulation/match.js';
import {side,type Seat} from '../src/simulation/types.js';
before(initPhysics);
const shot={type:'shot' as const,aim:.25,depth:.6,power:1,lob:false,critical:true};
function incoming(random:()=>number,seat:Seat=0){
 const m=new Match(['lin','lin'],random),s=m.state,sign=side(seat),p=s.players[seat];
 s.phase='rally';s.rally=2;
 Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,vx:0,vz:0,preparation:undefined});
 m.input(seat,{type:'move',x:0,z:10*sign});
 m.physics.place({x:2.1*sign,y:1,z:7.8*sign},{x:0,y:.5,z:10*sign});
 Object.assign(s.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
 return m;
}
test('a successful rescue physically jumps into reach on either side and returns a slower scattered ball',()=>{
 for(const seat of [0,1] as Seat[]){
  let draws=0;const m=incoming(()=>[0,1,1][draws++]??1,seat);m.input(seat,shot);
  const p=m.state.players[seat];let sawMotion=false;
  for(let i=0;i<40&&m.state.ball.hitter!==seat;i++){const oldX=p.x,oldZ=p.z;m.step(1/60);sawMotion||=!!p.rescue;assert.ok(Math.hypot(p.x-oldX,p.z-oldZ)<.5,'no teleport');}
  assert.ok(sawMotion,'jump must begin');assert.equal(m.state.ball.hitter,seat);assert.equal(m.state.ball.rescue,true);assert.equal(m.state.ball.critical,false);assert.equal(m.state.event,'极限救球');
  assert.ok(Math.hypot(m.state.ball.vx,m.state.ball.vz)<14,'weak return');assert.ok(Math.abs(m.state.ball.targetX-.25*4.45*side(seat))>1,'scatter changes real target');assert.equal(draws,3);
  assert.ok(p.stamina<.91);for(let i=0;i<45;i++)m.step(1/60);assert.equal(p.rescue,undefined);m.dispose();
 }
});
test('failed rescue rolls only once per incoming ball despite repeated swipes',()=>{
 let draws=0;const m=incoming(()=>{draws++;return .99;});
 for(let i=0;i<35;i++){m.input(0,shot);m.step(1/60);}
 assert.equal(draws,1);assert.equal(m.state.ball.hitter,1);assert.equal(m.state.players[0].rescue,undefined);m.dispose();
});
test('no swipe, distant ball and second-bounce loss cannot invoke rescue',()=>{
 for(const mode of ['no-input','distant','second-bounce']){
  let draws=0;const m=incoming(()=>{draws++;return 0;});
  if(mode==='distant'){m.physics.place({x:6,y:1,z:8.4},{x:0,y:.5,z:10});Object.assign(m.state.ball,m.physics.read());}
  if(mode==='second-bounce'){m.physics.place({x:2.1,y:.13,z:10},{x:0,y:-3,z:10});Object.assign(m.state.ball,m.physics.read());}
  if(mode!=='no-input')m.input(0,shot);
  for(let i=0;i<15;i++)m.step(1/60);
  assert.equal(draws,0,mode);assert.notEqual(m.state.ball.rescue,true);m.dispose();
 }
});

import {Athlete} from '../src/render/player.js';
import {Vector3} from 'three';
test('rescue animation lifts both feet, meets the ball and returns to ground',()=>{
 const m=incoming(()=>0);m.input(0,shot);let maxLift=0;const athlete=new Athlete(0);
 for(let i=0;i<30&&m.state.ball.hitter!==0;i++){
  m.step(1/60);athlete.update(m.state.players[0],m.state.time,1/60);maxLift=Math.max(maxLift,athlete.root.position.y);
 }
 assert.ok(maxLift>.08,'visible leap');
 const contact=m.state.players[0].contact!;athlete.root.updateMatrixWorld(true);
 const sweet=athlete.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
 assert.ok(sweet.distanceTo(new Vector3(contact.x,contact.y,contact.z))<.09,'racket physically meets rescue contact');
 for(let i=0;i<50;i++){m.step(1/60);athlete.update(m.state.players[0],m.state.time,1/60);}
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
test('rescue chance boundary is 35 percent and ordinary reachable returns never roll',()=>{
 for(const [value,expected] of [[.3499,true],[.35,false]] as const){
  const m=incoming(()=>value);m.input(0,shot);for(let i=0;i<20;i++)m.step(1/60);assert.equal(!!m.state.ball.rescue,expected);m.dispose();
 }
 let draws=0;const m=incoming(()=>{draws++;return 0;});Object.assign(m.state.players[0],{x:1.5,tx:1.5});m.input(0,shot);
 for(let i=0;i<30&&m.state.ball.hitter!==0;i++)m.step(1/60);
 assert.equal(m.state.ball.hitter,0);assert.equal(draws,0);assert.equal(m.state.ball.rescue,false);m.dispose();
});
test('scattered rescue may land out and next point clears its ball and player flags',()=>{
 let n=0;const m=incoming(()=>[0,1,1][n++]??1);m.input(0,{...shot,aim:1.1});
 for(let i=0;i<30&&m.state.ball.hitter!==0;i++)m.step(1/60);
 assert.ok(m.state.ball.targetX>4.115);assert.equal(m.state.ball.rescue,true);
 for(let i=0;i<400&&m.state.phase==='rally';i++)m.step(1/60);
 assert.equal(m.state.event,'出界');assert.deepEqual(m.state.score,[0,1]);
 for(let i=0;i<120&&m.state.phase==='point';i++)m.step(1/60);
 assert.equal(m.state.ball.rescue,false);assert.equal(m.state.players[0].rescue,undefined);m.dispose();
});
