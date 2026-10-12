import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isCharacterAvailable} from '../src/simulation/characters.js';
import {characterPicker} from '../src/ui/characters.js';
import {HiddenCharacterUnlock} from '../src/ui/hidden-character.js';

test('Bob and Saba are temporarily unavailable in every game character picker',()=>{
 const store={getItem:()=>null,setItem:()=>{}};
 const unlock=new HiddenCharacterUnlock(store);
 const html=characterPicker('lin',false,true);
 assert.equal(isCharacterAvailable('lin'),true);
 assert.equal(isCharacterAvailable('wuming'),true,'hidden-master eligibility remains governed by its unlock');
 for(const id of ['bob','saba']){
  assert.equal(isCharacterAvailable(id),false,id);
  assert.equal(unlock.selectable(id),'lin',`${id} preference falls back to Lin`);
  assert.doesNotMatch(html,new RegExp(`data-action="pick-character-${id}"`));
 }
});
