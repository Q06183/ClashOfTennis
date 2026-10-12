import {test} from 'node:test';
import assert from 'node:assert/strict';
import {App} from '../src/ui/app.js';
import {PracticeTutorial,TUTORIAL_VERSION} from '../src/ui/practice-tutorial.js';
import {initPhysics} from '../src/simulation/physics.js';

test('App saves completion only after two returns, recovery, slice and a winning result',async()=>{
  await initPhysics();
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}
  }});
  const app=Object.assign(Object.create(App.prototype),{
    screen:'setup',intro:false,tutorialRequired:true,tutorial:null,characterId:'lin',opponentId:'lin',
    hiddenMaster:{reset(){}},renderScreen(){},updateHud(){},toast(){},
    net:null,local:{dispose(){}},playback:{reset(){}},help:false,name:'测试球友',seat:0
  }) as any;
  const shot={type:'shot' as const,aim:0,depth:.5,power:.35,lob:false};
  function wait(predicate:()=>boolean){
    for(let i=0;i<3600&&!predicate();i++)app.tutorial.step(app.local,1/60);
    assert.ok(predicate());
  }
  try{
    await app.action('start-practice');
    assert.ok(app.tutorial instanceof PracticeTutorial);
    await app.action('finish-tutorial');assert.ok(app.tutorial,'cannot skip unfinished lessons');
    app.input({type:'move',x:2.5,z:12.9});wait(()=>app.tutorial.stage==='serve');
    app.input(shot);wait(()=>app.tutorial.stage==='return');
    wait(()=>app.tutorial.held(app.local));app.input(shot);
    wait(()=>app.tutorial.stage==='recover');
    assert.equal(data.get('rally-tutorial'),undefined);
    app.input({type:'move',...app.tutorial.movementTarget(app.local)});
    wait(()=>app.tutorial.stage==='return-again');
    wait(()=>app.tutorial.held(app.local));app.input(shot);
    wait(()=>app.tutorial.stage==='slice');
    wait(()=>app.tutorial.held(app.local));
    app.help=true;app.input({...shot,slice:true});
    assert.equal(app.tutorial.completed,false,'help must suspend input');
    await app.action('close-help');assert.equal(data.get('rally-tutorial'),undefined);
    app.input({...shot,slice:true});
    wait(()=>app.tutorial.stage==='finish');
    assert.equal(data.get('rally-tutorial'),undefined,'slice alone is not completion');
    wait(()=>app.tutorial.completed);app.completeTutorial();
    assert.equal(data.get('rally-tutorial'),TUTORIAL_VERSION);
    assert.equal(app.tutorialRequired,false);
    const sameMatch=app.local;
    assert.equal(sameMatch.state.winner,0);assert.equal(app.screen,'result');
    assert.match(app.result(),/你赢了，新手引导完成/);
    await app.action('finish-tutorial');
    assert.equal(app.tutorial,null);assert.notEqual(app.local,sameMatch);assert.equal(app.screen,'playing');
    await app.action('start-practice');assert.equal(app.tutorial,null,'passed players get ordinary practice');
    await app.action('replay-intro');assert.equal(app.intro,true);
    await app.action('close-intro');assert.equal(app.screen,'setup');
    await app.action('start-practice');assert.ok(app.tutorial,'explicit replay starts fresh practical lessons');
  }finally{
    app.local.dispose();
    if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');
  }
});

test('leaving replay restores both free-practice difficulty buttons without marking unpassed guides complete',async()=>{
  await initPhysics();
  const storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const historyDescriptor=Object.getOwnPropertyDescriptor(globalThis,'history');
  const locationDescriptor=Object.getOwnPropertyDescriptor(globalThis,'location');
  const data=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)
  }});
  Object.defineProperty(globalThis,'history',{configurable:true,value:{replaceState(){}}});
  Object.defineProperty(globalThis,'location',{configurable:true,value:{pathname:'/'}});
  const app=Object.assign(Object.create(App.prototype),{
    screen:'home',intro:false,tutorialRequired:false,tutorial:null,characterId:'lin',opponentId:'lin',
    difficulty:'standard',seat:0,surface:'hard',hiddenMaster:{reset(){}},renderScreen(){},updateHud(){},
    toast(){},net:null,local:{dispose(){}},playback:{reset(){}},help:false,name:'测试球友',
  }) as any;
  const setupHTML=()=>{
    const ui={innerHTML:'',querySelector(){return null;},insertAdjacentHTML(){}};
    const renderApp=Object.assign(Object.create(App.prototype),app,{
      ui,view:{setMode(){}},controls:{},cameraChoice:{},intro:false,surfaceOpen:false,
    });
    (App.prototype as any).renderScreen.call(renderApp);
    return ui.innerHTML;
  };
  try{
    for(const marker of [undefined,TUTORIAL_VERSION]){
      data.clear();if(marker)data.set('rally-tutorial',marker);
      await app.action('practice');
      assert.equal(app.tutorialRequired,false);
      assert.match(setupHTML(),/data-action="relaxed"/);
      assert.match(setupHTML(),/data-action="standard"/);
      await app.action('replay-intro');await app.action('close-intro');
      assert.equal(app.tutorialRequired,true);
      assert.match(setupHTML(),/data-action="standard"/,'all three choices stay visible even in guide mode');
      assert.match(setupHTML(),/data-action="practice-tutorial" aria-pressed="true"/);
      await app.action('standard');assert.equal(app.tutorialRequired,false);
      assert.match(setupHTML(),/开始认真对打/);
      await app.action('practice-tutorial');assert.equal(app.tutorialRequired,true);
      await app.action('relaxed');assert.equal(app.tutorialRequired,false);
      assert.match(setupHTML(),/开始轻松对打/);
      await app.action('practice-tutorial');
      assert.match(setupHTML(),/开始新手引导/);
      await app.action('back');
      assert.equal(app.intro,false);
      await app.action('practice');assert.equal(app.tutorialRequired,false);
      assert.match(setupHTML(),/认真对打/);
      await app.action('standard');await app.action('start-practice');
      assert.equal(app.tutorial,null);assert.equal(app.difficulty,'standard');
      await app.action('quit');await app.action('practice');
      await app.action('replay-intro');await app.action('close-intro');await app.action('start-practice');
      assert.ok(app.tutorial,'explicit replay starts the guide');
      await app.action('quit');assert.equal(app.tutorial,null);
      await app.action('practice');assert.match(setupHTML(),/认真对打/);
      assert.equal(data.get('rally-tutorial'),marker,'exiting replay does not rewrite completion');
      // Returning directly while the text modal is open also cancels the replay.
      await app.action('replay-intro');await app.action('back');
      assert.equal(app.intro,false);await app.action('practice');
      assert.equal(app.tutorialRequired,false);
    }
  }finally{
    app.local.dispose();
    for(const [key,descriptor] of [['localStorage',storageDescriptor],['history',historyDescriptor],['location',locationDescriptor]] as const){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
    }
  }
});
