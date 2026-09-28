import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {Athlete} from '../src/render/player.js';
import {disposeTree} from '../src/render/dispose.js';
import {model} from './helpers/athlete-model.js';

test('walking and running feet still cycle while a shot is queued and racket preparation is nearly complete',()=>{
 for(const id of ['lin','noah'])for(const fps of [20,30,60])for(const speed of [.8,1.8,4,7]){
  const a=new Athlete(0),heights=[[],[]] as number[][];
  try{
   for(let i=0;i<fps*3;i++){
    const x=2+i*speed/fps;
    a.update({characterId:id,x,z:10,tx:x+1,tz:10,stamina:1,moving:true,stroke:'backhand',swing:0,shotQueued:true,
     preparation:{stroke:'backhand',progress:.95,contact:{x:x-.4,y:1.2,z:9.5}}},i/fps,1/fps);
    for(let foot=0;foot<2;foot++)heights[foot].push(a.root.getObjectByName(`foot-${foot}`)!.getWorldPosition(new Vector3()).y);
   }
   for(const values of heights)assert.ok(Math.max(...values)-Math.min(...values)>.025,`${id}/${fps}/${speed} sliding legs`);
  }finally{disposeTree(a.root);}
 }
});
test('real left/right athlete skins retain visible foot lift during prepared running',async()=>{
 for(const id of ['lin','noah']){
  const a=new Athlete(0);a.attachModel((await model(id==='lin'?'athlete':`characters/${id}`)).scene);
  const positions:number[]=[];
  try{
   for(let i=0;i<90;i++){
    const x=2+i*.06;
    a.update({characterId:id,x,z:10,tx:x+1,tz:10,stamina:1,moving:true,stroke:'forehand',swing:0,
     preparation:{stroke:'forehand',progress:.95,contact:{x:x+.4,y:1.3,z:9.6}},shotQueued:true},i/30,1/30);
    const ankle=a.root.getObjectByName('Foot_R')!;
    positions.push(ankle.getWorldPosition(new Vector3()).y);
   }
   assert.ok(Math.max(...positions)-Math.min(...positions)>.03,`${id} skin feet frozen`);
  }finally{disposeTree(a.root);}
 }
});
