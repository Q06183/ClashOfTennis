import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WebSocket} from 'ws';
import {Rooms} from '../server/rooms.js';
import {initPhysics} from '../src/simulation/physics.js';
import {Match} from '../src/simulation/match.js';
import {aiInput} from '../src/simulation/ai.js';

before(initPhysics);
class InProcessSocket extends EventEmitter {
 readyState:number=WebSocket.OPEN;
 bufferedAmount=0;
 messages:any[]=[];
 send(bytes:string){this.messages.push(JSON.parse(bytes));}
 ping(){this.emit('pong');}
 close(){this.readyState=WebSocket.CLOSED;this.emit('close');}
 terminate(){this.close();}
 input(message:unknown){this.emit('message',Buffer.from(JSON.stringify(message)));}
 last(type:string){return this.messages.filter(m=>m.type===type).at(-1);}
}
test('in-process authoritative protocol retains hidden identities through locked play, resume and rematch',()=>{
 const rooms=new Rooms(),a=new InProcessSocket(),b=new InProcessSocket(),resumed=new InProcessSocket();
 try{
  rooms.add(a as unknown as WebSocket);rooms.add(b as unknown as WebSocket);
  a.input({type:'create',name:'A',characterId:'wuming'});
  const first=a.last('welcome');assert.ok(first);
  b.input({type:'join',name:'B',code:first.code,characterId:'lin'});
  assert.equal(b.last('room').room.seats[0].characterId,'wuming');
  b.input({type:'select-character',characterId:'not-a-player'});assert.match(b.last('error').message,/角色/);
  a.input({type:'select-character',characterId:'lin'});assert.equal(b.last('room').room.seats[0].characterId,'lin');
  a.input({type:'select-character',characterId:'wuming'});
  a.input({type:'ready'});b.input({type:'ready'});rooms.tick(1/60,true);
  assert.deepEqual(a.last('state'),b.last('state'));
  assert.deepEqual(a.last('state').state.players.map((p:any)=>p.characterId),['wuming','lin']);
  a.input({type:'select-character',characterId:'lin'});assert.match(a.last('error').message,/比赛/);
  a.input({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
  for(let i=0;i<80;i++)rooms.tick(1/60,true);
  assert.ok(a.last('state').state.rally>=1);assert.deepEqual(a.last('state'),b.last('state'));
  a.close();rooms.tick(1/60,true);assert.equal(b.last('state').paused,true);
  const frozen=b.last('state').state;
  for(let i=0;i<20;i++)rooms.tick(1/60,true);
  assert.deepEqual(b.last('state').state,frozen);
  rooms.add(resumed as unknown as WebSocket);
  resumed.input({type:'resume',code:first.code,token:first.token});rooms.tick(1/60,true);
  assert.equal(resumed.last('state').paused,false);
  assert.equal(resumed.last('state').state.players[0].characterId,'wuming');
  rooms.rooms.get(first.code)!.match!.finish(0,'测试重赛');
  resumed.input({type:'ready'});b.input({type:'ready'});rooms.tick(1/60,true);
  const reset=resumed.last('state').state;
  assert.deepEqual(reset.score,[0,0]);assert.equal(reset.phase,'serve');
  assert.deepEqual(reset.players.map((p:any)=>p.characterId),['wuming','lin']);
  assert.deepEqual(resumed.last('state'),b.last('state'));
 }finally{rooms.dispose();}
});
test('all-99 player completes a real AI match on either seat with finite legal state',()=>{
 for(const ids of [['wuming','lin'],['lin','wuming'],['wuming','wuming']] as const){
  let seed=11;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const match=new Match(ids,random);
  try{
   let ticks=0;
   while(match.state.phase!=='over'&&ticks++<60*1800){
    for(const seat of [0,1] as const){const command=aiInput(match.state,seat,'standard');if(command)match.input(seat,command);}
    match.step(1/60);
    if(ticks%60===0){
     for(const player of match.state.players)assert.ok(Number.isFinite(player.x)&&Number.isFinite(player.z)&&player.stamina>=0&&player.stamina<=1);
     assert.ok(Object.values(match.state.ball).filter(v=>typeof v==='number').every(Number.isFinite));
    }
   }
   assert.equal(match.state.phase,'over',`${ids} did not finish: ${match.state.score}`);
   assert.ok(Math.max(...match.state.score)>=7);
   assert.ok(Math.abs(match.state.score[0]-match.state.score[1])>=2);
   assert.deepEqual(match.state.players.map(p=>p.characterId),ids);
  }finally{match.dispose();}
 }
});
