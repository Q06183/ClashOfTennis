import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { initPhysics } from '../src/simulation/physics.js';
import { Rooms } from './rooms.js';
export async function createGameServer(options:{port:number;host:string;reconnectMs?:number;staticRoot?:string}){
  await initPhysics();const rooms=new Rooms(options.reconnectMs);
  const root=resolve(options.staticRoot??'dist');
  const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
  const http=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    if(req.url==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,rooms:rooms.rooms.size}));return;}
    try{
      const path=decodeURIComponent(new URL(req.url??'/', 'http://localhost').pathname);
      let file=resolve(root,'.'+path);if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
      if(path==='/')file=resolve(root,'index.html');
      try{if((await stat(file)).isDirectory())file=resolve(file,'index.html');}catch{res.writeHead(404);res.end('Not found');return;}
      const contentType=types[extname(file)]??'application/octet-stream';
      const accepted=String(req.headers['accept-encoding']??'').split(',').map(part=>{
        const [name,...params]=part.trim().split(';');const quality=params.find(p=>p.trim().startsWith('q='));
        return {name:name.trim(),q:quality?Number(quality.trim().slice(2)):1};
      }).filter(v=>v.q>0).sort((a,b)=>b.q-a.q);
      for(const encoding of accepted){
        if(encoding.name!=='br'&&encoding.name!=='gzip')continue;
        const compressed=file+(encoding.name==='br'?'.br':'.gz');
        try{await stat(compressed);file=compressed;res.setHeader('Content-Encoding',encoding.name);break;}catch{}
      }
      const data=await readFile(file);res.setHeader('Content-Type',contentType);res.setHeader('Vary','Accept-Encoding');
      res.setHeader('Cache-Control',path.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache');res.end(data);
    }catch{res.writeHead(400);res.end('Bad request');}
  });
  const wss=new WebSocketServer({server:http,path:'/ws',maxPayload:4096});
  wss.on('connection',ws=>rooms.add(ws));
  let last=performance.now(),acc=0,ticks=0;
  const timer=setInterval(()=>{
    const now=performance.now();acc+=Math.min((now-last)/1000,.2);last=now;
    while(acc>=1/60){rooms.tick(1/60,++ticks%3===0);acc-=1/60;}
  },8);
  try{await new Promise<void>((resolve,reject)=>{http.once('error',reject);http.listen(options.port,options.host,resolve);});}
  catch(error){clearInterval(timer);rooms.dispose();wss.close();throw error;}
  const port=(http.address() as AddressInfo).port;
  return {port,rooms,wsUrl:`ws://127.0.0.1:${port}/ws`,close:async()=>{
    clearInterval(timer);rooms.dispose();await new Promise<void>(r=>wss.close(()=>r()));await new Promise<void>(r=>http.close(()=>r()));
  }};
}
