import { randomInt, randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { Match } from '../src/simulation/match.js';
import type { RoomView, Seat } from '../src/simulation/types.js';

type Member={name:string;token:string;ws:WebSocket|null;ready:boolean;gone:number|null};
type Room={code:string;seats:[Member|null,Member|null];match:Match|null;updated:number;seq:number};
type Peer={ws:WebSocket;room:Room|null;seat:Seat|null;window:number;count:number;lastInput:number;lastPong:number;lastPing:number};
const send=(ws:WebSocket|null,v:unknown)=>{if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<256_000)ws.send(JSON.stringify(v));};
export class Rooms {
  readonly rooms=new Map<string,Room>();
  readonly peers=new Map<WebSocket,Peer>();
  constructor(private reconnectMs=30_000) {}
  add(ws:WebSocket) {
    const peer:Peer={ws,room:null,seat:null,window:Date.now(),count:0,lastInput:0,lastPong:Date.now(),lastPing:Date.now()};this.peers.set(ws,peer);
    ws.on('pong',()=>peer.lastPong=Date.now());
    ws.on('message',data=>{
      const now=Date.now();if(now-peer.window>1000){peer.window=now;peer.count=0;}
      if(++peer.count>90){ws.close(1008,'Too many messages');return;}
      try{this.handle(peer,JSON.parse(data.toString()));}catch{send(ws,{type:'error',message:'消息格式错误，请重试'});}
    });
    ws.on('close',()=>this.detach(peer,false));ws.on('error',()=>{});
  }
  private error(peer:Peer,message:string){send(peer.ws,{type:'error',message});}
  private view(r:Room):RoomView {
    const disconnected=r.seats.filter(m=>m?.gone!=null).map(m=>m!.gone!);
    return {code:r.code,seats:r.seats.map(m=>m?{name:m.name,connected:!!m.ws,ready:m.ready}:null),
      playing:!!r.match,paused:!!r.match&&r.match.state.phase!=='over'&&r.seats.some(m=>!m?.ws),
      expiresAt:disconnected.length?Math.min(...disconnected)+this.reconnectMs:null};
  }
  private broadcast(r:Room,v:unknown){for(const member of r.seats)send(member?.ws??null,v);}
  private roomUpdate(r:Room){this.broadcast(r,{type:'room',room:this.view(r)});}
  private welcome(p:Peer){const r=p.room!,seat=p.seat!;send(p.ws,{type:'welcome',code:r.code,seat,token:r.seats[seat]!.token});this.roomUpdate(r);}
  private attach(p:Peer,r:Room,seat:Seat,name:string){
    p.room=r;p.seat=seat;r.seats[seat]={name,token:randomUUID(),ws:p.ws,ready:false,gone:null};r.updated=Date.now();this.welcome(p);
  }
  private handle(p:Peer,m:any){
    if(!m||typeof m.type!=='string')return;
    if(m.type==='ping'){send(p.ws,{type:'pong',at:m.at});return;}
    if(m.type==='leave'){this.detach(p,true);return;}
    if(['create','join','resume'].includes(m.type)&&p.room){this.error(p,'你已经在房间中');return;}
    const name=typeof m.name==='string'?m.name.trim().slice(0,16)||'球友':'球友';
    if(m.type==='create'){
      if(this.rooms.size>=100){this.error(p,'球场暂时已满，请稍后再试');return;}
      let code:string;do{code=String(randomInt(100000,1000000));}while(this.rooms.has(code));
      const r:Room={code,seats:[null,null],match:null,updated:Date.now(),seq:0};this.rooms.set(code,r);this.attach(p,r,0,name);return;
    }
    if(m.type==='join'){
      const r=this.rooms.get(String(m.code));if(!r){this.error(p,'房间不存在或已结束');return;}
      if(r.seats[0]&&r.seats[1]){this.error(p,'房间已满，两位球友已就位');return;}
      this.attach(p,r,r.seats[0]?1:0,name);return;
    }
    if(m.type==='resume'){
      const r=this.rooms.get(String(m.code));
      const seat=r?.seats.findIndex(s=>s?.token===m.token&&typeof m.token==='string');
      if(!r||seat===undefined||seat<0){this.error(p,'无法恢复房间，请重新加入');return;}
      const member=r.seats[seat]!;if(member.gone&&Date.now()-member.gone>this.reconnectMs){this.error(p,'恢复时间已过，请重新加入');return;}
      const old=member.ws;member.ws=p.ws;member.gone=null;p.room=r;p.seat=seat as Seat;
      if(old&&old!==p.ws)old.close(1000,'Resumed elsewhere');this.welcome(p);return;
    }
    const r=p.room,seat=p.seat;if(!r||seat===null){this.error(p,'请先创建或加入房间');return;}
    r.updated=Date.now();
    if(m.type==='ready'){
      if(r.seats.some(member=>!member?.ws)){this.error(p,'等待好友加入后再准备');return;}
      if(r.match&&r.match.state.phase!=='over')return;
      r.seats[seat]!.ready=true;
      if(r.seats.every(member=>member?.ready)){
        r.match?.dispose();r.match=new Match();for(const member of r.seats)member!.ready=false;
      }
      this.roomUpdate(r);return;
    }
    if(m.type==='input'&&r.match&&!this.view(r).paused){
      const now=Date.now();if(now-p.lastInput<12)return;p.lastInput=now;
      r.match.input(seat,m.command);
    }
  }
  private detach(p:Peer,explicit:boolean){
    const r=p.room,seat=p.seat;
    if(r&&seat!==null&&r.seats[seat]?.ws===p.ws){
      r.updated=Date.now();
      const member=r.seats[seat]!;member.ws=null;member.gone=Date.now();member.ready=false;
      if(explicit){
        if(r.match&&r.match.state.phase!=='over')r.match.finish(seat===0?1:0,'对手离开了球场');
        r.seats[seat]=null;
      }
      this.roomUpdate(r);
    }
    p.room=null;p.seat=null;if(!explicit)this.peers.delete(p.ws);
  }
  tick(dt:number,broadcast:boolean){
    const now=Date.now();
    for(const peer of this.peers.values()){
      if(now-peer.lastPong>20_000){peer.ws.terminate();continue;}
      if(now-peer.lastPing>7_000&&peer.ws.readyState===WebSocket.OPEN){peer.lastPing=now;peer.ws.ping();}
    }
    for(const [code,r] of this.rooms){
      if(r.seats.every(m=>!m?.ws)&&now-r.updated>this.reconnectMs || now-r.updated>900_000){
        r.match?.dispose();this.rooms.delete(code);
        for(const p of this.peers.values())if(p.room===r){p.room=null;p.seat=null;send(p.ws,{type:'error',terminal:true,message:'房间已结束，请重新创建'});}
        continue;
      }
      let changed=false;
      r.seats.forEach((m,i)=>{
        if(m?.gone&&now-m.gone>this.reconnectMs){
          if(r.match&&r.match.state.phase!=='over')r.match.finish(i===0?1:0,'对手断线超时');
          r.seats[i]=null;changed=true;
        }
      });
      if(changed)this.roomUpdate(r);
      const paused=this.view(r).paused;
      if(r.match&&!paused)r.match.step(dt);
      if(r.match&&broadcast)this.broadcast(r,{type:'state',state:r.match.state,seq:++r.seq,paused});
    }
  }
  dispose(){for(const ws of this.peers.keys())ws.terminate();for(const r of this.rooms.values())r.match?.dispose();this.rooms.clear();this.peers.clear();}
}
