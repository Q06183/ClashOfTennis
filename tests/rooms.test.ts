import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/app.js';
import {projectedLandingAngle} from './helpers/projected-shot.js';
import {AimCameraLock} from '../src/render/aim-camera.js';
import {effectiveStamina,beginPointStamina,spendStamina,settlePointStamina,pointRecoveryRate} from '../src/simulation/stamina.js';
import {bodyAimTarget} from '../src/simulation/shot-aim.js';

async function client(url:string) {
  const ws=new WebSocket(url);const messages:any[]=[];
  ws.on('message',data=>messages.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  return {ws,messages,send:(v:unknown)=>ws.send(JSON.stringify(v)),
    async wait(type:string,predicate:(m:any)=>boolean=()=>true) {
      const until=Date.now()+2500;
      while(Date.now()<until) {const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}
      throw new Error(`Timed out waiting for ${type}: ${JSON.stringify(messages.slice(-3))}`);
    }};
}
test('hidden master works on both sockets without unlock metadata, survives resume and rematch',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'});
 const clients:Awaited<ReturnType<typeof client>>[]=[];
 try{
  const a=await client(server.wsUrl);clients.push(a);
  a.send({type:'create',name:'无名玩家',characterId:'wuming'});
  const first=await a.wait('welcome');
  const b=await client(server.wsUrl);clients.push(b);
  b.send({type:'join',code:first.code,name:'普通朋友',characterId:'lin'});await b.wait('welcome');
  const visible=await b.wait('room',m=>m.room.seats[1]?.characterId==='lin');
  assert.equal(visible.room.seats[0].characterId,'wuming');
  // Valid hidden ID is shared data, not a claim supplied via client stats.
  a.send({type:'select-character',characterId:'lin'});await b.wait('room',m=>m.room.seats[0]?.characterId==='lin');
  a.send({type:'select-character',characterId:'wuming',stats:{serve:9999}});
  await b.wait('room',m=>m.room.seats[0]?.characterId==='wuming');
  a.send({type:'ready'});b.send({type:'ready'});
  const start=await a.wait('state'),peer=await b.wait('state',m=>m.seq===start.seq);
  assert.deepEqual(start.state,peer.state);
  assert.deepEqual(start.state.players.map((p:any)=>p.characterId),['wuming','lin']);
  a.send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
  const hit=await a.wait('state',m=>m.state.rally===1),otherHit=await b.wait('state',m=>m.seq===hit.seq);
  assert.deepEqual(hit.state,otherHit.state);assert.ok(hit.state.players[0].stamina<1);
  a.send({type:'select-character',characterId:'lin'});assert.match((await a.wait('error')).message,/比赛/);
  a.ws.close();await b.wait('room',m=>m.room.paused);
  const resumed=await client(server.wsUrl);clients.push(resumed);
  resumed.send({type:'resume',code:first.code,token:first.token});await resumed.wait('welcome');
  assert.equal((await resumed.wait('state',m=>!m.paused)).state.players[0].characterId,'wuming');
  server.rooms.rooms.get(first.code)!.match!.finish(0,'验证重赛');
  await b.wait('state',m=>m.state.phase==='over');await resumed.wait('state',m=>m.state.phase==='over');
  resumed.send({type:'ready'});b.send({type:'ready'});
  const rematch=await resumed.wait('state',m=>m.state.phase==='serve'&&m.state.rally===0);
  assert.deepEqual(rematch.state.score,[0,0]);
  assert.deepEqual(rematch.state.players.map((p:any)=>p.characterId),['wuming','lin']);
  assert.deepEqual((await b.wait('state',m=>m.seq===rematch.seq)).state,rematch.state);
 }finally{clients.forEach(c=>c.ws.terminate());await server.close();}
});
test('real sockets create/join/ready, reject third seat, share state and resume securely',async()=>{
  const server=await createGameServer({port:0,host:'127.0.0.1'});
  const clients:Awaited<ReturnType<typeof client>>[]=[];
  try {
    const a=await client(server.wsUrl);clients.push(a);a.send({type:'create',name:'小蓝'});
    const first=await a.wait('welcome');assert.match(first.code,/^\d{6}$/);
    const b=await client(server.wsUrl);clients.push(b);b.send({type:'join',code:first.code,name:'小橙'});
    const second=await b.wait('welcome');assert.equal(second.seat,1);
    const c=await client(server.wsUrl);clients.push(c);c.send({type:'join',code:first.code,name:'第三人'});
    assert.match((await c.wait('error')).message,/满/);
    a.send({type:'ready'});b.send({type:'ready'});
    const sa=await a.wait('state');const sb=await b.wait('state',m=>m.seq===sa.seq);
    assert.deepEqual(sa.state,sb.state);
    assert.equal(JSON.stringify((await a.wait('room')).room).includes(first.token),false);
    a.send({type:'input',command:{type:'shot',aim:0,depth:.5,power:1,lob:false,critical:true,directionX:0}});
    const hit=await b.wait('state',m=>m.state.phase==='rally');
    assert.ok(Math.abs(hit.state.ball.vx)<1e-6,'direction must survive WebSocket input');
    assert.equal(hit.state.ball.critical,true,'critical tier must reach the opponent through the authoritative state');
    assert.equal(hit.state.ball.tier,'critical','path colour tier must reach the opponent through the authoritative state');
    assert.match(hit.state.event,/暴击/);
    assert.ok(hit.state.players[0].contact,'both clients need the actual animation contact point');
    a.ws.close();await b.wait('room',m=>m.room.paused);
    const frozen=await b.wait('state',m=>m.paused);
    const frozen2=await b.wait('state',m=>m.paused&&m.seq>frozen.seq+2);
    assert.deepEqual(frozen.state,frozen2.state);
    c.send({type:'resume',code:first.code,token:'wrong-token'});
    assert.match((await c.wait('error')).message,/恢复/);
    c.send({type:'resume',code:first.code,token:first.token});
    assert.equal((await c.wait('welcome')).seat,0);
    await b.wait('room',m=>!m.room.paused);
    c.send({type:'input',command:{type:'move',x:'bad',z:null}});
    const healthy=await c.wait('state',m=>!m.paused);
    assert.ok(Number.isFinite(healthy.state.players[0].x));
  } finally {clients.forEach(c=>c.ws.terminate());await server.close();}
});
test('room isolation and invalid room errors',async()=>{
  const server=await createGameServer({port:0,host:'127.0.0.1'});
  const a=await client(server.wsUrl),b=await client(server.wsUrl);
  try {
    a.send({type:'create',name:'a'});b.send({type:'join',code:'nope',name:'b'});
    assert.match((await b.wait('error')).message,/房间/);
    b.send({type:'create',name:'b'});
    const ra=await a.wait('welcome'),rb=await b.wait('welcome');assert.notEqual(ra.code,rb.code);
    a.send({type:'ready'});assert.match((await a.wait('error')).message,/好友/);
  } finally {a.ws.terminate();b.ws.terminate();await server.close();}
});
test('disconnect timeout ends the match and removes the lost seat',async()=>{
  const server=await createGameServer({port:0,host:'127.0.0.1',reconnectMs:140});
  const a=await client(server.wsUrl),b=await client(server.wsUrl);
  try{
    a.send({type:'create',name:'a'});const room=await a.wait('welcome');
    b.send({type:'join',code:room.code,name:'b'});await b.wait('welcome');
    a.send({type:'ready'});b.send({type:'ready'});await b.wait('state');
    a.ws.close();
    const ended=await b.wait('state',m=>m.state.phase==='over');
    assert.equal(ended.state.winner,1);assert.match(ended.state.event,/超时/);
    const update=await b.wait('room',m=>m.room.seats[0]===null);assert.equal(update.room.paused,false);
  }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});
test('both players retain reconnect window even after waiting in lobby',async()=>{
  const server=await createGameServer({port:0,host:'127.0.0.1',reconnectMs:500});
  const a=await client(server.wsUrl),b=await client(server.wsUrl);
  let c:Awaited<ReturnType<typeof client>>|undefined;
  try{
    a.send({type:'create',name:'a'});const credentials=await a.wait('welcome');
    b.send({type:'join',code:credentials.code,name:'b'});await b.wait('welcome');
    const room=server.rooms.rooms.get(credentials.code)!;room.updated=Date.now()-60_000;
    a.ws.close();b.ws.close();await new Promise(r=>setTimeout(r,60));
    c=await client(server.wsUrl);c.send({type:'resume',code:credentials.code,token:credentials.token});
    const response=await c.wait('welcome');assert.equal(response.seat,0);
  }finally{a.ws.terminate();b.ws.terminate();c?.ws.terminate();await server.close();}
});

test('character picks are validated, shared, locked during play and retained after resume',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'});const clients:Awaited<ReturnType<typeof client>>[]=[];
 try{
  const a=await client(server.wsUrl);clients.push(a);a.send({type:'create',name:'A',characterId:'mei'});const first=await a.wait('welcome');
  const b=await client(server.wsUrl);clients.push(b);b.send({type:'join',code:first.code,name:'B',characterId:'leo'});await b.wait('welcome');
  const room=await b.wait('room',m=>m.room.seats[1]?.characterId==='leo');assert.equal(room.room.seats[0].characterId,'mei');
  a.send({type:'select-character',characterId:'hacked',stats:{serve:1000}});assert.match((await a.wait('error')).message,/角色/);
  a.send({type:'ready'});await b.wait('room',m=>m.room.seats[0]?.ready);
  b.send({type:'select-character',characterId:'rafa'});const changed=await a.wait('room',m=>m.room.seats[1]?.characterId==='rafa');assert.ok(changed.room.seats.every((s:any)=>!s.ready));
  a.send({type:'ready'});b.send({type:'ready'});const start=await b.wait('state');assert.deepEqual(start.state.players.map((p:any)=>p.characterId),['mei','rafa']);
  a.send({type:'select-character',characterId:'leo'});assert.match((await a.wait('error')).message,/比赛/);
  a.ws.close();await b.wait('room',m=>m.room.paused);const resumed=await client(server.wsUrl);clients.push(resumed);resumed.send({type:'resume',code:first.code,token:first.token});await resumed.wait('welcome');const restored=await resumed.wait('state');assert.equal(restored.state.players[0].characterId,'mei');
 }finally{clients.forEach(c=>c.ws.terminate());await server.close();}
});

test('authoritative rescue animation, slow ball and scatter arrive identically at both sockets',async()=>{
 const {Match}=await import('../src/simulation/match.js');
 const server=await createGameServer({port:0,host:'127.0.0.1'});const a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'A'});const first=await a.wait('welcome');b.send({type:'join',code:first.code,name:'B'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(first.code)!;room.match!.dispose();room.match=new Match(['lin','lin'],()=>0);
  const m=room.match;m.state.phase='rally';m.state.rally=2;
  Object.assign(m.state.players[0],{x:0,z:10,tx:0,tz:10,vx:0,vz:0});m.input(0,{type:'move',x:0,z:10});
  m.physics.place({x:2.1,y:1,z:7.8},{x:0,y:.5,z:10});Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:1});
  a.send({type:'input',command:{type:'shot',aim:.25,depth:.6,power:1,lob:false,critical:true,rescue:true}});
  const jump=await a.wait('state',v=>!!v.state.players[0].rescue);const jumpB=await b.wait('state',v=>v.seq===jump.seq);assert.deepEqual(jump.state,jumpB.state);
  const hit=await a.wait('state',v=>v.state.ball.rescue===true);const hitB=await b.wait('state',v=>v.seq===hit.seq);
  assert.deepEqual(hit.state,hitB.state);assert.equal(hit.state.ball.critical,true);assert.ok(Math.hypot(hit.state.ball.vx,hit.state.ball.vz)<22);assert.equal(hit.state.event,'极限救球');
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('stamina-driven four-style jumps are chosen by the server and shared with both sockets',async()=>{
 const {Match}=await import('../src/simulation/match.js'),{rescueChance}=await import('../src/simulation/rescue.js');
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'跳接A'});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'跳接B'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(welcome.code)!;
  for(const seat of [0,1] as const)for(const kind of ['forehand','backhand','volley','smash'] as const){
   room.match!.dispose();let draws=0,chance=0;
   const m=room.match=new Match(['lin','lin'],()=>{
    if(draws++===0){chance=rescueChance(m.state.players[seat].totalStamina??1);return chance-1e-6;}
    return .5;
   }),sign=seat===0?1:-1,depth=kind==='volley'?4:10;
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   const p=m.state.players[seat];Object.assign(p,{x:0,z:depth*sign,tx:0,tz:depth*sign,vx:0,vz:0,stamina:seat===0?1:1/3,totalStamina:seat===0?1:1/3});
   m.physics.place({x:(kind==='backhand'?-2.65:2.65)*sign,y:kind==='smash'?2.9:kind==='volley'?1.9:1.2,z:(depth-1.8)*sign},{x:0,y:0,z:10*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:kind==='forehand'||kind==='backhand'?1:0});
   a.messages.length=0;b.messages.length=0;
   (seat===0?a:b).send({type:'input',command:{type:'shot',aim:0,depth:.55,power:.8,lob:false,rescueChance:1,rescueStroke:'hacked'}});
   const jump=await a.wait('state',v=>v.state.players[seat].rescue?.stroke===kind);
   assert.deepEqual((await b.wait('state',v=>v.seq===jump.seq)).state,jump.state);
   const hit=await a.wait('state',v=>v.state.rally===3&&v.state.ball.rescue);
   assert.deepEqual((await b.wait('state',v=>v.seq===hit.seq)).state,hit.state);
   assert.equal(hit.state.players[seat].stroke,kind);assert.equal(draws,3);
   assert.ok(seat===0?chance>.89:chance===.1);
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('real crosscourt flight reaches an adaptive rescue and carries total stamina but resets point bars',async t=>{
 const {Match}=await import('../src/simulation/match.js');
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'体力A',characterId:'leo'});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'体力B',characterId:'wuming'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(welcome.code)!;
  room.match!.dispose();const m=room.match=new Match(['leo','wuming'],()=>0);
  m.state.phase='rally';m.state.rally=2;m.step(.08);
  Object.assign(m.state.players[1],{x:-3,z:-14,tx:-3,tz:-14,vx:0,vz:0,stamina:.8});
  Object.assign(m.state.players[0],{x:0,z:10,tx:0,tz:10,vx:0,vz:0});
  m.physics.place({x:.6,y:1.8,z:9.6});Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:1});
  const pausedStep=t.mock.method(m,'step',()=>{});
  a.messages.length=0;b.messages.length=0;
  a.send({type:'input',command:{type:'shot',aim:.8,depth:.7,power:.9,lob:false}});
  await a.wait('state',v=>v.state.rally===3);
  b.send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
  await a.wait('state',v=>v.state.players[1].shotQueued);
  pausedStep.mock.restore();
  const jump=await a.wait('state',v=>!!v.state.players[1].rescue);
  assert.deepEqual((await b.wait('state',v=>v.seq===jump.seq)).state,jump.state);
  assert.ok(jump.state.players[1].rescue.travel>=.12&&jump.state.players[1].rescue.travel<=.28,'selected jump duration must survive serialization');
  const hit=await a.wait('state',v=>v.state.rally===4&&v.state.ball.rescue);
  assert.deepEqual((await b.wait('state',v=>v.seq===hit.seq)).state,hit.state);
  // Exercise the real reset/broadcast path, with known stamina for both roles.
  m.state.players.forEach((p,i)=>{p.totalStamina=1;beginPointStamina(p);spendStamina(p,i===0?.48:.28);settlePointStamina(p);});
  m.state.phase='point';m.state.pointTimer=.2;
  const ready=await a.wait('state',v=>v.state.phase==='serve'&&v.state.rally===0);
  assert.deepEqual((await b.wait('state',v=>v.seq===ready.seq)).state,ready.state);
  for(const [seat,used] of [[0,.48],[1,.28]] as const){
   const expected=1-used*.2*(1-pointRecoveryRate(m.state.players[seat].characterId));
   assert.equal(ready.state.players[seat].stamina,1);
   assert.ok(Math.abs(ready.state.players[seat].totalStamina-expected)<1e-9,'same two-level stamina accounting on both seats');
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('smash, volley, topspin and irregular slice bounce are identical on two real sockets',async()=>{
 const {Match}=await import('../src/simulation/match.js');
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'技能A'});const first=await a.wait('welcome');b.send({type:'join',code:first.code,name:'技能B'});await b.wait('welcome');a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(first.code)!;
  for(const skill of ['smash','volley','topspin','slice'] as const)for(const seat of [0,1] as const){
   room.match!.dispose();const m=room.match=new Match(['lin','lin'],()=>.65),sign=seat===0?1:-1;m.state.phase='rally';m.state.rally=2;const depth=skill==='smash'||skill==='volley'?3:10;
   Object.assign(m.state.players[seat],{x:0,z:depth*sign,tx:0,tz:depth*sign});m.input(seat,{type:'move',x:0,z:depth*sign});m.physics.place({x:(skill==='smash'?.25:.6)*sign,y:skill==='smash'?2.55:1.3,z:(depth-.25)*sign},{x:0,y:skill==='smash'?-.5:0,z:4*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:skill==='smash'||skill==='volley'?0:1});a.messages.length=0;b.messages.length=0;
   (seat===0?a:b).send({type:'input',command:{type:'shot',aim:0,depth:.55,power:.7,lob:false,topspin:skill==='topspin'?1:0,slice:skill==='slice'}});
   const hit=await a.wait('state',v=>v.state.rally===3),peer=await b.wait('state',v=>v.seq===hit.seq);assert.deepEqual(hit.state,peer.state);
   if(skill==='topspin')assert.equal(hit.state.ball.topspin,1);else assert.equal(hit.state.ball.skill,skill);
   if(skill==='slice'){const bounce=await a.wait('state',v=>v.state.ball.slice&&v.state.ball.bounces===1),same=await b.wait('state',v=>v.seq===bounce.seq);assert.deepEqual(bounce.state,same.state);assert.equal(bounce.state.event,'切削弹跳');}
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('both sockets receive the same weak low volley before its incoming ball touches the floor',async t=>{
 const {Match}=await import('../src/simulation/match.js');const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{a.send({type:'create',name:'低球A'});const welcome=await a.wait('welcome');b.send({type:'join',code:welcome.code,name:'低球B'});await b.wait('welcome');a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');const room=server.rooms.rooms.get(welcome.code)!;
 for(const seat of [0,1] as const){room.match!.dispose();const m=room.match=new Match(['lin','lin'],()=>1),sign=seat===0?1:-1;m.state.phase='rally';m.state.rally=2;m.step(.08);Object.assign(m.state.players[seat],{x:0,z:11*sign,tx:0,tz:11*sign,vx:0,vz:0});m.physics.place({x:.3*sign,y:.18,z:10.95*sign},{x:0,y:-3,z:5*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:0});a.messages.length=0;b.messages.length=0;
 // Freeze simulation time until the real socket input is processed. At y=.18,
 // vy=-3 the contact window is under 20ms, so wall-clock scheduling can bounce
 // the fixture before delivery even when the input handler is correct.
 const step=t.mock.method(m,'step',()=>{});
 (seat===0?a:b).send({type:'input',command:{type:'shot',aim:0,depth:.8,power:1,critical:true,lob:false}});
 const hit=await a.wait('state',v=>v.state.rally===3&&v.state.ball.skill==='volley'),peer=await b.wait('state',v=>v.seq===hit.seq);assert.deepEqual(hit.state,peer.state);assert.equal(hit.state.ball.critical,false);assert.ok(hit.state.players[seat].contact.y<.25);
 step.mock.restore();
 }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('left-hand single-backhand picks and real backhand contacts agree on both sockets',async()=>{
 const {Match}=await import('../src/simulation/match.js');const {handedness}=await import('../src/simulation/characters.js');
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'左手单反',characterId:'luca'});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'右手单反',characterId:'adrian'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});const initial=await a.wait('state');assert.deepEqual(initial.state.players.map((p:any)=>p.characterId),['luca','adrian']);
  const room=server.rooms.rooms.get(welcome.code)!;
  for(const seat of [0,1] as const){
   room.match!.dispose();const m=room.match=new Match(['luca','adrian'],()=>1),sign=seat===0?1:-1;m.state.phase='rally';m.state.rally=2;m.step(.08);
   const p=m.state.players[seat];Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,vx:0,vz:0});m.input(seat,{type:'move',x:0,z:10*sign});
   m.physics.place({x:-.6*sign*handedness(p.characterId),y:1.3,z:9.6*sign},{x:0,y:0,z:3*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});a.messages.length=0;b.messages.length=0;
   (seat===0?a:b).send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
   const hit=await a.wait('state',v=>v.state.rally===3),peer=await b.wait('state',v=>v.seq===hit.seq);assert.deepEqual(hit.state,peer.state);assert.equal(hit.state.players[seat].stroke,'backhand');assert.ok(hit.state.players[seat].backhand);
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('queued swipe at an automatic waiting spot returns a low bounce identically on both sockets',async()=>{
 const {Match}=await import('../src/simulation/match.js'),{reception}=await import('../src/simulation/reception.js');
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'等待接球'});const welcome=await a.wait('welcome');b.send({type:'join',code:welcome.code,name:'另一侧'});await b.wait('welcome');a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');const room=server.rooms.rooms.get(welcome.code)!;
  for(const seat of [0,1] as const){
   room.match!.dispose();const m=room.match=new Match(['lin','lin'],()=>1),sign=seat===0?1:-1;m.state.phase='rally';m.state.rally=2;
   m.physics.place({x:-2.325743260793388*sign,y:1.2050785743631423,z:2.7722555100917816*sign},{x:-1.4527925858274102*sign,y:-.29331559827551246,z:4.088712823810056*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:0});const p=m.state.players[seat],r=reception(m.state.ball,p,seat);Object.assign(p,{x:r.x,z:r.z,tx:r.x,tz:r.z,vx:0,vz:0});a.messages.length=0;b.messages.length=0;
   (seat===0?a:b).send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.4,lob:false}});
   const hit=await a.wait('state',v=>v.state.rally===3),peer=await b.wait('state',v=>v.seq===hit.seq);assert.deepEqual(hit.state,peer.state);assert.equal(hit.state.players[seat].stroke,'backhand');assert.equal(hit.state.ball.rescue,false);assert.ok(hit.state.players[seat].contact.y>.25);
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('a running receiver queues screen aim over sockets and uses actual contact for the return',async()=>{
 const {Match}=await import('../src/simulation/match.js'),{captureSwipeAim}=await import('../src/input/aim.js'),{PerspectiveCamera}=await import('three'),{frameMatch}=await import('../src/render/camera.js');
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'提前滑动'});const welcome=await a.wait('welcome');b.send({type:'join',code:welcome.code,name:'对侧'});await b.wait('welcome');a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');const room=server.rooms.rooms.get(welcome.code)!;
  for(const seat of [0,1] as const){
   room.match!.dispose();const m=room.match=new Match(['lin','lin'],()=>1),sign=seat===0?1:-1;m.state.phase='rally';m.state.rally=2;const p=m.state.players[seat];Object.assign(p,{x:-2*sign,z:10*sign,tx:-4*sign,tz:12*sign,vx:-sign,vz:0});m.physics.place({x:1.2*sign,y:2.8,z:-2*sign},{x:.3*sign,y:4,z:7*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:0});
   const camera=new PerspectiveCamera();frameMatch(camera,390,844,seat,p.x,10);const shot={type:'shot' as const,aim:0,depth:.6,power:.4,lob:false},aim=captureSwipeAim(camera,shot,24,-150,390,844);a.messages.length=0;b.messages.length=0;
   (seat===0?a:b).send({type:'input',command:{...shot,swipeAim:aim}});
   const queued=await a.wait('state',v=>v.state.rally===2&&v.state.players[seat].shotQueued);assert.equal(queued.state.players[seat].moving,true);
   const hit=await a.wait('state',v=>v.state.rally===3),peer=await b.wait('state',v=>v.seq===hit.seq);assert.deepEqual(hit.state,peer.state);const c=hit.state.players[seat].contact;assert.ok(Math.abs(projectedLandingAngle(camera,c,hit.state.ball,390,844)-Math.atan(24/150))<.01);assert.equal(hit.state.players[seat].shotQueued,false);
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('whole-court landing direction survives the real WebSocket protocol on both seats',async()=>{
 const {Match}=await import('../src/simulation/match.js');
 const {CourtView}=await import('../src/render/view.js');
 const {PerspectiveCamera}=await import('three');
 const {frameMatch}=await import('../src/render/camera.js');
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'边缘方向A',characterId:'wuming'});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'边缘方向B',characterId:'lin'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(welcome.code)!;
  for(const seat of [0,1] as const)for(const x of [-5.8,0,5.8])for(const depth of [3,6,10,16]){
   room.match!.dispose();const m=room.match=new Match(['wuming','lin'],()=>.5),sign=seat===0?1:-1;
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   const p=m.state.players[seat];Object.assign(p,{x:x*sign,z:depth*sign,tx:x*sign,tz:depth*sign,vx:0,vz:0});
   m.physics.place({x:(x+.4)*sign,y:1.8,z:(depth-.4)*sign},{x:0,y:0,z:4*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   const camera=new PerspectiveCamera();frameMatch(camera,390,844,seat,p.x,depth,m.state.players[seat===0?1:0]);
   const shot={type:'shot' as const,aim:0,depth:.6,power:.7,lob:false},ratio=x>0?.4:-.4;
   const aimed=CourtView.prototype.aimShot.call({camera,seat,size:{w:390,h:844},aimCamera:new AimCameraLock()} as any,shot,m.state,ratio*150,-150);
   a.messages.length=0;b.messages.length=0;
   (seat===0?a:b).send({type:'input',command:aimed});
   const hit=await a.wait('state',v=>v.state.rally===3),peer=await b.wait('state',v=>v.seq===hit.seq);
   assert.deepEqual(hit.state,peer.state);
   assert.equal(hit.state.players[seat].characterId,seat===0?'wuming':'lin');
   assert.equal(hit.state.ball.bounces,0);
   const angle=projectedLandingAngle(camera,hit.state.players[seat].contact,hit.state.ball,390,844);
   assert.ok(Math.abs(angle-Math.atan(ratio))<.015,`${seat}/${x}/${depth}: ${angle}`);
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('both sockets retain landing recovery and reject movement or hits until the player stands up',async()=>{
 const {Match}=await import('../src/simulation/match.js'),{RESCUE}=await import('../src/simulation/rescue.js');
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'恢复A'});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'恢复B'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(welcome.code)!;
  for(const seat of [0,1] as const){
   room.match!.dispose();const m=room.match=new Match(['lin','lin'],()=>1),sign=seat===0?1:-1,p=m.state.players[seat];
   m.state.phase='rally';m.state.rally=4;m.step(.08);m.state.time=.58;
   Object.assign(p,{x:1,z:10*sign,tx:1,tz:10*sign,vx:0,vz:0,
    rescue:{startedAt:0,fromX:0,fromZ:10*sign,toX:1,toZ:10*sign,contact:{x:1.6,y:1.2,z:9.6*sign},hit:true,stroke:'forehand'}});
   m.physics.place({x:1.6,y:2.5,z:9.6*sign},{x:0,y:0,z:3*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   a.messages.length=0;b.messages.length=0;
   (seat===0?a:b).send({type:'input',command:{type:'move',x:4,z:10*sign}});
   const landed=await a.wait('state',v=>v.state.time>.68&&v.state.time<1.05);
   assert.deepEqual((await b.wait('state',v=>v.seq===landed.seq)).state,landed.state);
   assert.equal(landed.state.players[seat].x,1);assert.equal(landed.state.players[seat].z,10*sign);
   assert.ok(landed.state.players[seat].rescue);assert.equal(landed.state.rally,4);
   (seat===0?a:b).send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
   const locked=await a.wait('state',v=>v.seq>landed.seq&&v.state.time<RESCUE.duration);
   assert.equal(locked.state.rally,4);
   const recovered=await a.wait('state',v=>v.state.time>RESCUE.duration&&!v.state.players[seat].rescue);
   assert.deepEqual((await b.wait('state',v=>v.seq===recovered.seq)).state,recovered.state);
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('serve positioning, body-centred straight aim and winning state agree on two real sockets',async()=>{
 const {captureSwipeAim}=await import('../src/input/aim.js'),{frameMatch}=await import('../src/render/camera.js');
 const {PerspectiveCamera}=await import('three');
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'站位A'});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'站位B'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  a.send({type:'input',command:{type:'move',x:3,z:15}});
  b.send({type:'input',command:{type:'move',x:-2,z:-8}});
  const ready=await a.wait('state',v=>Math.abs(v.state.players[0].x-3)<.04&&Math.abs(v.state.players[0].z-15)<.04&&Math.abs(v.state.players[1].z+8)<.04);
  assert.deepEqual((await b.wait('state',v=>v.seq===ready.seq)).state,ready.state);
  const camera=new PerspectiveCamera();frameMatch(camera,390,844,0,3,15,ready.state.players[1],'near');
  const shot={type:'shot' as const,aim:0,depth:.5,power:.5,lob:false};
  a.send({type:'input',command:{...shot,swipeAim:captureSwipeAim(camera,shot,0,-150,390,844)}});
  const hit=await a.wait('state',v=>v.state.rally===1),same=await b.wait('state',v=>v.seq===hit.seq);
  assert.deepEqual(hit.state,same.state);
  assert.ok(hit.state.players[0].contact.z>14,'serve is launched from the adjusted station');
  assert.ok(Math.abs(hit.state.ball.targetX-hit.state.ball.aimOrigin.x)<1e-6);
  const room=server.rooms.rooms.get(welcome.code)!;room.match!.finish(1,'获胜庆祝');
  const over=await a.wait('state',v=>v.state.phase==='over');
  assert.deepEqual((await b.wait('state',v=>v.seq===over.seq)).state,over.state);assert.equal(over.state.winner,1);
  a.send({type:'ready'});b.send({type:'ready'});
  const rematch=await a.wait('state',v=>v.state.phase==='serve'&&v.state.winner===null&&v.state.rally===0);
  assert.deepEqual(rematch.state.score,[0,0]);
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('immediate rescue uses total stamina and a later swipe replaces saved quality over sockets',async t=>{
 const {Match}=await import('../src/simulation/match.js'),{captureSwipeAim}=await import('../src/input/aim.js');
 const {PerspectiveCamera}=await import('three'),{frameMatch}=await import('../src/render/camera.js');
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'即时救球A'});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'即时救球B'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(welcome.code)!;
  for(const seat of [0,1] as const){
   room.match!.dispose();let rolls=0;
   const m=room.match=new Match(['lin','lin'],()=>++rolls===1?.8:.5),sign=seat===0?1:-1,p=m.state.players[seat];
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,vx:0,vz:0,stamina:.1,totalStamina:1});
   m.physics.place({x:2.65*sign,y:1.2,z:8.2*sign},{x:0,y:0,z:10*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   const pause=t.mock.method(m,'step',()=>{});
   const camera=new PerspectiveCamera();frameMatch(camera,390,844,seat,0,10,undefined,'near');
   const first={type:'shot' as const,aim:-.2,depth:.4,power:.2,lob:false};
   a.messages.length=0;b.messages.length=0;
   (seat===0?a:b).send({type:'input',command:{...first,swipeAim:captureSwipeAim(camera,first,-30,-150,390,844)}});
   const jump=await a.wait('state',v=>!!v.state.players[seat].rescue);
   assert.equal(jump.state.time,.08,'input starts the jump without advancing time');
   assert.equal(rolls,1);assert.deepEqual((await b.wait('state',v=>v.seq===jump.seq)).state,jump.state);
   const latest={type:'shot' as const,aim:.3,depth:.7,power:1,lob:false,critical:true,topspin:.6};
   const aim=captureSwipeAim(camera,latest,45,-150,390,844);
   (seat===0?a:b).send({type:'input',command:{...latest,swipeAim:aim}});
   await a.wait('state',v=>v.seq>jump.seq&&v.state.players[seat].strokeSpin===.6);
   pause.mock.restore();
   const hit=await a.wait('state',v=>v.state.rally===3&&v.state.ball.rescue);
   assert.deepEqual((await b.wait('state',v=>v.seq===hit.seq)).state,hit.state);
   assert.equal(hit.state.ball.topspin,.6);assert.equal(hit.state.ball.tier,'topspin');assert.equal(rolls,3);
   const target=bodyAimTarget(aim,hit.state.ball.aimOrigin,hit.state.ball.targetZ,sign);
   assert.ok(Math.abs(hit.state.ball.targetX-target)<1e-6,'latest body-centred direction survives the rescue');
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});
