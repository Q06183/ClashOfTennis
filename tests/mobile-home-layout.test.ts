import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {App} from '../src/ui/app.js';

test('redesigned home retains the court selector and supports scrollable short viewports',async()=>{
  const css=await readFile(new URL('../src/ui/home-design.css',import.meta.url),'utf8');
  assert.match(css,/overflow-x:hidden;overflow-y:auto/);
  assert.match(css,/\.home \.court-tag\{display:flex/);
  assert.match(css,/orientation:portrait/);
  assert.match(css,/orientation:landscape/);
  assert.match(css,/\.home \.menu>.match-button\{grid-column:1\/-1/);
});

test('home redesign preserves action order, icons and accessible labels without duplicating practice',async()=>{
  const app=Object.assign(Object.create(App.prototype),{name:'球友',characterId:'lin',surface:'hard',busy:false}) as any;
  const html=app.home();
  assert.match(html,/<button class="practice practice-entry" data-action="practice"/);
  assert.match(html,/<strong>单人练习 · 先热热身<\/strong>/);
  assert.match(html,/aria-label="单人练习：新手引导、轻松对打、认真对打"/);
  const actions=['match','create','create-doubles','join','practice','characters','surfaces'];
  for(let i=1;i<actions.length;i++)
    assert.ok(html.indexOf(`data-action="${actions[i-1]}"`)<html.indexOf(`data-action="${actions[i]}"`));
  assert.equal((html.match(/data-action="practice"/g)??[]).length,1);
  for(const icon of ['match','create','join','doubles','player','practice','court'])
    assert.match(html,new RegExp(`data-icon="${icon}"`));
  assert.doesNotMatch(html,/点按跑位\s*\/\s*滑动击球\s*\/\s*好友对战/);
  assert.match(html,/home-play-heading/);
  assert.match(html,/上场，/);
  assert.match(html,/aria-label="更换球员/);
  const css=await readFile(new URL('../src/ui/home-design.css',import.meta.url),'utf8');
  assert.match(css,/align-items:center/);
  assert.match(css,/min-height:48px/);
});

test('session-start actions and personalization have separate labelled regions',()=>{
  const app=Object.assign(Object.create(App.prototype),{name:'球友',characterId:'lin',surface:'hard',busy:false}) as any;
  const html=app.home();
  const play=html.match(/<section class="home-play"[\s\S]*?<\/section>/)![0];
  const settings=html.match(/<section class="home-settings"[\s\S]*?<\/section>/)![0];
  for(const action of ['match','create','create-doubles','join','practice'])
    assert.match(play,new RegExp(`data-action="${action}"`));
  assert.doesNotMatch(play,/data-action="characters"|data-action="surfaces"|id="nickname"/);
  assert.match(play,/和朋友一起玩/);assert.match(play,/自己先练练/);
  assert.match(settings,/上场设置/);assert.match(settings,/不进入比赛/);
  for(const action of ['characters','surfaces'])assert.match(settings,new RegExp(`data-action="${action}"`));
  assert.match(settings,/id="nickname"/);
  assert.doesNotMatch(settings,/data-action="match"|data-action="practice"/);
  assert.equal((html.match(/id="nickname"/g)??[]).length,1);
});
