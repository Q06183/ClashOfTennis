/** Production protocol check: invariant serve placement + authored slice bounce. */
import {WebSocket} from 'ws';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {frameMatch} from '../src/render/camera.js';
import {captureSwipeAim} from '../src/input/aim.js';
import {CHARACTERS} from '../src/simulation/characters.js';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
const base=process.env.GAME_URL??'http://100.81.1.29:7470';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function client(){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages:any[]=[];
 ws.on('message',raw=>messages.push(JSON.parse(String(raw))));
 await new Promise<void>((ok,no)=>{ws.once('open',ok);ws.once('error',no);});
 return {ws,send:(m:object)=>ws.send(JSON.stringify(m)),async wait(type:string,predicate=(m:any)=>true){
  for(let i=0;i<800;i++){
   const error=messages.find(m=>m.type==='error');if(error)throw Error(error.message);
   const found=messages.find(m=>m.type===type&&predicate(m));if(found)return found;
   await sleep(20);
  }
  throw Error(`Timeout ${type}: ${JSON.stringify(messages.at(-1))}`);
 }};
}
await initPhysics();
const samples:any[]=[],sliceBounces:any[]=[];
for(const c of CHARACTERS){
 const a=await client(),b=await client();
 try{
  a.send({type:'create',name:'发球方向核验A',characterId:c.id});const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'发球方向核验B',characterId:'lin'});await b.wait('welcome');
  a.send({type:'ready'});b.send({type:'ready'});const initial=(await a.wait('state')).state;
  const p=initial.players[0],camera=new PerspectiveCamera();
  frameMatch(camera,390,844,0,p.x,Math.abs(p.z),initial.players[1],'near');
  const shot={type:'shot' as const,aim:0,depth:.5,power:.5,lob:false};
  const command={...shot,swipeAim:captureSwipeAim(camera,shot,-82.5,-150,390,844)};
  a.send({type:'input',command});
  const hit=await a.wait('state',m=>m.state.rally===1);
  assert.deepEqual((await b.wait('state',m=>m.seq===hit.seq)).state,hit.state);
  const ball=hit.state.ball,contact=hit.state.players[0].contact;
  // Readback must agree with the intended server code, not merely a new bundle.
  const local=new Match([c.id,'lin'],()=>.5);
  try{
   local.input(0,command);while(local.state.phase==='serve')local.step(1/60);
   assert.ok(Math.abs(ball.targetX-local.state.ball.targetX)<1e-8);
   assert.ok(Math.abs(ball.vz-local.state.ball.vz)<1e-5);
  }finally{local.dispose();}
  const duration=(ball.targetZ-contact.z)/ball.vz;
  const vy=(.12-contact.y+9.81*duration*duration/2)/duration;
  const sample={id:c.id,targetX:ball.targetX,targetZ:ball.targetZ,heading:ball.vx/ball.vz,
   forwardSpeed:Math.abs(ball.vz),apex:contact.y+Math.max(0,vy)**2/(2*9.81),sameSnapshot:true};
  if(samples.length){
   assert.ok(Math.abs(sample.targetX-samples[0].targetX)<1e-8);
   assert.equal(sample.targetZ,samples[0].targetZ);
   assert.ok(Math.abs(sample.heading-samples[0].heading)<1e-6);
  }
  samples.push(sample);
  if(c.id==='mei'){
   b.send({type:'input',command:{type:'shot',aim:0,depth:.55,power:.5,lob:false,slice:true}});
   const returned=await a.wait('state',m=>m.state.rally===2);
   assert.equal(returned.state.ball.slice,true);
   const bounced=await a.wait('state',m=>m.seq>returned.seq&&m.state.rally===2&&m.state.ball.bounces===1);
   assert.deepEqual((await b.wait('state',m=>m.seq===bounced.seq)).state,bounced.state);
   const pre=returned.state.ball,post=bounced.state.ball;
   const deflection=Math.atan2(post.vx*pre.vz-post.vz*pre.vx,post.vx*pre.vx+post.vz*pre.vz);
   assert.ok(Math.abs(deflection)<=.16001);
   assert.ok(Math.hypot(post.vx,post.vz)<Math.hypot(pre.vx,pre.vz)*.93);
   sliceBounces.push({deflectionRadians:deflection,boundedRandomSkidPreserved:true,sameSnapshot:true});
  }
 }finally{a.send({type:'leave'});b.send({type:'leave'});await sleep(100);a.ws.close();b.ws.close();}
}
const mei=samples.find(s=>s.id==='mei'),lin=samples.find(s=>s.id==='lin');
assert.ok(mei.forwardSpeed<lin.forwardSpeed*.7&&mei.apex>lin.apex+1);
const report={verifiedAt:new Date().toISOString(),base,samples,sliceBounces,
 scope:'Ten deployed character serves and real slice bounce over two WebSockets; no physical-phone acceptance.'};
await mkdir('artifacts/deterministic-aim-2026-09-30',{recursive:true});
await writeFile('artifacts/deterministic-aim-2026-09-30/live.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
