import {test} from 'node:test';
import assert from 'node:assert/strict';
import {App} from '../src/ui/app.js';
import {courtButton,roomSeats,surfaceChoices} from '../src/ui/match-settings.js';
import {rescueHint} from '../src/ui/rescue-hint.js';
import {AimCameraLock} from '../src/render/aim-camera.js';
test('room settings are keyboard buttons and occupied human seats cannot be silently converted to bots',()=>{
 const room={code:'123456',mode:'doubles' as const,host:0 as const,playing:false,paused:false,expiresAt:null,seats:[
  {name:'<host>',connected:true,ready:false},null,{name:'friend',connected:true,ready:false},null,
 ]};
 const html=roomSeats(room,0);
 assert.match(html,/&lt;host&gt;/);assert.doesNotMatch(html,/data-action="bot-0-/);
 assert.doesNotMatch(html,/data-action="bot-2-/);assert.match(html,/data-action="bot-1-add"/);
 assert.doesNotMatch(roomSeats(room,2),/data-action="bot/);
 assert.match(courtButton('grass'),/aria-label="选择场地：草地"/);
 assert.match(surfaceChoices('clay'),/aria-pressed="true"/);
});
test('all creation actions carry selected surface and locked matches cannot open the picker',async()=>{
 const sent:any[]=[];
 const app=Object.assign(Object.create(App.prototype),{
  hiddenMaster:{reset(){}},surface:'clay',screen:'home',busy:false,name:'test',characterId:'lin',
  connect:(m:any)=>sent.push(m),renderScreen(){},toast(){},
 });
 for(const action of ['match','create','create-doubles'])await app.action(action);
 assert.deepEqual(sent.map(m=>m.surface),['clay','clay','clay']);
 assert.equal(sent[2].mode,'doubles');
 app.screen='playing';app.surfaceOpen=false;await app.action('surfaces');assert.equal(app.surfaceOpen,false);
});
test('doubles result identifies the entire winning team instead of only the first seat',()=>{
 const app=Object.assign(Object.create(App.prototype),{
  remote:{phase:'over',mode:'doubles',winner:0,score:[7,3],players:[{characterId:'lin'},{characterId:'lin'},{characterId:'mei'},{characterId:'leo'}],time:80,maxRally:5,event:'二跳'},
  seat:2,name:'local',room:{seats:[{name:'A1'},{name:'B1'},{name:'A2'},{name:'B2'}]},net:{},
 });
 const html=app.result();
 assert.match(html,/A1 \/ A2/);assert.match(html,/你赢了/);assert.match(html,/返回房间/);
 assert.doesNotMatch(html,/A1 \/ A2 · 林岳/,'a team victory should not name only one character');
});
test('partner rescue window is labelled as teammate, not opponent',()=>{
 const state={rescueWindow:{seat:2,remaining:.4,flight:2}} as any;
 assert.match(rescueHint(state,0)!,/队友/);
 assert.match(rescueHint(state,1)!,/对手/);
});
test('swiping after a teammate hit cannot lock the camera waiting for a nonexistent return',()=>{
 const lock=new AimCameraLock();
 lock.shot({phase:'rally',ball:{hitter:2},score:[1,0],rally:3} as any,0);
 assert.equal(lock.update({phase:'rally',ball:{hitter:2},score:[1,0],rally:3} as any,1/60),false);
});
test('standard doubles help describes the active rules rather than claiming first-to-seven',()=>{
 const app=Object.assign(Object.create(App.prototype),{
  remote:{mode:'doubles',scoring:{format:'standard'}},net:{},
 });
 const html=app.helpPanel();
 assert.match(html,/标准一盘/);assert.match(html,/接发/);
 assert.doesNotMatch(html,/先到 7 分且领先 2 分获胜/);
});
