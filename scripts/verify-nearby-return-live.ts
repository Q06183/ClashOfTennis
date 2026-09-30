/** Real serve/movement commands only; no injected match state or forced RNG. */
import {WebSocket} from 'ws';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL??'http://100.81.1.29:7470';
const out=process.env.VERIFY_DIR??'artifacts/rescue-nearby/live';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function client(){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages:any[]=[];
 ws.on('message',data=>messages.push(JSON.parse(String(data))));
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,messages,send:(v:object)=>ws.send(JSON.stringify(v)),async wait(predicate:(v:any)=>boolean){
  for(let i=0;i<700;i++){const m=messages.find(predicate);if(m)return m;await sleep(10);}
  throw Error(`Timed out: ${JSON.stringify(messages.at(-1))}`);
 }};
}
const html=await(await fetch(base)).text(),entry=html.match(/src="([^"]+\.js)"/)![1];
assert.deepEqual(Buffer.from(await(await fetch(base+entry)).arrayBuffer()),await readFile('dist'+entry));
const results=[];
for(const z of [-13,-14]){
 const a=await client(),b=await client();
 try{
  a.send({type:'create',name:'近球验证A',characterId:'lin'});const welcome=await a.wait(v=>v.type==='welcome');
  b.send({type:'join',code:welcome.code,name:'近球验证B',characterId:'lin'});
  await b.wait(v=>v.type==='welcome');a.send({type:'ready'});b.send({type:'ready'});
  await a.wait(v=>v.type==='state');
  b.send({type:'input',command:{type:'move',x:-4,z}});
  await a.wait(v=>v.type==='state'&&Math.abs(v.state.players[1].x+4)<.04&&Math.abs(v.state.players[1].z-z)<.04);
  a.send({type:'input',command:{type:'shot',aim:.7,depth:.2,power:.5,lob:false}});
  await b.wait(v=>v.type==='state'&&v.state.rally===1);
  b.send({type:'input',command:{type:'shot',aim:0,depth:.5,power:.5,lob:false}});
  const hit=await a.wait(v=>v.type==='state'&&(v.state.rally===2||v.state.phase==='point'));
  assert.equal(hit.state.rally,2);assert.equal(hit.state.ball.hitter,1);
  assert.equal(hit.state.ball.rescue,false,'nearby ball must be returned with ordinary footwork');
  assert.ok(!a.messages.some(v=>v.type==='state'&&(v.state.players[1].rescue||v.state.rescueWindow)),'no automatic hop or rescue hold');
  assert.deepEqual((await b.wait(v=>v.type==='state'&&v.seq===hit.seq)).state,hit.state);
  results.push({start:{x:-4,z},rally:hit.state.rally,rescue:hit.state.ball.rescue,contact:hit.state.players[1].contact,sameSnapshots:true});
 }finally{a.send({type:'leave'});b.send({type:'leave'});await sleep(100);a.ws.close();b.ws.close();}
}
await mkdir(out,{recursive:true});
const report={at:new Date().toISOString(),base,entry,results,scope:'Live server real serves and ordinary reception, no synthetic state/RNG; not phone acceptance.'};
await writeFile(out+'/nearby-return.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
