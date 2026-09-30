import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/app.js';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function client(url:string){
 const ws=new WebSocket(url),messages:any[]=[];ws.on('message',raw=>messages.push(JSON.parse(raw.toString())));
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,send:(v:unknown)=>ws.send(JSON.stringify(v)),async wait(type:string,predicate:(m:any)=>boolean=()=>true){
  const deadline=Date.now()+2500;
  while(Date.now()<deadline){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await sleep(10);}
  throw Error(`timeout ${type}: ${JSON.stringify(messages.slice(-1))}`);
 }};
}
test('active standard doubles is not deleted by the old 15-minute lobby age',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl);
 try{
  a.send({type:'create',mode:'doubles',format:'standard'});const w=await a.wait('welcome');
  for(const seat of [1,2,3])a.send({type:'configure',bot:{seat,enabled:true}});
  await a.wait('room',m=>m.room.seats[3]?.bot);a.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(w.code)!;room.updated=Date.now()-901000;
  server.rooms.tick(1/60,true);
  assert.equal(server.rooms.rooms.has(w.code),true,'playing standard set must not expire as an idle lobby');
 }finally{a.ws.terminate();await server.close();}
});
test('host departure migrates authority, same-team seat timeout awards opponents and next game keeps settings',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1',reconnectMs:150}),a=await client(server.wsUrl),b=await client(server.wsUrl),c=await client(server.wsUrl);
 try{
  a.send({type:'create',mode:'doubles',surface:'grass'});const w=await a.wait('welcome');
  b.send({type:'join',code:w.code});await b.wait('welcome');c.send({type:'join',code:w.code});await c.wait('welcome');
  a.send({type:'configure',bot:{seat:3,enabled:true}});await c.wait('room',m=>m.room.seats[3]?.bot);
  for(const p of [a,b,c])p.send({type:'ready'});
  await c.wait('state');c.ws.close();
  const over=await b.wait('state',m=>m.state.phase==='over');
  assert.equal(over.state.winner,1,'seat 2 is on team 0');
  a.send({type:'leave'});const lobby=await b.wait('room',m=>m.room.host===1);
  assert.equal(lobby.room.surface,'grass');
  b.send({type:'configure',bot:{seat:0,enabled:true}});
  b.send({type:'configure',bot:{seat:2,enabled:true}});
  await b.wait('room',m=>m.room.seats[0]?.bot&&m.room.seats[2]?.bot);
  b.send({type:'ready'});
  const next=await b.wait('state',m=>m.state.phase==='serve');
  assert.deepEqual(next.state.score,[0,0]);assert.equal(next.state.surface,'grass');
  assert.equal(next.state.players.length,4);
 }finally{a.ws.terminate();b.ws.terminate();c.ws.terminate();await server.close();}
});
