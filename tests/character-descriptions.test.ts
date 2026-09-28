import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTERS} from '../src/simulation/characters.js';
import {characterPicker} from '../src/ui/characters.js';

test('every player visibly describes the same shared-scale effects before expanding formula help',()=>{
 const percentages:Record<string,string[]> = {
  lin:['+0%'],
  mei:['+21.6%','-7.2%','+15%','-40%','-45%','-32%','+32%'],
  rafa:['+0%','+26.4%','-35%','-15%','+15%','+16%','-16%'],
  sora:['+4.8%','-9.6%','+55%','-5%','-30%','+8%','-8%'],
  ines:['+9.6%','-7.2%','-20%','+55%','+5%','+36%','-36%'],
  leo:['-14.4%','+9.6%','-25%','+15%','+60%','+32%','-32%'],
  noah:['+2.4%','+24%','-30%','-40%','+15%','+0%'],
  adrian:['-9.6%','+4.8%','+55%','+10%','-25%','+24%','-24%'],
  luca:['+12%','-4.8%','-20%','+50%','-40%','+4%','-4%'],
  wuming:['+46.8%','+97.5%','-78%','+78%'],
 };
 for(const c of CHARACTERS)for(const opponent of [false,true]){
  const html=characterPicker(c.id,opponent,true),visible=html.split('<details>')[0];
  assert.ok(visible.includes(c.strength)&&visible.includes(c.weakness),`${c.id} descriptions`);
  assert.ok(visible.includes('实际效果'),`${c.id} should not hide effects behind disclosure`);
  for(const pct of percentages[c.id])assert.ok(visible.includes(pct),`${c.id} ${pct}`);
  for(const value of Object.values(c.stats))assert.ok(visible.includes(`value="${value}"`));
  assert.doesNotMatch(html,/×\s*10|乘\s*10|10\s*倍/);
 }
});
