import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3,Object3D} from 'three';
import {HomePractice,frameHomePractice} from '../src/render/home-practice.js';
import {App} from '../src/ui/app.js';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {CourtView} from '../src/render/view.js';
import {BallTrail} from '../src/render/ball-trail.js';
import {ServeTarget} from '../src/render/serve-target.js';
import {CHARACTERS} from '../src/simulation/characters.js';

before(initPhysics);
test('home preview contains only the selected player and moves/swallows no match state',()=>{
  const preview=new HomePractice();
  for(const character of CHARACTERS)for(const surface of ['hard','clay','grass'] as const){
    const state=preview.sample(1/60,character.id,surface);
    assert.equal(state.players.length,1);assert.equal(state.players[0].characterId,character.id);
    assert.equal(state.surface,surface);assert.deepEqual(state.score,[0,0]);
    assert.ok([state.ball.x,state.ball.y,state.ball.z].every(Number.isFinite));
    assert.ok(state.ball.y>=.12-1e-6);
  }
  const time=preview.sample(0,'lin','hard').time;
  assert.equal(preview.sample(0,'lin','hard').time,time);
});
test('preview camera keeps the selected model in the free UI region on desktop, phone and landscape',()=>{
  for(const [w,h] of [[906,779],[390,844],[320,568],[844,390]]){
    const camera=new PerspectiveCamera();frameHomePractice(camera,w,h);
    for(const x of [-1.1,1.1])for(const y of [0,2.7])for(const z of [8.3,9.6]){
      const p=new Vector3(x,y,z).project(camera),sx=(p.x+1)/2,sy=(1-p.y)/2;
      if(w<=700&&h>w){assert.ok(sx>=.16-1e-8&&sx<=.84+1e-8);assert.ok(sy>=.18-1e-8&&sy<=.58+1e-8);}
      else{assert.ok(sx>=.52-1e-8&&sx<=.94+1e-8);assert.ok(sy>=.18-1e-8&&sy<=.88+1e-8);}
    }
  }
});
test('home rendering of a legacy two-player state hides the unselected opponent',()=>{
  const match=new Match(),updated:number[]=[],ids:string[]=[];
  try{
    const view=Object.assign(Object.create(CourtView.prototype),{
      mode:'home',seat:0,surface:'hard',ends:0,doubles:false,size:{w:390,h:844},
      camera:new PerspectiveCamera(),setCharacter(seat:number,id:string){ids.push(id);},
      quality:{level:'balanced'},athletes:[0,1,2,3].map(i=>({root:new Object3D(),update(){updated.push(i);}})),
      contactShadows:[0,1,2,3].map(()=>new Object3D()),ball:new Object3D(),shadow:new Object3D(),target:new Object3D(),marker:new Object3D(),
      ballTrail:new BallTrail(),serveTarget:new ServeTarget(),
      trail:[],flight:{update(){}},renderer:{render(){},domElement:{dataset:{}}}
    }) as any;
    view.render(match.state,1/60);
    assert.deepEqual(view.athletes.map((a:any)=>a.root.visible),[true,false,false,false]);
    assert.deepEqual(updated,[0]);assert.equal(view.renderer.domElement.dataset.players,'1');
    assert.deepEqual(ids,['lin']);
  }finally{match.dispose();}
});
test('tabs and friends panel navigate without starting a match or carrying opponent/bot picker context',async()=>{
  let renders=0;
  const app=Object.assign(Object.create(App.prototype),{
    screen:'home',homeTab:'play',net:null,busy:false,hiddenMaster:{reset(){}},renderScreen(){renders++;},
    choosingOpponent:true,choosingBot:{seat:3},friendsOpen:false,surfaceOpen:false
  }) as any;
  await app.action('tab-players');
  assert.equal(app.screen,'characters');assert.equal(app.homeTab,'players');
  assert.equal(app.characterReturn,'home');assert.equal(app.choosingOpponent,false);assert.equal(app.choosingBot,null);
  await app.action('tab-play');assert.equal(app.screen,'home');assert.equal(app.homeTab,'play');
  await app.action('friends');assert.equal(app.friendsOpen,true);
  await app.action('close-friends');assert.equal(app.friendsOpen,false);
  await app.action('friends');await app.action('join');
  assert.equal(app.screen,'join');assert.equal(app.friendsOpen,false);
  app.screen='playing';await app.action('tab-players');assert.equal(app.screen,'playing');
  assert.ok(renders>0);
});
