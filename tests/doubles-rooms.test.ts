import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/app.js';
async function client(url:string){
 const ws=new WebSocket(url),messages:any[]=[];
 ws.on('message',raw=>messages.push(JSON.parse(raw.toString())));
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,send:(v:unknown)=>ws.send(JSON.stringify(v)),async wait(type:string,predicate:(m:any)=>boolean=()=>true){
  const until=Date.now()+3000;
  while(Date.now()<until){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}
  throw Error(`Waiting ${type}: ${JSON.stringify(messages.slice(-2))}`);
 }};
}
test('host assigns same-team humans and bots, all clients share court and four-player state',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',mode:'doubles',surface:'clay',format:'standard',name:'甲'});
  const wa=await a.wait('welcome');b.send({type:'join',code:wa.code,name:'乙'});await b.wait('welcome');
  const initial=await a.wait('room',m=>m.room.seats[1]?.name==='乙');
  assert.equal(initial.room.seats.length,4);assert.equal(initial.room.host,0);
  b.send({type:'configure',surface:'grass'});assert.match((await b.wait('error')).message,/房主/);
  a.send({type:'configure',move:{from:1,to:2}});
  const moved=await b.wait('welcome',m=>m.seat===2);
  a.send({type:'configure',bot:{seat:1,enabled:true,characterId:'mei'}});
  a.send({type:'configure',bot:{seat:3,enabled:true,characterId:'leo'}});
  const filled=await a.wait('room',m=>m.room.seats[3]?.bot);
  assert.equal(filled.room.seats[2].name,'乙');assert.equal(filled.room.surface,'clay');
  a.send({type:'ready'});await b.wait('room',m=>m.room.seats[0]?.ready);
  a.send({type:'configure',surface:'grass'});
  const changed=await b.wait('room',m=>m.room.surface==='grass');
  assert.equal(changed.room.seats[0].ready,false);
  a.send({type:'ready'});b.send({type:'ready'});
  const start=await a.wait('state'),same=await b.wait('state',m=>m.seq===start.seq);
  assert.deepEqual(start.state,same.state);assert.equal(start.state.mode,'doubles');assert.equal(start.state.surface,'grass');
  assert.equal(start.state.scoring.format,'standard');assert.equal(start.state.players.length,4);
  a.send({type:'configure',surface:'hard'});assert.match((await a.wait('error')).message,/比赛/);
  b.ws.close();await a.wait('room',m=>m.room.paused);
  const resumed=await client(server.wsUrl);
  try{
   resumed.send({type:'resume',code:wa.code,token:moved.token});
   assert.equal((await resumed.wait('welcome')).seat,2);await a.wait('room',m=>!m.room.paused);
  }finally{resumed.ws.terminate();}
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});
test('one human and three server bots can start; bots cannot be resumed using public metadata',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),guest=await client(server.wsUrl);
 try{
  a.send({type:'create',mode:'doubles',surface:'clay'});const w=await a.wait('welcome');
  for(const seat of [1,2,3])a.send({type:'configure',bot:{seat,enabled:true}});
  const filled=await a.wait('room',m=>m.room.seats[3]?.bot);
  assert.ok(!JSON.stringify(filled.room).includes('token'));
  guest.send({type:'resume',code:w.code,token:''});assert.match((await guest.wait('error')).message,/恢复/);
  a.send({type:'ready'});const state=await a.wait('state');assert.equal(state.paused,false);
  a.send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
  const returned=await a.wait('state',m=>m.state.rally>=2);
  assert.equal(returned.state.ball.hitter,1);
 }finally{a.ws.terminate();guest.ws.terminate();await server.close();}
});
test('full human doubles room rejects fifth player and replacing humans; host moves with their seat',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'}),clients=await Promise.all(Array.from({length:5},()=>client(server.wsUrl)));
 try{
  clients[0].send({type:'create',mode:'doubles'});const w=await clients[0].wait('welcome');
  for(let i=1;i<4;i++){clients[i].send({type:'join',code:w.code,name:`p${i}`});assert.equal((await clients[i].wait('welcome')).seat,i);}
  clients[4].send({type:'join',code:w.code});assert.match((await clients[4].wait('error')).message,/满/);
  clients[0].send({type:'configure',bot:{seat:1,enabled:true}});assert.match((await clients[0].wait('error')).message,/真人/);
  clients[0].send({type:'configure',move:{from:0,to:3}});
  const moved=await clients[0].wait('welcome',m=>m.seat===3);assert.equal(moved.token,w.token);
  assert.equal((await clients[0].wait('room',m=>m.room.host===3)).room.seats[0].name,'p3');
  for(const c of clients.slice(0,4))c.send({type:'ready'});
  const start=await clients[0].wait('state');
  for(const c of clients.slice(1,4))assert.deepEqual((await c.wait('state',m=>m.seq===start.seq)).state,start.state);
 }finally{clients.forEach(c=>c.ws.terminate());await server.close();}
});
test('quick matchmaking only pairs equal selected surfaces',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'}),clients=await Promise.all(Array.from({length:4},()=>client(server.wsUrl)));
 try{
  clients[0].send({type:'match',surface:'clay'});await clients[0].wait('matchmaking');
  clients[1].send({type:'match',surface:'grass'});await clients[1].wait('matchmaking');
  clients[2].send({type:'match',surface:'clay'});
  const a=await clients[0].wait('welcome'),c=await clients[2].wait('welcome');assert.equal(a.code,c.code);
  clients[3].send({type:'match',surface:'grass'});
  const b=await clients[1].wait('welcome'),d=await clients[3].wait('welcome');assert.equal(b.code,d.code);assert.notEqual(a.code,b.code);
  assert.equal((await clients[0].wait('state')).state.surface,'clay');
  assert.equal((await clients[1].wait('state')).state.surface,'grass');
 }finally{clients.forEach(c=>c.ws.terminate());await server.close();}
});
test('bot character edits stay seat-specific, synchronize guests and are used by the next match',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',mode:'doubles',characterId:'lin'});const w=await a.wait('welcome');
  b.send({type:'join',code:w.code,characterId:'sora'});await b.wait('welcome');
  a.send({type:'configure',move:{from:1,to:2}});await b.wait('welcome',m=>m.seat===2);
  for(const seat of [1,3])a.send({type:'configure',bot:{seat,enabled:true,characterId:'lin'}});
  await b.wait('room',m=>m.room.seats[3]?.bot);
  a.send({type:'ready'});await b.wait('room',m=>m.room.seats[0]?.ready);
  b.send({type:'configure',bot:{seat:1,enabled:true,characterId:'rafa'}});
  assert.match((await b.wait('error')).message,/房主/);
  a.send({type:'configure',bot:{seat:1,enabled:true,characterId:'mei'}});
  const changed=await b.wait('room',m=>m.room.seats[1]?.characterId==='mei');
  assert.deepEqual(changed.room.seats.map((s:any)=>s.characterId),['lin','mei','sora','lin']);
  assert.ok(changed.room.seats.every((s:any)=>!s.ready));
  a.send({type:'configure',bot:{seat:3,enabled:true,characterId:'leo'}});
  await b.wait('room',m=>m.room.seats[3]?.characterId==='leo');
  a.send({type:'ready'});b.send({type:'ready'});
  const state=await a.wait('state'),same=await b.wait('state',m=>m.seq===state.seq);
  assert.deepEqual(state.state,same.state);
  assert.deepEqual(state.state.players.map((p:any)=>p.characterId),['lin','mei','sora','leo']);
  a.send({type:'configure',bot:{seat:1,enabled:true,characterId:'rafa'}});
  assert.match((await a.wait('error')).message,/比赛/);
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});
