import {test} from 'node:test';import assert from 'node:assert/strict';import {SnapshotPlayback} from '../src/network/playback.js';import type {MatchState,PlayerState} from '../src/simulation/types.js';
function state(time:number):MatchState{
 const player=(x:number):PlayerState=>({characterId:'lin',x,z:10,tx:x+1,tz:10,vx:5,vz:0,stamina:1,swing:Math.max(0,.44-time),stroke:'forehand',moving:true,preparation:{stroke:'forehand',progress:time*.5,contact:{x:0,y:1,z:9}}});
 return {time,phase:'rally',score:[0,0],players:[player(time*5),player(time*5)],ball:{x:time*3,y:10-time*time*4.905,z:10-time*8,vx:3,vy:-9.81*time,vz:-8,bounces:0,hitter:1,targetX:1,targetZ:10},server:0,fault:0,pointTimer:0,rally:4,maxRally:4,winner:null,event:'击球',eventId:1,lastPoint:null};
}
const variation=(a:number[])=>{const mean=a.reduce((x,y)=>x+y)/a.length;return Math.sqrt(a.reduce((s,x)=>s+(x-mean)**2,0)/a.length)/mean;};
test('20Hz snapshots render continuous movement and preparation on a 60Hz screen, including arrival jitter',()=>{
 for(const jitter of [false,true]){
  const playback=new SnapshotPlayback(),packets=Array.from({length:31},(_,i)=>({s:state(i*.05),at:100+i*50+(jitter?[0,18,4,12][i%4]:0)}));
  let index=0,latest=packets[0].s,oldX=0,previousOld=0,previousNew=0,previousProgress=0;
  const oldSpeed:number[]=[],newSpeed:number[]=[],progressSteps:number[]=[];
  for(let frame=0;frame<90;frame++){
   const now=100+frame*1000/60;
   while(index<packets.length&&packets[index].at<=now){latest=packets[index].s;playback.push(latest,packets[index].at);index++;}
   oldX+=(latest.players[0].x-oldX)*(1-Math.exp(-24/60));
   const out=playback.sample(now)!;
   if(frame>15&&frame<70){oldSpeed.push((oldX-previousOld)*60);newSpeed.push((out.players[0].x-previousNew)*60);progressSteps.push(out.players[0].preparation!.progress-previousProgress);}
   previousOld=oldX;previousNew=out.players[0].x;previousProgress=out.players[0].preparation!.progress;
  }
  assert.ok(variation(oldSpeed)>.2,'fixture reproduces old chase-and-stop behavior');assert.ok(variation(newSpeed)<.08,`continuous velocity under jitter=${jitter}: ${variation(newSpeed)}`);assert.ok(progressSteps.every(x=>x>0&&x<.02),'preparation must advance each render frame');
 }
});
test('sampling never mutates authority and missing packets cannot move indefinitely',()=>{
 const p=new SnapshotPlayback(),a=state(1),original=structuredClone(a);p.push(a,1000);const before=structuredClone(p.sample(1200)!);const after=p.sample(9000)!;
 assert.deepEqual(a,original);assert.equal(before.players[0].x,after.players[0].x);assert.equal(before.ball.x,after.ball.x);assert.ok(after.players[0].x<=a.players[0].x+.251);
});
test('bounce, point reset, reconnect and rematch do not blend incompatible states',()=>{
 const p=new SnapshotPlayback(),a=state(0),b=state(.1);b.ball.bounces=1;b.ball.y=.3;p.push(a,100);p.push(b,200);
 assert.equal(p.sample(225)!.ball.bounces,0,'do not show bounce before its timestamp');assert.equal(p.sample(300)!.ball.bounces,1);
 assert.deepEqual(p.sample(310,true)!.ball,b.ball,'paused rendering stays authoritative');
 const reset=state(0);reset.phase='serve';reset.players[0].x=-1.5;p.push(reset,400);assert.equal(p.sample(420)!.players[0].x,-1.5);
 const next=state(.2);next.phase='serve';next.score=[1,0];next.players[0].x=2;p.push(next,600);assert.equal(p.sample(625)!.players[0].x,-1.5,'no movement through point reset');assert.equal(p.sample(700)!.players[0].x,2);
});
test('playback diagnostics report snapshot rate, jitter and actual packet silence',()=>{
 const p=new SnapshotPlayback();for(let i=0;i<20;i++)p.push(state(i*.05),100+i*50);assert.deepEqual(p.stats(1100),{hz:20,jitterMs:0,gapMs:50});p.reset();assert.deepEqual(p.stats(2000),{hz:0,jitterMs:0,gapMs:0});
});
test('serialized snapshots clear completed rescue motion instead of retaining a stale pose',()=>{
 const playback=new SnapshotPlayback(),a=state(1),b=state(1.8);
 a.players[0].rescue={startedAt:1,fromX:0,fromZ:10,toX:1.5,toZ:10,contact:{x:2,y:1,z:10},hit:true};
 playback.push(JSON.parse(JSON.stringify(a)),1000);assert.ok(playback.sample(1000)!.players[0].rescue);
 playback.push(JSON.parse(JSON.stringify(b)),1800);assert.equal(playback.sample(1900)!.players[0].rescue,undefined);
});

test('a new serialized flight clears the previous skill and spin',()=>{
 const p=new SnapshotPlayback(),a=state(1),b=state(1.8);a.ball.slice=true;a.ball.skill='smash';a.ball.tier='smash';a.ball.topspin=1;b.rally++;
 p.push(JSON.parse(JSON.stringify(a)),1000);assert.equal(p.sample(1000)!.ball.skill,'smash');
 p.push(JSON.parse(JSON.stringify(b)),1800);const out=p.sample(1900)!;assert.equal(out.ball.slice,undefined);assert.equal(out.ball.skill,undefined);assert.equal(out.ball.tier,undefined);assert.equal(out.ball.topspin,undefined);
});

test('dual stamina survives snapshots, interpolates within a point and resets without blending point boundaries',()=>{
 const playback=new SnapshotPlayback(),a=state(1),b=state(1.1);
 Object.assign(a.players[0],{stamina:.8,totalStamina:.9,pointStaminaSpent:.2,pointStaminaCost:.04,pointStaminaSettled:false});
 Object.assign(b.players[0],{stamina:.6,totalStamina:.86,pointStaminaSpent:.4,pointStaminaCost:.08,pointStaminaSettled:false});
 playback.push(JSON.parse(JSON.stringify(a)),1000);playback.push(JSON.parse(JSON.stringify(b)),1100);
 const mid=playback.sample(1125)!.players[0];
 assert.ok(Math.abs(mid.stamina-.7)<1e-10);assert.ok(Math.abs(mid.totalStamina!-.88)<1e-10);
 const next=state(1.3);next.phase='serve';next.score=[1,0];
 Object.assign(next.players[0],{stamina:1,totalStamina:.908,pointStaminaSpent:0,pointStaminaCost:0,pointStaminaSettled:false});
 playback.push(JSON.parse(JSON.stringify(next)),1300);
 const ready=playback.sample(1400)!.players[0];assert.equal(ready.stamina,1);assert.equal(ready.totalStamina,.908);
 const legacy=state(1.5);playback.push(legacy,1500);
 const old=playback.sample(1600)!.players[0];assert.equal(old.totalStamina,undefined);assert.equal(old.pointStaminaCost,undefined);
});
