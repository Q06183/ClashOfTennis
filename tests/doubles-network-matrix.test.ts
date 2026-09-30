import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/app.js';
import {aiInput} from '../src/simulation/ai.js';
import type {MatchState,Seat} from '../src/simulation/types.js';
import {mkdir,writeFile} from 'node:fs/promises';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function client(url:string){
 const ws=new WebSocket(url),messages:any[]=[];let state:MatchState|undefined;
 ws.on('message',raw=>{const m=JSON.parse(raw.toString());messages.push(m);if(m.type==='state')state=m.state;});
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,messages,get state(){return state;},send:(v:unknown)=>ws.send(JSON.stringify(v)),async wait(type:string,predicate:(m:any)=>boolean=()=>true){
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await sleep(5);}
  throw Error(`waiting ${type}: ${JSON.stringify(messages.slice(-1))}`);
 }};
}
test('1-4 websocket humans, same/opposite teams, all surfaces and both scoring formats share complete matches and rematches',async()=>{
 const results=[];
 for(const [count,surface,format,sameTeam] of [
  [1,'hard','tiebreak',false],
  [2,'clay','tiebreak',true],
  [2,'grass','tiebreak',false],
  [3,'hard','tiebreak',false],
  [4,'clay','tiebreak',false],
  [4,'grass','standard',false],
 ] as const){
  const server=await createGameServer({port:0,host:'127.0.0.1'}),clients=await Promise.all(Array.from({length:count},()=>client(server.wsUrl)));
  try{
   clients[0].send({type:'create',mode:'doubles',surface,format,name:'p0'});
   const w=await clients[0].wait('welcome'),seats:Seat[]=[0];
   for(let i=1;i<count;i++){clients[i].send({type:'join',code:w.code,name:`p${i}`});seats.push((await clients[i].wait('welcome')).seat);}
   if(sameTeam){clients[0].send({type:'configure',move:{from:1,to:2}});seats[1]=(await clients[1].wait('welcome',m=>m.seat===2)).seat;}
   for(const seat of [0,1,2,3])if(!seats.includes(seat as Seat))clients[0].send({type:'configure',bot:{seat,enabled:true}});
   await clients[0].wait('room',m=>m.room.seats.every((s:any)=>s?.connected));
   for(const c of clients)c.send({type:'ready'});
   await clients[0].wait('state');
   const room=server.rooms.rooms.get(w.code)!;
   // Wall clock is compressed for long standard sets; actual inputs still
   // enter over real sockets, and all simulation/AI runs via Rooms.tick.
   let ticks=0,synchronized=0,invalid=0;
   const playing=()=>room.match!.state.phase!=='over';
   while(playing()&&ticks<60*1800){
    for(let batch=0;batch<8&&playing();batch++){
     const state=room.match!.state;
     clients.forEach((c,i)=>{
      const input=aiInput(state,seats[i],'standard');
      if(input)c.send({type:'input',command:input});
     });
     // This is only an input rate-window time adapter, not simulation state.
     for(const peer of server.rooms.peers.values()){peer.lastInput=0;peer.count=0;}
     await sleep(1);
     server.rooms.tick(1/60,true);ticks++;
    }
    await sleep(1);
    const shared=clients[0].messages.filter(m=>m.type==='state').at(-2);
    if(shared){
     for(const c of clients.slice(1)){
      const peer=c.messages.find(m=>m.type==='state'&&m.seq===shared.seq);
      if(peer){assert.deepEqual(peer.state,shared.state);synchronized++;}
     }
     for(const c of clients)c.messages.splice(0,Math.max(0,c.messages.length-30));
    }
    invalid+=clients.reduce((n,c)=>n+c.messages.filter(m=>m.type==='error').length,0);
   }
   assert.equal(room.match!.state.phase,'over',`${count}/${surface}/${format}: ${JSON.stringify(room.match!.state.scoring)}`);
   assert.equal(invalid,0);assert.ok(room.match!.state.maxRally>=3);
   if(count>1)assert.ok(synchronized>0);
   const final=structuredClone(room.match!.state);
   await sleep(15);
   for(const c of clients)c.send({type:'ready'});
   const next=await clients[0].wait('state',m=>m.state.phase==='serve'&&m.state.time<1);
   assert.deepEqual(next.state.score,[0,0]);assert.deepEqual(next.state.scoring.games,[0,0]);
   assert.equal(next.state.surface,surface);assert.equal(next.state.players.length,4);
   results.push({humans:count,seats,surface,format,score:final.score,games:final.scoring?.games,maxRally:final.maxRally,time:final.time,synchronized,rematch:true});
  }finally{clients.forEach(c=>c.ws.terminate());await server.close();}
 }
 await mkdir('artifacts/doubles-surfaces-2026-09-30',{recursive:true});
 await writeFile('artifacts/doubles-surfaces-2026-09-30/network-matrix.json',JSON.stringify(results,null,2));
});
