import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretGesture } from '../src/input/gesture.js';

test('short fast swipe is stronger but shallower than long slow swipe', () => {
  const fast = interpretGesture({dx:0,dy:-70,duration:65,hold:0,width:390,height:844});
  const slow = interpretGesture({dx:0,dy:-220,duration:700,hold:0,width:390,height:844});
  assert.ok(fast && slow);
  assert.ok(fast.power > slow.power);
  assert.ok(fast.depth < slow.depth);
});
test('normalized equivalent gestures on different screens agree', () => {
  const a = interpretGesture({dx:60,dy:-140,duration:230,hold:0,width:390,height:844});
  const b = interpretGesture({dx:120,dy:-280,duration:230,hold:0,width:780,height:1688});
  assert.deepEqual(a,b);
});
test('tap is not a shot; held upward swipe produces lob', () => {
  assert.equal(interpretGesture({dx:2,dy:-3,duration:100,hold:0,width:390,height:844}), null);
  assert.equal(interpretGesture({dx:0,dy:-130,duration:900,hold:600,width:390,height:844})?.lob, true);
});
test('a deliberate extra-fast swipe enters the critical tier above a strong swipe',()=>{
 const g={dx:0,dy:-260,duration:180,hold:0,width:390,height:844};
 const strong=interpretGesture(g)!,critical=interpretGesture({...g,duration:65})!;
 assert.equal(strong.power,1);assert.equal(!!strong.critical,false);assert.equal(critical.critical,true);
 assert.equal(interpretGesture({...g,dx:0,dy:-30,duration:20})?.critical,false,'tiny flick is not critical');
 assert.equal(interpretGesture({...g,duration:565,hold:500})?.critical,false,'lob cannot become critical');
 assert.deepEqual(critical,interpretGesture({...g,dy:-520,duration:65,width:780,height:1688}));
});
test('old easy critical flicks stay below critical while only long exceptionally fast strokes are critical',()=>{
 const base={dx:0,dy:-100,duration:65,hold:0,width:390,height:844};
 assert.equal(interpretGesture(base)!.critical,false);
 assert.equal(interpretGesture({...base,dy:-150,duration:50})!.critical,false);
 assert.equal(interpretGesture({...base,dy:-260,duration:120})!.critical,true);
 assert.equal(interpretGesture({...base,dy:-260,duration:240})!.critical,false);
});

test('same-length increasingly fast swipes expose all four pace tiers',async()=>{
 const {shotTier}=await import('../src/simulation/shot-profile.js');
 const tiers=[700,420,220,120].map(duration=>shotTier(interpretGesture({dx:0,dy:-260,duration,hold:0,width:390,height:844})!));
 assert.deepEqual(tiers,['normal','fast','power','critical']);
});
