import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {strokePose} from '../src/render/strokes.js';
import {strokeBody} from '../src/render/stroke-body.js';
import {Athlete} from '../src/render/player.js';
import {type PlayerState,type Seat,side} from '../src/simulation/types.js';

function state(characterId:string,stroke:'forehand'|'backhand',t:number):PlayerState {
 const contact={x:stroke==='backhand'?.65:-.65,y:1.2,z:.65};
 return {characterId,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,shotQueued:true,contact,
  swing:t>=1?.44*(2-t):0,preparation:t<1?{stroke,progress:t,contact}:undefined};
}
const pose=(p:PlayerState)=>strokePose(p,new Vector3(p.contact!.x,p.contact!.y,p.contact!.z));
test('left forehand coils the free arm with the shoulder then extends before wrapping',()=>{
 for(const id of ['noah','luca']){
  const load=strokeBody(state(id,'forehand',.5));
  assert.ok(load.freeHand.x<.05,'non-racket hand should accompany the unit turn');
  const extend=pose(state(id,'forehand',1.3));
  assert.ok(extend.tip.x<-.2&&extend.tip.z>1,'extend through the ball before crossing the body');
 }
});
test('left single backhand counterbalances behind the trunk and finishes with a high extended arm',()=>{
 const impact=strokeBody(state('luca','backhand',1));
 assert.ok(impact.freeHand.z<-.5,'right free arm must counterbalance behind the left swing');
 const finish=pose(state('luca','backhand',1.65));
 assert.ok(finish.tip.x<-.75&&finish.tip.y>2,'single-hand finish stays extended on the racket-arm side');
 assert.equal(finish.twoHands,false);
});
test('left double backhand keeps its upper hand on the shaft throughout the stroke on both seats',()=>{
 for(const seat of [0,1] as Seat[]){
  const a=new Athlete(seat),sign=side(seat);
  for(let i=0;i<100;i++){
   const p=state('noah','backhand',i/50);p.contact={x:.65*sign,y:1.2,z:-.65*sign};
   if(p.preparation)p.preparation.contact=p.contact;
   a.update(p,i/60,1/60);
   const racket=a.root.getObjectByName('racket-grip')!,support=a.root.getObjectByName('left-hand-grip')!;
   assert.ok(racket.localToWorld(new Vector3(0,-.1,0)).distanceTo(support.getWorldPosition(new Vector3()))<.025,`grip detached at ${i}`);
  }
 }
});

test('left swings remain continuous after the actual two-arm IK solve',()=>{
 for(const id of ['noah','luca'])for(const stroke of ['forehand','backhand'] as const)for(const seat of [0,1] as Seat[]){
  const a=new Athlete(seat),sign=side(seat);let previous:Vector3|undefined;
  for(let i=0;i<=2000;i++){
   const p=state(id,stroke,i/1000);p.contact={x:(stroke==='backhand'?.65:-.65)*sign,y:1.2,z:-.65*sign};
   if(p.preparation)p.preparation.contact=p.contact;
   a.update(p,i/1000,1/1000);
   const tip=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
   if(previous)assert.ok(tip.distanceTo(previous)<.04,`${id}/${stroke}/${seat} racket jumps ${tip.distanceTo(previous)}m at ${i/1000}`);
   previous=tip;
  }
 }
});
