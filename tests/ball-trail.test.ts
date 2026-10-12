import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BallTrail} from '../src/render/ball-trail.js';
import type {MatchState} from '../src/simulation/types.js';

const state=(time:number,rally=2)=>({
  time,phase:'rally',rally,score:[0,0],ball:{x:time*8,y:1+time,z:-time*12}
}) as MatchState;
test('ball motion trail has the same time span at 30, 60 and 120 FPS',()=>{
  let reference:ReturnType<BallTrail['sample']>|undefined;
  for(const fps of [30,60,120]){
    const trail=new BallTrail();let points:ReturnType<BallTrail['sample']>=[];
    for(let i=0;i<=fps;i++)points=trail.sample(state(i/fps));
    assert.equal(points.length,8);
    if(reference)for(let i=0;i<8;i++)for(const axis of ['x','y','z'] as const)
      assert.ok(Math.abs(points[i][axis]-reference[i][axis])<1e-10,`${fps}/${i}/${axis}`);
    reference=points;
  }
});
test('trail freezes on repeated simulation time and clears on flight, score, point and rewind',()=>{
  const trail=new BallTrail();
  for(let i=0;i<20;i++)trail.sample(state(i/60));
  const before=trail.sample(state(20/60));
  for(let i=0;i<100;i++)assert.deepEqual(trail.sample(state(20/60)),before);
  assert.deepEqual(trail.sample(state(21/60,3)),[]);
  trail.sample(state(22/60,3));
  assert.deepEqual(trail.sample({...state(23/60,3),score:[1,0]}),[]);
  assert.deepEqual(trail.sample({...state(24/60,3),phase:'point'}),[]);
  trail.sample(state(25/60,3));
  assert.deepEqual(trail.sample(state(0,3)),[]);
});
