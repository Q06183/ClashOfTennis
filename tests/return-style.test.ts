import {before,test} from 'node:test';import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';import {initPhysics} from '../src/simulation/physics.js';import {returnPlan} from '../src/simulation/return-plan.js';import {CHARACTERS} from '../src/simulation/characters.js';import {side,type Seat} from '../src/simulation/types.js';
before(initPhysics);
test('only the explicitly labelled volley specialist proactively approaches a catchable bounce',()=>{
 const m=new Match();for(const c of CHARACTERS)for(const seat of [0,1] as Seat[]){const sign=side(seat),p={...m.state.players[seat],characterId:c.id,x:-1*sign,z:9*sign,vx:0,vz:0};const b={...m.state.ball,x:1*sign,y:2.2,z:2*sign,vx:0,vy:4,vz:6*sign,bounces:0};
 assert.equal(returnPlan(b,p,seat,false).air,c.id==='ines',c.id);}
 assert.match(CHARACTERS.find(c=>c.id==='ines')!.strength,/主动.*截击/);m.dispose();
});
test('an early swipe by an ordinary player waits for a reachable bounce in a real rally',()=>{
 for(const seat of [0,1] as Seat[]){const m=new Match(['lin','lin'],()=>1),sign=side(seat);m.state.phase='rally';m.state.rally=2;Object.assign(m.state.players[seat],{x:-sign,z:9*sign,tx:-sign,tz:9*sign,vx:0,vz:0});m.physics.place({x:sign,y:2.2,z:2*sign},{x:0,y:4,z:6*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:0});m.input(seat,{type:'shot',aim:0,depth:.6,power:.4,lob:false});let bounced=false;
 for(let i=0;i<240&&m.state.rally===2&&m.state.phase==='rally';i++){bounced ||=m.state.ball.bounces>0;m.step(1/60);}
 assert.equal(m.state.rally,3);assert.equal(bounced,true);assert.notEqual(m.state.ball.skill,'volley');m.dispose();}
});
test('ordinary player still volleys when retreat cannot reach the post-bounce ball',()=>{
 const m=new Match(),p={...m.state.players[0],x:-4,z:7,tx:-4,tz:7,vx:0,vz:0};
 assert.equal(returnPlan({...m.state.ball,x:-2,y:1.5,z:3,vx:0,vy:0,vz:10,bounces:0},p,0,false).air,true);m.dispose();
});
test('deliberate swipe next to an airborne ball still takes immediate volley',()=>{
 const m=new Match();m.state.phase='rally';m.state.rally=2;(m as any).sinceHit=1;const p=m.state.players[0];Object.assign(p,{x:0,z:8,tx:0,tz:8});m.physics.place({x:.5,y:1,z:7.55},{x:0,y:-1,z:4});Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:0});m.input(0,{type:'shot',aim:0,depth:.5,power:.4,lob:false});assert.equal(m.state.rally,3);assert.equal(m.state.ball.skill,'volley');m.dispose();
});
test('ordinary emergency volley commitment survives marginal bounce forecast changes',()=>{
 const m=new Match(['lin','lin'],()=>1);m.state.phase='rally';m.state.rally=2;
 Object.assign(m.state.players[0],{x:.53,z:8.19,tx:0,tz:10,vx:.067,vz:-1.69,stamina:.594});
 m.physics.place({x:2.739,y:2.421,z:2.956},{x:-.818,y:-1.726,z:10.777});Object.assign(m.state.ball,m.physics.read(),{bounces:0,hitter:1});m.input(0,{type:'shot',aim:0,depth:.5,power:.3,lob:false});
 for(let i=0;i<180&&m.state.rally===2&&m.state.phase==='rally';i++)m.step(1/60);
 assert.equal(m.state.rally,3);assert.equal(m.state.ball.skill,'volley');assert.equal(m.state.ball.rescue,false);m.dispose();
});
