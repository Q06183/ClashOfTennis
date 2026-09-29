/** Compare soft/fast returns over the real service using ordinary commands. */
import {WebSocket} from 'ws';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {frameMatch} from '../src/render/camera.js';
import {captureSwipeAim} from '../src/input/aim.js';
const base=process.env.GAME_URL??'http://100.81.1.29:7470';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function client(){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages:any[]=[];
 ws.on('message',raw=>messages.push(JSON.parse(String(raw))));
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,send:(v:object)=>ws.send(JSON.stringify(v)),async wait(test:(m:any)=>boolean){
  for(let i=0;i<800;i++){const hit=messages.find(test);if(hit)return hit;await sleep(10);}
  throw Error(`Timeout: ${JSON.stringify(messages.slice(-1))}`);
 }};
}
const html=await (await fetch(base)).text(),entry=html.match(/src="([^"]+\.js)"/)![1];
const bytes=Buffer.from(await (await fetch(base+entry)).arrayBuffer());
assert.deepEqual(bytes,await readFile('dist'+entry));
const samples:object[]=[];
for(const power of [.2,1]){
 const a=await client(),b=await client();
 try{
  a.send({type:'create',name:'控球核验A',characterId:'wuming'});const welcome=await a.wait(m=>m.type==='welcome');
  b.send({type:'join',code:welcome.code,name:'控球核验B',characterId:'wuming'});await b.wait(m=>m.type==='welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait(m=>m.type==='state');
  a.send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.4,lob:false}});
  const serve=await a.wait(m=>m.type==='state'&&m.state.rally===1);
  const s=serve.state,p=s.players[1],camera=new PerspectiveCamera();
  frameMatch(camera,390,844,1,p.x,Math.abs(p.z),s.players[0],'near');
  const shot={type:'shot' as const,aim:0,depth:1,power,lob:false,critical:power===1};
  b.send({type:'input',command:{...shot,swipeAim:captureSwipeAim(camera,shot,90,-150,390,844)}});
  const hit=await a.wait(m=>m.type==='state'&&m.state.rally===2);
  assert.deepEqual((await b.wait(m=>m.type==='state'&&m.seq===hit.seq)).state,hit.state);
  const ball=hit.state.ball;
  assert.equal(ball.placementAssist,power===1?0:1);
  if(power===1)assert.ok(Math.abs(ball.targetZ)>11.915);
  else assert.ok(Math.abs(ball.targetX)<3.96&&Math.abs(ball.targetZ)<10.95);
  const result=await a.wait(m=>m.type==='state'&&m.seq>hit.seq&&(m.state.ball.bounces>0||m.state.phase==='point'));
  if(power<1){assert.equal(result.state.phase,'rally');assert.equal(result.state.ball.bounces,1);}
  else assert.equal(result.state.event,'出界');
  samples.push({power,assistance:ball.placementAssist,target:{x:ball.targetX,z:ball.targetZ},sameSnapshots:true,result:result.state.event});
 }finally{a.send({type:'leave'});b.send({type:'leave'});await sleep(120);a.ws.close();b.ws.close();}
}
const report={verifiedAt:new Date().toISOString(),base,entry,sha256:createHash('sha256').update(bytes).digest('hex'),samples,
 scope:'Real deployed serve/return with same depth and swipe direction at two power levels. Not phone/GPU acceptance.'};
await mkdir('artifacts/pace-control',{recursive:true});
await writeFile('artifacts/pace-control/live-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
