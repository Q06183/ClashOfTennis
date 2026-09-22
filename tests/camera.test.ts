import {test} from 'node:test';import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';import {frameMatch} from '../src/render/camera.js';
import {swipeDirection} from '../src/input/aim.js';

test('close camera roughly doubles the player and nearby court while retaining the opponent',()=>{
 const c=new PerspectiveCamera(26,390/844,.1,130);c.position.set(0,20,40);c.lookAt(0,.7,2.8);c.updateMatrixWorld();
 const height=()=>new Vector3(0,1.98,12.4).project(c).y-new Vector3(0,0,12.4).project(c).y;
 const width=()=>new Vector3(1,0,12.4).project(c).x-new Vector3(0,0,12.4).project(c).x;
 const before=height(),court=width();frameMatch(c,390,844,0,0,12.4);assert.ok(height()/before>1.9&&height()/before<2.3);assert.ok(width()/court>1.8&&width()/court<2.2);
 for(const z of [-12,12.4])for(const y of [0,1.98]){const p=new Vector3(0,y,z).project(c);assert.ok(p.y>-.8&&p.y<.8);}
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
