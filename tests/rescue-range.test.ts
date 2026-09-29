import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {RESCUE,rescueTarget,rescueChance} from '../src/simulation/rescue.js';
import {handedness} from '../src/simulation/characters.js';
import {side,type Seat,type RescueStroke} from '../src/simulation/types.js';
import {Athlete} from '../src/render/player.js';
import {model} from './helpers/athlete-model.js';
import {disposeTree} from '../src/render/dispose.js';

before(initPhysics);
const shot={type:'shot' as const,aim:0,depth:.55,power:.7,lob:false};
function fixture(kind:RescueStroke,seat:Seat,id='lin',random=()=>0,gap=3.65){
 const m=new Match([id,id],random),p=m.state.players[seat],sign=side(seat),depth=kind==='volley'?4:10;
 m.state.phase='rally';m.state.rally=2;m.step(.08);
 Object.assign(p,{x:0,z:depth*sign,tx:0,tz:depth*sign,vx:0,vz:0,stamina:.08,totalStamina:.8});
 m.physics.place({x:gap*(kind==='backhand'?-1:1)*sign*handedness(id),y:kind==='smash'?2.9:kind==='volley'?1.9:1.2,z:(depth-1.8)*sign},{x:0,y:0,z:10*sign});
 Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:kind==='forehand'||kind==='backhand'?1:0});
 return m;
}
test('new lateral reach catches balls outside the previous 2.5m body-travel limit with actual skinned racket contact',async()=>{
 for(const id of ['lin','noah','wuming'])for(const seat of [0,1] as Seat[]){
  const a=new Athlete(seat);a.attachModel((await model(id==='lin'?'athlete':`characters/${id}`)).scene);
  try{
   for(const kind of ['forehand','backhand','volley','smash'] as RescueStroke[]){
    const m=fixture(kind,seat,id),p=m.state.players[seat],z=p.z;
    try{
     const target=rescueTarget(m.state.ball,p,seat);
     assert.ok(target,`${id}/${seat}/${kind}: wider candidate`);
     assert.ok(Math.abs(target.x-p.x)>2.5,'fixture exercises newly added range');
     assert.ok(Math.abs(target.x-p.x)<=3.5);
     m.input(seat,shot);assert.ok(p.rescue);
     for(let i=0;i<60&&m.state.rally===2;i++){
      const oldX=p.x;m.step(1/120);a.update(p,m.state.time,1/120);
      assert.equal(p.z,z,'still lateral-only');
      assert.ok(Math.abs(p.x-oldX)<.31,'continuous travel rather than teleporting');
     }
     assert.equal(m.state.rally,3,`${id}/${seat}/${kind}: legal return`);
     assert.equal(m.state.ball.rescue,true);
     const tip=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3()),hit=p.contact!;
     assert.ok(tip.distanceTo(new Vector3(hit.x,hit.y,hit.z))<.1,`${id}/${seat}/${kind}: real racket reaches ball`);
     for(let i=0;i<160&&p.rescue;i++){m.step(1/120);a.update(p,m.state.time,1/120);}
     assert.equal(p.rescue,undefined);
    }finally{m.dispose();}
   }
  }finally{disposeTree(a.root);}
 }
});
test('wider reach retains the stamina lottery, one attempt per flight, recovery delay and far limit',()=>{
 assert.equal(rescueChance(1),.9);assert.equal(rescueChance(1/3),.1);
 assert.equal(RESCUE.duration,1.18);assert.ok(Math.abs(RESCUE.duration-RESCUE.riseAt-.5)<1e-10);
 for(const seat of [0,1] as Seat[]){
  let draws=0;const m=fixture('forehand',seat,'lin',()=>{draws++;return .99;});
  try{
   for(let i=0;i<30;i++){m.input(seat,shot);m.step(1/60);}
   assert.equal(draws,1);assert.notEqual(m.state.ball.rescue,true);
  }finally{m.dispose();}
  const far=fixture('forehand',seat,'lin',()=>{throw Error('unreachable ball must not roll');},5);
  try{
   assert.equal(rescueTarget(far.state.ball,far.state.players[seat],seat),null);
   far.input(seat,shot);assert.equal(far.state.players[seat].rescue,undefined);
  }finally{far.dispose();}
 }
});
