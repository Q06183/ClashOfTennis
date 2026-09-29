/** Real deployed serve -> queued touch return -> first/second bounce smoke test. */
import {WebSocket} from 'ws';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {frameMatch} from '../src/render/camera.js';
import {captureSwipeAim} from '../src/input/aim.js';
import {interpretGesture} from '../src/input/gesture.js';
import {predictFlight} from '../src/simulation/trajectory.js';
import {projectedOutgoingAngle} from '../tests/helpers/projected-shot.js';

const base=process.env.GAME_URL??'http://100.81.1.29:7470';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function client(){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages:any[]=[];
 ws.on('message',raw=>messages.push(JSON.parse(String(raw))));
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,send:(v:object)=>ws.send(JSON.stringify(v)),async wait(predicate:(m:any)=>boolean){
  for(let i=0;i<600;i++){const found=messages.find(predicate);if(found)return found;await sleep(20);}
  throw Error(`Timeout: ${JSON.stringify(messages.slice(-1))}`);
 }};
}
const html=await (await fetch(base)).text(),entry=html.match(/src="([^"]+\.js)"/)![1];
const online=Buffer.from(await (await fetch(base+entry)).arrayBuffer());
assert.deepEqual(online,await readFile('dist'+entry));
const a=await client(),b=await client();
try{
 a.send({type:'create',name:'小球核验A',characterId:'wuming'});
 const welcome=await a.wait(m=>m.type==='welcome');
 b.send({type:'join',code:welcome.code,name:'小球核验B',characterId:'wuming'});await b.wait(m=>m.type==='welcome');
 a.send({type:'ready'});b.send({type:'ready'});await a.wait(m=>m.type==='state');
 a.send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.4,lob:false}});
 const serve=await a.wait(m=>m.type==='state'&&m.state.rally===1);
 const s=serve.state,p=s.players[1],camera=new PerspectiveCamera();
 frameMatch(camera,390,844,1,p.x,Math.abs(p.z),s.players[0],'near');
 const shot=interpretGesture({dx:0,dy:-40,duration:650,hold:0,width:390,height:844})!;
 b.send({type:'input',command:{...shot,swipeAim:captureSwipeAim(camera,shot,0,-40,390,844)}});
 const hit=await a.wait(m=>m.type==='state'&&m.state.rally===2);
 assert.deepEqual((await b.wait(m=>m.type==='state'&&m.seq===hit.seq)).state,hit.state);
 assert.equal(hit.state.ball.drop,1);assert.equal(hit.state.event,'放小球');
 assert.ok(Math.abs(hit.state.ball.targetZ)<2);
 const angle=projectedOutgoingAngle(camera,hit.state.players[1].contact,hit.state.ball,390,844);
 assert.ok(Math.abs(angle)<.001);
 const bounce=await a.wait(m=>m.type==='state'&&m.state.rally===2&&m.state.ball.bounces===1);
 assert.deepEqual((await b.wait(m=>m.type==='state'&&m.seq===bounce.seq)).state,bounce.state);
 assert.equal(bounce.state.phase,'rally');
 const second=predictFlight(bounce.state.ball);
 assert.ok(Math.abs(second.landing.z)<4.5);
 assert.ok(Math.max(...second.points.map(p=>p.y))<.8);
 const report={verifiedAt:new Date().toISOString(),base,entry,sha256:createHash('sha256').update(online).digest('hex'),
  sameSnapshots:true,target:{x:hit.state.ball.targetX,z:hit.state.ball.targetZ},angle,
  firstBounce:bounce.state.ball,secondLanding:second.landing,
  scope:'Actual deployed serve and queued drop return, two WebSocket clients. Not browser or phone acceptance.'};
 await mkdir('artifacts/drop-shot',{recursive:true});
 await writeFile('artifacts/drop-shot/live-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{
 a.send({type:'leave'});b.send({type:'leave'});await sleep(150);a.ws.close();b.ws.close();
}
