import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three';
import {Footwork} from '../src/render/footwork.js';
import {Athlete} from '../src/render/player.js';
import {strokePose} from '../src/render/strokes.js';
import {strokeBody} from '../src/render/stroke-body.js';
import type {PlayerState} from '../src/simulation/types.js';
import {preparationPhase} from '../src/render/motion-phase.js';

const sample=(stroke:'forehand'|'backhand',t:number,queued=true)=>{
 const contact={x:stroke==='backhand'?.65:-.65,y:1.2,z:.65};
 const p:PlayerState={x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,swing:0,shotQueued:queued,preparation:{stroke,progress:t,contact}};
 return {pose:strokePose(p,new Vector3(contact.x,contact.y,contact.z)),body:strokeBody(p)};
};
for(const stroke of ['forehand','backhand'] as const){
 test(`${stroke}: loading slows down without freezing before acceleration`,()=>{
  const a=sample(stroke,.54),b=sample(stroke,.66),c=sample(stroke,.82),d=sample(stroke,.94);
  assert.ok(a.pose.tip.distanceTo(b.pose.tip)>.05,'loading must not freeze the racket');
  assert.ok(a.pose.tip.distanceTo(b.pose.tip)<c.pose.tip.distanceTo(d.pose.tip),'loading stays slower than the forward swing');
  assert.ok(Math.abs(a.body.hipTurn-b.body.hipTurn)>.01,'hips must keep moving with the racket');
 });
 test(`${stroke}: accepting a late swipe does not skip body or racket poses`,()=>{
  for(const t of [.7,.82,.94,.99]){
   const waiting=sample(stroke,t,false),queued=sample(stroke,t,true);
   assert.ok(waiting.pose.tip.distanceTo(queued.pose.tip)<1e-8,`input jumped the racket at ${t}`);
   assert.equal(waiting.pose.turn,queued.pose.turn);
   assert.deepEqual(waiting.body,queued.body);
  }
 });
}

test('running releases the heel around a fixed forefoot instead of keeping both soles flat',()=>{
 const a=new Athlete(1),gait=new Footwork(),q=new Quaternion();let rolling=0;
 for(let i=0;i<120;i++){
  const p={x:0,z:i*3/60,tx:0,tz:10,stamina:1,moving:true,stroke:'forehand' as const,swing:0};
  const g=gait.update(new Vector3(p.x,0,p.z),q,1/60);
  a.update(p,i/60,1/60);
  for(let j=0;j<2;j++){
   const ankle=a.root.getObjectByName(`foot-${j}`)!,toe=a.root.getObjectByName(`toe-${j}`)!;
   const angle=ankle.getWorldQuaternion(new Quaternion()).angleTo(q);
   if(g.planted[j]&&angle>.04){
    rolling++;
    const expected=g.feet[j].clone().add(new Vector3(0,-.035,.11));
    assert.ok(toe.getWorldPosition(new Vector3()).distanceTo(expected)<.008,'toe contact slips under heel lift');
    assert.ok(new Vector3(0,1,0).applyQuaternion(toe.getWorldQuaternion(new Quaternion())).y>.999);
   }
  }
 }
 assert.ok(rolling>10,'no heel/toe rollover in a two-second run');
});

test('shared groundstroke phase remains monotone, finite and C1 at every boundary',()=>{
 const state:PlayerState={x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'forehand',swing:0,shotQueued:true};
 const phase=(t:number)=>preparationPhase({...state,preparation:{stroke:'forehand',progress:t,contact:{x:0,y:1,z:0}}});
 let last=0;for(let i=0;i<=10000;i++){const v=phase(i/10000);assert.ok(v>=last-1e-10&&v>=0&&v<=1);last=v;}
 const h=1e-6;
 for(const t of [.42,.54,.68,.82,.94])assert.ok(Math.abs((phase(t)-phase(t-h))/h-(phase(t+h)-phase(t))/h)<.001);
 for(let i=1;i<1000;i++)assert.ok(phase(i/1000)-phase((i-1)/1000)>.0001,'no frozen interval in the swing clock');
 assert.ok(Math.abs((phase(1)-phase(1-h))/h-1)<.001);
});
