import {test} from 'node:test';
import assert from 'node:assert/strict';
import {characterPicker} from '../src/ui/characters.js';
import {HiddenCharacterUnlock} from '../src/ui/hidden-character.js';

const memoryStore=()=>{
 const data=new Map<string,string>();
 return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
};
test('exactly five consecutive activations unlock once and persist for both selectors',()=>{
 const store=memoryStore(),unlock=new HiddenCharacterUnlock(store);
 assert.equal(unlock.unlocked,false);assert.equal(unlock.selectable('wuming'),'lin');
 for(let i=0;i<4;i++)assert.equal(unlock.activate(),'pending');
 unlock.reset();
 for(let i=0;i<4;i++)assert.equal(unlock.activate(),'pending');
 assert.equal(unlock.unlocked,false);
 assert.equal(unlock.activate(),'unlocked');assert.equal(unlock.unlocked,true);
 assert.equal(unlock.selectable('wuming'),'wuming');
 assert.equal(unlock.activate(),'already-unlocked');
 const restored=new HiddenCharacterUnlock(store);
 assert.equal(restored.unlocked,true);assert.equal(restored.selectable('wuming'),'wuming');
 assert.equal(restored.selectable('invalid'),'lin');
});
test('failed storage read/write is diagnosed and still allows session-only unlocking',()=>{
 const errors:unknown[]=[];
 const unlock=new HiddenCharacterUnlock({getItem(){throw Error('read denied');},setItem(){throw Error('write denied');}},error=>errors.push(error));
 assert.equal(unlock.unlocked,false);
 for(let i=0;i<4;i++)unlock.activate();
 assert.equal(unlock.activate(),'session-only');
 assert.equal(unlock.selectable('wuming'),'wuming');assert.equal(errors.length,2);
});
test('invalid saved unlock values never reveal the hidden character',()=>{
 const store=memoryStore();store.setItem('rally-hidden-master','true');
 assert.equal(new HiddenCharacterUnlock(store).unlocked,false);
});

test('hidden master is absent by default, even if a stale selection points at it',()=>{
 for(const opponent of [false,true])for(const selected of ['lin','wuming']){
  const html=characterPicker(selected,opponent);
  assert.equal((html.match(/class="character-card /g)??[]).length,9);
  assert.ok(!html.includes('pick-character-wuming'));
  assert.ok(!html.includes('无名'));
 }
});
test('unlocked picker shows ten cards, six 99 meters and the hidden balance warning',()=>{
 for(const opponent of [false,true]){
  const html=characterPicker('wuming',opponent,true);
  assert.equal((html.match(/class="character-card /g)??[]).length,10);
  assert.equal((html.match(/value="99"/g)??[]).length,6);
  assert.match(html,/pick-character-wuming/);
  assert.match(html,/隐藏大佬/);assert.match(html,/非平衡/);
  assert.doesNotMatch(html,/×\s*10|乘\s*10|10\s*倍/);
  for(const value of ['+46.8%','+97.5%','-78%','+78%'])assert.ok(html.includes(value),value);
  assert.match(html,/<h2><button[^>]*data-action="hidden-master"/);
  assert.match(html,/<summary data-action="character-attributes">/,'disclosure must interrupt a title activation sequence');
 }
});
