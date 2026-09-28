import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rescueHint,rescueChanceText} from '../src/ui/rescue-hint.js';
import {RESCUE_LABELS} from '../src/simulation/rescue.js';
import type {MatchState,RescueStroke} from '../src/simulation/types.js';

test('HUD gives the actual stamina chance and names each jump instead of hiding it behind queued input',()=>{
 assert.match(rescueChanceText(1),/60%/);
 assert.match(rescueChanceText(2/3),/32\.5%/);
 assert.match(rescueChanceText(.5),/13\.6%/);
 assert.match(rescueChanceText(1/3),/5%/);
 const s={players:[{shotQueued:true},{}],ball:{rescue:false,hitter:0}} as unknown as MatchState;
 for(const stroke of Object.keys(RESCUE_LABELS) as RescueStroke[]){
  s.players[0].rescue={startedAt:0,fromX:0,fromZ:10,toX:2,toZ:10,contact:{x:2.5,y:1,z:10},hit:false,stroke};
  assert.equal(rescueHint(s,0),`${RESCUE_LABELS[stroke]}中…`);
  s.players[0].rescue.hit=true;s.ball.rescue=true;
  assert.match(rescueHint(s,0)!,/回球变慢/);assert.ok(rescueHint(s,1)!.includes(RESCUE_LABELS[stroke]));
 }
 s.players[0].rescue=undefined;s.ball.rescue=false;assert.equal(rescueHint(s,0),undefined);
});
test('landing and getting-up status stays visible even after the other player returns the ball',()=>{
 const s={time:.55,players:[{rescue:{startedAt:0,fromX:0,fromZ:10,toX:1,toZ:10,contact:{x:1.5,y:1,z:10},hit:true,stroke:'forehand'}},{}],
  ball:{rescue:false,hitter:1}} as unknown as MatchState;
 assert.match(rescueHint(s,0)!,/落地缓冲/);
 s.time=.9;assert.match(rescueHint(s,0)!,/正在起身/);
});
