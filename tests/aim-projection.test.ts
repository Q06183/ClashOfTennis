import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {swipeDirection} from '../src/input/aim.js';
test('screen swipe and projected ground direction agree at both ends and off centre',()=>{
  for(const sign of [1,-1])for(const x of [-3,0,3])for(const ratio of [-.2,0,.2]){
    const camera=new T.PerspectiveCamera(52,390/844,.1,130);
    camera.position.set(0,15,28*sign);camera.lookAt(0,.7,2*sign);camera.updateMatrixWorld();
    const start={x,y:0,z:11*sign};
    const dir=swipeDirection(camera,start,ratio*100,-100,390,844,sign);
    const from=new T.Vector3(start.x,0,start.z).project(camera);
    const to=new T.Vector3(start.x+dir*16*sign,0,start.z-16*sign).project(camera);
    const projectedRatio=((to.x-from.x)*390)/((to.y-from.y)*844);
    assert.ok(Math.abs(projectedRatio-ratio)<1e-6,`${sign} ${x}: ${projectedRatio} != ${ratio}`);
  }
});
test('serve landing direction matches the swipe from overhead contact height in both service courts',async()=>{
 const {frameMatch}=await import('../src/render/camera.js');
 for(const sign of [1,-1])for(const x of [-1.5,1.5])for(const [w,h] of [[390,844],[320,568]])for(const ratio of [-.3,0,.3]){
  const c=new T.PerspectiveCamera();frameMatch(c,w,h,sign===1?0:1,x,12.4);
  const contact={x,y:2.65,z:12.15*sign},landingZ=-5.5*sign;
  const direction=swipeDirection(c,contact,ratio*100,-100,w,h,sign,landingZ);
  const from=new T.Vector3(contact.x,contact.y,contact.z).project(c),to=new T.Vector3(x+direction*Math.abs(landingZ-contact.z)*sign,.12,landingZ).project(c);
  const actual=(to.x-from.x)*w/((to.y-from.y)*h);
  assert.ok(Math.abs(actual-ratio)<1e-5,`overhead ${sign}/${x}: ${actual} vs ${ratio}`);
 }
});
