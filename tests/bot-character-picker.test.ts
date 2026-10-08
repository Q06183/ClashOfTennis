import {test} from 'node:test';
import assert from 'node:assert/strict';
import {App} from '../src/ui/app.js';
import {roomSeats} from '../src/ui/match-settings.js';
import {NetworkClient} from '../src/network/client.js';
import {HiddenCharacterUnlock} from '../src/ui/hidden-character.js';
import type {RoomView} from '../src/simulation/types.js';

function fixture(){
 const sent:unknown[]=[],saved:unknown[]=[];
 const room:RoomView={code:'123456',mode:'doubles',surface:'hard',host:0,playing:false,paused:false,expiresAt:null,seats:[
  {name:'host',characterId:'lin',connected:true,ready:false},
  {name:'电脑 2',characterId:'mei',bot:true,connected:true,ready:false},
  {name:'friend',characterId:'sora',connected:true,ready:false},
  {name:'电脑 4',characterId:'leo',bot:true,connected:true,ready:false},
 ]};
 const app=Object.assign(Object.create(App.prototype),{
  screen:'room',seat:0,room,characterId:'lin',opponentId:'rafa',choosingOpponent:false,choosingBot:null,
  hiddenMaster:new HiddenCharacterUnlock({getItem:()=>null,setItem(){}}),
  net:{send:(m:unknown)=>sent.push(m)},renderScreen(){},toast(){},saveCharacter:(...args:unknown[])=>saved.push(args),
  playback:{reset(){},push(){}},local:{state:{surface:'hard'},dispose(){}},
 }) as any;
 return {app,room,sent,saved};
}

test('host can open a separate character picker for each bot, never for humans or as a guest',()=>{
 const {room}=fixture(),html=roomSeats(room,0);
 assert.match(html,/data-action="bot-1-character"/);
 assert.match(html,/data-action="bot-3-character"/);
 assert.doesNotMatch(html,/data-action="bot-[02]-character"/);
 assert.doesNotMatch(roomSeats(room,2),/data-action="bot-\d-character"/);
});

test('bot character is a draft until confirmation and does not modify self or practice opponent',async()=>{
 const {app,sent,saved}=fixture();
 await app.action('bot-3-character');
 assert.equal(app.screen,'characters');
 assert.deepEqual(app.choosingBot,{seat:3,characterId:'leo'});
 assert.deepEqual(sent,[],'opening must not remove the bot');
 await app.action('pick-character-mei');
 assert.equal(app.choosingBot.characterId,'mei');
 assert.equal(app.characterId,'lin');assert.equal(app.opponentId,'rafa');
 assert.deepEqual(saved,[]);assert.deepEqual(sent,[]);
 await app.action('confirm-characters');
 assert.deepEqual(sent,[{type:'configure',bot:{seat:3,enabled:true,characterId:'mei'}}]);
 assert.equal(app.screen,'room');assert.equal(app.choosingBot,null);
});

test('closing the bot picker cancels and locked hidden characters remain unavailable',async()=>{
 const {app,sent}=fixture();
 await app.action('bot-1-character');
 await app.action('pick-character-wuming');
 assert.equal(app.choosingBot?.characterId,'mei');
 await app.action('pick-character-leo');await app.action('close-characters');
 assert.equal(app.screen,'room');assert.equal(app.choosingBot,null);assert.deepEqual(sent,[]);
 await app.action('characters');await app.action('pick-character-sora');
 assert.equal(app.characterId,'sora');
 assert.deepEqual(sent,[{type:'select-character',characterId:'sora'}]);
});

test('bot picker rejects non-hosts, humans, empty or malformed seats and active matches',async()=>{
 for(const action of ['bot-0-character','bot-2-character','bot-9-character','bot-x-character','bot-1-unknown']){
  const {app,sent}=fixture();await app.action(action);
  assert.equal(app.screen,'room');assert.deepEqual(sent,[],action);
 }
 for(const state of [{seat:2},{room:{...fixture().room,playing:true},remote:{phase:'serve'}}]){
  const {app,sent}=fixture();Object.assign(app,state);await app.action('bot-1-character');
  assert.equal(app.screen,'room');assert.deepEqual(sent,[]);
 }
});

test('confirmation rechecks authority, target and match lock after opening',async()=>{
 for(const change of [
  (app:any)=>app.room.host=2,
  (app:any)=>app.room.seats[1]=null,
  (app:any)=>app.room.seats[1]={name:'new human',connected:true,ready:false},
  (app:any)=>{app.room.playing=true;app.remote={phase:'serve'};},
 ]){
  const {app,sent}=fixture();await app.action('bot-1-character');await app.action('pick-character-leo');
  change(app);await app.action('confirm-characters');assert.deepEqual(sent,[]);
 }
});

test('room broadcasts preserve the bot draft, but removing its target closes the picker',async()=>{
 const {app,room}=fixture(),original=NetworkClient.prototype.connect;
 let callbacks:any;
 NetworkClient.prototype.connect=function(){callbacks=(this as any).callbacks;};
 app.net=null;
 try{
  app.connect({type:'create'});app.screen='room';
  await app.action('bot-1-character');await app.action('pick-character-leo');
  callbacks.room(structuredClone(room));
  assert.equal(app.screen,'characters');assert.equal(app.choosingBot.characterId,'leo');
  const removed=structuredClone(room);removed.seats[1]=null;callbacks.room(removed);
  assert.equal(app.screen,'room');assert.equal(app.choosingBot,null);
 }finally{NetworkClient.prototype.connect=original;}
});

test('bot picker identifies the target and highlights its own character',async()=>{
 const {app}=fixture();await app.action('bot-3-character');
 assert.equal(app.screen,'characters');
 app.ui={innerHTML:''};app.view={setMode(){}};app.controls={};
 App.prototype['renderScreen'].call(app);
 assert.match(app.ui.innerHTML,/电脑球员/);
 assert.match(app.ui.innerHTML,/data-action="pick-character-leo" aria-pressed="true"/);
 assert.doesNotMatch(app.ui.innerHTML,/练习对手/);
});
