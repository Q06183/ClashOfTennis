import {test} from 'node:test';
import assert from 'node:assert/strict';
import {App} from '../src/ui/app.js';
import {characterPicker,revealCharacterPicker} from '../src/ui/characters.js';
import {HiddenCharacterUnlock} from '../src/ui/hidden-character.js';
import {NetworkClient} from '../src/network/client.js';
import type {RoomView} from '../src/simulation/types.js';

function fixture(reducedMotion=false){
 const events:unknown[]=[],sent:unknown[]=[],saved:unknown[]=[];
 let html='',scrollTop=0;
 const panel={
  get scrollTop(){return scrollTop;},
  set scrollTop(value:number){scrollTop=value;events.push(['restore-scroll',value]);},
 };
 const target=(name:string)=>({
  focus(options:FocusOptions){events.push([name,'focus',options,html]);},
  scrollIntoView(options:ScrollIntoViewOptions){events.push([name,'scroll',options]);},
 });
 const detail=target('detail'),card=target('card');
 const ui={
  get innerHTML(){return html;},
  set innerHTML(value:string){html=value;scrollTop=0;events.push('render');},
  ownerDocument:{defaultView:{matchMedia(query:string){
   assert.equal(query,'(prefers-reduced-motion: reduce)');return {matches:reducedMotion};
  }}},
  querySelector(selector:string){
   if(selector==='.character-panel')return panel;
   if(selector==='.character-detail')return detail;
   if(selector==='.character-card.selected')return card;
   return null;
  },
 };
 const app=Object.assign(Object.create(App.prototype),{
  ui,screen:'characters',seat:0,characterId:'lin',opponentId:'mei',choosingOpponent:false,choosingBot:null,
  hiddenMaster:new HiddenCharacterUnlock({getItem:()=>null,setItem(){}}),
  view:{setMode(){}},controls:{},surfaceOpen:false,net:null,room:null,
  saveCharacter:(...args:unknown[])=>saved.push(args),toast(){},
  playback:{reset(){},push(){}},local:{state:{surface:'hard'},dispose(){}},
 }) as any;
 return {app,ui,panel,events,sent,saved};
}

test('selecting self, opponent or bot renders the selected attributes before focusing and revealing them',async()=>{
 for(const mode of ['self','opponent','bot']){
  const {app,events,saved,panel}=fixture();
  if(mode==='opponent')app.choosingOpponent=true;
  if(mode==='bot')app.choosingBot={seat:3,characterId:'leo'};
  panel.scrollTop=280;events.length=0;
  await app.action('pick-character-sora');
  assert.match(app.ui.innerHTML,/aria-label="空野的属性介绍"/);
  assert.deepEqual(events.slice(0,2),['render',['restore-scroll',280]],'keep the previous position instead of jumping to the top');
  assert.deepEqual(events[2],['detail','focus',{preventScroll:true},app.ui.innerHTML]);
  assert.deepEqual(events[3],['detail','scroll',{behavior:'smooth',block:'start',inline:'nearest'}]);
  assert.equal(app.characterId,mode==='self'?'sora':'lin');
  assert.equal(app.opponentId,mode==='opponent'?'sora':'mei');
  assert.deepEqual(saved,mode==='bot'?[]:[[mode==='self'?'rally-character':'rally-opponent','sora']]);
  if(mode==='bot')assert.equal(app.choosingBot.characterId,'sora');
 }
});

test('reselecting the current player still reveals attributes and reduced-motion skips animation',async()=>{
 const {app,events}=fixture(true);
 await app.action('pick-character-lin');
 assert.deepEqual(events.at(-1),['detail','scroll',{behavior:'instant',block:'start',inline:'nearest'}]);
});

test('return to list reveals and focuses the selected card without rerendering or changing selections',async()=>{
 const {app,ui,events,saved,sent}=fixture();
 app.renderScreen();
 const html=ui.innerHTML;events.length=0;
 await app.action('character-list');
 assert.deepEqual(events,[
  ['card','focus',{preventScroll:true},html],
  ['card','scroll',{behavior:'smooth',block:'center',inline:'nearest'}],
 ]);
 assert.equal(app.characterId,'lin');assert.deepEqual(saved,[]);assert.deepEqual(sent,[]);
 app.screen='home';events.length=0;await app.action('character-list');assert.deepEqual(events,[]);
});

test('opening or refreshing the picker does not force scrolling; invalid and locked picks do nothing',async()=>{
 const {app,events}=fixture();
 app.renderScreen();assert.deepEqual(events,['render']);events.length=0;
 await app.action('pick-character-missing');await app.action('pick-character-wuming');
 assert.deepEqual(events,[]);
 app.screen='home';await app.action('pick-character-mei');assert.deepEqual(events,[]);
 app.screen='characters';app.hiddenMaster.unlocked=true;
 await app.action('pick-character-wuming');
 assert.match(app.ui.innerHTML,/aria-label="无名的属性介绍"/);
 assert.deepEqual(events.at(-1),['detail','scroll',{behavior:'smooth',block:'start',inline:'nearest'}]);
});

test('attribute region is focusable and contains a return action for all picker contexts',()=>{
 for(const args of [['lin',false,false],['mei',true,false],['leo',false,false,3],['wuming',false,true]] as const){
  const html=characterPicker(args[0],args[1],args[2],args.length===4?args[3]:undefined);
  assert.match(html,/class="character-detail"[^>]*tabindex="-1"[^>]*role="region"[^>]*aria-label="[^"]+的属性介绍"/);
  assert.match(html,/data-action="character-list">↑ 返回球员列表/);
 }
 const {ui,events}=fixture();
 ui.querySelector=()=>null;
 revealCharacterPicker(ui as unknown as HTMLElement,'detail');
 assert.deepEqual(events,[],'a closed picker must not scroll another screen');
});

test('room selection echo keeps attributes visible until confirmation instead of closing the picker',async()=>{
 const {app,events,sent}=fixture(),original=NetworkClient.prototype.connect;
 const room:RoomView={code:'123456',mode:'singles',surface:'hard',host:0,playing:false,paused:false,expiresAt:null,seats:[
  {name:'host',characterId:'lin',connected:true,ready:false},
  {name:'guest',characterId:'mei',connected:true,ready:false},
 ]};
 let callbacks:any;
 NetworkClient.prototype.connect=function(){callbacks=(this as any).callbacks;};
 try{
  app.connect({type:'create'});app.room=room;app.characterReturn='room';
  app.net={send:(m:unknown)=>sent.push(m)};
  await app.action('pick-character-sora');
  assert.deepEqual(sent,[{type:'select-character',characterId:'sora'}]);
  const selectedHTML=app.ui.innerHTML;events.length=0;
  const echoed=structuredClone(room);echoed.seats[0]!.characterId='sora';
  callbacks.room(echoed);
  assert.equal(app.screen,'characters');assert.equal(app.ui.innerHTML,selectedHTML);
  assert.deepEqual(events,[],'broadcast must not reset reading position or focus');
  app.renderScreen=()=>{};
  await app.action('confirm-characters');assert.equal(app.screen,'room');
  assert.equal(sent.length,1,'already acknowledged choice need not be sent again');
 }finally{NetworkClient.prototype.connect=original;}
});
