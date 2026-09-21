import {test} from 'node:test';import assert from 'node:assert/strict';import {FrameQuality} from '../src/render/quality.js';
const feed=(q:FrameQuality,ms:number,n:number)=>{for(let i=0;i<n;i++)q.sample(ms);};
test('mobile starts balanced and sustained slow rendering falls back to smooth',()=>{
 const q=new FrameQuality(true);assert.equal(q.level,'balanced');feed(q,1000/60,600);assert.equal(q.level,'balanced');feed(q,1000/30,180);assert.equal(q.level,'low');feed(q,1000/30,300);assert.equal(q.fps,30);
});
test('hidden tabs, long resume gaps and brief shader stalls do not permanently lower quality',()=>{
 const q=new FrameQuality(true);feed(q,1000/60,300);q.sample(10000,false);q.sample(0,false);feed(q,1000/60,300);q.sample(100);feed(q,1000/60,300);assert.equal(q.level,'balanced');
});
test('recovery requires thirty stable seconds and cannot exceed mobile ceiling',()=>{
 const q=new FrameQuality(true);feed(q,40,200);assert.equal(q.level,'low');feed(q,1000/60,600);assert.equal(q.level,'low');feed(q,1000/60,2000);assert.equal(q.level,'balanced');feed(q,1000/60,2500);assert.equal(q.level,'balanced');
});
test('repeated foreground hitches still trigger quality reduction',()=>{
 const q=new FrameQuality(true);for(let i=0;i<8;i++){feed(q,1000/30,60);q.sample(300);}assert.equal(q.level,'low');assert.ok(q.fps>0);
 const severe=new FrameQuality(true);feed(severe,300,40);assert.equal(severe.level,'low');assert.ok(severe.fps>0);
});
