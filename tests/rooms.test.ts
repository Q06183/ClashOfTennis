import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/app.js';

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
  assert.deepEqual(hit.state,hitB.state);assert.equal(hit.state.ball.critical,false);assert.ok(Math.hypot(hit.state.ball.vx,hit.state.ball.vz)<14);assert.equal(hit.state.event,'极限救球');
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

test('both sockets receive the same weak low volley before its incoming ball touches the floor',async()=>{
 const {Match}=await import('../src/simulation/match.js');const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{a.send({type:'create',name:'低球A'});const welcome=await a.wait('welcome');b.send({type:'join',code:welcome.code,name:'低球B'});await b.wait('welcome');a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');const room=server.rooms.rooms.get(welcome.code)!;
 for(const seat of [0,1] as const){room.match!.dispose();const m=room.match=new Match(['lin','lin'],()=>1),sign=seat===0?1:-1;m.state.phase='rally';m.state.rally=2;m.step(.08);Object.assign(m.state.players[seat],{x:0,z:11*sign,tx:0,tz:11*sign,vx:0,vz:0});m.physics.place({x:.3*sign,y:.18,z:10.95*sign},{x:0,y:-3,z:5*sign});Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:0});a.messages.length=0;b.messages.length=0;
 // Deliver through the actual protocol before advancing this deterministic low window.
 (seat===0?a:b).send({type:'input',command:{type:'shot',aim:0,depth:.8,power:1,critical:true,lob:false}});
 const hit=await a.wait('state',v=>v.state.rally===3&&v.state.ball.skill==='volley'),peer=await b.wait('state',v=>v.seq===hit.seq);assert.deepEqual(hit.state,peer.state);assert.equal(hit.state.ball.critical,false);assert.ok(hit.state.players[seat].contact.y<.25);
 }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});
