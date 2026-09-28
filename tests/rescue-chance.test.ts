import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rescueChance} from '../src/simulation/rescue.js';

test('rescue probability reaches 90% at full total stamina and floors at 10% at one third',()=>{
 assert.equal(rescueChance(1),.9);
 assert.equal(rescueChance(1/3),.1);
 assert.equal(rescueChance(0),.1);
 assert.equal(rescueChance(-1),.1);
 assert.equal(rescueChance(2),.9);
 assert.equal(rescueChance(NaN),.1);
 assert.equal(rescueChance(Infinity),.1);
 assert.ok(Math.abs(rescueChance(2/3)-.5)<1e-12);
 assert.ok(Math.abs(rescueChance(.5)-.225)<1e-12);
});
test('rescue chance is monotone, continuous and smoothly joins both stamina plateaus',()=>{
 let previous=.1;
 for(let i=0;i<=1000;i++){
  const chance=rescueChance(i/1000);
  assert.ok(chance>=previous&&chance>=.1&&chance<=.9);
  assert.ok(chance-previous<.0019);
  previous=chance;
 }
 const h=1e-5;
 for(const boundary of [1/3,1]){
  const left=(rescueChance(boundary)-rescueChance(boundary-h))/h;
  const right=(rescueChance(boundary+h)-rescueChance(boundary))/h;
  assert.ok(Math.abs(left-right)<.0001,'no sharp slope transition');
 }
});
