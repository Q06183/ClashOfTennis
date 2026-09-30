import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {movePlayer} from '../src/simulation/movement.js';
import {reception} from '../src/simulation/reception.js';
import {airInterception,canReturnNormally} from '../src/simulation/skills.js';
import {returnPlan} from '../src/simulation/return-plan.js';
import {overheadPlan} from '../src/simulation/overhead-plan.js';
import {rescueTarget,rescueMotionBounds} from '../src/simulation/rescue.js';
import {COURT,isInCourt,isInServiceBox} from '../src/simulation/rules.js';
import {side,type MatchMode,type Seat,type PlayerState} from '../src/simulation/types.js';
import {PerspectiveCamera,Vector3} from 'three';
import {frameMatch} from '../src/render/camera.js';

before(initPhysics);
const returnShot={type:'shot',aim:0,depth:.5,power:.5,lob:false} as const;
function resetPoint(m:Match,total:number,ends:0|1,dt:number){
 const s=m.state;s.score=[total,0];s.scoring!.ends=ends;s.phase='point';s.pointTimer=0;m.step(dt);
}

// Public scoring/reset path puts the same server on both service courts.
for(const mode of ['singles','doubles'] as MatchMode[])for(const ends of [0,1] as const)
for(const server of [0,1] as const)for(const wing of [-1,1]){
 test(`${mode}/ends ${ends}/server ${server}/wing ${wing}: mirrored corner serve has an ordinary legal return`,()=>{
  const m=new Match(['lin','lin','lin','lin'],()=>1,{mode});
  try{
   const s=m.state;
   const total=server===0?(wing<0?0:mode==='doubles'?7:3):(wing<0?2:1);
   resetPoint(m,total,ends,1/120);
   assert.equal(s.server,server);
   const receiver=s.receiver!,sign=side(server,s);
   m.input(server,{...returnShot,aim:wing,depth:.6,power:1,critical:true});
   while(s.phase==='serve')m.step(1/120);
   assert.ok(isInServiceBox(s.ball.targetX,s.ball.targetZ,server,total,ends));
   assert.ok(Math.abs(s.ball.targetX-wing*4*sign)<1e-6);
   m.input(receiver,returnShot);
   let bounced=false;
   for(let i=0;i<600&&s.phase==='rally'&&s.rally===1;i++){
    m.step(1/120);bounced||=s.ball.bounces===1;
   }
   assert.ok(bounced,'serve must bounce before the queued return');
   assert.equal(s.rally,2,`${s.event}; receiver x=${s.players[receiver].x}`);
   assert.equal(s.ball.hitter,receiver);
   assert.equal(s.ball.rescue,false,'ordinary footwork, no lottery or expanded arm reach');
   const p=s.players[receiver];
   assert.ok(p.contact&&canReturnNormally({...s.ball,...p.contact,bounces:1,vy:0},p,receiver));
  }finally{m.dispose();}
 });
}

for(const seat of [0,1,2,3] as Seat[])for(const ends of [0,1] as const)for(const wing of [-1,1]){
 test(`seat ${seat}/ends ${ends}/wing ${wing}: manual target and physical mover share 8m runoff`,()=>{
  const m=new Match(['lin','lin','lin','lin'],()=>1,{mode:'doubles'});
  try{
   const s=m.state,p=s.players[seat];s.phase='rally';s.ends=ends;p.ends=ends;
   m.input(seat,{type:'move',x:wing*20,z:side(seat,s)*10});
   assert.equal(p.tx,wing*8);
   for(let i=0;i<240;i++)movePlayer(p,seat,1/60);
   assert.ok(Math.abs(p.x-wing*8)<.04);
   p.x=wing*7.99;p.vx=wing*6;p.tx=wing*20;
   movePlayer(p,seat,1/60);
   assert.equal(p.x,wing*8);assert.equal(p.vx,0);
  }finally{m.dispose();}
 });
}

test('ordinary reception can chase a legal ball after it travels beyond the old runoff',()=>{
 for(const seat of [0,1] as const)for(const wing of [-1,1])for(const id of ['lin','noah','adrian','luca']){
  const sign=side(seat),p:PlayerState={characterId:id,x:wing*7*sign,z:10*sign,tx:0,tz:10*sign,stamina:1,swing:0,stroke:'forehand',moving:false};
  const b={x:wing*7.4*sign,y:1.1,z:9.4*sign,vx:0,vy:0,vz:2*sign,bounces:1,hitter:(1-seat) as Seat,targetX:0,targetZ:0};
  const target=reception(b,p,seat);
  assert.ok(Math.abs(target.x)>6.4&&Math.abs(target.x)<=8,`${id}/${seat}/${wing}: ${target.x}`);
  assert.ok(canReturnNormally({...b,...target.point},{...p,x:target.x,z:target.z},seat),'target must satisfy unchanged physical reach');
 }
});

test('extra runoff does not enlarge court lines or the service box',()=>{
 assert.equal(COURT.halfWidth,4.115);assert.equal(COURT.doublesHalfWidth,5.485);
 for(const wing of [-1,1]){
  assert.equal(isInCourt(wing*6,8,0,'doubles'),false);
  assert.equal(isInCourt(wing*4.2,8,0),false);
  assert.equal(isInServiceBox(wing*5,5,1,wing>0?0:1),false);
 }
});

test('wide air interception, volley planning and overhead planning use the expanded runoff',()=>{
 for(const seat of [0,1] as const)for(const wing of [-1,1]){
  const sign=side(seat),p:PlayerState={characterId:'ines',x:wing*7*sign,z:4*sign,tx:wing*7*sign,tz:4*sign,stamina:1,swing:0,stroke:'forehand',moving:false};
  const b={x:wing*7.4*sign,y:1.8,z:2*sign,vx:0,vy:2,vz:4*sign,bounces:0,hitter:(1-seat) as Seat,targetX:0,targetZ:0};
  const air=airInterception(b,p,seat);
  assert.ok(Math.abs(air.x)>6.4&&Math.abs(air.x)<=8);
  const volley=returnPlan(b,p,seat,false);
  assert.equal(volley.air,true);assert.ok(Math.abs(volley.x)>6.4&&Math.abs(volley.x)<=8);
  const overhead=overheadPlan({...b,y:4,z:3*sign,vy:1,vz:5*sign},p,seat);
  assert.ok(overhead);assert.ok(Math.abs(overhead.x)>6.4&&Math.abs(overhead.x)<=8);
 }
});

test('lateral rescue can finish outside 6.4m but its entire motion remains inside 8m',()=>{
 for(const seat of [0,1] as const)for(const wing of [-1,1]){
  const sign=side(seat),p:PlayerState={characterId:'lin',x:wing*6*sign,z:10*sign,tx:wing*6*sign,tz:10*sign,stamina:1,swing:0,stroke:'forehand',moving:false};
  const b={x:wing*8*sign,y:1.8,z:9.6*sign,vx:0,vy:0,vz:1.8*sign,bounces:1,hitter:(1-seat) as Seat,targetX:0,targetZ:0};
  const target=rescueTarget(b,p,seat);
  assert.ok(target);assert.ok(Math.abs(target.x)>6.4&&Math.abs(target.x)<=8);
  const bounds=rescueMotionBounds(target.x-p.x,target.travel,target.launchVx);
  assert.ok(p.x+bounds.min>=-8&&p.x+bounds.max<=8);
  assert.equal(rescueTarget({...b,x:wing*10*sign},p,seat),null);
 }
});

test('corner reception keeps a usable window at 30/60/120Hz for both hands and backhand styles',()=>{
 for(const fps of [30,60,120])for(const surface of ['hard','clay','grass'] as const)
 for(const id of ['lin','noah','luca'])for(const wing of [-1,1]){
  const m=new Match(['lin',id],()=>1,{surface});
  try{
   const s=m.state;resetPoint(m,wing<0?0:3,0,1/fps);
   m.input(0,{...returnShot,aim:wing,depth:.6,power:1,critical:true});
   while(s.phase==='serve')m.step(1/fps);
   m.input(1,returnShot);
   for(let i=0;i<5*fps&&s.phase==='rally'&&s.rally===1;i++)m.step(1/fps);
   assert.equal(s.rally,2,`${fps}Hz/${surface}/${id}/${wing}: ${s.event}`);
   assert.equal(s.ball.rescue,false);
  }finally{m.dispose();}
 }
});

test('normal slow backhand spacing is retained while fast outward chase closes the stance',()=>{
 const p:PlayerState={characterId:'lin',x:0,z:10,tx:0,tz:10,stamina:1,swing:0,stroke:'forehand',moving:false};
 const b={x:-2,y:1.1,z:9.4,vx:-3,vy:0,vz:2,bounces:1,hitter:1 as Seat,targetX:0,targetZ:0};
 const slow=reception(b,p,0),fast=reception({...b,vx:-8},p,0),inward=reception({...b,vx:8},p,0);
 assert.ok(slow.backhand&&fast.backhand&&inward.backhand);
 assert.ok(Math.abs(slow.x-slow.point.x-.65)<1e-8);
 assert.ok(Math.abs(inward.x-inward.point.x-.65)<1e-8);
 assert.ok(Math.abs(fast.x-fast.point.x-.3)<1e-8);
 assert.ok(Math.abs(fast.z-fast.point.z-.35)<1e-8);
});

test('near and far cameras retain players at either expanded movement edge',()=>{
 for(const seat of [0,1] as const)for(const wing of [-1,1])
 for(const [w,h] of [[390,844],[844,390]])for(const distance of ['near','far'] as const){
  const c=new PerspectiveCamera(),sign=side(seat);
  frameMatch(c,w,h,seat,wing*8,10,{x:0,z:-10*sign},distance);
  for(const y of [0,2]){
   const projected=new Vector3(wing*8,y,10*sign).project(c);
   assert.ok(Math.abs(projected.x)<.94&&Math.abs(projected.y)<.9);
  }
 }
});
