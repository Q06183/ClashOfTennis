import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {frameMatch} from '../src/render/camera.js';
import {captureSwipeAim} from '../src/input/aim.js';
import {projectedOutgoingAngle} from './helpers/projected-shot.js';
import {side,type Shot} from '../src/simulation/types.js';
import {rescueIncoming} from './helpers/rescue-incoming.js';

before(initPhysics);
test('legal slice returns keep the swipe heading even at both extremes of random scatter',()=>{
 for(const seat of [0,1] as const)for(const distance of ['near','far'] as const)
 for(const random of [0,.5,1])for(const ratio of [-.6,0,.6]){
  const m=new Match(['lin','lin'],()=>random),p=m.state.players[seat],sign=side(seat),camera=new PerspectiveCamera();
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:0,z:2*sign,tx:0,tz:2*sign});
   m.physics.place({x:.3*sign,y:1.3,z:1.75*sign},{x:0,y:0,z:4*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:1});
   frameMatch(camera,390,844,seat,0,2,undefined,distance);
   const shot:Shot={type:'shot',aim:0,depth:.7,power:.7,lob:false,slice:true};
   m.input(seat,{...shot,swipeAim:captureSwipeAim(camera,shot,-ratio*150,150,390,844)});
   assert.equal(m.state.rally,3);
   assert.equal(m.state.ball.slice,true);
   assert.ok(Math.abs(projectedOutgoingAngle(camera,p.contact!,m.state.ball,390,844)-Math.atan(ratio))<.001,
    `${seat}/${distance}/${random}/${ratio}`);
  }finally{m.dispose();}
 }
});
test('physical lateral rescue preserves the swipe despite random scatter and low stamina',()=>{
 for(const seat of [0,1] as const)for(const scatter of [0,.5,1])for(const ratio of [-.6,0,.6]){
  let draws=0;const m=new Match(['lin','lin'],()=>draws++===0?0:scatter),p=m.state.players[seat],sign=side(seat),camera=new PerspectiveCamera();
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:0,z:10*sign,tx:0,tz:10*sign,stamina:.08,totalStamina:.3});
   rescueIncoming(m,seat);
   frameMatch(camera,390,844,seat,0,10,undefined,'near');
   const shot:Shot={type:'shot',aim:0,depth:.7,power:.7,lob:false};
   m.input(seat,{...shot,swipeAim:captureSwipeAim(camera,shot,ratio*150,-150,390,844)});
   for(let i=0;i<60&&m.state.rally===2;i++)m.step(1/60);
   assert.equal(m.state.ball.rescue,true);
   assert.equal(draws,3,'keep lottery and depth variation sampling stable');
   assert.ok(Math.abs(projectedOutgoingAngle(camera,p.contact!,m.state.ball,390,844)-Math.atan(ratio))<.001,
    `${seat}/${scatter}/${ratio}`);
  }finally{m.dispose();}
 }
});
test('steep swipe directions do not fall back to a different heading in slow and lofted flights',()=>{
 for(const seat of [0,1] as const)for(const id of ['lin','wuming'])
 for(const kind of ['normal','slice','lob','volley','smash'] as const)
 for(const stamina of [0,.2,1])for(const depth of [1.2,10,16])for(const x of [-5,0,5])
 for(const ratio of [-5,-2,-.6,0,.6,2,5]){
  const m=new Match([id,id],()=>.5),p=m.state.players[seat],sign=side(seat),camera=new PerspectiveCamera();
  try{
   m.state.phase='rally';m.state.rally=2;m.step(.08);
   Object.assign(p,{x:x*sign,z:depth*sign,tx:x*sign,tz:depth*sign,stamina,totalStamina:stamina});
   m.physics.place({x:(x+.3)*sign,y:kind==='smash'?2.4:1.3,z:(depth-.25)*sign},{x:0,y:0,z:4*sign});
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:kind==='volley'?0:1});
   frameMatch(camera,390,844,seat,p.x,depth,undefined,'near');
   const shot:Shot={type:'shot',aim:0,depth:.7,power:.7,lob:kind==='lob',slice:kind==='slice'},reverse=shot.slice?-1:1;
   m.input(seat,{...shot,swipeAim:captureSwipeAim(camera,shot,ratio*100*reverse,-100*reverse,390,844)});
   assert.equal(m.state.rally,3,`${kind} legal contact`);
   const angle=projectedOutgoingAngle(camera,p.contact!,m.state.ball,390,844);
   assert.ok(Math.abs(angle-Math.atan(ratio))<.001,`${id}/${kind}/${stamina}/${depth}/${x}/${ratio}: ${angle}`);
   const c=p.contact!,from=new Vector3(c.x,c.y,c.z).project(camera);
   for(let i=0;i<6;i++)m.physics.step(1/60);
   const b=m.physics.read(),to=new Vector3(b.x,b.y,b.z).project(camera);
   assert.ok(Math.abs(Math.atan2((to.x-from.x)*390,(to.y-from.y)*844)-Math.atan(ratio))<.015,
    'actual Rapier flight, not an inverse-corrected target');
  }finally{m.dispose();}
 }
});

test('serve outliers and changing swipe angles stay continuous across both views and screen shapes',()=>{
 for(const seat of [0,1] as const)for(const distance of ['near','far'] as const)
 for(const [w,h] of [[390,844],[844,390],[320,568]])
 for(const total of [0,1])for(const x of [-3,3]){
  let previous:number|undefined,flight:number|undefined;
  for(let n=-40;n<=40;n++){
   const ratio=n/10,m=new Match(['lin','lin']),p=m.state.players[seat],sign=side(seat),camera=new PerspectiveCamera();
   try{
    m.state.server=seat;
    Object.assign(p,{x:x*sign,z:12.4*sign,tx:x*sign,tz:12.4*sign,stamina:total,totalStamina:total});
    m.physics.place({x:p.x,y:1.25,z:12.15*sign});Object.assign(m.state.ball,m.physics.read());
    frameMatch(camera,w,h,seat,p.x,12.4,undefined,distance);
    const shot:Shot={type:'shot',aim:0,depth:.5,power:.5,lob:false};
    m.input(seat,{...shot,swipeAim:captureSwipeAim(camera,shot,ratio*100,-100,w,h)});
    for(let i=0;i<120&&m.state.rally===0;i++)m.step(1/60);
    assert.equal(m.state.rally,1);
    const b=m.state.ball,angle=projectedOutgoingAngle(camera,p.contact!,b,w,h),duration=(b.targetZ-p.contact!.z)/b.vz;
    assert.ok(Math.abs(angle-Math.atan(ratio))<.001,`${seat}/${distance}/${w}/${total}/${x}/${ratio}: ${angle}`);
    if(previous!==undefined)assert.ok(angle>previous&&angle-previous<.101,'no root-switch discontinuity');
    if(flight!==undefined)assert.ok(Math.abs(duration-flight)<1e-6,'sideways aim cannot recursively inflate flight time');
    previous=angle;flight=duration;
   }finally{m.dispose();}
  }
 }
});
