import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import { gunzipSync,gzipSync } from 'node:zlib';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/app.js';
function request(port:number,path:string,encoding:string){return new Promise<{status:number;headers:any;body:Buffer}>((resolve,reject)=>{
  get(`http://127.0.0.1:${port}${path}`,{headers:{'accept-encoding':encoding}},res=>{
    const bytes:Buffer[]=[];res.on('data',chunk=>bytes.push(chunk));res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body:Buffer.concat(bytes)}));
  }).on('error',reject);
});}
test('production serves compressed pages and honors gzip q=0',async()=>{
  const root=await mkdtemp(join(tmpdir(),'rally-http-test-'));
  const page='<html><title>Rally Club</title></html>';
  await writeFile(join(root,'index.html'),page);await writeFile(join(root,'index.html.gz'),gzipSync(page));
  const server=await createGameServer({port:0,host:'127.0.0.1',staticRoot:root});
  try{
    const compressed=await request(server.port,'/','gzip');assert.equal(compressed.status,200);
    assert.equal(compressed.headers['content-encoding'],'gzip');
    assert.ok(gunzipSync(compressed.body).toString().includes('Rally Club'));
    const raw=await request(server.port,'/','gzip;q=0');assert.equal(raw.headers['content-encoding'],undefined);
    assert.ok(raw.body.toString().includes('Rally Club'));
    const health=await request(server.port,'/health','gzip');assert.equal(JSON.parse(health.body.toString()).ok,true);
    const traversal=await request(server.port,'/..%2fpackage.json','');assert.equal(traversal.status,403);
  }finally{await server.close();await rm(root,{recursive:true,force:true});}
});
