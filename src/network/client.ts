import type { Input, MatchState, RoomView, Seat } from '../simulation/types.js';
import {saveSeat,clearSeat} from './session.js';
type Credentials={code:string;seat:Seat;token:string};
type Callbacks={welcome:(c:Credentials)=>void;room:(r:RoomView)=>void;state:(s:MatchState,paused:boolean)=>void;status:(s:string)=>void;error:(s:string)=>void;latency:(ms:number)=>void;terminal?:(s:string)=>void};
export class NetworkClient {
  private ws:WebSocket|null=null;
  private credentials:Credentials|null=null;
  private stopped=false;
  private retry:ReturnType<typeof setTimeout>|null=null;
  private ping:ReturnType<typeof setInterval>|null=null;
  private deadline=0;
  constructor(private callbacks:Callbacks){}
  connect(action:unknown){
    let awaitingResume=(action as {type?:string})?.type==='resume';
    this.stopped=false;this.callbacks.status('正在连接球场…');
    const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);this.ws=ws;
    const timeout=setTimeout(()=>{if(ws.readyState===WebSocket.CONNECTING)ws.close();},8000);
    ws.onopen=()=>{clearTimeout(timeout);if(this.stopped||ws!==this.ws){ws.close();return;}this.callbacks.status('已连接');ws.send(JSON.stringify(action));
      this.ping=setInterval(()=>this.send({type:'ping',at:Date.now()}),2500);
    };
    ws.onmessage=e=>{
      if(this.stopped||ws!==this.ws)return;
      let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.type==='welcome'){
        awaitingResume=false;
        this.deadline=0;this.credentials={code:m.code,seat:m.seat,token:m.token};
        const saved=saveSeat(JSON.stringify(this.credentials));this.callbacks.welcome(this.credentials);
        if(!saved)this.callbacks.error('浏览器无法保存房间，当前对局不受影响；刷新后需重新加入');
      }else if(m.type==='room')this.callbacks.room(m.room);
      else if(m.type==='state')this.callbacks.state(m.state,m.paused);
      else if(m.type==='pong')this.callbacks.latency(Math.max(0,Date.now()-m.at));
      else if(m.type==='error'){
        if(awaitingResume||m.terminal){this.end(m.message);return;}
        this.callbacks.error(m.message);
      }
    };
    ws.onerror=()=>{if(!this.stopped&&ws===this.ws)this.callbacks.status('连接暂时不可用');};
    ws.onclose=()=>{
      if(ws!==this.ws)return;
      clearTimeout(timeout);if(this.ping)clearInterval(this.ping);this.ping=null;
      if(this.stopped)return;
      this.callbacks.status('连接已断开，正在重连…');
      if(this.credentials){
        if(!this.deadline)this.deadline=Date.now()+29_000;
        if(Date.now()<this.deadline){this.retry=setTimeout(()=>this.connect({type:'resume',...this.credentials}),1200);return;}
      }
      this.end('无法连接球场。请检查网络后重新建房或加入。');
    };
  }
  send(value:unknown){if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(value));}
  input(command:Input){this.send({type:'input',command});}
  private end(message:string){this.close();(this.callbacks.terminal??this.callbacks.error)(message);}
  close(){this.stopped=true;if(this.retry)clearTimeout(this.retry);if(this.ping)clearInterval(this.ping);this.send({type:'leave'});this.ws?.close();clearSeat();}
}
