/** Verify released character selection and authoritative serve on real sockets.
 * GAME_URL=http://100.81.1.29:7470 node --import tsx scripts/verify-joint-release-live.ts
 */
import {WebSocket} from 'ws';
import assert from 'node:assert/strict';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getCharacter,CHARACTERS} from '../src/simulation/characters.js';
const base=process.env.GAME_URL??'http://100.81.1.29:7470';
const roster=process.env.ROSTER_JOINT==='1';
const output=`artifacts/${roster?'roster-joint-release':'joint-release'}-2026-09-30/live`;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function client(){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages:any[]=[];
 ws.on('message',raw=>messages.push(JSON.parse(String(raw))));
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,messages,send:(m:object)=>ws.send(JSON.stringify(m)),async wait(type:string,predicate=(m:any)=>true){
  for(let i=0;i<500;i++){
   const error=messages.find(m=>m.type==='error');if(error)throw Error(error.message);
   const result=messages.find(m=>m.type===type&&predicate(m));if(result)return result;
   await sleep(20);
  }
  throw Error(`Timeout ${type}`);
 }};
}
const rows=[];
for(const pair of roster?[['rafa','sora'],['ines','leo'],['adrian','luca'],['wuming','noah'],['mei','lin']]:[['noah','mei'],['mei','lin']]){
 const a=await client(),b=await client();
 try{
  a.send({type:'create',name:'关节发布核验A',characterId:pair[0]});
  const welcome=await a.wait('welcome');
  b.send({type:'join',code:welcome.code,name:'关节发布核验B',characterId:pair[1]});
  await b.wait('welcome');a.send({type:'ready'});b.send({type:'ready'});
  const initial=(await a.wait('state')).state;
  assert.deepEqual(initial.players.map((p:any)=>p.characterId),pair);
  a.messages.length=0;b.messages.length=0;
  (initial.server===0?a:b).send({type:'input',command:{type:'shot',aim:.12,depth:.5,power:.5,lob:false}});
  const hit=await a.wait('state',m=>m.state.rally===1);
  const second=await b.wait('state',m=>m.seq===hit.seq);
  assert.deepEqual(hit.state,second.state);
  assert.ok(hit.state.players[initial.server].contact);
  rows.push({characters:pair,serveSeat:initial.server,sameSnapshot:true,contact:hit.state.players[initial.server].contact});
 }finally{
  a.send({type:'leave'});b.send({type:'leave'});await sleep(100);a.ws.close();b.ws.close();
 }
}
const assets=[];
for(const id of roster?CHARACTERS.map(c=>c.id):['lin','mei','noah']){
 const c=getCharacter(id),url=base+c.model,response=await fetch(url);
 assert.equal(response.status,200);
 const served=Buffer.from(await response.arrayBuffer()),local=await readFile('public'+c.model);
 assert.deepEqual(served,local);
 const n=served.readUInt32LE(12),j=JSON.parse(served.toString('utf8',20,20+n));
 const metadata=j.scenes[j.scene??0].extras;
 if(['lin','mei','noah'].includes(id)){
  assert.equal(metadata.handFaceRevision,2);assert.equal(metadata.bodyProportionRevision,3);
 }else{
  assert.equal(metadata.jointOptimizationRevision,1);assert.equal(metadata.jointHandProfile,'original');
 }
 assert.equal(metadata.wholeArmRevision,undefined);
 assets.push({id,url,sha256:createHash('sha256').update(served).digest('hex'),handFaceRevision:metadata.handFaceRevision,jointOptimizationRevision:metadata.jointOptimizationRevision});
}
await mkdir(output,{recursive:true});
const report={verifiedAt:new Date().toISOString(),base,rows,assets,scope:'Real HTTP assets and two WebSocket clients; not physical-phone acceptance.'};
await writeFile(output+'/joint-release-live.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
