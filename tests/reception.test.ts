import {test,before} from 'node:test';import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';import {initPhysics} from '../src/simulation/physics.js';import {reception} from '../src/simulation/reception.js';
import {driveAI} from '../src/simulation/ai.js';
before(initPhysics);
const shot={type:'shot',aim:0,depth:.5,power:.5,lob:false} as const;
test('serve shows a toss and windup before authoritative contact',()=>{
 const m=new Match();m.input(0,shot);m.step(.1);assert.equal(m.state.phase,'serve');assert.equal(m.state.rally,0);assert.ok(m.state.players[0].preparation?.progress);
 for(let i=0;i<60&&m.state.phase==='serve';i++)m.step(1/60);
 assert.equal(m.state.rally,1);assert.equal(m.state.players[0].stroke,'serve');m.dispose();
});
test('reception waits beyond the landing point and leaves lateral and forward swing space',()=>{
 for(const seat of [0,1] as const){const sign=seat===0?1:-1;const p={x:0,z:10*sign,tx:0,tz:10*sign,stamina:1,swing:0,stroke:'forehand',moving:false} as const;
 const b={x:0,y:1.5,z:4*sign,vx:0,vy:-3,vz:13*sign,bounces:0,hitter:seat===0?1:0,targetX:0,targetZ:7*sign} as const;
 const r=reception(b,p,seat);assert.ok((r.z-r.point.z)*sign>.6);assert.ok(Math.abs(r.x-r.point.x)>.6);assert.ok(r.point.y>.6);assert.ok(r.time>.4);}
});
test('an early return gesture survives the full incoming flight and strikes after the bounce',()=>{
 const m=new Match();m.input(0,{...shot,lob:true});for(let i=0;i<60&&m.state.phase==='serve';i++)m.step(1/60);
 m.input(1,shot);let bounce:{x:number;z:number}|undefined;let elapsed=0;
 for(let i=0;i<220&&m.state.rally===1&&m.state.phase==='rally';i++){m.step(1/60);elapsed+=1/60;if(m.state.ball.bounces===1&&!bounce)bounce={...m.state.ball};}
 assert.equal(m.state.rally,2);assert.ok(elapsed>1.25);assert.ok(bounce);const c=m.state.players[1].contact!;assert.ok(Math.hypot(c.x-bounce.x,c.z-bounce.z)>1.3);m.dispose();
});
test('a short bounced ball at the net can be taken before travelling 1.5 metres',()=>{
 const m=new Match();m.input(0,shot);for(let i=0;i<220&&m.state.rally<2;i++){driveAI(m,1);m.step(1/60);}assert.equal(m.state.rally,2);
 m.physics.place({x:0,y:.2,z:3},{x:0,y:-5,z:8});Object.assign(m.state.ball,m.physics.read(),{bounces:0});
 Object.assign(m.state.players[0],{x:0,z:3.5,tx:0,tz:3.5});
 m.input(0,{type:'move',x:0,z:3.5});
 for(let i=0;i<60&&m.state.phase==='rally'&&m.state.rally===2;i++){if(m.state.ball.bounces)m.input(0,shot);m.step(1/60);}
 assert.equal(m.state.rally,3);assert.notEqual(m.state.players[0].stroke,'volley');m.dispose();
});
test('ending a match clears a pending serve and queued receiver preparation',()=>{
 const m=new Match();m.input(0,shot);m.step(.2);assert.ok(m.state.players[0].preparation);
 m.finish(1,'对手离开');assert.equal(m.state.players[0].preparation,undefined);assert.equal(m.state.players[0].shotQueued,false);m.dispose();
});
test('recovery movement from the previous shot does not delay reading the next incoming ball',()=>{
 const m=new Match();m.input(0,shot);
 for(let i=0;i<260&&m.state.rally<2;i++){driveAI(m,0,'standard');driveAI(m,1,'standard');m.step(1/60);}assert.equal(m.state.rally,2);
 const receiver=m.state.players[0];m.step(1/60);
 const expected=reception(m.state.ball,receiver,0);
 assert.ok(Math.abs(receiver.tx-expected.x)<.05,'new flight must replace the stale recovery destination');
 m.input(0,{type:'move',x:2,z:10});m.step(1/60);
 assert.equal(receiver.tx,2,'a fresh manual move during this flight still takes precedence');m.dispose();
});
