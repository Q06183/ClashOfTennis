import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {CHARACTERS,handedness} from '../src/simulation/characters.js';
import {frameMatch} from '../src/render/camera.js';
import {captureSwipeAim} from '../src/input/aim.js';
import {side,type Shot,type Seat} from '../src/simulation/types.js';
import {predictFlight} from '../src/simulation/trajectory.js';
before(initPhysics);

function launch(id:string,seat:Seat,kind:string,mode:string,random:number,stamina=1,ratio=.18){
 let calls=0;
 const m=new Match([id,id],()=>{calls++;return random;}),p=m.state.players[seat],sign=side(seat);
 Object.assign(p,{x:1.5*sign,z:12.4*sign,tx:1.5*sign,tz:12.4*sign,stamina,totalStamina:stamina});
 // Fix contact in world space to isolate penalties from deliberate placement.
 const contact={x:1.5*sign,y:kind==='serve'?2.65:kind==='smash'?2.4:1.3,z:12.15*sign};
 if(kind==='forehand'||kind==='backhand')contact.x+=(kind==='backhand'?-.3:.3)*sign*handedness(id);
 m.physics.place(contact);Object.assign(m.state.ball,m.physics.read(),{hitter:seat===0?1:0,bounces:kind==='volley'?0:1});
 if(kind==='rescue')p.rescue={startedAt:0,fromX:p.x,fromZ:p.z,toX:p.x,toZ:p.z,contact,hit:false,stroke:'forehand'};
 const shot:Shot={type:'shot',aim:ratio,depth:.55,power:kind==='critical'?.95:.6,lob:kind==='lob',slice:kind==='slice',topspin:kind==='topspin'?.8:0,critical:kind==='critical'};
 if(mode==='direction')shot.directionX=ratio;
 if(mode==='swipe'||mode==='ground'){
  const camera=new PerspectiveCamera();frameMatch(camera,390,844,seat,p.x,12.4);
  shot.swipeAim=captureSwipeAim(camera,shot,ratio*150*(shot.slice?-1:1),-150*(shot.slice?-1:1),390,844);
  if(mode==='ground')delete shot.swipeAim.elevation;
 }
 (m as unknown as {hit:(seat:Seat,shot:Shot,serve:boolean)=>void}).hit(seat,shot,kind==='serve');
 const b={...m.state.ball},flight=predictFlight(b);
 m.dispose();return {b,flight,calls};
}

test('all ten athletes and input protocols launch without consuming trajectory RNG',()=>{
 for(const c of CHARACTERS)for(const seat of [0,1] as const)
 for(const kind of ['serve','forehand','backhand','volley','smash','slice','rescue','lob','topspin','critical'])
 for(const mode of ['legacy','direction','ground','swipe']){
  const samples=[0,.5,1].map(r=>launch(c.id,seat,kind,mode,r));
  for(const s of samples){
   assert.equal(s.calls,0,`${c.id}/${seat}/${kind}/${mode}: trajectory consumes RNG`);
   assert.deepEqual(s.b,samples[0].b,`${c.id}/${kind}/${mode}: random target or velocity`);
  }
 }
});

test('attributes and fatigue cannot change a touch aim target, while weak serves remain higher and slower',()=>{
 for(const seat of [0,1] as const)for(const kind of ['serve','normal','volley','slice','rescue'])
 for(const ratio of [-.4,0,.4]){
  const ref=launch('lin',seat,kind,'swipe',.5,1,ratio);
  for(const c of CHARACTERS)for(const stamina of [0,.2,1]){
   const s=launch(c.id,seat,kind,'swipe',.5,stamina,ratio);
   assert.ok(Math.abs(s.b.targetX-ref.b.targetX)<1e-9,`${c.id}/${stamina}/${kind}: attribute steers X`);
   assert.equal(s.b.targetZ,ref.b.targetZ);
   assert.ok(Math.abs(s.b.vx/s.b.vz-ref.b.vx/ref.b.vz)<1e-6,'attribute rotates court-plane heading');
   assert.equal(s.flight.hitNet,false);
  }
 }
 const mei=launch('mei',0,'serve','swipe',.5),lin=launch('lin',0,'serve','swipe',.5);
 assert.ok(Math.abs(mei.b.vz)<Math.abs(lin.b.vz)*.7);
 assert.ok(Math.max(...mei.flight.points.map(p=>p.y))>Math.max(...lin.flight.points.map(p=>p.y))+1);
});

test('slice bounce retains its explicit random sideways skid, only after ground contact',()=>{
 for(const seat of [0,1] as const)for(const r of [0,.5,1]){
  let calls=0;const m=new Match(['mei','noah'],()=>{calls++;return r;}),sign=side(seat);
  try{
   m.state.phase='rally';m.state.rally=2;
   const velocity={x:2*sign,y:-2,z:-5*sign};
   m.physics.place({x:0,y:.15,z:-3*sign},velocity);
   Object.assign(m.state.ball,m.physics.read(),{hitter:seat,bounces:0,slice:true});
   for(let i=0;i<12&&m.state.ball.bounces===0;i++)m.step(1/120);
   assert.equal(m.state.ball.bounces,1);
   const b=m.state.ball;
   const cross=b.vx*velocity.z-b.vz*velocity.x,dot=b.vx*velocity.x+b.vz*velocity.z;
   assert.ok(Math.abs(Math.atan2(cross,dot)+(r*2-1)*.16)<1e-6,'preserve authored bounce deflection');
   assert.ok(b.vx*velocity.x+b.vz*velocity.z>0);
   assert.ok(Math.abs(b.vz)<5&&b.vy>0);
   assert.equal(calls,3,'only the bounce angle/pace/height samples are consumed here');
  }finally{m.dispose();}
 }
});
