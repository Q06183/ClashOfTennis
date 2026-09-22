import {aiInput} from '../../src/simulation/ai.js';
import {writeFile} from 'node:fs/promises';
import {CHARACTERS} from '../../src/simulation/characters.js';import {Match} from '../../src/simulation/match.js';import {initPhysics} from '../../src/simulation/physics.js';import {side,type Seat} from '../../src/simulation/types.js';
await initPhysics();
const ids=CHARACTERS.map(c=>c.id),rows=Object.fromEntries(ids.map(id=>[id,{games:0,wins:0,points:0,conceded:0}]));const games:any[]=[];
for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++)for(const flip of [false,true])for(const polarity of [1,-1])for(const policy of ['rally','attack','net'])for(const seed of Array.from({length:12},(_,i)=>i+1+Number(process.env.BALANCE_SEED_OFFSET??0))){
 const pair:[string,string]=flip?[ids[b],ids[a]]:[ids[a],ids[b]];let randomState=seed;const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};const m=new Match(pair,random);let faults=0,lastEvent=-1;
 for(let tick=0;tick<60*1800&&m.state.phase!=='over';tick++){
  const s=m.state;
  for(const seat of [0,1] as Seat[]){
   const command=aiInput({...s,time:s.time+seed*2.31},seat,'standard');
   if(command){
    if(command.type==='move'&&policy==='net')command.z=side(seat)*(s.rally>=3&&s.rally%5===3?4.5:9.8);
    if(command.type==='shot'&&s.phase==='rally'){command.aim=Math.sin(seed*12.71+(s.score[0]+s.score[1])*6.23+s.rally*4.39)*.93;}
    if(command.type==='shot'&&s.phase==='rally'&&policy==='attack'){command.power=.86;command.depth=Math.min(command.depth,.78);}
    if(command.type==='shot')command.aim*=polarity;else command.x*=polarity;
    m.input(seat,command);
   }
  }
  m.step(1/60);
  if(m.state.eventId!==lastEvent){lastEvent=m.state.eventId;if(m.state.event.includes('双误')||m.state.event.includes('一发'))faults++;}
 }
 if(m.state.phase!=='over')throw new Error(`Nonterminal: ${pair},${policy},${seed} ${JSON.stringify({score:m.state.score,rally:m.state.rally,phase:m.state.phase,maxRally:m.state.maxRally})}`);
 const result={pair,policy,polarity,seed,score:m.state.score,winner:m.state.winner,maxRally:m.state.maxRally,faults};games.push(result);
 for(const seat of [0,1] as Seat[]){const row=rows[pair[seat]];row.games++;row.wins+=Number(m.state.winner===seat);row.points+=m.state.score[seat];row.conceded+=m.state.score[1-seat];}
 m.dispose();
}
const summary=Object.fromEntries(Object.entries(rows).map(([id,r])=>[id,{...r,winRate:r.wins/r.games,pointShare:r.points/(r.points+r.conceded)}]));
const pairs=ids.flatMap((a,i)=>ids.slice(i+1).map(b=>{const samples=games.filter(g=>g.pair.includes(a)&&g.pair.includes(b));return {a,b,games:samples.length,aWinRate:samples.filter(g=>g.pair[g.winner]===a).length/samples.length};}));
const report={verifiedAt:new Date().toISOString(),scope:'Deterministic automated balance harness, three policies, twelve seeded RNG streams, both seats and both aim/recovery polarities. Not human balance acceptance.',summary,pairs,pass:Object.values(summary).every(s=>s.winRate>=.4&&s.winRate<=.6)&&pairs.every(p=>p.aWinRate>=.3&&p.aWinRate<=.7),games};
await writeFile(process.env.BALANCE_REPORT??'docs/character-balance.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary,pairs,pass:report.pass},null,2));
