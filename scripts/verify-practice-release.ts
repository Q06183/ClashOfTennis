/** Bounded real-WebSocket release smoke: serves, faults, full score and rematch.
 * The existing AI-vs-AI verifier can sustain a rally for many minutes. This
 * intentionally does not return balls and is not a difficulty/balance test. */
import {WebSocket} from 'ws';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import type {MatchState} from '../src/simulation/types.js';

const url=process.env.TEST_WS_URL??'ws://localhost:7470/ws';
const clients=[new WebSocket(url),new WebSocket(url)];
const snapshots=[new Map<number,string>(),new Map<number,string>()];
let code='',round=0,done=false,shared=0,first:number[]|null=null;
const lastServe=[-1,-1],started=Date.now();
const timeout=setTimeout(()=>finish(Error('Controlled match timed out in 120s')),120000);
const send=(seat:number,message:object)=>{if(clients[seat].readyState===WebSocket.OPEN)clients[seat].send(JSON.stringify(message));};
async function finish(error?:Error){
  if(done)return;done=true;clearTimeout(timeout);
  for(let i=0;i<2;i++){send(i,{type:'leave'});clients[i].close();}
  if(error){console.error(error);process.exitCode=1;return;}
  const report={verifiedAt:new Date().toISOString(),url,firstScore:first,sharedSnapshots:shared,
    rematchReset:true,wallSeconds:Math.round((Date.now()-started)/1000),
    scope:'Two independent local WebSocket seats; controlled legal serves versus deliberate faults, no returns. Not phone, network-distance or AI balance acceptance.'};
  const output=process.env.TEST_REPORT??'artifacts/product-review-controlled-network.json';
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
clients.forEach((ws,seat)=>{
  ws.on('open',()=>{if(seat===0)send(0,{type:'create',name:'发布验证A',characterId:'lin'});else if(code)send(1,{type:'join',code,name:'发布验证B',characterId:'lin'});});
  ws.on('error',error=>void finish(error));
  ws.on('message',raw=>{
    if(done)return;
    try{
      const m=JSON.parse(String(raw));
      if(m.type==='error')throw Error(m.message);
      if(m.type==='welcome'&&seat===0){code=m.code;if(clients[1].readyState===WebSocket.OPEN)send(1,{type:'join',code,name:'发布验证B',characterId:'lin'});}
      if(m.type==='room'&&!m.room.playing&&m.room.seats.every((p:any)=>p?.connected))send(seat,{type:'ready'});
      if(m.type!=='state')return;
      const state=m.state as MatchState,serialized=JSON.stringify(state);
      const peer=snapshots[1-seat].get(m.seq);
      if(peer){assert.equal(peer,serialized,'both seats receive the same authoritative state');shared++;}
      snapshots[seat].set(m.seq,serialized);
      if(snapshots[seat].size>40)snapshots[seat].delete(snapshots[seat].keys().next().value!);
      if(state.phase==='over'){
        assert.deepEqual(state.score,[7,0]);first=[...state.score];
        if(round===0){round=1;send(0,{type:'ready'});send(1,{type:'ready'});}
      }else if(round===1){
        assert.deepEqual(state.score,[0,0]);assert.equal(state.server,0);assert.equal(state.phase,'serve');
        assert.ok(shared>10);void finish();
      }else if(state.phase==='serve'&&state.server===seat&&!state.players[seat].preparation&&state.eventId!==lastServe[seat]){
        lastServe[seat]=state.eventId;
        send(seat,{type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false,...(seat===1?{directionX:4}:{})}});
      }
    }catch(error){void finish(error as Error);}
  });
});
