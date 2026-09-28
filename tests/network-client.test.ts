import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NetworkClient} from '../src/network/client.js';

test('denied session storage cannot suppress welcome delivery or stop connection cleanup',async t=>{
 const saved=new Map(['WebSocket','location','sessionStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const warn=console.warn;console.warn=()=>{};
 t.after(()=>{console.warn=warn;for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);});
 let socket:any,welcome=false;
 class FakeSocket {
  static OPEN=1;static CONNECTING=0;readyState=0;
  constructor(){socket=this;}
  send(){} close(){this.readyState=3;queueMicrotask(()=>socket.onclose?.());}
 }
 Object.defineProperty(globalThis,'WebSocket',{value:FakeSocket,configurable:true});
 Object.defineProperty(globalThis,'location',{value:{protocol:'http:',host:'localhost:7470'},configurable:true});
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw Error('SecurityError');}});
 const client=new NetworkClient({welcome(){welcome=true;},room(){},state(){},error(){},latency(){},status(){}});
 client.connect({type:'create',characterId:'wuming'});
 socket.readyState=1;socket.onopen();
 try{
  assert.doesNotThrow(()=>socket.onmessage({data:JSON.stringify({type:'welcome',code:'123456',seat:0,token:'test'})}));
  assert.equal(welcome,true);
 }finally{assert.doesNotThrow(()=>client.close());}
 assert.equal(socket.readyState,3);
});

test('cancelling a connecting socket cannot disable a later practice session',async t=>{
  const saved=new Map(['WebSocket','location','sessionStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  t.after(()=>{for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);});
  class FakeSocket {
    static OPEN=1;static CONNECTING=0;
    readyState=0;onopen:(()=>void)|null=null;onmessage:((e:any)=>void)|null=null;
    onerror:(()=>void)|null=null;onclose:(()=>void)|null=null;
    send(){}
    close(){this.readyState=3;queueMicrotask(()=>{this.onerror?.();this.onclose?.();});}
  }
  Object.defineProperty(globalThis,'WebSocket',{value:FakeSocket,configurable:true});
  Object.defineProperty(globalThis,'location',{value:{protocol:'http:',host:'localhost:7470'},configurable:true});
  Object.defineProperty(globalThis,'sessionStorage',{value:{setItem(){},removeItem(){}},configurable:true});
  let practiceConnected=true;
  const client=new NetworkClient({welcome(){},room(){},state(){},error(){},latency(){},status:s=>practiceConnected=s==='已连接'});
  client.connect({type:'create',name:'a'});client.close();practiceConnected=true;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(practiceConnected,true,'a cancelled socket must not emit stale status updates');
});
test('rejected resume terminates old session instead of leaving a fake connected match',async t=>{
  const saved=new Map(['WebSocket','location','sessionStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  t.after(()=>{for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);});
  let socket:any;let removed=false;let reason='';
  class FakeSocket {
    static OPEN=1;static CONNECTING=0;readyState=0;onopen:(()=>void)|null=null;onmessage:((e:any)=>void)|null=null;
    onerror:(()=>void)|null=null;onclose:(()=>void)|null=null;
    constructor(){socket=this;}
    send(){} close(){this.readyState=3;queueMicrotask(()=>this.onclose?.());}
  }
  Object.defineProperty(globalThis,'WebSocket',{value:FakeSocket,configurable:true});
  Object.defineProperty(globalThis,'location',{value:{protocol:'http:',host:'localhost:7470'},configurable:true});
  Object.defineProperty(globalThis,'sessionStorage',{value:{setItem(){},removeItem(){removed=true;}},configurable:true});
  const client=new NetworkClient({welcome(){},room(){},state(){},error(){},latency(){},status(){},terminal:s=>reason=s});
  client.connect({type:'resume',code:'123456',token:'expired'});
  socket.readyState=1;socket.onopen();socket.onmessage({data:JSON.stringify({type:'error',message:'无法恢复房间，请重新加入'})});
  try{assert.match(reason,/恢复/);assert.equal(removed,true);assert.equal(socket.readyState,3);}finally{client.close();}
});
