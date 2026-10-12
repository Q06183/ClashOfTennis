import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Box3} from 'three';
import {ServeTarget} from '../src/render/serve-target.js';
import {isInServiceBox,COURT} from '../src/simulation/rules.js';
import type {MatchState,Seat} from '../src/simulation/types.js';

test('serve-box highlight exactly matches legal diagonal boundaries for four seats and both ends',()=>{
  const target=new ServeTarget();
  try{
    for(const seat of [0,1,2,3] as Seat[])for(const ends of [0,1] as const)for(const point of [0,1,6,7]){
      const state={phase:'serve',server:seat,ends,score:[point,0],players:Array.from({length:4},()=>({}))} as MatchState;
      target.update(state,seat,true);assert.ok(target.root.visible);
      target.root.updateMatrixWorld(true);
      const bounds=new Box3().setFromObject(target.root),center=bounds.getCenter(new Vector3());
      assert.ok(isInServiceBox(center.x,center.z,seat,point,ends));
      assert.ok(Math.abs(bounds.max.x-bounds.min.x-COURT.halfWidth)<1e-6);
      assert.ok(Math.abs(bounds.max.z-bounds.min.z-COURT.service)<1e-6);
      assert.equal(isInServiceBox(-center.x,center.z,seat,point,ends),false);
      target.update(state,(seat^1) as Seat,true);assert.equal(target.root.visible,false);
      target.update({...state,phase:'rally'},seat,true);assert.equal(target.root.visible,false);
      target.update(state,seat,false);assert.equal(target.root.visible,false);
      state.players[seat].preparation={stroke:'serve',progress:.2,contact:{x:0,y:2,z:12}};
      target.update(state,seat,true);assert.equal(target.root.visible,false);
    }
  }finally{target.dispose();}
});
