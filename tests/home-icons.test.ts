import {test} from 'node:test';
import assert from 'node:assert/strict';
import {homeIcon,type HomeIcon} from '../src/ui/home-icons.js';
import {App} from '../src/ui/app.js';

test('all homepage icons share accessible inline SVG geometry without external assets',()=>{
  for(const id of ['match','create','join','doubles','player','practice','court','arrow'] as HomeIcon[]){
    const svg=homeIcon(id);
    assert.match(svg,/viewBox="0 0 24 24"/);
    assert.match(svg,/stroke-width="1.7"/);
    assert.match(svg,/aria-hidden="true" focusable="false"/);
    assert.match(svg,new RegExp(`data-icon="${id}"`));
    assert.doesNotMatch(svg,/https?:|<image|<script/);
  }
});
test('every homepage action has a meaningful icon, text and an unchanged action identity',()=>{
  const app=Object.assign(Object.create(App.prototype),{
    name:'<球友>',characterId:'lin',surface:'clay',busy:false,networkError:''
  }) as any;
  const html=app.home();
  for(const [action,icon] of Object.entries({
    match:'match',create:'create',join:'join','create-doubles':'doubles',characters:'player',practice:'practice',surfaces:'court'
  })){
    const button=html.match(new RegExp(`<button[^>]*data-action="${action}"[\\s\\S]*?<\\/button>`))?.[0];
    assert.ok(button,action);assert.match(button,new RegExp(`data-icon="${icon}"`));
    assert.match(button,/<strong>/);
  }
  assert.match(html,/&lt;球友&gt;/);
  assert.match(html,/红土球场 · 红土/);
  assert.match(html,/aria-label="更换球员/);
  app.busy=true;
  const busy=app.home();
  for(const action of ['match','create','create-doubles'])
    assert.match(busy,new RegExp(`data-action="${action}" disabled`));
});
