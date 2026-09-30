import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {frameMatch} from '../src/render/camera.js';
import type {MatchState,Seat} from '../src/simulation/types.js';
import {readFile} from 'node:fs/promises';
test('self marker follows the actual viewer for all four seats and both ends at readable pixel size',async()=>{
 const {SelfMarker}=await import('../src/render/self-marker.js');
 for(const seat of [0,1,2,3] as Seat[])for(const ends of [0,1] as const){
  const camera=new PerspectiveCamera(),sign=(seat%2===0?1:-1)*(ends?-1:1);
  frameMatch(camera,390,844,sign>0?0:1,2,10,undefined,'far');
  const state={ends,players:[0,1,2,3].map(i=>({x:i-1.5,z:(i%2===0?1:-1)*(ends?-1:1)*(i<2?10:3)}))} as MatchState;
  const marker=new SelfMarker();marker.update(state,seat,camera,844,true);
  assert.equal(marker.root.visible,true);
  assert.equal(marker.ring.position.x,state.players[seat].x);
  assert.equal(marker.ring.position.z,state.players[seat].z);
  assert.equal(marker.arrow.position.x,state.players[seat].x);
  assert.ok(marker.arrow.position.y>2);
  marker.root.updateMatrixWorld(true);
  const top=marker.arrow.localToWorld(new Vector3(0,.5,0)).project(camera);
  const bottom=marker.arrow.localToWorld(new Vector3(0,-.5,0)).project(camera);
  assert.ok(Math.abs(Math.abs(top.y-bottom.y)*844/2-14)<.1,'triangle stays 14px high');
  assert.equal(marker.ring.material.opacity,1);
  const rim=marker.root.children.find(o=>o.name==='self-ring-rim')!;
  assert.ok(rim&&marker.ring.renderOrder>rim.renderOrder,'bright ring must draw over its dark border');
  marker.update(state,seat,camera,844,false);assert.equal(marker.root.visible,false);
  marker.dispose();
 }
});
test('self marker tolerates lobby preview without the requested third/fourth player',async()=>{
 const {SelfMarker}=await import('../src/render/self-marker.js');
 const marker=new SelfMarker();marker.update({players:[]} as any,3,new PerspectiveCamera(),844,true);
 assert.equal(marker.root.visible,false);marker.dispose();
});
test('renderer uses one self marker in singles and doubles, not the ball hitter',async()=>{
 const source=await readFile('src/render/view.ts','utf8');
 assert.match(source,/selfMarker.*update\(state,this\.seat/);
});
