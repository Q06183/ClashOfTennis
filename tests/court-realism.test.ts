import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COURT} from '../src/simulation/rules.js';
import {flightTime} from '../src/simulation/flight.js';

test('court remains regulation length rather than being stretched to fake distance',()=>{
 assert.equal(COURT.halfLength*2,23.77);
 assert.equal(COURT.halfWidth*2,8.23);
 assert.equal(COURT.service,6.4);
});
test('crosscourt flight duration follows travel distance instead of a fixed short global maximum',()=>{
 const start={x:-3,y:1.3,z:13},target={x:3,y:.12,z:-10};
 const normal=flightTime(start,target,.5,1,9.81);
 const defense=flightTime(start,target,.12,.65,9.81);
 const attack=flightTime(start,target,.9,1.55,9.81);
 assert.ok(normal>=1.2&&normal<=1.65,`normal: ${normal}`);
 assert.ok(defense>=2&&defense<=3.3,`slower defensive return: ${defense}`);
 assert.ok(attack>=.65&&attack<normal,`attack: ${attack}`);
 // Maximum-flight clamp used to force different long, weak shots to equal
 // duration, counteracting their pace attributes and shortening the exchange.
 const longer=flightTime({...start,z:16},{...target,z:-11},.12,.65,9.81);
 assert.ok(longer>defense+.2);
 const volley=flightTime({x:0,y:1.8,z:3},{x:1,y:.12,z:-4},.8,1.55,9.81);
 assert.ok(volley<attack,'net play remains distinctly faster');
});
