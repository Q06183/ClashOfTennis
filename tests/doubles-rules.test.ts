import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../src/simulation/rules.js';
import * as types from '../src/simulation/types.js';

test('doubles has four distinct players, two teams and an alternating team service order',()=>{
 assert.equal(typeof (types as any).teamOf,'function');
 const {teamOf,partner}=types as any;
 assert.deepEqual([0,1,2,3].map(teamOf),[0,1,0,1]);
 assert.deepEqual([0,1,2,3].map(partner),[2,3,0,1]);
 assert.deepEqual(Array.from({length:13},(_,n)=>(rules.serverForPoint as any)(n,'doubles')),[0,1,1,2,2,3,3,0,0,1,1,2,2]);
});
test('doubles tramlines are legal during rallies but never in the service box',()=>{
 assert.equal((rules.isInCourt as any)(5.48,-10,3,'doubles'),true);
 assert.equal((rules.isInCourt as any)(5.6,-10,3,'doubles'),false);
 assert.equal(rules.isInCourt(5,-10,1),false);
 assert.equal(rules.isInServiceBox(-5,-5,2 as any,0),false);
 assert.equal(rules.isInServiceBox(-2,-5,2 as any,0),true);
});
test('receiver identity follows the chosen deuce/ad order regardless of who serves',()=>{
 assert.equal(typeof (rules as any).receiverForPoint,'function');
 const receive=(rules as any).receiverForPoint;
 assert.deepEqual([0,1,2,3,4,5,6,7].map(n=>receive(rules.serverForPoint(n,'doubles'),n,'doubles')),[1,2,0,3,1,2,0,3]);
 // At six points ends switch, but designated receiver identities do not.
 assert.equal(receive(3,6,'doubles'),0);
});
test('physical ends can reverse independently of stable player/team identities',()=>{
 assert.equal((types.side as any)(2),1);
 assert.equal((types.side as any)(3),-1);
 assert.equal((types.side as any)(0,{ends:1}),-1);
 assert.equal((rules.isInCourt as any)(5,10,3,'doubles',1),true);
 assert.equal((rules.isInServiceBox as any)(2,5,2,0,1),true);
});
test('standard one-set scoring handles advantage, game service and six-all tie-break',async()=>{
 const scoring=await import('../src/simulation/scoring.js');
 const s=scoring.createScoring('standard');
 const points:[number,number]=[0,0];
 const win=(team:0|1)=>scoring.scorePoint(points,s,team);
 for(let i=0;i<3;i++){win(0);win(1);}
 assert.deepEqual(points,[3,3]);
 assert.equal(win(0),null);assert.equal(scoring.pointLabel(points,0,s),'AD');
 win(1);assert.equal(scoring.pointLabel(points,0,s),'40');
 win(1);win(1);assert.deepEqual(s.games,[0,1]);assert.deepEqual(points,[0,0]);
 for(let game=1;game<12;game++)for(let p=0;p<4;p++)win(game%2===1?0:1);
 assert.deepEqual(s.games,[6,6]);assert.equal(s.tiebreak,true);
 for(let i=0;i<6;i++){win(0);win(1);}
 assert.equal(win(0),null);assert.equal(win(0),0);assert.deepEqual(s.games,[7,6]);
});
