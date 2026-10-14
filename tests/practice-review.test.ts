import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {driveAI} from '../src/simulation/ai.js';
import {PracticeReview,pointAdvice,practiceGoalChoices,practiceBestKey,readPracticeBest,savePracticeBest} from '../src/ui/practice-review.js';
import {App} from '../src/ui/app.js';
import {readFileSync} from 'node:fs';

before(initPhysics);
test('queued gestures and repeated ticks do not count; a real return and legal bounce count once',()=>{
  const m=new Match(),r=new PracticeReview('control'),s=m.state;
  try{
    r.observe(s);m.input(1,{type:'shot',aim:0,depth:.5,power:.35,lob:false});r.observe(s);
    assert.equal(r.value,0);
    s.phase='rally';s.rally=1;s.ball.hitter=1;r.observe(s);
    assert.equal(r.players[1].returns,0,'serve excluded');
    s.rally=2;s.ball.hitter=0;s.ball.bounces=0;s.ball.slice=true;s.eventId++;r.observe(s);
    for(let i=0;i<10;i++)r.observe(s);
    assert.equal(r.players[0].returns,1);assert.equal(r.value,0);
    s.ball.bounces=1;s.eventId++;s.event='切削弹跳';r.observe(s);r.observe(s);
    assert.equal(r.value,1);assert.deepEqual([...r.players[0].styles],['切削']);
    s.phase='point';s.event='二跳';s.eventId++;s.score=[1,0];s.lastPoint=0;r.observe(s);r.observe(s);
    assert.equal(r.players[1].missed,1);assert.equal(r.players[0].missed,0);
  }finally{m.dispose();}
});

test('out/net, first fault, lets, double faults and timeout have distinct ownership',()=>{
  const m=new Match(),r=new PracticeReview(),s=m.state;
  try{
    r.observe(s);
    for(const [reason,rally,hitter,winner] of [
      ['一发出界 · 准备二发',1,0,null],['发球擦网 · 重发',1,0,null],
      ['双误',1,0,1],['发球超时',0,1,0],['出界',3,0,1],['下网',2,1,0]
    ] as const){
      s.phase='point';s.rally=rally;s.ball.hitter=hitter;s.lastPoint=winner;s.event=reason;s.eventId++;
      if(winner!==null)s.score[winner]++;
      r.observe(s);r.observe(s);
    }
    assert.deepEqual({...r.players[0],styles:undefined},{returns:0,legal:0,out:1,net:0,missed:0,doubleFault:1,timeout:0,styles:undefined,perfect:0,winners:0});
    assert.equal(r.players[1].timeout,1);assert.equal(r.players[1].net,1);
    assert.match(r.advice,/二发|场内/);
  }finally{m.dispose();}
});

test('air interceptions are not legal landings or errors; resets do not reuse the prior flight',()=>{
  const m=new Match(),r=new PracticeReview('variety'),s=m.state;
  try{
    r.observe(s);s.phase='rally';s.rally=2;s.ball.hitter=0;s.ball.tier='lob';r.observe(s);
    s.rally=3;s.ball.hitter=1;s.ball.skill='volley';s.ball.bounces=0;s.eventId++;r.observe(s);
    assert.equal(r.players[0].returns,1);assert.equal(r.value,0);
    s.ball.bounces=1;s.eventId++;r.observe(s);assert.equal(r.players[1].legal,1);
    s.phase='point';s.lastPoint=1;s.score=[0,1];s.event='二跳';s.eventId++;r.observe(s);
    s.phase='serve';s.rally=0;s.ball.bounces=0;s.eventId++;r.observe(s);
    s.phase='rally';s.rally=1;s.ball.hitter=0;s.ball.bounces=1;s.eventId++;r.observe(s);
    assert.equal(r.value,0,'serve cannot inherit a return classification');
  }finally{m.dispose();}
});

test('variety assigns one style per flight and real full-match AI pipeline remains internally consistent',()=>{
  const m=new Match(),r=new PracticeReview('variety'),s=m.state;
  try{
    r.observe(s);
    for(const [i,style] of ['normal','slice','lob'].entries()){
      s.phase='rally';s.rally=i*2+2;s.ball.hitter=0;s.ball.bounces=0;
      s.ball.slice=style==='slice';s.ball.tier=style==='lob'?'lob':'normal';s.ball.topspin=style==='lob'?1:0;
      r.observe(s);s.ball.bounces=1;s.eventId++;r.observe(s);
    }
    assert.equal(r.value,3);assert.ok(r.complete);assert.match(r.progress,/已达成/);
    assert.equal(r.players[0].styles.size,3);
  }finally{m.dispose();}
  for(const surface of ['hard','clay','grass'] as const){
    const real=new Match(['lin','lin'],()=>.5,{surface}),stats=new PracticeReview('rally');
    try{
      stats.observe(real.state);
      for(let i=0;i<100000&&real.state.phase!=='over';i++){
        if(real.state.rally<8)driveAI(real,0,'standard');stats.observe(real.state);
        driveAI(real,1,'standard');stats.observe(real.state);
        real.step(1/60);stats.observe(real.state);
      }
      assert.equal(real.state.phase,'over');assert.equal(stats.maxRally,real.state.maxRally);
      assert.ok(stats.players[0].returns>0);assert.ok(stats.players[0].legal>0);
      for(const p of stats.players)assert.ok(p.legal<=p.returns);
      const counted=stats.players.reduce((n,p)=>n+p.out+p.net+p.missed+p.doubleFault+p.timeout,0);
      assert.equal(counted,real.state.score[0]+real.state.score[1],'each actual lost point counted once');
    }finally{real.dispose();}
  }
});

test('all advice and optional goal buttons have grounded semantics',()=>{
  for(const reason of ['出界','下网','二跳','双误','发球超时','接发球未落地','同队连续触球','接发顺序错误','触身失分','发球擦网 · 重发'])assert.ok(pointAdvice(reason).length>10);
  assert.match(pointAdvice('接发球未落地'),/先等落地/);
  assert.match(practiceGoalChoices('rally'),/goal-rally" aria-pressed="true"/);
  assert.match(practiceGoalChoices('rally'),/含发球/);
});

test('personal best is monotonic, combination-scoped and resilient to invalid or denied storage',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});
  try{
    const key=practiceBestKey('hard','relaxed','lin','ines','control');
    assert.equal(readPracticeBest(key),0);assert.ok(savePracticeBest(key,5));assert.ok(savePracticeBest(key,2));assert.equal(readPracticeBest(key),5);
    assert.notEqual(key,practiceBestKey('hard','standard','lin','ines','control'));
    assert.notEqual(key,practiceBestKey('clay','relaxed','lin','ines','control'));
    assert.notEqual(key,practiceBestKey('hard','relaxed','ines','lin','control'));
    for(const raw of ['Infinity','NaN','-1','3.5','oops','99999999999999999']){data.set(key,raw);assert.equal(readPracticeBest(key),0);}
    assert.equal(savePracticeBest(key,NaN),false);
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}}});
    assert.equal(readPracticeBest(key),0);assert.equal(savePracticeBest(key,5),false);
  }finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');}
});

test('pause and quit cancel gate inputs without modifying online pause, tutorial or match state',async()=>{
  const match=new Match();
  const app=Object.assign(Object.create(App.prototype),{
    screen:'playing',net:null,local:match,help:false,intro:false,paused:false,connected:true,practicePaused:false,
    hiddenMaster:{reset(){}},renderScreen(){},updateHud(){},practiceReview:new PracticeReview(),
    audio:{muted:false},cameraChoice:{button(){return '';}}
  }) as any;
  const shot={type:'shot' as const,aim:0,depth:.5,power:.35,lob:false};
  try{
    const initial=structuredClone(match.state);
    await app.action('pause-practice');app.input(shot);
    assert.deepEqual(match.state,initial);assert.equal(app.practicePaused,true);
    await app.action('quit');assert.equal(app.quitConfirm,true);
    await app.action('cancel-quit');assert.equal(app.practicePaused,true);
    await app.action('help');await app.action('close-help');assert.equal(app.practicePaused,true);
    await app.action('resume-practice');assert.equal(app.practicePaused,false);
    await app.action('quit');await app.action('cancel-quit');assert.equal(app.practicePaused,false);
    app.input(shot);assert.ok(match.state.players[0].preparation);
    app.net={input(){throw Error('blocked input must not send');}};
    await app.action('pause-practice');assert.equal(app.practicePaused,false,'online pause ignored');
    await app.action('quit');assert.equal(app.practicePaused,false);app.input(shot);
    await app.action('cancel-quit');assert.equal(app.quitConfirm,false);
    assert.doesNotMatch(app.playing(),/pause-practice/);app.net=null;
    assert.match(app.playing(),/pause-practice/);
    assert.match(app.helpPanel(),/<details class="help-details"><summary>进阶/);
    assert.match(app.quitPanel(),/丢弃本场进度/);
  }finally{match.dispose();}
});

test('frame and background paths hold the entire local pipeline; tutorial and network tracking are isolated',()=>{
  const source=readFileSync(new URL('../src/ui/app.ts',import.meta.url),'utf8');
  assert.match(source,/if\(document\.hidden&&!this\.net&&this\.screen==='playing'\)/);
  assert.match(source,/training&&\(this\.help\|\|this\.intro\|\|this\.practicePaused\|\|this\.quitConfirm\|\|document\.hidden\)/);
  assert.match(source,/this\.practiceReview=this\.tutorial\?null:new PracticeReview/);
  assert.match(source,/if\(training\)this\.practiceReview\?\.observe\(this\.local\.state\)/);
});

test('legal ground return height prevents same-tick bounce replacement; no simulation hooks are needed',()=>{
  const m=new Match(),r=new PracticeReview('control'),s=m.state;
  const shot={type:'shot' as const,aim:0,depth:.5,power:.35,lob:false};
  let landings=0;
  try{
    r.observe(s);
    for(let i=0;i<60000&&s.phase!=='over';i++){
      if(s.rally<8)driveAI(m,0,'standard');r.observe(s);
      driveAI(m,1,'standard');r.observe(s);
      const before={rally:s.rally,bounces:s.ball.bounces};
      m.step(1/60);r.observe(s);
      if(before.bounces===0&&s.ball.bounces===1&&s.phase==='rally'){
        landings++;assert.equal(s.rally,before.rally);
        const rally=s.rally;
        m.input(s.ball.hitter===0?1:0,shot);r.observe(s);
        assert.equal(s.rally,rally,'ball at first rebound is below the legal ground-hit height');
      }
    }
    assert.ok(landings>0);
    assert.ok(r.players[0].legal>0);
    assert.ok(r.players[0].legal<=r.players[0].returns);
  }finally{m.dispose();}
  const out=new Match();
  try{
    const stats=new PracticeReview('control');stats.observe(out.state);
    out.input(0,{...shot,directionX:4});
    for(let i=0;i<600&&out.state.phase!=='point';i++){out.step(1/60);stats.observe(out.state);}
    assert.match(out.state.event,/出界/);assert.equal(stats.players[0].legal,0,'fault landing is not a legal landing');
  }finally{out.dispose();}
});

test('actual App frame freezes time, ball, stamina and score for each pause reason including rescue holds',()=>{
  const documentDescriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  const rafDescriptor=Object.getOwnPropertyDescriptor(globalThis,'requestAnimationFrame');
  const match=new Match();
  const app=Object.assign(Object.create(App.prototype),{
    screen:'playing',net:null,local:match,help:false,intro:false,practicePaused:false,quitConfirm:false,
    lastFrame:0,accumulator:0,lastHud:10000,lastEvent:match.state.eventId,tutorial:null,
    practiceReview:new PracticeReview(),view:{recordFrame(){},render(){}},
    updateHud(){},renderScreen(){},audio:{play(){}}
  }) as any;
  Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false}});
  Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:()=>0});
  try{
    for(const phase of ['serve','rally'] as const){
      match.state.phase=phase;
      if(phase==='rally')match.state.rescueWindow={seat:0,remaining:.5,flight:match.state.rally};
      for(const reason of ['help','intro','practicePaused','quitConfirm','hidden']){
        if(reason==='hidden')(globalThis.document as any).hidden=true;else app[reason]=true;
        const initial=structuredClone(match.state);app.lastFrame=0;app.accumulator=0;
        app.advanceFrame(80);
        assert.deepEqual(match.state,initial,`${phase} / ${reason} must hold full simulation`);
        if(reason==='hidden')(globalThis.document as any).hidden=false;else app[reason]=false;
      }
    }
    match.state.rescueWindow=undefined;match.state.phase='serve';app.lastFrame=0;
    const time=match.state.time;app.advanceFrame(80);
    assert.ok(match.state.time>time,'normal frame resumes simulation');
  }finally{
    match.dispose();
    for(const [key,descriptor] of [['document',documentDescriptor],['requestAnimationFrame',rafDescriptor]] as const){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
    }
  }
});
