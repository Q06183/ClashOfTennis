import {before,test} from 'node:test';import assert from 'node:assert/strict';import {Vector3} from 'three';
import {strokePose} from '../src/render/strokes.js';import {serveBallHeight,SERVE_DURATION,TOSS_RELEASE} from '../src/simulation/serve-motion.js';
import {Match} from '../src/simulation/match.js';import {initPhysics} from '../src/simulation/physics.js';import type {PlayerState} from '../src/simulation/types.js';
const c=new Vector3(0,2.65,.25),base:PlayerState={x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'serve',swing:0};
function preparing(t:number){return strokePose({...base,preparation:{stroke:'serve',progress:t,contact:{x:c.x,y:c.y,z:c.z}}},c);}
before(initPhysics);
test('service racket flows through intermediate poses without stopping at every key',()=>{
 const e=.00001;
 for(const t of [.32,.52,.88]){const left=preparing(t).tip.sub(preparing(t-e).tip).multiplyScalar(1/(e*SERVE_DURATION)),right=preparing(t+e).tip.sub(preparing(t).tip).multiplyScalar(1/(e*SERVE_DURATION));assert.ok(left.length()>.2,`unintended full stop at ${t}`);assert.ok(left.distanceTo(right)<.03,`velocity discontinuity at ${t}`);}
});
test('ball release preserves upward velocity instead of launching from a stopped hand',()=>{
 const e=.00001,before=(serveBallHeight(TOSS_RELEASE)-serveBallHeight(TOSS_RELEASE-e))/(e*SERVE_DURATION),after=(serveBallHeight(TOSS_RELEASE+e)-serveBallHeight(TOSS_RELEASE))/(e*SERVE_DURATION);assert.ok(Math.abs(before-after)<.01,`release velocity jumps ${before} -> ${after}`);
});
test('serve has enough recovery time and a continuous racket velocity through actual contact',()=>{
 const m=new Match();try{m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});while(m.state.phase==='serve')m.step(1/60);const duration=m.state.players[0].swing;assert.ok(duration>=.65&&duration<=.8,'landing and recovery need their own time');
 const dt=.00001,pre=preparing(1-dt/SERVE_DURATION).tip,impact=preparing(1).tip,post=strokePose({...base,swing:duration-dt},c).tip;const vin=impact.clone().sub(pre).multiplyScalar(1/dt),vout=post.sub(impact).multiplyScalar(1/dt);assert.ok(vin.length()>2);assert.ok(vin.distanceTo(vout)<.1,`contact brakes or snaps: ${vin.toArray()} -> ${vout.toArray()}`);
 }finally{m.dispose();}
});

import {Athlete} from '../src/render/player.js';
test('actual service hands and feet move continuously through the drop and return to ready',()=>{
 for(const seat of [0,1] as const){const m=new Match(),a=new Athlete(seat);try{
 if(seat===1){m.state.score=[1,0];m.state.phase='point';m.state.pointTimer=0;m.step(1/60);}
 m.input(seat,{type:'shot',aim:0,depth:.5,power:.5,lob:false});const last=new Map<string,Vector3>();
 for(let i=0;i<500;i++){m.step(1/240);a.update(m.state.players[seat],m.state.time,1/240);a.root.updateMatrixWorld(true);
 for(const name of ['racket-grip','left-hand-grip','foot-0','foot-1']){const at=a.root.getObjectByName(name)!.getWorldPosition(new Vector3()),prev=last.get(name);if(prev)assert.ok(at.distanceTo(prev)<.085,`${seat}/${name} discontinuity at ${m.state.time}: ${at.distanceTo(prev)}`);last.set(name,at);}
 }
 }finally{m.dispose();}}
});

test('the held toss follows the palm and the athlete looks upward as the ball rises',()=>{
 const m=new Match(),a=new Athlete(0);try{m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
 for(let i=0;i<60;i++){m.step(1/120);a.update(m.state.players[0],m.state.time,1/120);a.root.updateMatrixWorld(true);const progress=m.state.players[0].preparation!.progress;
 if(progress<=TOSS_RELEASE){const hand=a.root.getObjectByName('left-hand-grip')!.getWorldPosition(new Vector3()),ball=m.state.ball;assert.ok(hand.distanceTo(new Vector3(ball.x,ball.y-.1,ball.z))<.04,'held ball must remain above the actual palm');}
 }
 assert.ok(a.root.getObjectByName('head-tracking')!.rotation.x<-.4,'head follows the raised toss');
 }finally{m.dispose();}
});

import {SnapshotPlayback} from '../src/network/playback.js';
test('network playback keeps the last serve frames moving across the serve-to-rally packet boundary',()=>{
 const m=new Match();try{m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});const packets=[];
 for(let i=0;i<78;i++){m.step(1/60);if(i%3===2)packets.push(structuredClone(m.state));}
 const index=packets.findIndex(p=>p.phase==='rally'),a=packets[index-1],b=packets[index],original=structuredClone(a),p=new SnapshotPlayback();assert.equal(a.phase,'serve');
 p.push(a,100+a.time*1000);p.push(b,100+b.time*1000);
 let progress=a.players[0].preparation!.progress,height=a.ball.y;
 for(const ms of [10,20,30]){const out=p.sample(175+a.time*1000+ms)!;assert.equal(out.phase,'serve');assert.ok(out.players[0].preparation!.progress>progress);assert.ok(out.ball.y<height);progress=out.players[0].preparation!.progress;height=out.ball.y;}
 assert.deepEqual(a,original);assert.equal(p.sample(175+b.time*1000+1)!.phase,'rally');
 const missing=new SnapshotPlayback();missing.push(a,100+a.time*1000);const short=structuredClone(missing.sample(175+a.time*1000+20)!);assert.ok(short.players[0].preparation!.progress>a.players[0].preparation!.progress);const capped=structuredClone(missing.sample(175+a.time*1000+500)!);assert.deepEqual(missing.sample(175+a.time*1000+5000)!.ball,capped.ball);assert.equal(capped.phase,'serve','missing packets must never invent a hit');
 }finally{m.dispose();}
});

import {Quaternion} from 'three';
test('tossing elbow and wrist stay continuous at contact and while returning to the grip',()=>{
 for(const seat of [0,1] as const){const m=new Match(),a=new Athlete(seat);try{
 if(seat===1){m.state.score=[1,0];m.state.phase='point';m.state.pointTimer=0;m.step(1/60);}
 m.input(seat,{type:'shot',aim:0,depth:.5,power:.5,lob:false});let previous:Vector3|undefined,rotation:Quaternion|undefined;
 for(let i=0;i<500;i++){m.step(1/240);a.update(m.state.players[seat],m.state.time,1/240);a.root.updateMatrixWorld(true);const hand=a.root.getObjectByName('left-hand-grip')!,elbow=hand.parent!.getWorldPosition(new Vector3()),q=hand.getWorldQuaternion(new Quaternion());
 if(previous)assert.ok(elbow.distanceTo(previous)<.035,`elbow jumps at ${m.state.time}: ${elbow.distanceTo(previous)}`);
 if(rotation)assert.ok(q.angleTo(rotation)<.15,`wrist flips at ${m.state.time}: ${q.angleTo(rotation)}`);previous=elbow;rotation=q;
 }
 }finally{m.dispose();}}
});
