import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {spendStamina,settlePointStamina,pointRecoveryRate} from '../src/simulation/stamina.js';

before(initPhysics);
test('new points reset their own bars while carrying total stamina on either seat',()=>{
 for(const ids of [['wuming','lin'],['lin','wuming'],['lin','lin']] as const){
  const m=new Match(ids);
  try{
   m.state.players.forEach((p,i)=>{spendStamina(p,i===0?.28:.48);settlePointStamina(p);});
   m.state.phase='point';m.state.pointTimer=0;
   const before=m.state.players.map(p=>p.totalStamina);m.step(1/60);
   for(const seat of [0,1]){assert.equal(m.state.players[seat].stamina,1);assert.equal(m.state.players[seat].totalStamina,before[seat],`${ids}/${seat} reset must not refill total stamina`);}
  }finally{m.dispose();}
 }
});
test('point settlement refunds only this point cost and waiting longer cannot grant more',()=>{
 for(const ids of [['wuming','leo'],['leo','wuming']] as const){
  const m=new Match(ids);
  try{
   m.state.players.forEach(p=>{spendStamina(p,.5);settlePointStamina(p);});m.state.phase='point';m.state.pointTimer=1.8;
   for(let i=0;i<60;i++)m.step(1/60);
   m.state.players.forEach(p=>{
    assert.equal(p.stamina,.5);
    assert.ok(Math.abs(p.totalStamina!-(.9+.1*pointRecoveryRate(p.characterId)))<1e-10);
   });
   const remaining=m.state.pointTimer;const before=m.state.players.map(p=>p.totalStamina);
   m.step(remaining+.5); // Extra time beyond the break cannot create extra rest.
   assert.equal(m.state.phase,'serve');
   m.state.players.forEach((p,i)=>{assert.equal(p.stamina,1);assert.equal(p.totalStamina,before[i]);});
  }finally{m.dispose();}
 }
});
test('only starting a new match restores both total bars to full stamina',()=>{
 const old=new Match(['wuming','lin']);old.state.players.forEach(p=>spendStamina(p,.9));old.finish(0,'done');
 const next=new Match(['wuming','lin']);
 try{assert.deepEqual(next.state.players.map(p=>p.totalStamina),[1,1]);assert.ok(old.state.players.every(p=>p.totalStamina!<1));}
 finally{old.dispose();next.dispose();}
});
