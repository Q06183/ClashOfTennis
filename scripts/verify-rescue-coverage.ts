import {mkdir,writeFile} from 'node:fs/promises';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {rescueTarget} from '../src/simulation/rescue.js';
import {Match as Before} from '../artifacts/rescue-coverage-2026-09-30/src/simulation/match.js';
import {rescueTarget as beforeTarget} from '../artifacts/rescue-coverage-2026-09-30/src/simulation/rescue.js';
await initPhysics();
const rows:any[]=[];
for(const gap of [1.15,2,3,3.8])for(const speed of [2.5,6,12])for(const arrival of [.24,.45,.7])
for(const vx of [-3,0,3])for(const stamina of [.15,.7]){
 const scenario={gap,speed,arrival,vx,stamina};
 const result:any={scenario};
 for(const [name,Class,target] of [['before',Before,beforeTarget],['after',Match,rescueTarget]] as const){
  let draws=0;const m=new Class(['lin','lin'],()=>{draws++;return 0;}),p=m.state.players[0];
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:0,z:10,tx:gap,tz:10,vx,vz:0,stamina,totalStamina:stamina});
   m.physics.place({x:gap,y:1.7,z:10-speed*arrival},{x:0,y:1,z:speed});
   Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:1});
   const candidate=!!target(m.state.ball,p,0);
   let started=false,short=false,when=0,minZ=Infinity,maxZ=-Infinity,peakSpeed=0;
   m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
   for(let i=0;i<150&&m.state.phase==='rally'&&m.state.rally===2;i++){
    if(p.rescue){if(!started)when=m.state.time;started=true;short||=!!('short' in p.rescue&&p.rescue.short);
     minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
    const beforeX=p.x,was=p.rescue;m.step(1/120);
    if(was)peakSpeed=Math.max(peakSpeed,Math.abs(p.x-beforeX)*120);
   }
   started||=!!p.rescue;
   result[name]={candidate,started,short,when,returned:m.state.rally===3,rescueHit:m.state.ball.rescue===true,
    draws,lateralOnly:!started||maxZ-minZ<1e-9,peakSpeed,...('rescueDiagnostics'in m?{diagnostics:m.rescueDiagnostics}:{})};
  }finally{m.dispose();}
 }
 rows.push(result);
}
const summary:any={cases:rows.length,scope:'Synthetic equal-input before/after sweep, RNG forced success to isolate eligibility, NOT live match frequency.'};
for(const name of ['before','after'])summary[name]={
 candidates:rows.filter(r=>r[name].candidate).length,starts:rows.filter(r=>r[name].started).length,
 short:rows.filter(r=>r[name].short).length,actualRescueHits:rows.filter(r=>r[name].rescueHit).length,
 allReturns:rows.filter(r=>r[name].returned).length,missedDives:rows.filter(r=>r[name].started&&!r[name].rescueHit).length,
 maxDiveSpeed:Math.max(...rows.map(r=>r[name].peakSpeed)),
};
summary.newRescueHits=rows.filter(r=>!r.before.rescueHit&&r.after.rescueHit).length;
summary.lostReturns=rows.filter(r=>r.before.returned&&!r.after.returned).length;
summary.lostRescueHits=rows.filter(r=>r.before.rescueHit&&!r.after.rescueHit).length;
await mkdir('artifacts/rescue-coverage-2026-09-30',{recursive:true});
await writeFile('artifacts/rescue-coverage-2026-09-30/coverage.json',JSON.stringify({summary,rows},null,2));
console.log(JSON.stringify(summary,null,2));
