import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {initPhysics} from '../src/simulation/physics.js';
import {Match,gradeTiming,TIMING} from '../src/simulation/match.js';
import {aiInput,driveAI,relaxedOpening,practiceOpenness} from '../src/simulation/ai.js';
import {PracticeTutorial,TUTORIAL_FINAL,missAdvice} from '../src/ui/practice-tutorial.js';
import {HintGate,HINT_RULES,staminaWidths,hintKey} from '../src/ui/match-feedback.js';
import {displayName,matchingCopy,resultHeadline,ruleLabel,emoteBar,roomRecord,MATCH_BOT_OFFER_MS} from '../src/ui/copy.js';
import {TargetDrill,targetZone,inZone,TARGET_DRILL} from '../src/ui/target-drill.js';
import {PracticeReview,practiceReviewPanel,PRACTICE_GOALS} from '../src/ui/practice-review.js';
import {recordPracticeResult,recentPracticeResults,saveRallyBest,readRallyBest,rallyBestKey,suggestStandard} from '../src/ui/practice-history.js';
import {isLobHook,interpretGesture} from '../src/input/gesture.js';
import {characterPicker} from '../src/ui/characters.js';
import {CHARACTERS} from '../src/simulation/characters.js';
import {staminaBars} from '../src/ui/stamina.js';
import {Rooms} from '../server/rooms.js';
import {createGameServer} from '../server/app.js';
import {App} from '../src/ui/app.js';
import {EMOTES} from '../src/simulation/types.js';

before(initPhysics);
const shot={type:'shot' as const,aim:0,depth:.5,power:.35,lob:false};

function withStorage<T>(run:(data:Map<string,string>)=>T){
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});
  try{return run(data);}finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');}
}

// ---------- G1 quick match fallback ----------
async function client(url:string){
  const ws=new WebSocket(url),messages:any[]=[];ws.on('message',d=>messages.push(JSON.parse(d.toString())));
  await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  return {ws,send:(v:unknown)=>ws.send(JSON.stringify(v)),async wait(type:string,predicate:(m:any)=>boolean=()=>true,ms=3000){
    const until=Date.now()+ms;while(Date.now()<until){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}
    throw new Error(`timeout ${type}: ${JSON.stringify(messages)}`);
  }};
}
test('G1 searching reports online count and bot deadline; asking or waiting starts a computer match',async()=>{
  const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl);
  try{
    a.send({type:'match',name:'甲',characterId:'mei'});
    const status=await a.wait('matchmaking');
    assert.equal(status.searching,true);assert.ok(status.online>=1);assert.equal(status.botAfterMs,20_000);
    a.send({type:'match-bot'});
    const welcome=await a.wait('welcome');assert.equal(welcome.matched,true);assert.equal(welcome.seat,0);
    const room=await a.wait('room',m=>m.room.playing);
    assert.equal(room.room.matchedBot,true);assert.equal(room.room.seats[1].bot,true);
    assert.match(room.room.seats[1].name,/^电脑 · /);assert.notEqual(room.room.seats[1].characterId,'mei');
    const state=await a.wait('state');assert.equal(state.state.phase,'serve');
  }finally{a.ws.terminate();await server.close();}
});
test('G1 automatic fallback fires once after the configured wait and never pairs a matched player again',()=>{
  const rooms=new Rooms(30_000,50),sent:any[]=[];
  const ws={readyState:WebSocket.OPEN,bufferedAmount:0,send:(v:string)=>sent.push(JSON.parse(v)),on(){},ping(){},close(){},terminate(){}} as any;
  rooms.add(ws);const peer=rooms.peers.get(ws)!;
  (rooms as any).handle(peer,{type:'match',name:'等',characterId:'lin'});
  assert.equal(peer.searching?.name,'等');
  rooms.tick(1/60,false);assert.ok(peer.searching,'not before the deadline');
  peer.searching!.joined-=60;rooms.tick(1/60,false);
  assert.equal(peer.searching,null);assert.ok(peer.room);assert.equal(rooms.rooms.size,1);
  const welcome=sent.filter(m=>m.type==='welcome');assert.equal(welcome.length,1);
  rooms.tick(1/60,false);assert.equal(rooms.rooms.size,1,'no duplicate room');
  rooms.dispose();
});
test('G1 waiting copy counts up, offers computer at 10s and reaches the 20s automatic fallback',()=>{
  const info={online:3,botAfterMs:20_000};
  assert.equal(matchingCopy(0,info).clock,'0:00');assert.equal(matchingCopy(0,info).offer,false);
  assert.match(matchingCopy(0,info).detail,/20 秒/);assert.match(matchingCopy(0,info).online,/在线 3 人/);
  const offer=matchingCopy(MATCH_BOT_OFFER_MS+100,info);assert.equal(offer.offer,true);assert.match(offer.detail,/10 秒后自动/);assert.match(matchingCopy(15_000,info).detail,/5 秒后自动/);
  assert.match(matchingCopy(21_000,info).detail,/正在为你安排/);assert.equal(matchingCopy(75_000,info).clock,'1:15');
});

// ---------- G7 emotes, record, alternating serve ----------
test('G7 emotes are fixed ids, rate limited and broadcast; record counts finished matches and rematch swaps serve',async()=>{
  const server=await createGameServer({port:0,host:'127.0.0.1'}),a=await client(server.wsUrl),b=await client(server.wsUrl);
  try{
    a.send({type:'create',name:'甲'});const wa=await a.wait('welcome');
    b.send({type:'join',code:wa.code,name:'乙'});await b.wait('welcome');
    a.send({type:'emote',id:1});const emote=await b.wait('emote');assert.deepEqual([emote.seat,emote.id],[0,1]);
    a.send({type:'emote',id:2});a.send({type:'emote',id:99});a.send({type:'emote',text:'自由文本'});
    await new Promise(r=>setTimeout(r,120));
    await assert.rejects(b.wait('emote',()=>true,200),'second emote inside 1.2s is dropped; bad ids ignored');
    a.send({type:'ready'});b.send({type:'ready'});
    await a.wait('room',m=>m.room.playing);
    const room=server.rooms.rooms.get(wa.code)!;
    assert.equal(room.match!.state.server,0,'first match: host opens');
    room.match!.finish(1,'测试结束');
    await a.wait('room',m=>m.room.matches===1);
    assert.deepEqual(room.record,[0,1]);
    a.send({type:'ready'});b.send({type:'ready'});
    await a.wait('room',m=>m.room.playing&&m.room.matches===1);
    assert.equal(room.match!.state.server,1,'rematch: the other side opens');
  }finally{a.ws.terminate();b.ws.terminate();await server.close();}
  assert.equal(EMOTES.length,6);assert.match(emoteBar(),/data-action="emote-5"/);
  assert.match(roomRecord({matches:2,record:[1,1]} as any,0),/2 场 · 你 1 胜 1 负 · 下一场你方先发球/);
  assert.match(roomRecord({matches:1,record:[1,0]} as any,0),/下一场对方先发球/);
  assert.equal(roomRecord(null,0),'');
});
test('G7 firstServer offsets the whole rotation in singles and doubles without changing receiver rules',()=>{
  for(const mode of ['singles','doubles'] as const)for(const first of [0,1] as const){
    const m=new Match(['lin','lin','lin','lin'],()=>.5,{mode,firstServer:first});
    try{assert.equal(m.state.server,first);assert.notEqual(m.state.receiver!%2,m.state.server%2);}finally{m.dispose();}
  }
});

// ---------- U1 wording ----------
test('U1 blank name shows 你, practice opponent is 陪练 and tiebreak jargon is gone from match copy',()=>{
  assert.equal(displayName(''),'你');assert.equal(displayName('  '),'你');assert.equal(displayName('阿梅'),'阿梅');
  assert.equal(ruleLabel(false),'7 分制 · 需领先 2 分');assert.doesNotMatch(ruleLabel(true),/抢七/);
  const m=new Match();
  try{
    const app=Object.assign(Object.create(App.prototype),{local:m,seat:0,name:'你',room:null,net:null,opponentId:'mei',
      audio:{muted:false},cameraChoice:{button(){return '';}},lobButton:false}) as any;
    assert.match(app.teamName(1),/^陪练 · /);
    const hud=app.playing();assert.doesNotMatch(hud,/抢七|搭档|球友/);
    m.finish(1,'二跳');app.practiceReview=null;
    const result=app.result();assert.doesNotMatch(result,/持拍庆祝|球友/);
  }finally{m.dispose();}
});

// ---------- U2 HUD ----------
test('U2 one combined stamina bar per player keeps both values for assistive tech',()=>{
  const html=staminaBars('me');
  assert.equal((html.match(/class="stamina-row/g)??[]).length,1);
  assert.match(html,/id="stamina-me"/);assert.match(html,/id="total-stamina-me"/);assert.match(html,/aria-label="体力 · 本分 100% · 总体 100%"/);
  assert.deepEqual(staminaWidths({stamina:.5,totalStamina:.8}),{total:80,effective:40});
  assert.deepEqual(staminaWidths({stamina:2,totalStamina:-1}),{total:0,effective:0});
});
test('U2 hint gate: full coaching in opening points, then only new situations, each held ≥1.5s',()=>{
  const g=new HintGate();
  assert.equal(g.decide('incoming','来球了','',0,0).visible,true);
  assert.equal(g.decide('hit','好球','',0,100).visible,true,'opening points: shown, but…');
  assert.equal(g.decide('hit','好球','',0,100).text,'来球了','…the previous hint is held for its minimum time');
  assert.equal(g.decide('hit','好球','',0,HINT_RULES.minHoldMs+1).text,'好球');
  const later=HINT_RULES.openingPoints;
  assert.equal(g.decide('incoming','来球了','',later,5000).visible,false,'routine prompt suppressed after the opening');
  assert.equal(g.decide('topspin-in','上旋来球','',later,6000).visible,true,'first topspin still explained');
  assert.equal(g.decide('incoming','x','',later,6000+HINT_RULES.minHoldMs+1).visible,false);
  assert.equal(g.decide('topspin-in','上旋来球','',later,9000).visible,false,'seen situations are not repeated');
  g.reset();assert.equal(g.decide('topspin-in','上旋来球','',later,0).visible,true);
  const m=new Match();
  try{
    m.state.ball.hitter=1;m.state.ball.topspin=.5;assert.equal(hintKey(m.state,0,false),'topspin-in');
    m.state.players[0].shotQueued=true;assert.equal(hintKey(m.state,0,false),'queued');
    assert.equal(hintKey(m.state,0,true),'lob');
  }finally{m.dispose();}
});

// ---------- U3 + G3 tutorial ----------
test('U3 tutorial prompts are short, explain misses concretely and fold the pace physics',async()=>{
  const m=new Match(['lin','lin'],()=>.5),coach=new PracticeTutorial();
  try{
    coach.stage='serve';const serve=coach.prompt(m);
    assert.ok(serve.detail.length<40,serve.detail);assert.ok(serve.more&&/落点通常越深/.test(serve.more));
    assert.equal(coach.paceOpen,true,'first time open');
    coach.prompt(m);assert.equal(coach.paceOpen,false,'later folded behind 为什么？');
    for(const [reason,pattern] of [['出界',/划短/],['下网',/划长/],['二跳',/停住/]] as const)assert.match(missAdvice(reason),pattern);
  }finally{m.dispose();}
});
test('U3 a failed tutorial return names the reason and keeps the landing point for the red marker',async()=>{
  const {opening,advance}=await import('./helpers/tutorial.js');
  const m=new Match(['lin','lin'],()=>.5),coach=new PracticeTutorial();
  try{
    opening(coach,m);advance(coach,m,()=>coach.held(m));
    coach.input(m,{...shot,directionX:3});
    advance(coach,m,()=>coach.lastMiss!==null);
    assert.match(coach.lastMiss!.reason,/出界/);assert.ok(Number.isFinite(coach.lastMiss!.x));
    assert.ok(Math.abs(coach.lastMiss!.x)<=4.115+1.2+1e-9&&Math.abs(coach.lastMiss!.z)<=11.885+1.5+1e-9,'marker stays just outside the lines, inside the visible court');
    assert.ok(Math.abs(coach.lastMiss!.x)>4.115||Math.abs(coach.lastMiss!.z)>11.885,'an out landing is outside the singles court');
    advance(coach,m,()=>!coach.held(m)&&coach.retryNoticeShown);
    assert.match(coach.prompt(m).title,/出界了/);assert.match(coach.prompt(m).detail,/划短/);
  }finally{m.dispose();}
});
test('G3 final lesson is a real point: losses never pass, one won point completes without a fake 7:0',async()=>{
  const {opening,returnBall,recover,advance}=await import('./helpers/tutorial.js');
  const m=new Match(['lin','lin'],()=>.5),coach=new PracticeTutorial();
  try{
    opening(coach,m);returnBall(coach,m,'recover');recover(coach,m);returnBall(coach,m,'slice');returnBall(coach,m,'finish',true);
    assert.deepEqual(m.state.score,[0,0]);assert.equal(m.state.server,0);assert.equal(m.state.phase,'serve');
    // The learner's serve waits without a timeout, like every other tutorial step.
    for(let i=0;i<60*20;i++)coach.step(m,1/60);
    assert.deepEqual(m.state.score,[0,0]);assert.equal(coach.completed,false);
    // Serving but never returning loses points; three losses restart instead of passing.
    advance(coach,m,()=>{
      const s=m.state;if(s.phase==='serve'&&s.server===0&&!s.players[0].preparation)coach.input(m,shot);
      return coach.finishResets>=1;
    },60*120);
    assert.equal(coach.completed,false);assert.deepEqual(m.state.score,[0,0]);
    let last=-1;
    advance(coach,m,()=>{
      const s=m.state;
      if(s.phase==='serve'&&s.server===0&&!s.players[0].preparation)coach.input(m,shot);
      if(s.phase==='rally'&&s.ball.hitter===1&&s.rally!==last){last=s.rally;coach.input(m,{...shot,aim:(s.rally%2?1:-1)*.7,depth:.6,power:.4});}
      return coach.completed;
    },60*120);
    assert.equal(m.state.phase,'over');assert.equal(m.state.winner,0);
    assert.ok(m.state.score[0]>=1&&m.state.score[0]<7,'score reflects real points, not a forced 7:0');
    assert.match(m.state.event,/赢下了第一分/);
  }finally{m.dispose();}
});

// ---------- G2 timing ----------
test('G2 timing grades: early queue, ideal queue and instant reply are distinct; perfect is faster and freer',()=>{
  assert.equal(gradeTiming(true,.2),'perfect');assert.equal(gradeTiming(true,TIMING.queuedGood-.01),'good');assert.equal(gradeTiming(true,2),'early');
  assert.equal(gradeTiming(false,.05),'perfect');assert.equal(gradeTiming(false,.2),'good');assert.equal(gradeTiming(false,.5),'late');
  const run=(lead:boolean)=>{
    const m=new Match(['lin','lin'],()=>.5);m.setTimingGrade(0,true);
    try{
      m.practiceFeed();let queued=false;
      for(let i=0;i<600;i++){
        const s=m.state;
        if(!queued&&lead&&s.ball.z>3){m.input(0,shot);queued=true;}
        if(!lead&&m.canReturn(0)){m.input(0,shot);}
        if(s.ball.hitter===0&&s.rally>2)return {timing:s.ball.timing,speed:Math.hypot(s.ball.vx,s.ball.vz)};
        m.step(1/60);
      }
      throw Error('no contact');
    }finally{m.dispose();}
  };
  const instant=run(false),lead=run(true);
  assert.equal(instant.timing,'perfect');assert.ok(['perfect','good'].includes(lead.timing!));
  const off=new Match(['lin','lin'],()=>.5);
  try{
    off.practiceFeed();
    for(let i=0;i<600&&!(off.state.ball.hitter===0&&off.state.rally>2);i++){if(off.canReturn(0))off.input(0,shot);off.step(1/60);}
    assert.equal(off.state.ball.timing,undefined,'ungraded seats (computers, tutorial) are unchanged');
    assert.ok(instant.speed>Math.hypot(off.state.ball.vx,off.state.ball.vz),'perfect strike is faster than the ungraded baseline');
  }finally{off.dispose();}
});

// ---------- G4 relaxed partner ----------
test('G4 relaxed partner leaves attackable balls; openness adapts from local results only',()=>{
  assert.equal(practiceOpenness([]),0);assert.equal(practiceOpenness([false,false,false]),1);
  assert.equal(practiceOpenness([true,true,true]),-1);assert.ok(practiceOpenness([true,false,false])>0);
  const m=new Match(['lin','lin'],()=>.5);
  try{
    const s=m.state;s.phase='rally';s.ball.hitter=0;s.ball.bounces=1;
    let opened=0,flights=0;
    for(let r=1;r<200;r++){
      s.rally=r;const p=s.players[1];s.ball.x=p.x+.5;s.ball.z=p.z+.3;s.ball.y=1;
      const cmd=aiInput(s,1,'relaxed');if(!cmd||cmd.type!=='shot')continue;flights++;
      if(relaxedOpening(s,1))opened++,assert.ok(cmd.depth<.3&&Math.abs(cmd.aim)<.25&&cmd.power<=.3,'opening ball is short and central');
    }
    assert.ok(opened/flights>.18&&opened/flights<.4,`opening share ${opened}/${flights}`);
    const standard=aiInput(s,1,'standard')!;assert.equal(standard.type,'shot');
  }finally{m.dispose();}
  withStorage(()=>{
    assert.deepEqual(recentPracticeResults(),[]);
    for(let i=0;i<12;i++)recordPracticeResult(i%2===0);
    assert.equal(recentPracticeResults().length,10);
    assert.equal(suggestStandard([true,true,true]),true);assert.equal(suggestStandard([true,false,true]),false);
    const key=rallyBestKey('hard','relaxed','lin','mei');
    assert.equal(saveRallyBest(key,5),true);assert.equal(saveRallyBest(key,4),false);assert.equal(readRallyBest(key),5);
  });
});

// ---------- G5 target drill ----------
test('G5 target drill awards one star per legal first bounce inside the lit corner and alternates corners',()=>{
  assert.equal(PRACTICE_GOALS.target.target,TARGET_DRILL.stars);
  const m=new Match(),s=m.state,drill=new TargetDrill();
  try{
    const zone=targetZone(s,0);assert.ok(zone.z<0,'zone on the opponent half');
    s.phase='rally';s.rally=2;s.ball.hitter=0;s.ball.bounces=0;drill.observe(s);
    s.ball.bounces=1;s.ball.x=zone.x;s.ball.z=zone.z;assert.equal(drill.observe(s),true);assert.equal(drill.stars,1);
    assert.equal(drill.observe(s),false,'one flight counts once');
    s.rally=4;s.ball.bounces=0;drill.observe(s);s.ball.bounces=1;s.ball.x=zone.x;s.ball.z=zone.z;
    assert.equal(drill.observe(s),false,'second zone is the other corner');
    const next=targetZone(s,1);assert.equal(Math.sign(next.x),-Math.sign(zone.x));
    assert.equal(inZone(next,next.x,next.z),true);assert.equal(inZone(next,9,next.z),false);
    s.rally=1;s.ball.hitter=0;s.ball.bounces=1;s.ball.x=next.x;s.ball.z=next.z;assert.equal(drill.observe(s),false,'serves never count');
    const review=new PracticeReview('target');assert.ok(review.drill);assert.match(review.progress,/目标区 · ☆☆☆/);
  }finally{m.dispose();}
});

// ---------- U4 characters ----------
test('U4 cards show distinct signatures; detail shows signed differences from 60 and folds raw coefficients',()=>{
  const signatures=CHARACTERS.filter(c=>!c.hidden).map(c=>c.signature);
  assert.equal(new Set(signatures).size,signatures.length,'every card second line is unique');
  const html=characterPicker('rafa',false);
  assert.match(html,/重炮正手/);assert.doesNotMatch(html,/<small>[^<]*右手 · 双反/,'grip moves to a compact badge');assert.match(html,/class="grip-badge" title="右手 · 双反"/);
  assert.match(html,/<b>\+22<\/b>/);assert.match(html,/<b>-14<\/b>/);
  assert.match(html,/class="character-detail character-sheet"/);
});

// ---------- U5 result ----------
test('U5 loss headline names the player progress; review is open with the main error and parallel tiles',()=>{
  const lost=resultHeadline({won:false,guided:false,maxRally:10,legal:8});
  assert.match(lost.title,/最长回合 10 拍/);assert.match(lost.detail,/8 次合法落地/);
  assert.match(resultHeadline({won:false,guided:false,maxRally:2,newBest:true}).detail,/新纪录/);
  const r=new PracticeReview();r.players[0].returns=11;r.players[0].legal=8;r.players[0].out=3;r.players[0].missed=2;
  const html=practiceReviewPanel(r,0,true);
  assert.match(html,/本场最多的失误：<strong>回球出界 ×3<\/strong>/);
  assert.match(html,/<b>8<small>73%<\/small><\/b><span>合法落地/);assert.doesNotMatch(html,/\d+ \/ \d+/);
  const m=new Match();
  try{
    m.finish(1,'二跳');
    const app=Object.assign(Object.create(App.prototype),{local:m,seat:0,name:'你',net:null,room:null,opponentId:'lin',difficulty:'relaxed',
      practiceReview:r,practiceBest:0,practiceSaved:true,rallyRecord:false}) as any;
    const result=withStorage(()=>app.result());
    assert.match(result,/<details class="result-review" open>/);assert.match(result,/赢下本场/);assert.doesNotMatch(result,/MATCH WINNER/);
    assert.equal((result.match(/林岳/g)??[]).length>=1,true);assert.doesNotMatch(result,/林岳 · 林岳/,'practice/bot names never repeat the character');
    app.room={seats:[{name:'你'},{name:'电脑 · 露卡',bot:true}]};m.state.players[1].characterId='luca';
    assert.match(app.result(),/电脑 · 露卡 赢下本场/);assert.doesNotMatch(app.result(),/露卡 · 露卡/);
  }finally{m.dispose();}
});

// ---------- G6 lob gesture ----------
test('G6 an upward swipe with a hook is a lob; straight swipes and slices are not',()=>{
  assert.equal(isLobHook(800,560,610,390,844),true);
  assert.equal(isLobHook(800,560,560,390,844),false,'no hook');
  assert.equal(isLobHook(800,780,790,390,844),false,'too small to be deliberate');
  assert.equal(isLobHook(500,480,700,390,844),false,'ending below start is a slice');
  assert.ok(interpretGesture({dx:0,dy:-190,duration:300,hold:0,width:390,height:844}),'net release is still an upward shot');
});
