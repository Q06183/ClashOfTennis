import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {initPhysics} from '../src/simulation/physics.js';
import {Match} from '../src/simulation/match.js';
import {driveAI} from '../src/simulation/ai.js';
before(initPhysics);
function rally(){
  const m=new Match();
  m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
  for(let i=0;i<180&&m.state.rally<2;i++){driveAI(m,1);m.step(1/60);}
  assert.equal(m.state.rally,2);return m;
}
function place(m:Match,x:number,y:number,z:number,vx:number,vy:number,vz:number){
  m.physics.place({x,y,z},{x:vx,y:vy,z:vz});Object.assign(m.state.ball,m.physics.read(),{bounces:0});
}
test('a low ball crossing the net physically loses the point',()=>{
  const m=rally();place(m,0,.5,-.1,0,0,20);m.step(1/60);
  assert.equal(m.state.event,'下网');assert.equal(m.state.score[0],1);m.dispose();
});
test('an out first bounce loses the point instead of waiting for a second bounce',()=>{
  const m=rally();place(m,5,.17,6,0,-6,0);for(let i=0;i<3&&m.state.phase==='rally';i++)m.step(1/60);
  assert.equal(m.state.event,'出界');assert.equal(m.state.score[0],1);m.dispose();
});
test('line bounce is judged at contact, not a later frame beyond the sideline',()=>{
  const m=rally();place(m,4.105,.125,5,8,-3,0);m.step(1/60);
  assert.equal(m.state.phase,'rally',`incorrect call: ${m.state.event}`);assert.equal(m.state.ball.bounces,1);m.dispose();
});
test('rally can be volleyed before bounce while serve cannot',()=>{
  const m=rally();place(m,0,1.2,3,0,0,8);
  Object.assign(m.state.players[0],{x:0,z:3,tx:0,tz:3});
  m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
  for(let i=0;i<15;i++)m.step(1/60);
  assert.equal(m.state.ball.hitter,0);assert.equal(m.state.ball.bounces,0);m.dispose();
});
