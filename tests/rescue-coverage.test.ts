import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {initPhysics} from '../src/simulation/physics.js';
import * as rescue from '../src/simulation/rescue.js';
import {Match} from '../src/simulation/match.js';
import {side,type PlayerState,type BallState} from '../src/simulation/types.js';
import {SkinnedMesh,Vector3} from 'three';
import {Athlete} from '../src/render/player.js';
import {model} from './helpers/athlete-model.js';
import {disposeTree} from '../src/render/dispose.js';
import {handedness} from '../src/simulation/characters.js';
before(initPhysics);

test('running lateral rescue inherits velocity without increasing travel speed or acceleration limits',()=>{
 const p:PlayerState={x:0,z:10,tx:3,tz:10,vx:5,vz:0,moving:true,stamina:1,swing:0,stroke:'forehand',
  rescue:{startedAt:0,fromX:0,fromZ:10,toX:2,toZ:10,travel:.4,natural:true,launchVx:5,contact:{x:2.6,y:1.3,z:10},hit:false}};
 const original=rescue.rescueMotionBounds(2,.4,0),running=rescue.rescueMotionBounds(2,.4,5);
 assert.ok(original.acceleration>rescue.RESCUE.acceleration);
 assert.ok(running.acceleration<=rescue.RESCUE.acceleration&&running.speed<=rescue.RESCUE.travelSpeed);
 rescue.moveRescue(p,0,1/200);
 assert.equal(p.vx,5,'the takeoff tick must keep the inherited velocity');
 let previousV=5;
 for(let i=1;i<=80;i++){
  const x=p.x;rescue.moveRescue(p,i/200,1/200);
  assert.ok(Math.abs(p.x-x)<9/200+1e-8);
  if(i===1)assert.ok(Math.abs(p.vx!-5)<.2,'must not discard running momentum');
  assert.ok(Math.abs(p.vx!-previousV)<=65/200+.01,'bounded acceleration');
  assert.equal(p.z,10);previousV=p.vx!;
 }
 assert.ok(Math.abs(p.x-2)<1e-8);
});

test('short step-out recovers sooner without shrinking its real contact phase or changing chance',()=>{
 const base:PlayerState={x:0,z:10,tx:0,tz:10,moving:false,stamina:1,swing:0,stroke:'forehand',
  rescue:{startedAt:0,fromX:0,fromZ:10,toX:.5,toZ:10,travel:.2,natural:true,contact:{x:1.1,y:1.3,z:10},hit:true,recovery:'step-out'}};
 const short=structuredClone(base);short.rescue!.short=true;
 assert.equal(rescue.rescueAge(short,.2),.2);
 assert.ok(Math.abs(rescue.rescueAge(short,.4)-.4)<1e-9);
 rescue.moveRescue(short,.95,1/60);rescue.moveRescue(base,.95,1/60);
 assert.equal(short.rescue,undefined);assert.ok(base.rescue);
 assert.equal(rescue.rescueChance(1),.9);assert.equal(rescue.rescueChance(.5),.225);assert.equal(rescue.rescueChance(1/3),.1);
});

test('early rescue preparation uses real footwork to close depth, not airborne forward travel',()=>{
 const p:PlayerState={characterId:'lin',x:0,z:12,tx:0,tz:12,vx:0,vz:0,stamina:.1,totalStamina:.8,moving:false,swing:0,stroke:'forehand'};
 let found=false;
 for(const x of [2,2.5,3,3.5])for(const z of [4,5,6])for(const vy of [2,4,6]){
  const b:BallState={x,y:2,z,vx:0,vy,vz:7,bounces:0,hitter:1,targetX:x,targetZ:10};
  const saved=structuredClone(p),plan=rescue.rescueApproach(b,p,0);
  assert.deepEqual(p,saved,'forecast must not move the actual player');
  if(plan){found=true;assert.ok(plan.wait>0);assert.ok(Math.abs(plan.z-p.z)>.01);}
 }
 assert.ok(found,'at least one approaching legal ball admits a ground-stage then lateral dive');
});

test('a slow short emergency is not excluded just because ball speed is below 3m/s',()=>{
 for(const seat of [0,1] as const){
  const sign=side(seat),p:PlayerState={characterId:'lin',x:0,z:10*sign,tx:0,tz:10*sign,vx:2*sign,stamina:.2,totalStamina:.2,moving:true,swing:0,stroke:'forehand'};
  const b:BallState={x:1.15*sign,y:1.8,z:9.6*sign,vx:0,vy:0,vz:1.8*sign,bounces:1,hitter:seat===0?1:0,targetX:0,targetZ:0};
  const target=rescue.rescueTarget(b,p,seat);
  assert.ok(target,'short legal candidate');assert.ok(target.short);
  assert.ok(Math.abs(target.x-p.x)<=1.2);assert.equal(target.z,p.z);
 }
});

test('long-range preflight can defer until later while short urgent contacts cannot',()=>{
 const p:PlayerState={x:0,z:10,tx:2,tz:10,vx:3,vz:0,stamina:.3,moving:true,swing:0,stroke:'forehand'};
 const b:BallState={x:2,y:2,z:3,vx:0,vy:3,vz:8,bounces:1,hitter:1,targetX:0,targetZ:10};
 const target=rescue.rescueTarget(b,p,0)!;
 assert.ok(target);assert.ok(rescue.canDelayRescue(b,p,0,target));
 assert.equal(rescue.canDelayRescue(b,p,0,{...target,short:true}),false);
 assert.equal(rescue.canDelayRescue(b,p,0,{...target,travel:.25}),false);
});

test('ordinary in-reach contact never triggers a rescue lottery',()=>{
 for(const seat of [0,1] as const){
  let rolls=0;const m=new Match(['lin','lin'],()=>{rolls++;return 0;}),p=m.state.players[seat],sign=side(seat);
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign});
   m.physics.place({x:.4*sign,y:1.2,z:9.7*sign},{x:0,y:0,z:4*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   m.input(seat,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
   assert.equal(m.state.rally,3);assert.equal(rolls,0);assert.equal(p.rescue,undefined);
  }finally{m.dispose();}
 }
});

test('opposite momentum brakes continuously and trajectory bounds include the reverse excursion',()=>{
 const d=1.4,T=.5,v=-3,bounds=rescue.rescueMotionBounds(d,T,v);
 assert.ok(bounds.min<0);assert.ok(bounds.max>=d-1e-9);
 const p:PlayerState={x:0,z:10,tx:d,tz:10,vx:v,stamina:1,moving:true,swing:0,stroke:'forehand',
  rescue:{startedAt:0,fromX:0,fromZ:10,toX:d,toZ:10,travel:T,natural:true,launchVx:v,contact:{x:2,y:1.2,z:10},hit:false}};
 let old=v;
 for(let i=1;i<=100;i++){
  rescue.moveRescue(p,i/200,1/200);
  if(i===1)assert.ok(p.vx!<0,'cannot instantly reverse running direction');
  assert.ok(Math.abs(p.vx!-old)<rescue.RESCUE.acceleration/200+.01);
  assert.ok(p.x>=bounds.min-1e-8&&p.x<=bounds.max+1e-8);old=p.vx!;
 }
});

test('a grazing ordinary window is distinguished from a stable ordinary reception',()=>{
 const p:PlayerState={characterId:'lin',x:0,z:10,tx:0,tz:10,stamina:.4,totalStamina:.7,moving:false,swing:0,stroke:'forehand'};
 const options={time:0,manualUntil:0,serviceFlight:false,slice:false};
 let grazing=0,stable=0;
 for(const x of [.8,1.3,1.8,2.3])for(const z of [6,8,9])for(const speed of [6,12,18]){
  const b:BallState={x,y:1.6,z,vx:0,vy:1,vz:speed,bounces:1,hitter:1,targetX:x,targetZ:10};
  const brief=rescue.hasNormalReturnWindow(b,p,0,options,1/120);
  const safe=rescue.hasNormalReturnWindow(b,p,0,options);
  if(brief&&!safe)grazing++;
  if(safe)stable++;
 }
 assert.ok(grazing>0&&stable>0,'fixture exercises both categories');
});

test('second bounce and unbounced serves never commit a rescue or roll a chance',()=>{
 for(const service of [false,true]){
  let draws=0;const m=new Match(['lin','lin'],()=>{draws++;return 0;});
  try{
   m.state.phase='rally';m.state.rally=2;
   const internal=m as unknown as {sinceHit:number;serviceFlight:boolean;tryRescue:(seat:0)=>boolean};
   internal.sinceHit=.2;internal.serviceFlight=service;
   Object.assign(m.state.players[0],{x:0,z:10,tx:0,tz:10,stamina:.1});
   m.physics.place({x:3.4,y:1.8,z:6},{x:0,y:1.5,z:8});
   Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:service?0:2});
   for(let i=0;i<4;i++)internal.tryRescue(0);
   assert.equal(draws,0);assert.equal(m.state.players[0].rescue,undefined);
  }finally{m.dispose();}
 }
});

test('new short and momentum rescues hit with real released skins on both handed seats',async()=>{
 for(const id of ['lin','noah','luca'])for(const seat of [0,1] as const)for(const shortCase of [true,false]){
  const sign=side(seat),hand=handedness(id),a=new Athlete(seat),m=new Match([id,id],()=>0);
  a.attachModel((await model(`releases/joint-pivot-v1/${id}`)).scene);
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   const p=m.state.players[seat],gap=shortCase?1.15:3,v=shortCase?-3:3;
   Object.assign(p,{x:0,z:10*sign,tx:gap*sign*hand,tz:10*sign,vx:v*sign*hand,vz:0,stamina:.15,totalStamina:.15,preparation:undefined,backhand:false});
   const speed=shortCase?9:12;
   m.physics.place({x:gap*sign*hand,y:1.7,z:(10-speed*.45)*sign},{x:0,y:1,z:speed*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   m.input(seat,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
   let jumped=false;
   for(let i=0;i<150&&m.state.rally===2;i++){m.step(1/120);a.update(p,m.state.time,1/120);jumped||=!!p.rescue;}
   assert.ok(jumped,`${id}/${seat}/${shortCase}: jump`);
   assert.equal(m.state.ball.rescue,true);
   assert.ok(a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3()).distanceTo(new Vector3(p.contact!.x,p.contact!.y,p.contact!.z))<.1);
   for(let i=0;i<160;i++){
    m.step(1/120);a.update(p,m.state.time,1/120);
    a.root.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();o.computeBoundingBox();assert.ok(o.boundingBox!.min.toArray().every(Number.isFinite));}});
   }
   assert.equal(p.rescue,undefined);
  }finally{m.dispose();disposeTree(a.root);}
 }
});
