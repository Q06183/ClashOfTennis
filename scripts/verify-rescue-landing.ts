/** Deterministic real-Match replay fixtures, not a live-production acceptance test. */
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initPhysics} from '../src/simulation/physics.js';
import {Match} from '../src/simulation/match.js';
import {RESCUE} from '../src/simulation/rescue.js';
import {handedness} from '../src/simulation/characters.js';
import {side,other,type Seat,type PlayerState} from '../src/simulation/types.js';
import {rescueIncoming} from '../tests/helpers/rescue-incoming.js';

await initPhysics();
const clips=[];
for(const id of ['lin','noah'])for(const seat of [0,1] as Seat[])for(const short of [true,false])for(const move of [false,true]){
 const m=new Match([id,id],()=>0),p=m.state.players[seat],sign=side(seat),hand=handedness(id);
 try{
  m.state.phase='rally';m.state.rally=2;m.step(.08);
  Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,vx:0,vz:0,stamina:.08,totalStamina:1,preparation:undefined,backhand:false});
  if(short){
   Object.assign(p,{tx:1.15*sign*hand,vx:-3*sign*hand,stamina:.15,totalStamina:.15});
   m.physics.place({x:1.15*sign*hand,y:1.7,z:5.95*sign},{x:0,y:1,z:9*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:other(seat),bounces:1});
  }else rescueIncoming(m,seat);
  m.input(seat,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
  const frames:{time:number;player:PlayerState;ball:typeof m.state.ball}[]=[];
  let launch:NonNullable<PlayerState['rescue']>|undefined,unlock:number|undefined,contact:number|undefined;
  for(let i=0;i<360;i++){
   if(p.rescue&&!launch)launch=structuredClone(p.rescue);
   if(p.rescue?.hit&&contact===undefined)contact=m.state.time;
   if(launch&&!p.rescue&&unlock===undefined)unlock=m.state.time;
   frames.push({time:m.state.time,player:structuredClone(p),ball:structuredClone(m.state.ball)});
   if(launch&&move&&contact!==undefined&&unlock===undefined)
    m.input(seat,{type:'move',x:launch.toX+sign*hand*1.5,z:launch.toZ});
   if(unlock!==undefined&&m.state.time>=unlock+.45)break;
   m.step(1/120);
  }
  assert.ok(launch&&unlock!==undefined&&contact!==undefined);
  assert.equal(launch.short,short);assert.equal(m.state.ball.rescue,true);
  const expectedUnlock=launch.startedAt+launch.travel!+(short?RESCUE.landAt:RESCUE.duration)-RESCUE.travel;
  assert.ok(Math.abs(unlock-expectedUnlock)<1/120+1e-8);
  if(!move)assert.equal(p.x,launch.toX);
  else assert.ok((p.x-launch.toX)*sign*hand>.05);
  clips.push({id,seat,short,move,launch,contact,unlock,expectedUnlock,finalX:p.x,frames});
 }finally{m.dispose();}
}
await mkdir('artifacts/rescue-landing',{recursive:true});
await writeFile('artifacts/rescue-landing/clips.json',JSON.stringify(clips));
const report=clips.map(({frames,...metadata})=>({...metadata,frameCount:frames.length}));
await writeFile('artifacts/rescue-landing/replay-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
