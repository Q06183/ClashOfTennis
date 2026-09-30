import {test} from 'node:test';
import assert from 'node:assert/strict';
import {staminaBars,staminaLabels} from '../src/ui/stamina.js';
import {characterPicker} from '../src/ui/characters.js';
import {App} from '../src/ui/app.js';
import {CameraChoice} from '../src/ui/camera-choice.js';

test('both seats have distinct point and total bars and explicit recovery-budget wording',()=>{
 for(const side of ['me','them'] as const){
  const html=staminaBars(side);
  assert.match(html,new RegExp(`id="stamina-${side}"`));
  assert.match(html,new RegExp(`id="total-stamina-${side}"`));
  assert.match(html,/本分/);assert.match(html,/总体/);
 }
 const labels=staminaLabels({stamina:.5,totalStamina:.8});
 assert.equal(labels.point,'本分 50%');assert.equal(labels.total,'总体 80%');
 assert.equal(labels.effective,'有效体力 40%');
 for(const id of ['lin','mei','wuming']){
  const html=characterPicker(id,false,true);
  assert.match(html,/20%/);assert.match(html,/90%/);assert.match(html,/下一分/);
  assert.doesNotMatch(html,/每分之间只按实际休息时间/);
 }
});
test('actual scoreboard renders four independent bar IDs for the two players',()=>{
 const cameraChoice=Object.assign(Object.create(CameraChoice.prototype),{distance:'near'});
 const html=(App.prototype as any).playing.call({audio:{muted:false},cameraChoice,local:{state:{surface:'hard'}}});
 for(const side of ['me','them'])for(const id of [`stamina-${side}`,`total-stamina-${side}`]){
  assert.equal((html.match(new RegExp(`id="${id}"`,'g'))??[]).length,1,id);
 }
 assert.equal((html.match(/本分 100%/g)??[]).length,2);
 assert.equal((html.match(/总体 100%/g)??[]).length,2);
});
