import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {side,type Seat} from '../src/simulation/types.js';
import {rescueChance} from '../src/simulation/rescue.js';
import {Athlete} from '../src/render/player.js';
import {Vector3} from 'three';
import {disposeTree} from '../src/render/dispose.js';

before(initPhysics);
// Real opposing strike -> full flight -> bounce -> run -> rescue, with no
// synthetic post-bounce state or forced player position after the strike.
function fastCrossCourt(receiver:Seat,roll:number){
 const sender=receiver===0?1:0,sign=side(sender),pair:readonly [string,string]=receiver===1?['leo','wuming']:['wuming','leo'];
 let draws=0;
 const match=new Match(pair,()=>{draws++;return draws===1?roll:.5;});
 match.state.phase='rally';match.state.rally=2;match.step(.08);
 Object.assign(match.state.players[receiver],{x:-4*sign,z:side(receiver)*12,tx:-4*sign,tz:side(receiver)*12,vx:0,vz:0,stamina:.08});
 Object.assign(match.state.players[sender],{x:0,z:10*sign,tx:0,tz:10*sign});
 match.physics.place({x:.6*sign,y:1.8,z:9.6*sign});
 Object.assign(match.state.ball,match.physics.read(),{hitter:receiver,bounces:1});
 const hit=match as unknown as {hit:(seat:Seat,shot:object)=>void};
 hit.hit(sender,{type:'shot',aim:.8,depth:.5,power:.3,lob:false});
 match.input(receiver,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
 return {match,draws:()=>draws};
}
test('a full legal crosscourt flight is anticipated before the bounce for a naturally timed dive',()=>{
 for(const receiver of [0,1] as Seat[]){
  const {match,draws}=fastCrossCourt(receiver,0),p=match.state.players[receiver],a=new Athlete(receiver);
  let jumped=false;
  try{
   for(let i=0;i<300&&match.state.phase==='rally'&&match.state.rally===3;i++){
    match.step(1/60);a.update(p,match.state.time,1/60);jumped||=!!p.rescue;
   }
   assert.ok(jumped,`seat ${receiver} must enter the rescue lottery`);
   assert.equal(draws(),1);assert.equal(match.state.ball.rescue,true);
   assert.equal(match.state.ball.hitter,receiver);
   const tip=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3()),c=p.contact!;
   assert.ok(tip.distanceTo(new Vector3(c.x,c.y,c.z))<.1,'actual racket contact');
  }finally{match.dispose();disposeTree(a.root);}
 }
});
test('a real missed rally rolls only once, with no automatic success on repeated input',()=>{
 for(const receiver of [0,1] as Seat[]){
  const {match,draws}=fastCrossCourt(receiver,.99);
  try{
   for(let i=0;i<300&&match.state.phase==='rally'&&match.state.rally===3;i++){
    match.input(receiver,{type:'shot',aim:0,depth:.5,power:.5,lob:false});match.step(1/60);
   }
   assert.equal(draws(),1);
   assert.notEqual(match.state.ball.rescue,true);
   assert.equal(match.state.phase,'point');
   assert.ok(rescueChance(.8)<.99);
  }finally{match.dispose();}
 }
});
