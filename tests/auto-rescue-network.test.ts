import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/app.js';
import {Match} from '../src/simulation/match.js';
import {RESCUE} from '../src/simulation/rescue.js';
import {handedness} from '../src/simulation/characters.js';
import {rescueIncoming} from './helpers/rescue-incoming.js';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function client(url:string){
 const ws=new WebSocket(url),messages:any[]=[];
 ws.on('message',raw=>messages.push(JSON.parse(String(raw))));
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,messages,send:(v:object)=>ws.send(JSON.stringify(v)),async wait(type:string,predicate=(m:any)=>true){
  for(let i=0;i<400;i++){const index=messages.findIndex(m=>m.type===type&&predicate(m));if(index>=0)return messages.splice(index,1)[0];await sleep(10);}
  throw Error(`Timeout ${type}: ${JSON.stringify(messages.slice(-1))}`);
 }};
}
test('both clients see ordinary nearby returns instead of an unnecessary automatic rescue',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'near A'});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'near B'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(welcome.code)!;
  for(const id of ['lin','noah'])for(const seat of [0,1] as const){
   room.match!.dispose();let draws=0;
   const m=room.match=new Match([id,id],()=>{draws++;return 0;}),sign=seat===0?1:-1,hand=handedness(id);
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(m.state.players[seat],{x:0,z:10*sign,tx:0,tz:10*sign,vx:0,vz:0,
    stamina:.7,totalStamina:1,preparation:undefined,backhand:false});
   m.physics.place({x:1.8*sign*hand,y:1.7,z:6*sign},{x:0,y:1,z:9*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   a.messages.length=0;b.messages.length=0;
   (seat===0?a:b).send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
   const hit=await a.wait('state',v=>v.state.rally===3);
   assert.deepEqual((await b.wait('state',v=>v.seq===hit.seq)).state,hit.state);
   assert.equal(hit.state.ball.rescue,false);assert.equal(hit.state.ball.hitter,seat);
   assert.equal(hit.state.players[seat].rescue,undefined);assert.equal(draws,0);
   assert.equal(m.rescueDiagnostics.started,0);
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});
test('automatic hold synchronizes both clients, accepts only the receiver, and times out without a fabricated return',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'自动救球A'});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'自动救球B'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(welcome.code)!;
  for(const seat of [0,1] as const)for(const success of [true,false]){
   room.match!.dispose();let rolls=0;const m=room.match=new Match(['lin','lin'],()=>{rolls++;return 0;});
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   const p=m.state.players[seat],sign=seat===0?1:-1;
   Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,stamina:.08,totalStamina:1});
   rescueIncoming(m,seat);
   a.messages.length=0;b.messages.length=0;
   // No input at all until after the automatic dive has reached the ball.
   const hold=await a.wait('state',v=>!!v.state.rescueWindow);
   assert.deepEqual((await b.wait('state',v=>v.seq===hold.seq)).state,hold.state);
   assert.equal(rolls,1);assert.equal(hold.state.rescueWindow.seat,seat);
   const shooter=seat===0?a:b,opponent=seat===0?b:a;
   opponent.send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
   shooter.send({type:'input',command:{type:'move',x:5,z:14*sign}});
   const later=await a.wait('state',v=>v.seq>hold.seq&&v.state.rescueWindow?.remaining<hold.state.rescueWindow.remaining-.06);
   assert.equal(later.state.time,hold.state.time);
   assert.deepEqual(later.state.ball,hold.state.ball);assert.deepEqual(later.state.players,hold.state.players);
   if(success){
    shooter.send({type:'input',command:{type:'shot',aim:.2,depth:.55,power:.7,lob:false}});
    const hit=await a.wait('state',v=>v.state.rally===3);
    assert.deepEqual((await b.wait('state',v=>v.seq===hit.seq)).state,hit.state);
    assert.equal(hit.state.rescueWindow,undefined);assert.equal(hit.state.ball.rescue,true);
    const c=hit.state.players[seat].contact;
    assert.deepEqual(c,{x:hold.state.ball.x,y:hold.state.ball.y,z:hold.state.ball.z});assert.equal(rolls,1);
   }else{
    const expired=await a.wait('state',v=>v.seq>later.seq&&!v.state.rescueWindow);
    assert.deepEqual((await b.wait('state',v=>v.seq===expired.seq)).state,expired.state);
    assert.equal(expired.state.rally,2);assert.equal(expired.state.ball.hitter,seat===0?1:0);
    assert.ok(expired.state.ball.z*sign>=hold.state.ball.z*sign);
    assert.equal(rolls,1);assert.equal(expired.state.players[seat].rescue.missed,true);
   }
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});
test('disconnect pauses the contact countdown and resume does not clear the remaining chance',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 let resumed:Awaited<ReturnType<typeof client>>|undefined;
 try{
  a.send({type:'create',name:'A'});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'B'});const peer=await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(welcome.code)!;room.match!.dispose();
  const m=room.match=new Match(['lin','lin'],()=>0);m.state.phase='rally';m.state.rally=2;m.step(.08);
  Object.assign(m.state.players[1],{x:0,z:-10,tx:0,tz:-10,stamina:.08,totalStamina:1});rescueIncoming(m,1);
  await a.wait('state',v=>!!v.state.rescueWindow);b.ws.terminate();
  const paused=await a.wait('state',v=>v.paused);const remaining=paused.state.rescueWindow.remaining;
  await sleep(180);assert.equal(m.state.rescueWindow!.remaining,remaining);
  resumed=await client(server.wsUrl);resumed.send({type:'resume',code:welcome.code,token:peer.token});await resumed.wait('welcome');
  resumed.send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
  const hit=await a.wait('state',v=>v.state.rally===3);
  assert.equal(hit.state.ball.hitter,1);assert.equal(hit.state.rescueWindow,undefined);
  assert.deepEqual((await resumed.wait('state',v=>v.seq===hit.seq)).state,hit.state);
 }finally{a.ws.terminate();b.ws.terminate();resumed?.ws.terminate();await server.close();}
});

test('short momentum rescue serializes launch velocity and preserves the half-second physical hold',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'short A'});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'short B'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(welcome.code)!;
  for(const seat of [0,1] as const){
   room.match!.dispose();let rolls=0;
   const m=room.match=new Match(['lin','lin'],()=>{rolls++;return 0;}),sign=seat===0?1:-1,p=m.state.players[seat];
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:0,z:10*sign,tx:1.15*sign,tz:10*sign,vx:-3*sign,vz:0,
    stamina:.15,totalStamina:.15,preparation:undefined,backhand:false});
   m.physics.place({x:1.15*sign,y:1.7,z:5.95*sign},{x:0,y:1,z:9*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   a.messages.length=0;b.messages.length=0;
   const hold=await a.wait('state',v=>!!v.state.rescueWindow);
   assert.deepEqual((await b.wait('state',v=>v.seq===hold.seq)).state,hold.state);
   const r=hold.state.players[seat].rescue;
   assert.equal(r.short,true);assert.ok(Number.isFinite(r.launchVx));assert.equal(r.fromZ,r.toZ);
   assert.equal(rolls,1);assert.ok(hold.state.rescueWindow.remaining<=.5);
   (seat===0?a:b).send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
   const hit=await a.wait('state',v=>v.state.rally===3);
   assert.deepEqual((await b.wait('state',v=>v.seq===hit.seq)).state,hit.state);
   assert.equal(hit.state.ball.rescue,true);assert.equal(m.rescueDiagnostics.contact,1);
   assert.equal(rolls,1);
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});

test('both clients see short landing unlock and long get-up at the displaced position before new movement',async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
 try{
  a.send({type:'create',name:'landing A'});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'landing B'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait('state');
  const room=server.rooms.rooms.get(welcome.code)!;
  for(const seat of [0,1] as const)for(const short of [true,false]){
   room.match!.dispose();const m=room.match=new Match(['lin','lin'],()=>0),sign=seat===0?1:-1,p=m.state.players[seat];
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,vx:0,vz:0,stamina:.08,totalStamina:1,preparation:undefined,backhand:false});
   if(short){
    Object.assign(p,{tx:1.15*sign,vx:-3*sign,stamina:.15,totalStamina:.15});
    m.physics.place({x:1.15*sign,y:1.7,z:5.95*sign},{x:0,y:1,z:9*sign});
    Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   }else rescueIncoming(m,seat);
   a.messages.length=0;b.messages.length=0;
   const hold=await a.wait('state',v=>!!v.state.rescueWindow),r=hold.state.players[seat].rescue;
   assert.equal(r.short,short);assert.equal(r.recovery,short?'step-out':'supported-fall');
   const shooter=seat===0?a:b;
   shooter.send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
   const hit=await a.wait('state',v=>v.state.rally===3);
   assert.equal(hit.state.ball.rescue,true);
   if(!short){
    const rise=r.startedAt+r.travel+RESCUE.riseAt-RESCUE.travel;
    const recovering=await a.wait('state',v=>v.state.time>=rise+.25);
    assert.ok(recovering.state.players[seat].rescue,'big jump is still locked halfway through its .5s get-up');
    assert.equal(recovering.state.players[seat].x,r.toX);
    assert.deepEqual((await b.wait('state',v=>v.seq===recovering.seq)).state,recovering.state);
   }
   const free=await a.wait('state',v=>v.seq>hit.seq&&!v.state.players[seat].rescue);
   const expected=r.startedAt+r.travel+(short?RESCUE.landAt:RESCUE.duration)-RESCUE.travel;
   assert.ok(free.state.time>=expected-1e-9&&free.state.time<expected+.07,'first free snapshot follows the correct boundary');
   assert.equal(free.state.players[seat].x,r.toX);assert.equal(free.state.players[seat].tx,r.toX);
   assert.deepEqual((await b.wait('state',v=>v.seq===free.seq)).state,free.state);
   const idle=await a.wait('state',v=>v.state.time>free.state.time+.12);
   assert.equal(idle.state.phase,'rally');assert.equal(idle.state.players[seat].x,r.toX,'no stale-target return');
   shooter.send({type:'input',command:{type:'move',x:r.toX+sign,z:r.toZ}});
   const moved=await a.wait('state',v=>v.seq>idle.seq&&(v.state.players[seat].x-r.toX)*sign>.03);
   assert.deepEqual((await b.wait('state',v=>v.seq===moved.seq)).state,moved.state);
   assert.ok(Math.abs(moved.state.players[seat].x-r.toX)<.3,'normal acceleration, not a position reset');
  }
 }finally{a.ws.terminate();b.ws.terminate();await server.close();}
});
