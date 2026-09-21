import {test} from 'node:test';import assert from 'node:assert/strict';
import {movePlayer} from '../src/simulation/movement.js';import type {PlayerState} from '../src/simulation/types.js';
const player=():PlayerState=>({x:-4.1,z:10,tx:4.1,tz:10,stamina:1,swing:0,stroke:'forehand',moving:false});
test('a court-width sprint has a real acceleration phase and takes over 1.6 seconds',()=>{
 const p=player();movePlayer(p,0,1/60);assert.ok(p.vx!<.3);assert.ok(p.x+4.1<.01);
 let time=1/60;while(p.x<4.05&&time<4){movePlayer(p,0,1/60);time+=1/60;}assert.ok(time>1.6&&time<2.8,`${time}`);
 for(let i=0;i<90;i++)movePlayer(p,0,1/60);assert.equal(p.moving,false);assert.ok(Math.abs(p.x-p.tx)<.04);
});
test('reversing direction brakes before moving the other way',()=>{
 const p=player();for(let i=0;i<40;i++)movePlayer(p,0,1/60);assert.ok(p.vx!>4);
 p.tx=-4.1;movePlayer(p,0,1/60);assert.ok(p.vx!>0,'cannot reverse instantly');
 for(let i=0;i<60;i++)movePlayer(p,0,1/60);assert.ok(p.vx!<0);
});
test('backpedal is slower than forward running and both seats are symmetric',()=>{
 const speeds=[];for(const seat of [0,1] as const){const sign=seat===0?1:-1;
 for(const forward of [true,false]){const p={...player(),x:0,tx:0,z:10*sign,tz:(forward?1:16.5)*sign};for(let i=0;i<40;i++)movePlayer(p,seat,1/60);speeds.push(Math.abs(p.vz!));}}
 assert.ok(speeds[0]>speeds[1]+1);assert.deepEqual(speeds.slice(0,2),speeds.slice(2));
});
