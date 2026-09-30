import {test} from 'node:test';
import assert from 'node:assert/strict';
import {App} from '../src/ui/app.js';
import {HiddenCharacterUnlock} from '../src/ui/hidden-character.js';
import {initPhysics} from '../src/simulation/physics.js';
import {NetworkClient} from '../src/network/client.js';

test('resumed Wuming without an unlock marker never becomes a locked local practice pick',async()=>{
 const original=NetworkClient.prototype.connect;
 const storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}});
 let callbacks:any;
 NetworkClient.prototype.connect=function(){callbacks=(this as any).callbacks;};
 const app=Object.assign(Object.create(App.prototype),{
  characterId:'lin',opponentId:'lin',hiddenMaster:new HiddenCharacterUnlock({getItem:()=>null,setItem(){}}),
  playback:{reset(){},push(){}},net:null,screen:'home',seat:0,renderScreen(){},toast(){},local:{state:{},dispose(){}},
 }) as any;
 try{
  app.connect({type:'resume'});
  callbacks.room({paused:false,seats:[{characterId:'wuming'},null]});
  assert.equal(app.room.seats[0].characterId,'wuming','authoritative room identity stays intact');
  assert.equal(app.characterId,'lin','local selection must respect local discovery');
  const sent:unknown[]=[];
  app.net={send:(m:unknown)=>sent.push(m)};app.screen='room';app.room.playing=false;
  await app.action('characters');await app.action('confirm-characters');await app.action('ready');
  assert.deepEqual(sent,[{type:'select-character',characterId:'lin'},{type:'ready'}],'confirming the visible fallback must synchronize the editable lobby');
  await initPhysics();app.net=null;
  await app.action('start-practice');
  assert.equal(app.local.state.players[0].characterId,'lin');app.local.dispose();
 }finally{
  NetworkClient.prototype.connect=original;
  if(storageDescriptor)Object.defineProperty(globalThis,'localStorage',storageDescriptor);
  else Reflect.deleteProperty(globalThis,'localStorage');
 }
});

test('real App action handler gates selections, resets interrupted clicks and shares player/opponent unlock',async()=>{
 const data=new Map<string,string>(),store={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:store});
 const sent:unknown[]=[],toasts:string[]=[];
 // Exercise actual action logic without constructing a WebGL canvas in Node.
 const app=Object.assign(Object.create(App.prototype),{
  screen:'home',characterId:'lin',opponentId:'mei',hiddenMaster:new HiddenCharacterUnlock(store),
  choosingOpponent:false,characterReturn:'home',renderScreen(){},toast:(s:string)=>toasts.push(s),
  net:{send:(m:unknown)=>sent.push(m)},room:{},controls:{},
 }) as any;
 try{
  await app.action('characters');
  await app.action('pick-character-wuming');assert.equal(app.characterId,'lin');assert.equal(sent.length,0);
  for(let i=0;i<4;i++)await app.action('hidden-master');
  await app.action('pick-character-mei');
  for(let i=0;i<4;i++)await app.action('hidden-master');
  assert.equal(app.hiddenMaster.unlocked,false);
  await app.action('close-characters');await app.action('characters');
  for(let i=0;i<4;i++)await app.action('hidden-master');
  assert.equal(app.hiddenMaster.unlocked,false);
  await app.action('hidden-master');
  assert.equal(app.hiddenMaster.unlocked,true);assert.equal(app.characterId,'mei');
  assert.match(toasts.at(-1)!,/已解锁/);
  await app.action('pick-character-wuming');
  assert.equal(app.characterId,'wuming');assert.equal(data.get('rally-character'),'wuming');
  assert.deepEqual(sent.at(-1),{type:'select-character',characterId:'wuming'});
  await app.action('close-characters');await app.action('practice');await app.action('opponent-characters');
  const sentBefore=sent.length;
  await app.action('pick-character-wuming');
  assert.equal(app.opponentId,'wuming');assert.equal(data.get('rally-opponent'),'wuming');assert.equal(sent.length,sentBefore);
  await app.action('close-characters');assert.equal(app.screen,'setup');
  // The same actual handler must instantiate a practice match with both IDs.
  await initPhysics();
  app.net=null;app.local={dispose(){}};app.playback={reset(){}};
  app.drawState={phase:'serve',server:1}; // stale network render state must not drive practice aim
  await app.action('start-practice');
  assert.equal(app.drawState,null);
  assert.deepEqual(app.local.state.players.map((p:any)=>p.characterId),['wuming','wuming']);
  app.local.dispose();
 }finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');}
});
