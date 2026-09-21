import { WebSocket } from 'ws';
import {SnapshotPlayback} from '../../src/network/playback.js';
const playback=new SnapshotPlayback(),arrivals:number[]=[],rtts:number[]=[];let lastArrival=0,frames=0;
const sampleTimer=setInterval(()=>{if(playback.sample(performance.now()))frames++;},1000/60);
let pingTimer:ReturnType<typeof setInterval>;
const metrics=(a:number[])=>{a.sort((a,b)=>a-b);return {samples:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)}};
import { aiInput } from '../../src/simulation/ai.js';
import type { MatchState,Seat } from '../../src/simulation/types.js';
import { writeFile } from 'node:fs/promises';

const characterPicks=(process.env.TEST_CHARACTERS??'lin,lin').split(',');
if(characterPicks.length!==2)throw new Error('TEST_CHARACTERS requires two IDs');
const criticalMode=process.env.TEST_CRITICAL==='1';
let criticalHits=0,lastRally=0,lastScore='0:0';
const url=process.env.TEST_WS_URL??'ws://127.0.0.1:7470/ws';
const clients=[new WebSocket(url),new WebSocket(url)];
const scores:(number[]|null)[]=[null,null];
let code='',round=0,done=false,firstScore:number[]|null=null,maxRally=0;
const started=Date.now();
const timeout=setTimeout(()=>finish(new Error('Match did not finish within 600 seconds')),600_000);
function send(seat:Seat,value:unknown){if(clients[seat].readyState===WebSocket.OPEN)clients[seat].send(JSON.stringify(value));}
async function finish(error?:Error){
  if(done)return;done=true;clearTimeout(timeout);clearInterval(sampleTimer);clearInterval(pingTimer);for(const ws of clients)ws.close();
  if(!error&&criticalMode&&criticalHits<2)error=new Error('No repeated critical shots observed');
  if(error){console.error(error.message);process.exitCode=1;return;}
  const result={verifiedAt:new Date().toISOString(),endpoint:url,transport:'two independent WebSocket clients on this computer',fullMatchScore:firstScore,characters:characterPicks,maxRally,...(criticalMode?{criticalHits,criticalPolicy:'critical on every non-lob shot'}:{}),rematchReset:true,wallSeconds:Math.round((Date.now()-started)/1000),snapshotIntervalsMs:metrics(arrivals),rttMs:metrics(rtts),renderSamples:frames,scope:'Local two-client authoritative match and playback sample integration. Not phone Wi-Fi quality or visual acceptance.'};
  await writeFile('docs/performance/network-playback.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
clients.forEach((ws,index)=>{
  const seat=index as Seat;
  ws.on('open',()=>{if(seat===0)pingTimer=setInterval(()=>send(0,{type:'ping',at:performance.now()}),1000);if(seat===0)send(0,{type:'create',name:'验证球员 A',characterId:characterPicks[0]});else if(code)send(1,{type:'join',code,name:'验证球员 B',characterId:characterPicks[1]});});
  ws.on('error',e=>finish(e));
  ws.on('message',raw=>{
    const m=JSON.parse(raw.toString());if(seat===0&&m.type==='pong')rtts.push(performance.now()-m.at);
    if(m.type==='error'){void finish(new Error(m.message));return;}
    if(m.type==='welcome'&&seat===0){code=m.code;if(clients[1].readyState===WebSocket.OPEN)send(1,{type:'join',code,name:'验证球员 B',characterId:characterPicks[1]});}
    if(m.type==='room'&&m.room.seats.every((s:any)=>s?.connected)&&!m.room.playing)send(seat,{type:'ready'});
    if(m.type==='state'){
      const state=m.state as MatchState;if(seat===0){const at=performance.now();if(lastArrival)arrivals.push(at-lastArrival);lastArrival=at;playback.push(state,at);}
      if(state.players.some((p,i)=>(p.characterId??'lin')!==characterPicks[i])){void finish(new Error('Character picks did not survive authoritative state/rematch'));return;}
      if(seat===0){const score=state.score.join(':');if(score!==lastScore){console.log(JSON.stringify({score,criticalHits}));lastScore=score;}if(state.rally>lastRally&&state.ball.critical)criticalHits++;lastRally=state.rally;}
      maxRally=Math.max(maxRally,state.maxRally);
      if(state.phase==='over'){
        scores[seat]=state.score;
        if(scores[0]&&scores[1]&&round===0){
          if(JSON.stringify(scores[0])!==JSON.stringify(scores[1])){void finish(new Error('Scores disagree'));return;}
          firstScore=state.score;round=1;send(0,{type:'ready'});send(1,{type:'ready'});
        }
      }else if(round===1){
        if(state.score[0]!==0||state.score[1]!==0||state.server!==0||state.phase!=='serve'){void finish(new Error('Rematch did not reset'));return;}
        void finish();
      }else{const input=aiInput(state,seat,'standard');if(input){if(criticalMode&&input.type==='shot'&&!input.lob){input.power=1;input.critical=true;}send(seat,{type:'input',command:input});}}
    }
  });
});
