import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {CHARACTERS} from '../src/simulation/characters.js';
import {beginPointStamina,spendStamina,recoverPointStamina,settlePointStamina,effectiveStamina,pointRecoveryRate} from '../src/simulation/stamina.js';
import type {PlayerState} from '../src/simulation/types.js';
import {movePlayer} from '../src/simulation/movement.js';
import {rescueChance} from '../src/simulation/rescue.js';

before(initPhysics);
const player=(id='lin'):PlayerState=>({characterId:id,x:0,z:10,tx:0,tz:10,stamina:1,totalStamina:1,stroke:'forehand',swing:0,moving:false});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('point drain is charged at 20% to match stamina, with at most 20% charged in one point',()=>{
 const p=player();beginPointStamina(p);
 spendStamina(p,.25);near(p.stamina,.75);near(p.totalStamina!,.95);
 spendStamina(p,.75);near(p.stamina,0);near(p.totalStamina!,.8);
 spendStamina(p,50);near(p.stamina,0);near(p.totalStamina!,.8);
 recoverPointStamina(p,1);near(p.stamina,1);near(p.totalStamina!,.8);
 spendStamina(p,1);near(p.stamina,0);near(p.totalStamina!,.8);
 near(p.pointStaminaSpent!,1);near(p.pointStaminaCost!,.2);
});
test('end-of-point recovery is character dependent, capped at 90% of actual match stamina lost and paid only once',()=>{
 for(const c of CHARACTERS){
  const p=player(c.id);beginPointStamina(p);spendStamina(p,.5);
  const cost=1-p.totalStamina!,rate=pointRecoveryRate(c.id),before=p.totalStamina!;
  assert.ok(rate>=0&&rate<=.9);
  settlePointStamina(p);near(p.totalStamina!,before+cost*rate);
  assert.ok(p.totalStamina!<=1-cost*.1+1e-10);
  const once=p.totalStamina!;settlePointStamina(p);near(p.totalStamina!,once);
 }
 near(pointRecoveryRate('lin'),.6);near(pointRecoveryRate('mei'),.792);near(pointRecoveryRate('wuming'),.9);
 assert.ok(pointRecoveryRate('leo')<pointRecoveryRate('lin'));
});
test('new points reset only the point bar; no-spend points and empty match bars cannot manufacture refunds',()=>{
 const p=player();beginPointStamina(p);spendStamina(p,1);settlePointStamina(p);near(p.totalStamina!,.92);
 beginPointStamina(p);near(p.stamina,1);near(p.totalStamina!,.92);settlePointStamina(p);near(p.totalStamina!,.92);
 p.totalStamina=.01;beginPointStamina(p);spendStamina(p,1);near(p.pointStaminaCost!,.01);
 settlePointStamina(p);near(p.totalStamina!,.006);
 p.totalStamina=0;beginPointStamina(p);spendStamina(p,1);settlePointStamina(p);near(p.totalStamina!,0);
});
test('both bars contribute to effective stamina; legacy states default only the missing match bar',()=>{
 const p=player();p.stamina=.5;p.totalStamina=.6;near(effectiveStamina(p),.3);
 p.stamina=1;near(effectiveStamina(p),.6);p.totalStamina=0;near(effectiveStamina(p),0);
 delete p.totalStamina;p.stamina=.5;near(effectiveStamina(p),.5);
});
test('run, strike and rescue deductions share the ledger; invalid costs do not corrupt it',()=>{
 const p=player();beginPointStamina(p);
 for(const cost of [.01,.04,.1])spendStamina(p,cost);
 near(p.stamina,.85);near(p.totalStamina!,.97);
 for(const cost of [-1,NaN,Infinity])spendStamina(p,cost);
 near(p.stamina,.85);near(p.totalStamina!,.97);
});
test('first fault is not a new point; second fault settles once and next point resets only local stamina',()=>{
 const m=new Match(['lin','wuming']);
 try{
  const s=m.state,p=s.players[0],isPoint=()=>m.state.phase==='point';
  m.input(0,{type:'shot',aim:1.2,depth:1,power:1,lob:false,critical:true});
  for(let i=0;i<300&&!isPoint();i++)m.step(1/60);
  assert.equal(s.fault,1);assert.deepEqual(s.score,[0,0]);
  const afterFault={point:p.stamina,total:p.totalStamina,spent:p.pointStaminaSpent};
  while(isPoint())m.step(1/60);
  near(p.stamina,afterFault.point);near(p.totalStamina!,afterFault.total!);
  near(p.pointStaminaSpent!,afterFault.spent!);
  m.input(0,{type:'shot',aim:1.2,depth:1,power:1,lob:false,critical:true});
  for(let i=0;i<300&&!isPoint();i++)m.step(1/60);
  assert.deepEqual(s.score,[0,1]);assert.equal(p.pointStaminaSettled,true);
  const total=p.totalStamina!;assert.ok(total<1);
  while(isPoint())m.step(1/60);
  near(p.stamina,1);near(p.totalStamina!,total);near(p.pointStaminaSpent!,0);
 }finally{m.dispose();}
});
test('match fatigue still slows movement and shots when the fresh point bar is full',()=>{
 const samples:number[][]=[];
 for(const total of [1,.4,0]){
  const m=new Match(['lin','lin']),p=m.state.players[0];
  try{
   p.totalStamina=total;p.x=-5;p.tx=5;p.tz=p.z;p.vx=0;p.vz=0;
   for(let i=0;i<45;i++)movePlayer(p,0,1/60);
   const velocity=p.vx!;
   m.input(0,{type:'shot',aim:0,depth:.5,power:.4,lob:false});
   while(m.state.rally===0)m.step(1/60);
   samples.push([velocity,Math.hypot(m.state.ball.vx,m.state.ball.vz)]);
  }finally{m.dispose();}
 }
 for(let i=0;i<2;i++)assert.ok(samples[0][i]>samples[1][i]&&samples[1][i]>samples[2][i]);
 near(rescueChance(1/3),.1);
 near(rescueChance(1),.9);
});
test('earned last point settles both players once even when it ends the match',()=>{
 const m=new Match(['lin','wuming']);
 try{
  m.state.score=[6,0];m.state.players.forEach(p=>spendStamina(p,.5));
  m.state.phase='rally';m.state.rally=2;m.state.ball.hitter=0;m.state.ball.bounces=1;
  m.physics.place({x:0,y:1,z:-23},{x:0,y:0,z:-3});Object.assign(m.state.ball,m.physics.read());
  m.step(1/60);
  assert.equal(m.state.phase,'over');assert.deepEqual(m.state.score,[7,0]);
  for(const p of m.state.players){
   near(p.totalStamina!,1-.1*(1-pointRecoveryRate(p.characterId)));
   assert.equal(p.pointStaminaSettled,true);
  }
  const totals=m.state.players.map(p=>p.totalStamina);
  m.finish(0,'repeat finalization');
  assert.deepEqual(m.state.players.map(p=>p.totalStamina),totals);
 }finally{m.dispose();}
});
