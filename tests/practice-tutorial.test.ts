import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initPhysics} from '../src/simulation/physics.js';
import {Match} from '../src/simulation/match.js';
import {PracticeTutorial,TUTORIAL_PACE_HINT} from '../src/ui/practice-tutorial.js';
import {CHARACTERS} from '../src/simulation/characters.js';
import type {SurfaceId} from '../src/simulation/surfaces.js';
import {tutorialGesture} from '../src/ui/tutorial-gesture.js';

const shot={type:'shot' as const,aim:0,depth:.5,power:.35,lob:false};
import {advance,opening,returnBall,recover,winFinal} from './helpers/tutorial.js';
export {advance,opening,returnBall,recover,winFinal};

test('seven-stage guide waits for both real moves, two legal returns, slice and a real won point',async()=>{
  await initPhysics();const match=new Match(['lin','lin'],()=>.5),coach=new PracticeTutorial();
  try{
    const initial=structuredClone(match.state);
    coach.step(match,120);coach.input(match,shot);
    coach.input(match,{type:'move',x:NaN,z:13});
    assert.deepEqual(match.state,initial);
    opening(coach,match);
    advance(coach,match,()=>coach.held(match));
    const contact=structuredClone(match.state);
    coach.step(match,120);coach.input(match,{...shot,slice:true});
    assert.deepEqual(match.state,contact,'wrong gesture and waiting keep the contact frozen');
    coach.input(match,shot);assert.equal(coach.stage,'return','contact alone does not pass');
    assert.equal(coach.normalReturns,0);
    advance(coach,match,()=>coach.stage==='recover');
    assert.equal(coach.normalReturns,1);
    const beforeMove=structuredClone(match.state);coach.step(match,120);
    coach.input(match,shot);assert.deepEqual(match.state,beforeMove);
    coach.input(match,{type:'move',x:5,z:14});assert.equal(coach.held(match),true,'must tap center');
    recover(coach,match);
    returnBall(coach,match,'slice');assert.equal(coach.normalReturns,2);
    advance(coach,match,()=>coach.held(match));coach.input(match,shot);
    assert.equal(coach.stage,'slice','normal gesture cannot pass slice');
    returnBall(coach,match,'finish',true);
    assert.equal(coach.completed,false,'slice must not skip the winning point');
    const idle=structuredClone(match.state.score);coach.step(match,1/60);assert.deepEqual(idle,[0,0]);
    winFinal(coach,match);
    assert.equal(match.state.phase,'over');assert.equal(match.state.winner,0);
    assert.ok(match.state.score[0]>=1&&match.state.score[0]<7,'real points, no forced 7:0');
    const finished=structuredClone(match.state);coach.step(match,120);
    assert.deepEqual(match.state,finished);
  }finally{match.dispose();}
});

test('failed ordinary returns restore the same feed without going back to serve or losing progress',async()=>{
  await initPhysics();const match=new Match(['lin','lin'],()=>.5),coach=new PracticeTutorial();
  try{
    opening(coach,match);const feed=structuredClone(match.state);
    advance(coach,match,()=>coach.held(match));
    coach.input(match,{...shot,directionX:3});
    advance(coach,match,()=>match.state.event==='陪练送球');
    assert.equal(coach.stage,'return');assert.deepEqual(match.state,feed);
    assert.equal(match.state.phase,'rally');assert.equal(coach.normalReturns,0);
    returnBall(coach,match,'recover');recover(coach,match);
    const second=structuredClone(match.state);
    advance(coach,match,()=>coach.held(match));coach.input(match,{...shot,directionX:3});
    advance(coach,match,()=>match.state.event==='陪练送球');
    assert.equal(coach.stage,'return-again');assert.equal(coach.normalReturns,1);
    assert.deepEqual(match.state,second);
    returnBall(coach,match,'slice');
    const sliceFeed=structuredClone(match.state);
    advance(coach,match,()=>coach.held(match));coach.input(match,{...shot,slice:true,directionX:3});
    advance(coach,match,()=>match.state.event==='陪练送球');
    assert.equal(coach.stage,'slice');assert.equal(coach.normalReturns,2);
    assert.deepEqual(match.state,sliceFeed,'failed slice retries without losing two ordinary returns');
    returnBall(coach,match,'finish',true);
  }finally{match.dispose();}
});

test('checkpoint restores private serve motion and can be reused',async()=>{
  await initPhysics();const m=new Match();
  try{
    m.input(0,shot);m.step(.2);const state=structuredClone(m.state),restore=m.practiceCheckpoint();
    m.step(.2);restore();assert.deepEqual(m.state,state);
    for(let i=0;i<60&&m.state.phase==='serve';i++)m.step(1/60);
    assert.equal(m.state.rally,1);restore();assert.deepEqual(m.state,state);
  }finally{m.dispose();}
});

test('every player and bot on each surface can complete two ordinary returns and slice',async()=>{
  await initPhysics();
  for(const surface of ['hard','clay','grass'] as SurfaceId[])for(const c of CHARACTERS)for(const roles of [[c.id,'lin'],['lin',c.id]]){
    const m=new Match(roles,()=>.5,{surface}),coach=new PracticeTutorial();
    try{
      opening(coach,m);returnBall(coach,m,'recover');recover(coach,m);
      returnBall(coach,m,'slice');returnBall(coach,m,'finish',true);
      winFinal(coach,m);assert.equal(coach.normalReturns,2);
    }finally{m.dispose();}
  }
});

test('finger guidance covers taps, both diagonal serves and both swipe directions',()=>{
  for(const gesture of ['点','↑','↓','↖','↗']){
    assert.match(tutorialGesture(gesture),/hand-finger/);
    assert.match(tutorialGesture(gesture),/aria-hidden="true"/);
  }
  assert.match(tutorialGesture('点'),/hand-ripple/);
  assert.equal(tutorialGesture('✓'),'');
});

test('animation labels show outgoing direction, reversed only for slice',()=>{
  for(const direction of ['↑','↖','↗']){
    const html=tutorialGesture(direction);
    assert.ok(html.includes(`滑动 ${direction}`));
    assert.ok(html.includes(`data-direction="${direction}"`));
    assert.match(html,/与滑动同向/);
    assert.match(html,/outgoing-arrow/);
  }
  const slice=tutorialGesture('↓');
  assert.match(slice,/滑动 ↓/);
  assert.match(slice,/data-direction="↑"/);
  assert.match(slice,/出球 ↑/);
  assert.match(slice,/与滑动反向/);
  assert.doesNotMatch(tutorialGesture('点'),/outgoing-arrow/);
});

test('serve, normal return and slice prompts teach speed, length and outgoing direction',async()=>{
  await initPhysics();const m=new Match(['lin','lin'],()=>.5),coach=new PracticeTutorial();
  try{
    // Designer review U2: the pace physics moves into the foldable “为什么？” section.
    coach.stage='serve';assert.match(coach.prompt(m).detail,/球也向左上飞/);
    assert.equal(coach.prompt(m).more,TUTORIAL_PACE_HINT);
    coach.stage='return';m.practiceFeed();
    advance(coach,m,()=>coach.held(m));
    assert.match(coach.prompt(m).detail,/滑动方向就是出球方向/);
    assert.equal(coach.prompt(m).more,TUTORIAL_PACE_HINT);
    coach.stage='slice';
    assert.match(coach.prompt(m).detail,/出球方向与滑动方向相反/);
    assert.match(coach.prompt(m).detail,/向右下划，球向左上飞/);
    assert.equal(coach.prompt(m).more,TUTORIAL_PACE_HINT);
    assert.match(TUTORIAL_PACE_HINT,/相同用时划得越长/);
    assert.match(TUTORIAL_PACE_HINT,/落点通常越深/);
  }finally{m.dispose();}
});
