/** Deployment smoke: real sockets/clock, no injected state or forced RNG. */
import {WebSocket} from 'ws';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.GAME_URL??'http://127.0.0.1:7470';
const output=process.env.VERIFY_DIR??'artifacts/wide-reception-deploy-2026-09-30/live';
const root=process.env.BUILD_ROOT??'dist';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function client(){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages:any[]=[];
 ws.on('message',raw=>messages.push(JSON.parse(String(raw))));
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,send:(value:object)=>ws.send(JSON.stringify(value)),async wait(predicate:(m:any)=>boolean){
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
   const i=messages.findIndex(predicate);if(i>=0)return messages.splice(i,1)[0];
   await sleep(10);
  }
  throw Error(`Timeout: ${JSON.stringify(messages.slice(-2))}`);
 }};
}
async function room(){
 const a=await client(),b=await client();
 a.send({type:'create',name:'Wide verify A',characterId:'lin'});
 const welcome=await a.wait(m=>m.type==='welcome');
 b.send({type:'join',code:welcome.code,name:'Wide verify B',characterId:'lin'});
 await b.wait(m=>m.type==='welcome');a.send({type:'ready'});b.send({type:'ready'});
 const start=await a.wait(m=>m.type==='state');
 return {a,b,start,close:async()=>{
  a.send({type:'leave'});b.send({type:'leave'});await sleep(100);a.ws.terminate();b.ws.terminate();
 }};
}
const html=await(await fetch(base)).text(),entry=html.match(/src="([^"]+\.js)"/)![1];
const bytes=Buffer.from(await(await fetch(base+entry)).arrayBuffer());
assert.deepEqual(bytes,await readFile(root+entry));
const movement=[];
for(const wing of [-1,1]){
 const {a,b,start,close}=await room();
 try{
  b.send({type:'input',command:{type:'move',x:wing*20,z:-10.3}});
  const edge=await a.wait(m=>m.type==='state'&&m.seq>start.seq&&m.state.players[1].tx===wing*8&&Math.abs(m.state.players[1].x-wing*8)<.04);
  assert.deepEqual((await b.wait(m=>m.type==='state'&&m.seq===edge.seq)).state,edge.state);
  movement.push({wing,x:edge.state.players[1].x,target:edge.state.players[1].tx,synchronized:true});
 }finally{await close();}
}
const returns=[];
const {a,b,start,close}=await room();
try{
 let ready=start;
 for(let n=0;n<2;n++){
  const state=ready.state,total=state.score[0]+state.score[1],sender=state.server,receiver=1-sender;
  const peers=[a,b],wing=total%2===0?-1:1;
  peers[sender].send({type:'input',command:{type:'shot',aim:wing,depth:.6,power:1,critical:true,lob:false}});
  const serve=await peers[receiver].wait(m=>m.type==='state'&&m.seq>ready.seq&&m.state.rally===1);
  peers[receiver].send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
  const hit=await a.wait(m=>m.type==='state'&&m.seq>serve.seq&&(m.state.rally===2||m.state.phase==='point'));
  assert.equal(hit.state.rally,2);assert.equal(hit.state.ball.hitter,receiver);assert.equal(hit.state.ball.rescue,false);
  assert.ok(hit.state.players[receiver].contact.y>.25);
  assert.deepEqual((await b.wait(m=>m.type==='state'&&m.seq===hit.seq)).state,hit.state);
  returns.push({total,sender,receiver,wing,contact:hit.state.players[receiver].contact,rescue:false,synchronized:true});
  if(n===0)ready=await a.wait(m=>m.type==='state'&&m.seq>hit.seq&&m.state.phase==='serve'&&m.state.score[0]+m.state.score[1]>total);
 }
}finally{await close();}
await mkdir(output,{recursive:true});
const report={at:new Date().toISOString(),base,entry,sha256:createHash('sha256').update(bytes).digest('hex'),movement,returns,
 scope:'Deployed HTTP bytes, normal room/score progression and real WebSocket inputs. No server state injection. Not physical-phone acceptance.'};
await writeFile(output+'/wide-reception.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
