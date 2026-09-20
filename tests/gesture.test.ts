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
