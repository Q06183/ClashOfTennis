import {test} from 'node:test';import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';import {frameMatch} from '../src/render/camera.js';
import {swipeDirection} from '../src/input/aim.js';

test('reference-style elevated camera keeps the near athlete around one fifth of the full court depth',()=>{
 for(const [w,h] of [[390,844],[320,568],[844,390],[195,183]]){
  const c=new PerspectiveCamera();frameMatch(c,w,h,0,0,12.4);
  const p=(x:number,y:number,z:number)=>new Vector3(x,y,z).project(c);
  const near=p(0,0,11.885),far=p(0,0,-11.885);
  const court=Math.hypot((near.x-far.x)*w/2,(near.y-far.y)*h/2);
  const athlete=(p(0,1.96,12.4).y-p(0,0,12.4).y)*h/2;
  assert.ok(athlete/court>.18&&athlete/court<.26,`${w}x${h}: ${athlete/court}`);
  assert.ok(c.position.y>=14&&c.position.z>=34,'not the oversized low close-up');
  for(const x of [-5.485,5.485])for(const z of [-11.885,11.885]){
   const q=p(x,0,z);assert.ok(Math.abs(q.x)<.94&&Math.abs(q.y)<.75,'all four doubles court corners visible');
  }
 }
});
test('match view remains directly behind the baseline with level court lines on both seats',()=>{
 for(const seat of [0,1] as const)for(const [w,h] of [[390,844],[844,390]])
 for(const x of [-6,0,6])for(const depth of [3,12.4,16]){
  const sign=seat===0?1:-1,c=new PerspectiveCamera();
  frameMatch(c,w,h,seat,x,depth,{x:-x,z:-10*sign});
  assert.equal(c.position.x,0,'no sideline/diagonal camera offset');
  assert.ok(Math.abs(c.getWorldDirection(new Vector3()).x)<1e-12,'camera looks straight down court');
  for(const z of [-11.885,0,11.885]){
   const left=new Vector3(-5.485,0,z).project(c),right=new Vector3(5.485,0,z).project(c);
   assert.ok(Math.abs(left.y-right.y)<1e-12,'baseline and net are horizontal');
   assert.ok(Math.abs(left.x+right.x)<1e-12,'court stays horizontally centred while players run');
  }
 }
});
test('following camera keeps a retreating player visible on phone sizes and preserves swipe direction',()=>{
 for(const seat of [0,1] as const)for(const [w,h]of [[390,844],[320,568],[844,390]])for(const x of [-6,0,6])for(const depth of [10,16]){
  const sign=seat===0?1:-1,c=new PerspectiveCamera();frameMatch(c,w,h,seat,x,depth);
  for(const y of [0,1.98]){const p=new Vector3(x,y,depth*sign).project(c);assert.ok(Math.abs(p.x)<.92&&p.y>-.85&&p.y<.75,`${w}x${h} ${x}/${depth}: ${p.toArray()}`);}
  const start={x,y:0,z:depth*sign},dir=swipeDirection(c,start,20,-100,w,h,sign);
  const from=new Vector3(start.x,0,start.z).project(c),to=new Vector3(start.x+dir*16*sign,0,start.z-16*sign).project(c);
  assert.ok(Math.abs((to.x-from.x)*w/((to.y-from.y)*h)-.2)<1e-6);
 }
});
test('close net camera retains the actual opponent during wide approaches at either end',()=>{
 for(const seat of [0,1] as const)for(const depth of [1.1,3,6,12.4])for(const x of [-6,0,6])for(const oppX of [-4.1,4.1])for(const oppDepth of [1.1,12]){
 const sign=seat===0?1:-1,c=new PerspectiveCamera(),opp={x:oppX,z:-oppDepth*sign};frameMatch(c,390,844,seat,x,depth,opp);
 for(const y of [0,2]){const p=new Vector3(opp.x,y,opp.z).project(c);assert.ok(Math.abs(p.x)<.93&&Math.abs(p.y)<.9,`opponent ${x}/${depth} => ${oppX}/${oppDepth}: ${p.toArray()}`);}
 }
});
