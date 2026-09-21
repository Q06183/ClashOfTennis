import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics } from '../src/simulation/physics.js';
import { Match } from '../src/simulation/match.js';
import { driveAI } from '../src/simulation/ai.js';
import type { Shot } from '../src/simulation/types.js';
before(async () => { await initPhysics(); });
const shot: Shot = {type:'shot',aim:0,depth:.6,power:.5,lob:false};
function advance(m: Match, seconds: number) { for(let i=0;i<seconds*60;i++) m.step(1/60); }

test('valid serve bounces and wins a point if human never swipes', () => {
  const m = new Match();
  m.input(0,shot); advance(m,3.8);
  assert.equal(m.state.score[0],1);
  assert.equal(m.state.rally,1);
  m.dispose();
});
test('receiver cannot volley a serve and cannot hit from across court', () => {
  const m = new Match();
  m.input(0,shot); m.input(1,shot); advance(m,.4);
  assert.equal(m.state.ball.hitter,0);
  m.dispose();
});
test('two long serves produce a double fault', () => {
  const m = new Match();
  const bad = {...shot,depth:1,power:1,aim:1.2};
  m.input(0,bad); advance(m,2);
  assert.equal(m.state.fault,1);
  advance(m,2); m.input(0,bad); advance(m,2);
  assert.equal(m.state.score[1],1);
  m.dispose();
});
test('AI uses the same simulation, rallies and finishes a match', () => {
  const m = new Match();
  for(let i=0;i<60*480 && m.state.phase!=='over';i++) {
    driveAI(m,0,'standard'); driveAI(m,1,'standard'); m.step(1/60);
  }
  assert.equal(m.state.phase,'over');
  assert.ok(m.state.maxRally >= 3, `max rally was ${m.state.maxRally}`);
  assert.ok(Math.max(...m.state.score)>=7);
  m.dispose();
});
test('nonfinite and impossible inputs cannot corrupt simulation', () => {
  const m = new Match();
  m.input(0,{type:'move',x:NaN,z:Infinity});
  m.input(0,{...shot,power:NaN});
  advance(m,.1);
  assert.ok(Number.isFinite(m.state.players[0].x));
  assert.equal(m.state.phase,'serve');
  m.dispose();
});
test('serve horizontal aim follows screen direction for both seats and service sides',()=>{
  for(const total of [0,1,2,3]){
    const targets=[];
    for(const aim of [-.4,.4]){
      const m=new Match();m.state.score=[total,0];m.state.phase='point';m.state.pointTimer=0;m.step(1/60);
      const seat=m.state.server;m.input(seat,{...shot,aim});
      for(let i=0;i<60&&m.state.rally===0;i++)m.step(1/60);
      targets.push(m.state.ball.targetX*(seat===0?1:-1));m.dispose();
    }
    assert.ok(targets[1]>targets[0],`reversed screen direction at total ${total}`);
  }
});
