import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {initPhysics,BallPhysics} from '../src/simulation/physics.js';
import {Match} from '../src/simulation/match.js';
import {DeadBalls} from '../src/simulation/dead-balls.js';
import {DeadBallView} from '../src/render/dead-balls.js';
import {SnapshotPlayback} from '../src/network/playback.js';
import {ENCLOSURE} from '../src/simulation/enclosure.js';
import type {BallState} from '../src/simulation/types.js';
import {readFileSync} from 'node:fs';

before(initPhysics);
const ball=(changes:Partial<BallState>={}):BallState=>({
  x:5,y:.18,z:5,vx:4,vy:-6,vz:5,bounces:0,hitter:1,targetX:5,targetZ:5,surface:'hard',...changes
});
function outside(surface:'hard'|'clay'|'grass'='hard',winning=false){
  const m=new Match(['lin','lin'],()=>.5,{surface});
  m.state.phase='rally';m.state.rally=2;
  if(winning)m.state.score=[6,0];
  const b=ball({surface});
  m.physics.place(b,{x:b.vx,y:b.vy,z:b.vz});Object.assign(m.state.ball,b);
  for(let i=0;i<8&&m.state.phase==='rally';i++)m.step(1/120);
  assert.equal(m.state.event,'出界');
  return m;
}
test('out call is immediate but ball continues bouncing and remains after the next serve resets',()=>{
  const m=outside();
  try{
    assert.deepEqual(m.state.score,[1,0]);assert.equal(m.state.phase,'point');
    assert.equal(m.state.deadBalls?.length,1);
    const first={...m.state.deadBalls![0]},event=m.state.eventId;
    m.input(0,{type:'shot',aim:0,depth:.5,power:1,lob:false});
    for(let i=0;i<30;i++)m.step(1/120);
    const b=m.state.deadBalls![0];
    assert.equal(m.state.eventId,event);assert.deepEqual(m.state.score,[1,0]);
    assert.ok(b.y>first.y,'already rebounding ball rises instead of freezing');
    assert.ok(b.x>first.x);assert.ok(b.z>first.z);
    for(let i=0;i<240&&m.state.phase==='point';i++)m.step(1/120);
    assert.equal(m.state.phase,'serve');
    assert.ok(m.state.deadBalls![0].age>1.7);
    assert.notEqual(m.state.deadBalls![0].x,m.state.ball.x,'old ball never teleports into new service');
  }finally{m.dispose();}
});
test('physical perimeter reflects all four walls, loses energy and does not invent a ceiling',()=>{
  for(const [axis,sign] of [['x',-1],['x',1],['z',-1],['z',1]] as const){
    const p=new BallPhysics('hard',{enclosure:true});
    try{
      const edge=axis==='x'?ENCLOSURE.sideX:ENCLOSURE.backZ;
      const point={x:0,y:.8,z:0};point[axis]=sign*(edge-.5);
      const v={x:0,y:0,z:0};v[axis]=sign*12;p.place(point,v);
      for(let i=0;i<40&&p.read()[axis==='x'?'vx':'vz']*sign>0;i++)p.step(1/240);
      const speed=p.read()[axis==='x'?'vx':'vz'];
      assert.ok(speed*sign<0);assert.ok(Math.abs(speed)<12*.8);
    }finally{p.dispose();}
  }
  const p=new BallPhysics('hard',{enclosure:true});
  try{
    p.place({x:12,y:5,z:0},{x:12,y:0,z:0});
    for(let i=0;i<30;i++)p.step(1/240);
    assert.ok(p.read().x>12.8);assert.ok(p.read().vx>0,'above fence can fly out');
  }finally{p.dispose();}
});
test('dead ball flight honors each surface, settles with drag and bounds accumulated worlds',()=>{
  const speeds:number[]=[];
  for(const surface of ['hard','clay','grass'] as const){
    const manager=new DeadBalls();
    try{
      manager.add(ball({surface}));
      for(let i=0;i<10&&manager.states[0].bounces===0;i++)manager.step(1/120);
      assert.equal(manager.states[0].bounces,1);speeds.push(manager.states[0].vy);
      for(let i=0;i<6000&&!manager.states[0].settled;i++)manager.step(1/120);
      assert.ok(manager.states[0].settled);
      for(let i=0;i<10;i++)manager.add(ball());
      assert.equal(manager.states.length,3);
      manager.clear();assert.equal(manager.states.length,0);
    }finally{manager.clear();}
  }
  assert.ok(speeds[1]>speeds[0]);assert.ok(speeds[0]>speeds[2]);
});
test('final out keeps cosmetic physics running without changing winner, final time or score',()=>{
  const m=outside('hard',true);
  try{
    assert.equal(m.state.phase,'over');const final=m.state.endedAt!;
    const score=[...m.state.score],winner=m.state.winner,event=m.state.eventId;
    const start=m.state.deadBalls![0].x;
    for(let i=0;i<300;i++){m.step(1/120);m.input(1,{type:'shot',aim:0,depth:.5,power:.5,lob:false});}
    assert.notEqual(m.state.deadBalls![0].x,start);assert.equal(m.state.endedAt,final);
    assert.equal(m.state.winner,winner);assert.deepEqual(m.state.score,score);assert.equal(m.state.eventId,event);
  }finally{m.dispose();}
});
test('fault does not award a point and checkpoint replay removes cosmetic leftovers',()=>{
  const m=new Match();
  try{
    m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false,directionX:4});
    for(let i=0;i<300&&m.state.phase!=='point';i++)m.step(1/120);
    assert.equal(m.state.fault,1);assert.deepEqual(m.state.score,[0,0]);
    assert.equal(m.state.deadBalls!.length,1);
    m.practiceFeed();assert.equal(m.state.deadBalls!.length,0);
    const restore=m.practiceCheckpoint();
    Object.assign(m.state.ball,ball());m.physics.place(ball(),{x:4,y:-6,z:5});
    for(let i=0;i<10&&m.state.phase==='rally';i++)m.step(1/120);
    assert.equal(m.state.deadBalls!.length,1);
    restore();assert.equal(m.state.deadBalls!.length,0);assert.equal(m.state.phase,'rally');
  }finally{m.dispose();}
});
test('network playback interpolates dead balls across phase reset and freezes without mutating packets',()=>{
  const m=outside(),a=structuredClone(m.state);
  try{
    const b=structuredClone(a);b.time=a.time+.05;b.phase='serve';
    b.deadBalls![0].x+=.4;b.deadBalls![0].age+=.05;
    const original=structuredClone(a),p=new SnapshotPlayback();
    p.push(a,1000);p.push(b,1050);
    const out=p.sample(1100)!;
    assert.ok(out.deadBalls![0].x>a.deadBalls![0].x&&out.deadBalls![0].x<b.deadBalls![0].x);
    assert.deepEqual(a,original);
    assert.deepEqual(p.sample(1300,true)!.deadBalls,b.deadBalls);
    const end=new SnapshotPlayback(),over={...a,phase:'over' as const};
    end.push(over,1000);end.push({...over,time:over.time+.05,deadBalls:b.deadBalls},1050);
    assert.ok(end.sample(1100)!.deadBalls![0].x>a.deadBalls![0].x);
  }finally{m.dispose();}
});
test('dead ball renderer uses synchronized positions and survives result presentation',()=>{
  const view=new DeadBallView(),state={...ball(),id:1,age:1,wallHits:0,settled:false};
  try{
    view.update([state],true,1/60);assert.ok(view.root.visible);
    assert.equal(view.root.children.length,2);
    assert.equal(view.root.children[0].position.x,5);
    const rotation=view.root.children[0].rotation.z;
    view.update([state],true,1/60);assert.equal(view.root.children[0].rotation.z,rotation,'same authoritative age freezes cosmetic spin');
    view.update([{...state,x:7}],true,1/60);assert.equal(view.root.children[0].position.x,7);
    view.update([],true,1/60);assert.equal(view.root.children.length,0);
  }finally{view.dispose();}
});
test('wall-ended live ball cannot be returned and cosmetic motion never consumes authority RNG',()=>{
  let draws=0;
  const m=new Match(['lin','lin'],()=>{draws++;return .5;});
  try{
    m.state.phase='rally';m.state.rally=2;
    const b=ball({x:12.4,y:1,z:5,vx:20,vy:0,vz:0});
    m.physics.place(b,{x:b.vx,y:b.vy,z:b.vz});Object.assign(m.state.ball,b);
    for(let i=0;i<10&&m.state.phase==='rally';i++)m.step(1/120);
    assert.equal(m.state.event,'出界');assert.equal(m.state.phase,'point');
    const count=draws,score=[...m.state.score];
    for(let i=0;i<120;i++)m.step(1/120);
    assert.equal(draws,count);assert.deepEqual(m.state.score,score);
    assert.ok(m.state.deadBalls![0].vx<0);
  }finally{m.dispose();}
});
test('home buttons share a single family with explicit primary and responsive states',()=>{
  const css=readFileSync('src/ui/home-design.css','utf8');
  assert.match(css,/\.home \.menu>button\{/);
  for(const property of ['border-radius:10px','align-items:center','min-height:48px','background:var(--home-button-fill)'])assert.ok(css.includes(property));
  assert.match(css,/match-button/);assert.match(css,/focus-visible/);assert.match(css,/:disabled/);
  assert.match(readFileSync('src/main.ts','utf8'),/home-design.css/);
});
test('a final out preserves a short court-view window rather than instantly hiding the ball for a celebration',()=>{
  const source=readFileSync('src/render/view.ts','utf8');
  assert.match(source,/authoritative\.time-authoritative\.endedAt<1\.8/);
  assert.match(source,/this\.mode==='match'\|\|finishingFlight/);
  assert.match(source,/this\.deadBallView\?\.update\(state\.deadBalls/);
});
