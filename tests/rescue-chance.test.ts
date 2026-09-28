import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rescueChance} from '../src/simulation/rescue.js';

test('rescue probability reaches 60% at full stamina and floors at 5% at one third',()=>{
 assert.equal(rescueChance(1),.6);
 assert.equal(rescueChance(1/3),.05);
 assert.equal(rescueChance(0),.05);
 assert.equal(rescueChance(-1),.05);
 assert.equal(rescueChance(2),.6);
 assert.equal(rescueChance(NaN),.05);
 assert.equal(rescueChance(Infinity),.05);
 assert.ok(Math.abs(rescueChance(2/3)-.325)<1e-12);
 assert.ok(Math.abs(rescueChance(.5)-.1359375)<1e-12);
});
test('rescue chance is monotone, continuous and smoothly joins both stamina plateaus',()=>{
 let previous=.05;
 for(let i=0;i<=1000;i++){
  const chance=rescueChance(i/1000);
  assert.ok(chance>=previous&&chance>=.05&&chance<=.6);
  assert.ok(chance-previous<.0013);
  previous=chance;
 }
 const h=1e-5;
 for(const boundary of [1/3,1]){
  const left=(rescueChance(boundary)-rescueChance(boundary-h))/h;
  const right=(rescueChance(boundary+h)-rescueChance(boundary))/h;
  assert.ok(Math.abs(left-right)<.0001,'no sharp slope transition');
 }
});
