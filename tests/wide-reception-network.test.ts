import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/app.js';

async function client(url:string){
 const ws=new WebSocket(url),messages:any[]=[];
 ws.on('message',raw=>messages.push(JSON.parse(String(raw))));
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,send:(value:object)=>ws.send(JSON.stringify(value)),async wait(predicate:(m:any)=>boolean){
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
   const index=messages.findIndex(predicate);
   if(index>=0)return messages.splice(index,1)[0];
   await new Promise(resolve=>setTimeout(resolve,5));
  }
  throw Error(`Timed out: ${JSON.stringify(messages.slice(-2))}`);
 }};
}

test('both peers share expanded manual runoff and actual mirrored corner-serve returns',async()=>{
 for(const wing of [-1,1]){
  const server=await createGameServer({port:0,host:'127.0.0.1'});
  const peers:Awaited<ReturnType<typeof client>>[]=[];
  try{
   const a=await client(server.wsUrl),b=await client(server.wsUrl);peers.push(a,b);
   a.send({type:'create',name:'wide-a',characterId:'lin'});
   const welcome=await a.wait(m=>m.type==='welcome');
   b.send({type:'join',code:welcome.code,name:'wide-b',characterId:'lin'});
   await b.wait(m=>m.type==='welcome');
   a.send({type:'ready'});b.send({type:'ready'});
   await a.wait(m=>m.type==='state');
   b.send({type:'input',command:{type:'move',x:wing*20,z:-10}});
   const atEdge=await b.wait(m=>m.type==='state'&&m.state.players[1].tx===wing*8&&Math.abs(m.state.players[1].x-wing*8)<.04);
   assert.deepEqual((await a.wait(m=>m.type==='state'&&m.seq===atEdge.seq)).state,atEdge.state);
   // Select the service court through the usual point reset; shots below
   // still enter through sockets and run with the authority's 60Hz clock.
   const match=server.rooms.rooms.get(welcome.code)!.match!;
   match.state.score=[wing<0?0:3,0];match.state.phase='point';match.state.pointTimer=0;
   const point=await a.wait(m=>m.type==='state'&&m.seq>atEdge.seq&&m.state.phase==='serve'&&Math.abs(m.state.players[1].x+wing*-1.5)<.01);
   a.send({type:'input',command:{type:'shot',aim:wing,depth:.6,power:1,critical:true,lob:false}});
   await b.wait(m=>m.type==='state'&&m.seq>point.seq&&m.state.rally===1);
   b.send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
   const hit=await a.wait(m=>m.type==='state'&&m.seq>point.seq&&(m.state.rally===2||m.state.phase==='point'));
   assert.equal(hit.state.rally,2);assert.equal(hit.state.ball.hitter,1);assert.equal(hit.state.ball.rescue,false);
   assert.ok(hit.state.players[1].contact.y>.25);
   assert.deepEqual((await b.wait(m=>m.type==='state'&&m.seq===hit.seq)).state,hit.state);
  }finally{peers.forEach(p=>p.ws.terminate());await server.close();}
 }
});
