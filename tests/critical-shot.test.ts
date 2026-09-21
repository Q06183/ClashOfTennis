import {test,before} from 'node:test';import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';import {initPhysics} from '../src/simulation/physics.js';import {predictFlight} from '../src/simulation/trajectory.js';import type {Shot} from '../src/simulation/types.js';
before(initPhysics);
function launch(critical:boolean,total=0,extra:Partial<Shot>={}){
 const m=new Match();m.state.score=[total,0];m.state.phase='point';m.state.pointTimer=0;m.step(1/60);
 m.input(m.state.server,{type:'shot',aim:0,depth:.55,power:1,lob:false,critical,...extra});
 for(let i=0;i<60&&m.state.rally===0;i++)m.step(1/60);
 const result=structuredClone(m.state);m.dispose();return result;
}
test('critical shot is faster than maximum-power strong shot and goes deeper at both ends',()=>{
 for(const total of [0,1]){
  const normal=launch(false,total),critical=launch(true,total),speed=(s:typeof normal)=>Math.hypot(s.ball.vx,s.ball.vz);
  assert.ok(speed(critical)>speed(normal)*1.08);assert.ok(speed(critical)<speed(normal)*1.2);
  assert.equal(critical.ball.targetX,normal.ball.targetX);assert.ok(Math.abs(critical.ball.targetZ)>Math.abs(normal.ball.targetZ));
  assert.equal(critical.ball.critical,true);assert.match(critical.event,/暴击/);assert.equal(predictFlight(critical.ball).hitNet,false);
 }
});
test('critical flag does not boost lobs or low-power shots and clears for the next point',()=>{
 for(const extra of [{power:.5},{lob:true}]){
  const a=launch(false,0,extra),b=launch(true,0,extra);assert.equal(!!b.ball.critical,false);assert.equal(b.ball.vz,a.ball.vz);
 }
 const m=new Match();m.input(0,{type:'shot',aim:0,depth:.5,power:1,lob:false,critical:true});
 for(let i=0;i<60&&m.state.rally===0;i++)m.step(1/60);
 assert.equal(m.state.ball.critical,true);m.state.phase='point';m.state.pointTimer=0;m.step(1/60);assert.equal(m.state.ball.critical,false);m.dispose();
});
test('critical rally return beats the strongest ordinary return and ordinary reply clears the effect',()=>{
 const returns=[];
 for(const critical of [false,true]){
  const m=new Match();m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
  for(let i=0;i<60&&m.state.rally===0;i++)m.step(1/60);
  m.input(1,{type:'shot',aim:0,depth:.6,power:1,lob:false,critical});
  for(let i=0;i<220&&m.state.phase==='rally'&&m.state.rally<2;i++)m.step(1/60);
  assert.equal(m.state.rally,2);returns.push(structuredClone(m.state.ball));
  m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
  for(let i=0;i<220&&m.state.phase==='rally'&&m.state.rally<3;i++)m.step(1/60);
  assert.equal(m.state.rally,3);assert.equal(m.state.ball.critical,false);m.dispose();
 }
 assert.ok(Math.hypot(returns[1].vx,returns[1].vz)>Math.hypot(returns[0].vx,returns[0].vz)*1.08);
 assert.equal(returns[0].targetX,returns[1].targetX);assert.ok(Math.abs(returns[1].targetZ)>Math.abs(returns[0].targetZ));
});
test('malformed critical flags cannot launch a serve',()=>{
 for(const critical of ['true',1,{},null]){
  const m=new Match();m.input(0,{type:'shot',aim:0,depth:.5,power:1,lob:false,critical} as unknown as Shot);
  for(let i=0;i<60;i++)m.step(1/60);assert.equal(m.state.rally,0);assert.equal(m.state.players[0].preparation,undefined);m.dispose();
 }
});
