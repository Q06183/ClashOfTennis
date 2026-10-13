import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {initPhysics} from '../src/simulation/physics.js';
import {DeadBalls,DEAD_BALL_CLEANUP,deadBallOpacity} from '../src/simulation/dead-balls.js';
import {Match} from '../src/simulation/match.js';
import {DeadBallView} from '../src/render/dead-balls.js';
import {SnapshotPlayback} from '../src/network/playback.js';
import type {BallState,DeadBallState} from '../src/simulation/types.js';
import {MeshStandardMaterial,MeshBasicMaterial} from 'three';

before(initPhysics);
const ball=(surface:'hard'|'clay'|'grass'='hard'):BallState=>({
  surface,x:5,y:.18,z:5,vx:4,vy:-6,vz:5,bounces:0,hitter:1,targetX:5,targetZ:5
});
test('all surfaces settle then expire in-place without needing another ball or point',()=>{
  for(const surface of ['hard','clay','grass'] as const){
    const manager=new DeadBalls(),array=manager.states;
    try{
      manager.add(ball(surface));const state=manager.states[0];
      for(let i=0;i<6000&&!state.settled;i++)manager.step(1/120);
      assert.ok(state.settled);assert.ok(state.settledAt!==undefined);
      const position=[state.x,state.y,state.z];
      assert.equal(deadBallOpacity(state),1);
      manager.step(DEAD_BALL_CLEANUP.hold+DEAD_BALL_CLEANUP.fade/2);
      assert.deepEqual([state.x,state.y,state.z],position);
      assert.ok(Math.abs(deadBallOpacity(state)-.5)<1e-8);
      manager.step(DEAD_BALL_CLEANUP.fade/2+.001);
      assert.equal(manager.states,array,'authority array identity must be preserved');
      assert.equal(array.length,0);
      assert.equal((manager as any).bodies.size,0);
    }finally{manager.clear();}
  }
});
test('invalid steps do not advance removal; cleanup of one ball leaves a flying ball untouched',()=>{
  const manager=new DeadBalls();
  try{
    manager.add({...ball(),y:-3});manager.step(1/120);
    const expired=manager.states[0];assert.ok(expired.settled);
    const age=expired.age;
    for(const dt of [0,-1,NaN,Infinity])manager.step(dt);
    assert.equal(expired.age,age);
    manager.add({...ball(),x:0,y:10,vx:1,vy:0,vz:1});
    const moving=manager.states[1];
    for(let i=0;i<146;i++)manager.step(1/120);
    assert.equal(manager.states.length,1);assert.equal(manager.states[0].id,moving.id);
    assert.equal(moving.settled,false);
  }finally{manager.clear();}
});
test('final point keeps ticking until even settled balls are removed then freezes final duration',()=>{
  const match=new Match();
  try{
    match.state.phase='rally';match.state.rally=2;match.state.score=[6,0];
    const b=ball();match.physics.place(b,{x:b.vx,y:b.vy,z:b.vz});
    Object.assign(match.state.ball,b);
    for(let i=0;i<8&&match.state.phase==='rally';i++)match.step(1/120);
    assert.equal(match.state.phase,'over');assert.equal(match.state.deadBalls?.length,1);
    const score=[...match.state.score],event=match.state.eventId,endedAt=match.state.endedAt;
    for(let i=0;i<6000&&match.state.deadBalls!.length;i++)match.step(1/120);
    assert.equal(match.state.deadBalls!.length,0);
    assert.deepEqual(match.state.score,score);assert.equal(match.state.eventId,event);
    assert.equal(match.state.endedAt,endedAt);
    const time=match.state.time;match.step(1);
    assert.equal(match.state.time,time,'empty terminal match need not advance');
  }finally{match.dispose();}
});
test('ball, ground shadow and cast shadow fade together; removal disposes geometry/materials',()=>{
  const view=new DeadBallView(),state:DeadBallState={...ball(),id:1,age:1,wallHits:0,settled:true,settledAt:1};
  try{
    view.update([state],true,0);
    const meshes=(view as any).meshes.get(1),ballMaterial=meshes.ball.material as MeshStandardMaterial;
    const shadowMaterial=meshes.shadow.material as MeshBasicMaterial;
    assert.equal(ballMaterial.opacity,1);assert.equal(shadowMaterial.opacity,.38);
    state.age+=DEAD_BALL_CLEANUP.hold+DEAD_BALL_CLEANUP.fade/2;
    view.update([state],true,1/60);
    assert.ok(Math.abs(ballMaterial.opacity-.5)<1e-8);
    assert.ok(Math.abs(shadowMaterial.opacity-.19)<1e-8);
    const opacity=ballMaterial.opacity;
    view.update([state],true,1);
    assert.equal(ballMaterial.opacity,opacity,'pause cannot advance a local-only fade');
    let disposals=0;
    for(const object of [meshes.ball.geometry,meshes.shadow.geometry,ballMaterial,shadowMaterial])
      object.addEventListener('dispose',()=>disposals++);
    view.update([],true,0);
    assert.equal(view.root.children.length,0);assert.equal(disposals,4);
    assert.equal((view as any).meshes.size,0);
  }finally{view.dispose();}
});
test('terminal network snapshots interpolate fade age, freeze on pause and deliver authoritative deletion',()=>{
  const match=new Match();
  try{
    const a=structuredClone(match.state);a.phase='over';a.time=10;
    a.deadBalls=[{...ball(),id:1,age:2,settledAt:1,settled:true,wallHits:0}];
    const b=structuredClone(a);b.time+=.05;b.deadBalls![0].age+=.05;
    const playback=new SnapshotPlayback();playback.push(a,1000);playback.push(b,1050);
    const before=structuredClone(a),out=playback.sample(1100)!;
    assert.ok(out.deadBalls![0].age>2&&out.deadBalls![0].age<2.05);
    assert.deepEqual(a,before);
    assert.deepEqual(playback.sample(1100,true)!.deadBalls,b.deadBalls);
    const removed=structuredClone(b);removed.time+=.05;removed.deadBalls=[];
    playback.push(removed,1100);
    assert.deepEqual(playback.sample(1200)!.deadBalls,[]);
  }finally{match.dispose();}
});
