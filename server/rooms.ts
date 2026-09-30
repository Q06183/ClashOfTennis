import {getCharacter,isCharacterId,type CharacterId} from '../src/simulation/characters.js';
import { randomInt, randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { Match } from '../src/simulation/match.js';
import {other,type MatchMode,type RoomView,type Seat} from '../src/simulation/types.js';
import {driveAI} from '../src/simulation/ai.js';
import {isSurfaceId,type SurfaceId} from '../src/simulation/surfaces.js';
import {isScoringFormat,type ScoringFormat} from '../src/simulation/scoring.js';

type Member={name:string;characterId:CharacterId;token:string;ws:WebSocket|null;ready:boolean;gone:number|null;bot?:boolean};
type Room={code:string;mode:MatchMode;surface:SurfaceId;format:ScoringFormat;host:Seat;seats:(Member|null)[];match:Match|null;updated:number;seq:number};
type Search={name:string;characterId:CharacterId;surface:SurfaceId;joined:number};
type Peer={ws:WebSocket;room:Room|null;seat:Seat|null;searching:Search|null;window:number;count:number;lastInput:number;lastPong:number;lastPing:number};
const send=(ws:WebSocket|null,v:unknown)=>{if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<256_000)ws.send(JSON.stringify(v));};
export class Rooms {
  readonly rooms=new Map<string,Room>();
  readonly peers=new Map<WebSocket,Peer>();
  private matchmaking:Peer[]=[];
  constructor(private reconnectMs=30_000) {}
  add(ws:WebSocket) {
    const peer:Peer={ws,room:null,seat:null,searching:null,window:Date.now(),count:0,lastInput:0,lastPong:Date.now(),lastPing:Date.now()};this.peers.set(ws,peer);
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
    return {code:r.code,mode:r.mode,surface:r.surface,format:r.format,host:r.host,seats:r.seats.map(m=>m?{name:m.name,characterId:m.characterId,bot:!!m.bot,connected:!!m.ws||!!m.bot,ready:m.ready}:null),
      playing:!!r.match,paused:!!r.match&&r.match.state.phase!=='over'&&r.seats.some(m=>!m||!m.bot&&!m.ws),
      expiresAt:disconnected.length?Math.min(...disconnected)+this.reconnectMs:null};
  }
  private broadcast(r:Room,v:unknown){for(const member of r.seats)send(member?.ws??null,v);}
  private roomUpdate(r:Room){this.broadcast(r,{type:'room',room:this.view(r)});}
  private welcome(p:Peer){const r=p.room!,seat=p.seat!;send(p.ws,{type:'welcome',code:r.code,seat,token:r.seats[seat]!.token});this.roomUpdate(r);}
  private attach(p:Peer,r:Room,seat:Seat,name:string,characterId:CharacterId){
    p.room=r;p.seat=seat;r.seats[seat]={name,characterId,token:randomUUID(),ws:p.ws,ready:false,gone:null};r.updated=Date.now();this.welcome(p);
  }
  private code(){let code:string;do{code=String(randomInt(100000,1000000));}while(this.rooms.has(code));return code;}
  private create(mode:MatchMode='singles',surface:SurfaceId='hard',format:ScoringFormat='tiebreak'):Room {
    const r:Room={code:this.code(),mode,surface,format,host:0,seats:Array(mode==='doubles'?4:2).fill(null),match:null,updated:Date.now(),seq:0};
    this.rooms.set(r.code,r);return r;
  }
  private clearReady(r:Room){for(const m of r.seats)if(m)m.ready=false;}
  private hostAfterLeave(r:Room){
    if(!r.seats[r.host]||r.seats[r.host]?.bot){
      const next=r.seats.findIndex(m=>m&&!m.bot);if(next>=0)r.host=next as Seat;
    }
  }
  private start(r:Room){
    r.match?.dispose();r.match=new Match(r.seats.map(m=>m!.characterId),Math.random,{mode:r.mode,surface:r.surface,format:r.format});
    this.clearReady(r);
  }
  private configure(p:Peer,m:any){
    const r=p.room!;
    if(p.seat!==r.host){this.error(p,'只有房主可以配置球场');return;}
    if(r.match&&r.match.state.phase!=='over'){this.error(p,'比赛中不能改变队伍或场地');return;}
    const seatValid=(s:unknown):s is Seat=>Number.isInteger(s)&&Number(s)>=0&&Number(s)<r.seats.length;
    // One operation per message, validated before any mutation.
    const fields=['surface','format','bot','move'].filter(k=>m[k]!==undefined);
    if(fields.length!==1){this.error(p,'每次只能修改一项房间设置');return;}
    if(m.surface!==undefined){
      if(!isSurfaceId(m.surface)){this.error(p,'场地不存在');return;}r.surface=m.surface;
    }else if(m.format!==undefined){
      if(!isScoringFormat(m.format)){this.error(p,'赛制不存在');return;}r.format=m.format;
    }else if(m.bot!==undefined){
      const b=m.bot;
      if(!b||!seatValid(b.seat)||typeof b.enabled!=='boolean'||b.characterId!==undefined&&!isCharacterId(b.characterId)){this.error(p,'电脑席位配置无效');return;}
      if(r.seats[b.seat]&&!r.seats[b.seat]!.bot){this.error(p,'不能替换真人，请先调整席位');return;}
      r.seats[b.seat]=b.enabled?{name:`电脑 ${b.seat+1}`,characterId:getCharacter(b.characterId).id,token:randomUUID(),ws:null,ready:false,gone:null,bot:true}:null;
    }else{
      const move=m.move;
      if(!move||!seatValid(move.from)||!seatValid(move.to)||move.from===move.to){this.error(p,'席位移动无效');return;}
      const {from,to}=move;
      [r.seats[from],r.seats[to]]=[r.seats[to],r.seats[from]];
      if(r.host===from)r.host=to;else if(r.host===to)r.host=from;
      for(const index of [from,to] as Seat[]){
        const member=r.seats[index],peer=member?.ws?this.peers.get(member.ws):undefined;
        if(peer){peer.seat=index;send(peer.ws,{type:'welcome',code:r.code,seat:index,token:member!.token});}
      }
    }
    // A completed old match must not send stale snapshots over a new lobby.
    r.match?.dispose();r.match=null;this.clearReady(r);this.roomUpdate(r);
  }
  private match(p:Peer,name:string,characterId:CharacterId,surface:SurfaceId){
    this.matchmaking=this.matchmaking.filter(candidate=>candidate.searching&&candidate.ws.readyState===WebSocket.OPEN&&!candidate.room);
    const index=this.matchmaking.findIndex(candidate=>candidate.searching?.surface===surface);
    const opponent=index>=0?this.matchmaking.splice(index,1)[0]:undefined;
    if(!opponent){
      p.searching={name,characterId,surface,joined:Date.now()};this.matchmaking.push(p);
      send(p.ws,{type:'matchmaking',searching:true});return;
    }
    const first=opponent.searching!;opponent.searching=null;p.searching=null;
    const r=this.create('singles',surface);
    opponent.room=r;opponent.seat=0;p.room=r;p.seat=1;
    r.seats[0]={name:first.name,characterId:first.characterId,token:randomUUID(),ws:opponent.ws,ready:false,gone:null};
    r.seats[1]={name,characterId,token:randomUUID(),ws:p.ws,ready:false,gone:null};
    this.start(r);
    for(const peer of [opponent,p])send(peer.ws,{type:'welcome',code:r.code,seat:peer.seat,token:r.seats[peer.seat!]!.token,matched:true});
    this.roomUpdate(r);
  }
  private handle(p:Peer,m:any){
    if(!m||typeof m.type!=='string')return;
    if(m.type==='ping'){send(p.ws,{type:'pong',at:m.at});return;}
    if(m.type==='leave'){this.detach(p,true);return;}
    if(['create','join','resume','match'].includes(m.type)&&p.room){this.error(p,'你已经在房间中');return;}
    if(p.searching&&m.type!=='ping'&&m.type!=='leave'&&m.type!=='match'){this.error(p,'正在寻找对手，请先取消匹配');return;}
    const name=typeof m.name==='string'?m.name.trim().slice(0,16)||'球友':'球友';
    if(['create','join','match'].includes(m.type)&&m.characterId!==undefined&&!isCharacterId(m.characterId)){this.error(p,'角色不存在，请重新选择');return;}
    const characterId=getCharacter(m.characterId).id;
    if(['create','match'].includes(m.type)){
      if(m.surface!==undefined&&!isSurfaceId(m.surface)){this.error(p,'场地不存在');return;}
      if(m.mode!==undefined&&m.mode!=='singles'&&m.mode!=='doubles'){this.error(p,'比赛模式不存在');return;}
      if(m.format!==undefined&&!isScoringFormat(m.format)){this.error(p,'赛制不存在');return;}
      if(m.type==='match'&&(m.mode==='doubles'||m.format==='standard')){this.error(p,'快速匹配为单打抢七；双打或标准赛请开房');return;}
    }
    if(m.type==='match'){
      if(p.searching){send(p.ws,{type:'matchmaking',searching:true});return;}
      if(this.rooms.size>=100){this.error(p,'球场暂时已满，请稍后再试');return;}
      this.match(p,name,characterId,m.surface??'hard');return;
    }
    if(m.type==='create'){
      if(this.rooms.size>=100){this.error(p,'球场暂时已满，请稍后再试');return;}
      const r=this.create(m.mode??'singles',m.surface??'hard',m.format??'tiebreak');this.attach(p,r,0,name,characterId);return;
    }
    if(m.type==='join'){
      const r=this.rooms.get(String(m.code));if(!r){this.error(p,'房间不存在或已结束');return;}
      if(r.match&&r.match.state.phase!=='over'){this.error(p,'比赛进行中，请等待下一场');return;}
      const index=r.seats.findIndex(s=>!s);
      if(index<0){this.error(p,'房间已满，请房主腾出席位');return;}
      r.match?.dispose();r.match=null;this.clearReady(r);
      this.attach(p,r,index as Seat,name,characterId);this.hostAfterLeave(r);return;
    }
    if(m.type==='resume'){
      const r=this.rooms.get(String(m.code));
      const seat=r?.seats.findIndex(s=>s&&!s.bot&&s.token===m.token&&typeof m.token==='string');
      if(!r||seat===undefined||seat<0){this.error(p,'无法恢复房间，请重新加入');return;}
      const member=r.seats[seat]!;if(member.gone&&Date.now()-member.gone>this.reconnectMs){this.error(p,'恢复时间已过，请重新加入');return;}
      const old=member.ws;member.ws=p.ws;member.gone=null;p.room=r;p.seat=seat as Seat;
      if(old&&old!==p.ws)old.close(1000,'Resumed elsewhere');this.welcome(p);return;
    }
    const r=p.room,seat=p.seat;if(!r||seat===null){this.error(p,'请先创建或加入房间');return;}
    r.updated=Date.now();
    if(m.type==='configure'){this.configure(p,m);return;}
    if(m.type==='select-character'){
      if(r.match&&r.match.state.phase!=='over'){this.error(p,'比赛中不能更换角色');return;}
      if(!isCharacterId(m.characterId)){this.error(p,'角色不存在，请重新选择');return;}
      r.seats[seat]!.characterId=m.characterId;for(const member of r.seats)if(member)member.ready=false;
      this.roomUpdate(r);return;
    }
    if(m.type==='ready'){
      if(r.seats.some(member=>!member||!member.bot&&!member.ws)){this.error(p,'等待好友加入，或请房主添加电脑后再准备');return;}
      if(r.match&&r.match.state.phase!=='over')return;
      r.seats[seat]!.ready=true;
      if(r.seats.every(member=>member?.bot||member?.ready)){
        this.start(r);
      }
      this.roomUpdate(r);return;
    }
    if(m.type==='input'&&r.match&&!this.view(r).paused){
      const now=Date.now();if(now-p.lastInput<12)return;p.lastInput=now;
      r.match.input(seat,m.command);
    }
  }
  private detach(p:Peer,explicit:boolean){
    if(p.searching){p.searching=null;this.matchmaking=this.matchmaking.filter(candidate=>candidate!==p);}
    const r=p.room,seat=p.seat;
    if(r&&seat!==null&&r.seats[seat]?.ws===p.ws){
      r.updated=Date.now();
      const member=r.seats[seat]!;member.ws=null;member.gone=Date.now();member.ready=false;
      if(explicit){
        if(r.match&&r.match.state.phase!=='over')r.match.finish(other(seat),'对手离开了球场');
        r.seats[seat]=null;this.clearReady(r);this.hostAfterLeave(r);
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
      const active=!!r.match&&r.match.state.phase!=='over';
      if(r.seats.every(m=>!m?.ws)&&now-r.updated>this.reconnectMs || !active&&now-r.updated>900_000){
        r.match?.dispose();this.rooms.delete(code);
        for(const p of this.peers.values())if(p.room===r){p.room=null;p.seat=null;send(p.ws,{type:'error',terminal:true,message:'房间已结束，请重新创建'});}
        continue;
      }
      let changed=false;
      r.seats.forEach((m,i)=>{
        if(m?.gone&&now-m.gone>this.reconnectMs){
          if(r.match&&r.match.state.phase!=='over')r.match.finish(other(i as Seat),'对手断线超时');
          r.seats[i]=null;this.clearReady(r);this.hostAfterLeave(r);changed=true;
        }
      });
      if(changed)this.roomUpdate(r);
      const paused=this.view(r).paused;
      if(r.match&&!paused){
        r.seats.forEach((member,i)=>{if(member?.bot)driveAI(r.match!,i as Seat,'standard');});
        r.match.step(dt);
      }
      if(r.match&&broadcast)this.broadcast(r,{type:'state',state:r.match.state,seq:++r.seq,paused});
    }
  }
  dispose(){for(const ws of this.peers.keys())ws.terminate();for(const r of this.rooms.values())r.match?.dispose();this.matchmaking=[];this.rooms.clear();this.peers.clear();}
}
