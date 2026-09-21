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
