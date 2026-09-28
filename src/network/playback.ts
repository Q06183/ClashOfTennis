import {clamp,type MatchState,type PlayerState} from '../simulation/types.js';
import {SERVE_DURATION,serveBallHeight} from '../simulation/serve-motion.js';
import {flightGravity} from '../simulation/flight.js';
import {COURT} from '../simulation/rules.js';
type Snapshot={state:MatchState;at:number};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
/** Presentation clock only. Scoring, aiming and input remain server-authoritative. */
export class SnapshotPlayback {
 private queue:Snapshot[]=[];
 private offset=0;
 private cursor=-Infinity;
 private draw:MatchState|null=null;
 private wasFrozen=false;
 private intervals:number[]=[];
 readonly delayMs=75;
 reset(){this.queue=[];this.draw=null;this.cursor=-Infinity;this.wasFrozen=false;this.intervals=[];}
 push(state:MatchState,at:number){
  let last=this.queue.at(-1);
  if(last&&(state.time<last.state.time||at-last.at>1000)){this.reset();last=undefined;}
  if(last&&state.time===last.state.time){this.queue[this.queue.length-1]={state,at};return;}
  const offset=at-state.time*1000;
  if(!last)this.offset=offset;
  else{
   this.intervals.push(at-last.at);if(this.intervals.length>40)this.intervals.shift();
   // Filter arrival jitter instead of restarting the motion clock on every packet.
   this.offset+=clamp(offset-this.offset,-25,25)*.05;
  }
  this.queue.push({state,at});if(this.queue.length>32)this.queue.shift();
 }
 stats(now:number){
  const mean=this.intervals.reduce((a,b)=>a+b,0)/(this.intervals.length||1);
  return {hz:mean?Math.round(1000/mean):0,jitterMs:mean?Math.round(Math.sqrt(this.intervals.reduce((n,x)=>n+(x-mean)**2,0)/this.intervals.length)):0,gapMs:Math.max(0,Math.round(now-(this.queue.at(-1)?.at??now)))};
 }
 private copy(state:MatchState){
  if(!this.draw)this.draw=structuredClone(state);
  const out=this.draw,players=out.players,ball=out.ball;
  Object.assign(out,state,{players,ball});Object.assign(ball,state.ball);
  for(const key of ['tier','skill','topspin','slice'] as const)if(!(key in state.ball))delete ball[key];
  for(let i=0;i<2;i++)Object.assign(players[i],state.players[i],{
   serveCourt:state.players[i].serveCourt,strokeSpin:state.players[i].strokeSpin,preparation:state.players[i].preparation,contact:state.players[i].contact,rescue:state.players[i].rescue,
   totalStamina:state.players[i].totalStamina,pointStaminaSpent:state.players[i].pointStaminaSpent,
   pointStaminaCost:state.players[i].pointStaminaCost,pointStaminaSettled:state.players[i].pointStaminaSettled,
  });
  return out;
 }
 sample(now:number,frozen=false):MatchState|null{
  const latest=this.queue.at(-1);if(!latest)return null;
  if(frozen||latest.state.phase==='over'){this.wasFrozen=true;return this.copy(latest.state);}
  if(this.wasFrozen){this.queue=[latest];this.offset=latest.at-latest.state.time*1000;this.cursor=-Infinity;this.wasFrozen=false;}
  const time=clamp(Math.max(this.cursor,(now-this.offset-this.delayMs)/1000),this.queue[0].state.time,latest.state.time+.05);
  this.cursor=time;
  while(this.queue.length>2&&this.queue[1].state.time<=time)this.queue.shift();
  let a=this.queue[0].state,b:MatchState|undefined;
  for(const item of this.queue){if(item.state.time<=time)a=item.state;else{b=item.state;break;}}
  const out=this.copy(a),age=Math.max(0,time-a.time);out.time=time;
  // Never blend across a point reset, score change, or new character selection.
  const continuous=b&&a.phase===b.phase&&a.score[0]===b.score[0]&&a.score[1]===b.score[1]&&a.players.every((p,i)=>p.characterId===b!.players[i].characterId);
  if(continuous&&b){
   const t=clamp(age/(b.time-a.time),0,1);
   for(let i=0;i<2;i++){
    const p=out.players[i],from=a.players[i],to=b.players[i];
    p.x=mix(from.x,to.x,t);p.z=mix(from.z,to.z,t);p.vx=mix(from.vx??0,to.vx??0,t);p.vz=mix(from.vz??0,to.vz??0,t);p.stamina=mix(from.stamina,to.stamina,t);
    if(from.totalStamina!==undefined&&to.totalStamina!==undefined)p.totalStamina=mix(from.totalStamina,to.totalStamina,t);
    this.animate(p,from,age);
    if(from.preparation&&to.preparation&&from.preparation.stroke===to.preparation.stroke)p.preparation={...from.preparation,progress:mix(from.preparation.progress,to.preparation.progress,t),contact:{x:mix(from.preparation.contact.x,to.preparation.contact.x,t),y:mix(from.preparation.contact.y,to.preparation.contact.y,t),z:mix(from.preparation.contact.z,to.preparation.contact.z,t)}};
   }
   if(a.ball.hitter===b.ball.hitter&&a.ball.bounces===b.ball.bounces&&a.rally===b.rally){
    for(const key of ['x','y','z','vx','vy','vz'] as const)out.ball[key]=mix(a.ball[key],b.ball[key],t);
   }else this.advanceBall(out,Math.min(age,.05));
  }else if(!b){
   const dt=Math.min(age,.05);
   if(a.phase==='rally')for(let i=0;i<2;i++){const p=out.players[i];p.x+=(p.vx??0)*dt;p.z+=(p.vz??0)*dt;this.animate(p,a.players[i],dt);}
   this.advanceBall(out,dt);
  }
  // Keep the toss moving up to the known hit packet, without predicting a hit
  // or carrying a service animation through a score/reset boundary.
  const serveBoundary=b&&b.phase==='rally'&&b.rally===a.rally+1&&b.server===a.server&&a.score.every((score,i)=>score===b!.score[i])&&a.players.every((p,i)=>p.characterId===b!.players[i].characterId);
  if(a.phase==='serve'&&a.players[a.server].preparation?.stroke==='serve'&&(!b||continuous||serveBoundary)){
   const from=a.players[a.server],player=out.players[a.server];this.animate(player,from,Math.min(age,.05));
   out.ball.y=serveBallHeight(player.preparation!.progress);
  }
  return out;
 }
 private animate(out:PlayerState,from:PlayerState,dt:number){
  out.swing=Math.max(0,from.swing-dt);
  if(from.preparation)out.preparation={...from.preparation,progress:Math.min(.999,from.preparation.progress+dt/(from.preparation.stroke==='serve'?SERVE_DURATION:.65))};
 }
 private advanceBall(out:MatchState,dt:number){
  if(out.phase!=='rally')return;
  const b=out.ball,g=flightGravity(b);
  // At most 50ms of dead reckoning; stop at ground/net instead of inventing a bounce/hit.
  const ground=(b.vy+Math.sqrt(b.vy*b.vy+2*g*Math.max(0,b.y-COURT.ballRadius)))/g;
  let t=Math.min(dt,Math.max(0,ground));const net=b.vz===0?-1:-b.z/b.vz;
  if(net>0&&net<t&&b.y+b.vy*net-g/2*net*net<COURT.net+COURT.ballRadius)t=net;
  b.x+=b.vx*t;b.y=Math.max(COURT.ballRadius,b.y+b.vy*t-g/2*t*t);b.z+=b.vz*t;
 }
}
