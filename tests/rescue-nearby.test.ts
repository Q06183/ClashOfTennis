import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {initPhysics} from '../src/simulation/physics.js';
import {Match} from '../src/simulation/match.js';
import {handedness} from '../src/simulation/characters.js';
import {side,other,type Seat} from '../src/simulation/types.js';
before(initPhysics);
const shot={type:'shot' as const,aim:0,depth:.5,power:.5,lob:false};
const cases=[{x:1.8,y:1.7,z:6,vx:0},{x:1.8,y:2.2,z:6,vx:0}];
function setup(id:string,seat:Seat,sample:typeof cases[number],random:()=>number){
 const m=new Match([id,id],random),p=m.state.players[seat],sign=side(seat),hand=handedness(id);
 m.state.phase='rally';m.state.rally=2;m.step(.08);
 Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,vx:sample.vx*sign*hand,vz:0,
  stamina:.7,totalStamina:1,preparation:undefined,backhand:false});
 m.physics.place({x:sample.x*sign*hand,y:sample.y,z:sample.z*sign},{x:0,y:1,z:9*sign});
 Object.assign(m.state.ball,m.physics.read(),{hitter:other(seat),bounces:1});
 return m;
}
test('nearby normally catchable balls never launch a rescue even with a sub-100ms contact window',()=>{
 for(const id of ['lin','noah'])for(const seat of [0,1] as Seat[])for(const dt of [1/60,1/120])for(const sample of cases){
  const control=setup(id,seat,sample,()=>1);let draws=0;
  // Disable advisory rescue staging too: a failed lottery alone is not a
  // ground-only control, because it can still change the movement target.
  (control as unknown as {tryRescue:(seat:Seat)=>boolean}).tryRescue=()=>false;
  const m=setup(id,seat,sample,()=>{draws++;return 0;});
  try{
   for(const match of [control,m]){
    match.input(seat,shot);
    for(let i=0;i<160&&match.state.rally===2&&match.state.phase==='rally';i++)match.step(dt);
   }
   assert.equal(control.state.ball.hitter,seat,`${id}/${seat}/${dt}/${JSON.stringify(sample)}: real normal-return control`);
   assert.equal(control.state.ball.rescue,false);
   assert.equal(m.state.ball.hitter,seat,'still return instead of merely disabling the jump');
   assert.equal(m.state.ball.rescue,false,`${id}/${seat}/${dt}/${sample.x}: ordinary reception wins`);
   assert.equal(draws,0,'do not even roll the rescue lottery');
   assert.equal(m.rescueDiagnostics.started,0);
  }finally{m.dispose();control.dispose();}
 }
});
test('normal direction-change footwork takes priority over a small hop at the live 60Hz tick',()=>{
 for(const id of ['lin','noah'])for(const seat of [0,1] as Seat[]){
  const sample={x:.8,y:1.2,z:6,vx:-3},control=setup(id,seat,sample,()=>1);
  (control as unknown as {tryRescue:(seat:Seat)=>boolean}).tryRescue=()=>false;
  let draws=0;const m=setup(id,seat,sample,()=>{draws++;return 0;});
  try{
   for(const match of [control,m]){
    match.input(seat,shot);
    for(let i=0;i<80&&match.state.rally===2&&match.state.phase==='rally';i++)match.step(1/60);
    assert.equal(match.state.ball.hitter,seat);assert.equal(match.state.ball.rescue,false);
   }
   assert.equal(draws,0);assert.equal(m.rescueDiagnostics.started,0);
  }finally{control.dispose();m.dispose();}
 }
});
test('nearby but physically unreachable return keeps a genuine emergency hop',()=>{
 for(const id of ['lin','noah']){
  const sample={x:.8,y:1.2,z:6,vx:-3},seat:Seat=1;
  const control=setup(id,seat,sample,()=>1);
  (control as unknown as {tryRescue:(seat:Seat)=>boolean}).tryRescue=()=>false;
  const m=setup(id,seat,sample,()=>0);
  try{
   for(const match of [control,m]){
    match.input(seat,shot);
    for(let i=0;i<160&&match.state.rally===2&&match.state.phase==='rally';i++)match.step(1/120);
   }
   assert.equal(control.state.ball.hitter,other(seat),'normal movement really cannot reach this low reversing ball');
   assert.equal(m.state.ball.hitter,seat);assert.equal(m.state.ball.rescue,true);
   assert.equal(m.rescueDiagnostics.started,1,'do not turn all nearby emergencies into misses');
  }finally{control.dispose();m.dispose();}
 }
});
test('without a swipe nearby ordinary reception still suppresses automatic flight',()=>{
 for(const seat of [0,1] as Seat[]){
  let draws=0;const m=setup('lin',seat,cases[1],()=>{draws++;return 0;});
  try{
   for(let i=0;i<44;i++){m.step(1/120);assert.equal(m.state.players[seat].rescue,undefined);}
   assert.equal(draws,0);m.input(seat,shot);
   for(let i=0;i<40&&m.state.rally===2;i++)m.step(1/120);
   assert.equal(m.state.ball.hitter,seat);assert.equal(m.state.ball.rescue,false);
  }finally{m.dispose();}
 }
});
