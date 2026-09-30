import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Mesh} from 'three';
import {makeCourt} from '../src/render/court.js';
import {disposeTree} from '../src/render/dispose.js';
import {MOVEMENT_HALF_WIDTH} from '../src/simulation/rules.js';

test('courtside furniture leaves room for the player and racket beyond the expanded runoff',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{
  createElement:()=>({width:0,height:0,getContext:()=>({fillText(){}})}),
 }});
 const scene=new Scene();
 try{
  makeCourt(scene);
  const benchVertices:number[]=[];
  scene.traverse(node=>{
   if(!(node instanceof Mesh))return;
   const positions=node.geometry.attributes.position;
   for(let i=0;i<positions.count;i++){
    const x=Math.abs(positions.getX(i)),y=positions.getY(i),z=Math.abs(positions.getZ(i));
    if(y>.42&&y<.58&&z>7&&z<11&&x>7&&x<12)benchVertices.push(x);
   }
  });
  assert.ok(benchVertices.length>0);
  assert.ok(Math.min(...benchVertices)>MOVEMENT_HALF_WIDTH+1.5,'no bench in the wide swing envelope');
 }finally{
  disposeTree(scene);
  if(previous)Object.defineProperty(globalThis,'document',previous);
  else Reflect.deleteProperty(globalThis,'document');
 }
});
