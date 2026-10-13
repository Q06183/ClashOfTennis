import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {App} from '../src/ui/app.js';

test('simple home scrolls on short viewports and keeps practice visually subordinate',async()=>{
  const css=await readFile(new URL('../src/ui/home-design.css',import.meta.url),'utf8');
  assert.match(css,/overflow-x:hidden;overflow-y:auto/);
  assert.match(css,/\.home \.court-tag\{display:flex/);
  assert.match(css,/orientation:portrait/);assert.match(css,/orientation:landscape/);
  assert.match(css,/\.home \.menu>.match-button\{grid-column:1\/-1/);
  assert.match(css,/\.home \.menu>.practice-entry\{min-height:44px/);
});

test('homepage exposes one friends entry and a separate player tab, not room and player cards',()=>{
  const app=Object.assign(Object.create(App.prototype),{name:'球友',characterId:'lin',surface:'hard',busy:false,homeTab:'play'}) as any;
  const html=app.home();
  assert.match(html,/<strong>单人练习<\/strong>/);
  assert.match(html,/aria-label="单人练习：新手引导、轻松对打、认真对打"/);
  for(const action of ['match','friends','practice','surfaces','tab-play','tab-players'])
    assert.equal((html.match(new RegExp(`data-action="${action}"`,'g'))??[]).length,1,action);
  assert.doesNotMatch(html,/data-action="create"|data-action="create-doubles"|data-action="join"|data-action="characters"/);
  assert.doesNotMatch(html,/home-settings|id="nickname"/);
  assert.match(html,/id="home-tab-players" role="tab" tabindex="-1" aria-selected="false"/);
  assert.match(html,/role="tabpanel" aria-labelledby="home-tab-play"/);
  const panel=app.friendsPanel();
  for(const action of ['create','create-doubles','join'])assert.match(panel,new RegExp(`data-action="${action}"`));
  assert.equal((panel.match(/id="nickname"/g)??[]).length,1);
  assert.match(panel,/role="dialog" aria-modal="true"/);
});
