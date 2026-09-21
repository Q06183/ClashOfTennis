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
