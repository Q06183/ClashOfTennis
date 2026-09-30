import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('phone home keeps the court badge in the artwork and clear of the action menu',async()=>{
  const css=await readFile(new URL('../src/ui/style.css',import.meta.url),'utf8');
  assert.ok(css.includes('@media(max-width:700px){.home .court-tag{display:flex;top:clamp(230px,42%,360px)'));
  assert.doesNotMatch(css,/.home .court-tag{display:none}/);
  assert.ok(css.includes('.menu .match-button{grid-column:1/-1'));
  assert.ok(css.includes('@media(max-width:700px) and (max-height:620px) and (orientation:portrait)'));
  assert.ok(css.includes('.home{overflow-x:hidden;overflow-y:auto}'));
  assert.ok(css.includes('min-height:568px'));
});
