import {test} from 'node:test';import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';import {frameMatch} from '../src/render/camera.js';
import {swipeDirection} from '../src/input/aim.js';

test('court reads larger relative to the player without shrinking its screen width',()=>{
 const c=new PerspectiveCamera(47,390/844,.1,130);c.position.set(0,11.8,25.5);c.lookAt(0,.7,2.8);c.updateMatrixWorld();
 const height=()=>new Vector3(0,1.98,11).project(c).y-new Vector3(0,0,11).project(c).y;
 const before=height();frameMatch(c,390,844,0,0,11);assert.ok(height()<before*.9&&height()>before*.8);
 const netWidth=new Vector3(4.115,0,0).project(c).x;assert.ok(netWidth>.7);
 for(const z of [-12,11]){const p=new Vector3(0,0,z).project(c);assert.ok(p.y>-.8&&p.y<.8);}
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
