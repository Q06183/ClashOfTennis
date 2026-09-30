/** Live service verification without synthetic server state or forced RNG. */
import {WebSocket} from 'ws';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL??'http://100.81.1.29:7470';
const output=process.env.VERIFY_DIR??'artifacts/auto-rescue';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function client(){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages:any[]=[];
 ws.on('message',raw=>messages.push(JSON.parse(String(raw))));
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,send:(v:object)=>ws.send(JSON.stringify(v)),async wait(test:(m:any)=>boolean){
  for(let i=0;i<700;i++){const hit=messages.find(test);if(hit)return hit;await sleep(10);}
  throw Error(`Timeout: ${JSON.stringify(messages.slice(-1))}`);
 }};
}
const html=await (await fetch(base)).text(),entry=html.match(/src="([^"]+\.js)"/)![1];
const bytes=Buffer.from(await (await fetch(base+entry)).arrayBuffer());
assert.deepEqual(bytes,await readFile('dist'+entry));
const attempts:object[]=[];
for(const success of [true,false]){
 let verified=false;
 for(let trial=0;trial<4&&!verified;trial++){
  const a=await client(),b=await client();
  try{
   a.send({type:'create',name:'救球核验A',characterId:'lin'});
   const welcome=await a.wait(m=>m.type==='welcome');
   b.send({type:'join',code:welcome.code,name:'救球核验B',characterId:'leo'});
   await b.wait(m=>m.type==='welcome');a.send({type:'ready'});b.send({type:'ready'});
   await a.wait(m=>m.type==='state');
   b.send({type:'input',command:{type:'move',x:-5,z:-15}});
   await a.wait(m=>m.type==='state'&&Math.abs(m.state.players[1].x+5)<.06&&Math.abs(m.state.players[1].z+15)<.06);
   a.send({type:'input',command:{type:'shot',aim:.7,depth:.2,power:.5,lob:false}});
   const result=await a.wait(m=>m.type==='state'&&(m.state.rescueWindow||m.state.phase==='point'));
   if(!result.state.rescueWindow){attempts.push({success,trial,lotteryMiss:true});continue;}
   const hold=result;
   assert.ok(Number.isFinite(hold.state.players[1].rescue.launchVx),'updated momentum-aware server is running');
   assert.deepEqual((await b.wait(m=>m.type==='state'&&m.seq===hold.seq)).state,hold.state);
   const still=await a.wait(m=>m.type==='state'&&m.seq>hold.seq&&m.state.rescueWindow?.remaining<hold.state.rescueWindow.remaining-.08);
   assert.equal(still.state.time,hold.state.time);assert.deepEqual(still.state.ball,hold.state.ball);
   assert.deepEqual(still.state.players,hold.state.players);
   if(success)b.send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
   const released=await a.wait(m=>m.type==='state'&&m.seq>still.seq&&!m.state.rescueWindow);
   assert.deepEqual((await b.wait(m=>m.type==='state'&&m.seq===released.seq)).state,released.state);
   assert.equal(released.state.rally,success?2:1);
   assert.equal(released.state.ball.hitter,success?1:0);
   if(success)assert.deepEqual(released.state.players[1].contact,{x:hold.state.ball.x,y:hold.state.ball.y,z:hold.state.ball.z});
   else assert.ok(released.state.ball.z<=hold.state.ball.z);
   attempts.push({success,trial,freezeTime:hold.state.time,remaining:hold.state.rescueWindow.remaining,
    contact:hold.state.ball,travel:hold.state.players[1].rescue.travel,launchVx:hold.state.players[1].rescue.launchVx,
    short:hold.state.players[1].rescue.short,sameSnapshots:true,releasedRally:released.state.rally});
   verified=true;
  }finally{a.send({type:'leave'});b.send({type:'leave'});await sleep(100);a.ws.close();b.ws.close();}
 }
 assert.ok(verified,`live ${success?'success':'timeout'} case not observed`);
}
const report={verifiedAt:new Date().toISOString(),base,entry,sha256:createHash('sha256').update(bytes).digest('hex'),attempts,
 scope:'Real deployed serve, automatic no-swipe rescue, frozen snapshots, input/timeout; no browser or phone acceptance.'};
await mkdir(output,{recursive:true});
await writeFile(output+'/live-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
