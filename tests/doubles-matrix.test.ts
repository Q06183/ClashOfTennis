import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {driveAI} from '../src/simulation/ai.js';
import {side,type Seat} from '../src/simulation/types.js';
import {createScoring,scorePoint} from '../src/simulation/scoring.js';
before(initPhysics);
test('every doubles surface supports an entire natural four-player tiebreak and mirrored movement',async()=>{
 const results=[];
 for(const surface of ['hard','clay','grass'] as const){
  const m=new Match(['lin','mei','ines','leo'],()=>.5,{mode:'doubles',surface});
  const hitters=new Set<Seat>(),servers=new Set<Seat>();
  for(let frame=0;frame<60*1800&&m.state.phase!=='over';frame++){
   servers.add(m.state.server);
   for(const seat of [0,1,2,3] as Seat[])driveAI(m,seat,'standard');
   m.step(1/60);
   if(m.state.rally>0)hitters.add(m.state.ball.hitter);
   assert.ok(m.state.players.every((p,i)=>p.z*side(i as Seat,m.state)>.89));
  }
  assert.equal(m.state.phase,'over',`${surface}: ${m.state.score}`);
  assert.ok(m.state.maxRally>=3,`${surface} longest ${m.state.maxRally}`);
  assert.equal(servers.size,4,`${surface} service rotation`);
  assert.equal(hitters.size,4,`${surface} every player must hit`);
  assert.ok(Math.max(...m.state.score)>=7&&Math.abs(m.state.score[0]-m.state.score[1])>=2);
  results.push({surface,score:m.state.score,maxRally:m.state.maxRally,time:m.state.time,servers:[...servers],hitters:[...hitters]});
  m.dispose();
 }
 await mkdir('artifacts/doubles-surfaces-2026-09-30',{recursive:true});
 await writeFile('artifacts/doubles-surfaces-2026-09-30/natural-doubles-matrix.json',JSON.stringify(results,null,2));
});
test('standard set requires two clear games, and extended tiebreak still requires two clear points',()=>{
 const s=createScoring('standard'),p:[number,number]=[0,0];
 const game=(team:0|1)=>{let result=null;for(let i=0;i<4;i++)result=scorePoint(p,s,team);return result;};
 for(let i=0;i<5;i++){game(0);game(1);}
 assert.equal(game(0),null);assert.deepEqual(s.games,[6,5]);assert.equal(game(0),0);assert.deepEqual(s.games,[7,5]);
 const tie=createScoring(),points:[number,number]=[0,0];
 for(let i=0;i<12;i++){assert.equal(scorePoint(points,tie,0),null);assert.equal(scorePoint(points,tie,1),null);}
 assert.equal(scorePoint(points,tie,1),null);assert.equal(scorePoint(points,tie,1),1);
});
