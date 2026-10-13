/** Verify the live authority sends post-out bounce + wall reflection across reset. */
import {WebSocket} from 'ws';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import type {MatchState} from '../src/simulation/types.js';

const url=process.env.TEST_WS_URL??'ws://localhost:7470/ws';
const clients=[new WebSocket(url),new WebSocket(url)],packets=[new Map<number,string>(),new Map<number,string>()];
let code='',done=false,sent=false,shared=0;
let first:{id:number;x:number;y:number;age:number;bounces:number}|null=null;
let rose=false,afterReset=false,reflected=false,reportState:MatchState|null=null;
const requireCleanup=process.env.REQUIRE_CLEANUP==='1';
let settled=false,fading=false;
const removedSeats=new Set<number>();
const timer=setTimeout(()=>finish(Error('Dead-ball live motion not verified in 30 seconds')),30000);
const send=(seat:number,data:object)=>{if(clients[seat].readyState===WebSocket.OPEN)clients[seat].send(JSON.stringify(data));};
async function finish(error?:Error){
  if(done)return;done=true;clearTimeout(timer);
  for(let i=0;i<2;i++){send(i,{type:'leave'});clients[i].close();}
  if(error){console.error(error);process.exitCode=1;return;}
  const result={verifiedAt:new Date().toISOString(),url,first,rose,afterReset,reflected,sharedSnapshots:shared,
    ...(requireCleanup?{settled,fading,removedOnBothSeats:removedSeats.size===2}:{}),
    finalDeadBall:reportState!.deadBalls?.find(b=>b.id===first!.id),score:reportState!.score,
    scope:'Live authority, two independent local WebSocket seats, actual out first serve, ground bounce and wall reflection through second-serve reset.'};
  await writeFile(process.env.TEST_REPORT??'artifacts/dead-ball-live.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
clients.forEach((ws,seat)=>{
  ws.on('open',()=>{if(seat===0)send(0,{type:'create',name:'球运动验证A',characterId:'lin'});else if(code)send(1,{type:'join',code,name:'球运动验证B'});});
  ws.on('error',e=>void finish(e));
  ws.on('message',raw=>{
    if(done)return;
    try{
      const m=JSON.parse(String(raw));
      if(m.type==='error')throw Error(m.message);
      if(m.type==='welcome'&&seat===0){code=m.code;if(clients[1].readyState===WebSocket.OPEN)send(1,{type:'join',code,name:'球运动验证B'});}
      if(m.type==='room'&&!m.room.playing&&m.room.seats.every((p:any)=>p?.connected))send(seat,{type:'ready'});
      if(m.type!=='state')return;
      const state=m.state as MatchState,json=JSON.stringify(state),peer=packets[1-seat].get(m.seq);
      if(peer){assert.equal(peer,json);shared++;}
      packets[seat].set(m.seq,json);if(packets[seat].size>50)packets[seat].delete(packets[seat].keys().next().value!);
      if(requireCleanup&&first&&!state.deadBalls?.some(b=>b.id===first!.id)){
        removedSeats.add(seat);
        if(removedSeats.size===2){
          assert.ok(rose&&reflected&&afterReset&&settled&&fading);
          assert.deepEqual(state.score,[0,0],'cleanup is not a new point');
          reportState=state;void finish();
        }
      }
      if(seat!==0)return;
      if(!sent&&state.phase==='serve'){
        sent=true;send(0,{type:'input',command:{type:'shot',aim:0,depth:1,power:.7,lob:false,directionX:.4}});
      }
      const b=first?state.deadBalls?.find(b=>b.id===first!.id):state.deadBalls?.[0];
      if(b&&!first){assert.equal(state.fault,1);assert.deepEqual(state.score,[0,0]);first={id:b.id,x:b.x,y:b.y,age:b.age,bounces:b.bounces};}
      if(b&&first){
        assert.equal(b.id,first.id);assert.deepEqual(state.score,[0,0],'dead ball does not score twice');
        rose ||= b.y>first.y+.25;
        reflected ||= b.wallHits>0&&b.vx<0;
        afterReset ||= state.phase==='serve'&&state.fault===1&&b.age>1.2;
        settled ||= b.settled&&b.settledAt!==undefined;
        fading ||= b.settledAt!==undefined&&b.age-b.settledAt>.6;
        reportState=state;
        if(!requireCleanup&&rose&&reflected&&afterReset&&shared>10)void finish();
      }
    }catch(error){void finish(error as Error);}
  });
});
