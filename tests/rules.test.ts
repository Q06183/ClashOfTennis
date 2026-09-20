import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverForPoint, winnerForScore, isInCourt, isInServiceBox } from '../src/simulation/rules.js';

test('tie-break service order changes after one point then every two', () => {
  assert.deepEqual(Array.from({ length: 9 }, (_, n) => serverForPoint(n)), [0,1,1,0,0,1,1,0,0]);
});
test('match requires seven points and a two point margin', () => {
  assert.equal(winnerForScore([6,0]), null);
  assert.equal(winnerForScore([7,6]), null);
  assert.equal(winnerForScore([8,6]), 0);
  assert.equal(winnerForScore([10,12]), 1);
});
test('court lines are in; beyond line or wrong side is out', () => {
  assert.ok(isInCourt(4.115, -11.885, 1));
  assert.equal(isInCourt(4.3,-10,1), false);
  assert.equal(isInCourt(0,10,1), false);
});
test('serve must land in the diagonal service box', () => {
  assert.ok(isInServiceBox(-2,-5,0,0));
  assert.equal(isInServiceBox(2,-5,0,0),false);
  assert.equal(isInServiceBox(-2,-8,0,0),false);
  assert.ok(isInServiceBox(2,5,1,0));
});
