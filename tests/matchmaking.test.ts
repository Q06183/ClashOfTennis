import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/app.js';

async function client(url:string){
  const ws=new WebSocket(url),messages:any[]=[];ws.on('message',data=>messages.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  return {ws,send:(value:unknown)=>ws.send(JSON.stringify(value)),async wait(type:string,predicate:(message:any)=>boolean=()=>true){
    const until=Date.now()+2500;while(Date.now()<until){const i=messages.findIndex(message=>message.type===type&&predicate(message));if(i>=0)return messages.splice(i,1)[0];await new Promise(resolve=>setTimeout(resolve,10));}
    throw new Error(`Timed out waiting for ${type}: ${JSON.stringify(messages)}`);
  }};
}

test('two searching players are paired and their match starts automatically',async()=>{
  const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
  try{
    a.send({type:'match',name:'甲',characterId:'mei'});assert.equal((await a.wait('matchmaking')).searching,true);
    b.send({type:'match',name:'乙',characterId:'leo'});
    const wa=await a.wait('welcome'),wb=await b.wait('welcome');
    assert.equal(wa.code,wb.code);assert.deepEqual([wa.seat,wb.seat],[0,1]);assert.equal(wa.matched,true);assert.equal(wb.matched,true);
    const room=await a.wait('room',message=>message.room.playing);
    assert.deepEqual(room.room.seats.map((seat:any)=>seat.name),['甲','乙']);
    const stateA=await a.wait('state'),stateB=await b.wait('state',message=>message.seq===stateA.seq);
    assert.deepEqual(stateA.state,stateB.state);assert.deepEqual(stateA.state.players.map((player:any)=>player.characterId),['mei','leo']);
  }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('a disconnected searcher is removed from the matchmaking queue',async()=>{
  const server=await createGameServer({port:0,host:'127.0.0.1'}),gone=await client(server.wsUrl),b=await client(server.wsUrl),c=await client(server.wsUrl);
  try{
    gone.send({type:'match',name:'已离开'});await gone.wait('matchmaking');gone.ws.close();await new Promise(resolve=>setTimeout(resolve,30));
    b.send({type:'match',name:'仍在等'});await b.wait('matchmaking');c.send({type:'match',name:'新对手'});
    const wb=await b.wait('welcome'),wc=await c.wait('welcome');assert.equal(wb.code,wc.code);
  }finally{gone.ws.terminate();b.ws.terminate();c.ws.terminate();await server.close();}
});
