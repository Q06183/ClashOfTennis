/** Non-browser smoke check against the deployed authoritative service.
 * Creates a private two-client room, verifies real serves and point resets,
 * then leaves. Run with: node --import tsx scripts/verify-live.ts */
import {WebSocket} from 'ws';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {frameMatch} from '../src/render/camera.js';
import {captureSwipeAim} from '../src/input/aim.js';
import {projectedOutgoingAngle} from '../tests/helpers/projected-shot.js';

const base=process.env.GAME_URL??'http://100.81.1.29:7470';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function client(){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages:any[]=[];
 ws.on('message',raw=>messages.push(JSON.parse(String(raw))));
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,messages,send:(message:object)=>ws.send(JSON.stringify(message)),async wait(type:string,predicate=(m:any)=>true){
  for(let i=0;i<500;i++){const found=messages.find(m=>m.type===type&&predicate(m));if(found)return found;await sleep(20);}
  throw Error(`Timeout ${type}: ${JSON.stringify(messages.slice(-1))}`);
 }};
}
const html=await (await fetch(base)).text(),entry=html.match(/src="([^"]+\.js)"/)![1];
const online=Buffer.from(await (await fetch(base+entry)).arrayBuffer()),local=await readFile('dist'+entry);
assert.deepEqual(online,local,'deployed entry equals final build');
const a=await client(),b=await client(),serves:object[]=[];
try{
 a.send({type:'create',name:'版本核验A'});const welcome=await a.wait('welcome');
 b.send({type:'join',code:welcome.code,name:'版本核验B'});await b.wait('welcome');
 a.send({type:'ready'});b.send({type:'ready'});
 let state=(await a.wait('state')).state;
 for(let n=0;n<2;n++){
  const seat=state.server,player=state.players[seat],camera=new PerspectiveCamera(),ratio=seat===0?-.2:.2;
  frameMatch(camera,390,844,seat,player.x,Math.abs(player.z),state.players[1-seat],'near');
  const shot={type:'shot' as const,aim:0,depth:.5,power:.5,lob:false};
  a.messages.length=0;b.messages.length=0;
  (seat===0?a:b).send({type:'input',command:{...shot,swipeAim:captureSwipeAim(camera,shot,ratio*150,-150,390,844)}});
  const hit=await a.wait('state',v=>v.state.rally===1);
  assert.deepEqual((await b.wait('state',v=>v.seq===hit.seq)).state,hit.state);
  const angle=projectedOutgoingAngle(camera,hit.state.players[seat].contact,hit.state.ball,390,844);
  assert.ok(Math.abs(angle-Math.atan(ratio))<.001,`live outgoing angle ${seat}`);
  serves.push({seat,angle,swipeAngle:Math.atan(ratio),contact:hit.state.players[seat].contact,sameSnapshot:true});
  // Let the point finish without returning. A first fault is still one point,
  // so retry once if necessary before checking the new point's stamina.
  let ready=await a.wait('state',v=>v.seq>hit.seq&&v.state.phase==='serve'&&v.state.rally===0);
  if(ready.state.score[0]+ready.state.score[1]===n){
   a.messages.length=0;b.messages.length=0;
   (seat===0?a:b).send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
   ready=await a.wait('state',v=>v.state.phase==='serve'&&v.state.score[0]+v.state.score[1]>n);
  }
  assert.deepEqual((await b.wait('state',v=>v.seq===ready.seq)).state,ready.state);
  for(const p of ready.state.players){
   assert.equal(p.stamina,p.totalStamina);assert.equal(p.pointStaminaStart,p.totalStamina);
  }
  assert.ok(ready.state.players[seat].stamina<1,'new point must not refill to 100%');
  state=ready.state;
 }
 await mkdir('artifacts/sep29',{recursive:true});
 const report={verifiedAt:new Date().toISOString(),base,entry,sha256:createHash('sha256').update(online).digest('hex'),serves,
  pointBars:state.players.map((p:any)=>({point:p.stamina,total:p.totalStamina,opening:p.pointStaminaStart})),
  scope:'Live HTTP bundle and two WebSocket seats; not browser/GPU or phone acceptance.'};
 await writeFile('artifacts/sep29/live-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{
 a.send({type:'leave'});b.send({type:'leave'});await sleep(100);a.ws.close();b.ws.close();
}
