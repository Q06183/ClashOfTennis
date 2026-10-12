import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {App} from '../src/ui/app.js';

test('phone home keeps the court badge in the artwork and clear of the action menu',async()=>{
  const css=await readFile(new URL('../src/ui/style.css',import.meta.url),'utf8');
  assert.ok(css.includes('@media(max-width:700px){.home .court-tag{display:flex;top:clamp(230px,42%,360px)'));
  assert.doesNotMatch(css,/.home .court-tag{display:none}/);
  assert.ok(css.includes('.menu .match-button{grid-column:1/-1'));
  assert.ok(css.includes('@media(max-width:700px) and (max-height:620px) and (orientation:portrait)'));
  assert.ok(css.includes('.home{overflow-x:hidden;overflow-y:auto}'));
  assert.ok(css.includes('min-height:568px'));
});

test('single-player stays in the original bottom row and only gains subtle emphasis',async()=>{
  const app=Object.assign(Object.create(App.prototype),{name:'球友',characterId:'lin',surface:'hard',busy:false}) as any;
  const html=app.home();
  assert.match(html,/<button class="practice practice-entry" data-action="practice"/);
  assert.match(html,/<strong>单人练习 · 先热热身<\/strong>/);
  assert.match(html,/aria-label="单人练习：新手引导、轻松对打、认真对打"/);
  const actions=['match','create','join','create-doubles','characters','practice'];
  for(let i=1;i<actions.length;i++)
    assert.ok(html.indexOf(`data-action="${actions[i-1]}"`)<html.indexOf(`data-action="${actions[i]}"`));
  assert.equal((html.match(/data-action="practice"/g)??[]).length,1);
  assert.doesNotMatch(html,/practice-entry-icon|practice-entry-copy/);
  const css=await readFile(new URL('../src/ui/style.css',import.meta.url),'utf8');
  const style=css.match(/\.menu \.practice-entry\{([^}]+)\}/)![1];
  assert.match(style,/background:#e4ead8/);
  assert.doesNotMatch(style,/(?:^|;)(?:min-height|padding|margin|grid[^:]*|order|position):/,'emphasis must not resize or move the row');
  assert.doesNotMatch(css,/min-height:620px|home-copy\{top:13%/,'remove layout changes from the promoted entry');
});
