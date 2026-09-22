import {test} from 'node:test';import assert from 'node:assert/strict';import {Vector3} from 'three';import {strokePose} from '../src/render/strokes.js';import {Athlete} from '../src/render/player.js';import type {PlayerState} from '../src/simulation/types.js';
const base:PlayerState={x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke:'serve',swing:0,shotQueued:false};
const prepared=(stroke:PlayerState['stroke'],progress:number):PlayerState=>({...base,stroke,shotQueued:stroke!=='serve',preparation:{stroke,progress,contact:{x:stroke.includes('backhand')?.7:-.7,y:stroke==='serve'||stroke==='smash'?2.65:1.1,z:.6}}});
test('serve preparation actually loads the legs before the upward drive',()=>{
 const a=new Athlete(1);a.update(prepared('serve',.05),0,1/60);const hip=a.root.getObjectByName('athlete-torso')!.position.y;a.update(prepared('serve',.55),.6,1/60);assert.ok(a.root.getObjectByName('athlete-torso')!.position.y<hip-.09,'trophy pose needs real knee loading rather than idle footwork');
});
test('serve sets a staggered stance and lands on the front foot before the trailing leg',()=>{
 const a=new Athlete(1);a.update(prepared('serve',.5),.5,1/60);const feet=()=>[0,1].map(i=>a.root.getObjectByName(`foot-${i}`)!.getWorldPosition(new Vector3()));let f=feet();assert.ok(Math.abs(f[0].z-f[1].z)>.25,'serve feet must not remain parallel');
 a.update({...base,stroke:'serve',swing:.48,contact:{x:0,y:2.65,z:.25}},1.5,1/60);f=feet();assert.ok(f[1].y-f[0].y>.08,'right back leg trails above a landed left foot');
});
test('serve and overhead have different loading paths and only serve extends a tossing arm',()=>{
 const c=new Vector3(0,2.65,.25);let difference=0;for(const t of [.2,.4,.6,.8]){const serve=strokePose(prepared('serve',t),c),smash=strokePose(prepared('smash',t),c);difference+=serve.tip.distanceTo(smash.tip);assert.equal(smash.toss,0);}assert.ok(difference>1.1,'overhead must not reuse the complete service windup');
});
test('slice follows through forward on its own side rather than wrapping up like a drive',()=>{
 for(const bh of [false,true]){const c=new Vector3(bh?.7:-.7,1.1,.6),stroke=bh?'slice-backhand':'slice-forehand';const cut=strokePose({...base,stroke,swing:.132},c),drive=strokePose({...base,stroke:bh?'backhand':'forehand',swing:.132},c);assert.ok(cut.tip.z>c.z+.3,'slice needs extension through the ball');assert.ok(cut.tip.y<1.3);assert.ok(drive.tip.y>1.7);assert.equal(cut.twoHands,false);}
});
import {before} from 'node:test';import {Match} from '../src/simulation/match.js';import {initPhysics} from '../src/simulation/physics.js';
before(initPhysics);
test('serve toss releases from the hand, rises above contact, then descends into the racket without teleporting',()=>{
 const m=new Match(),a=new Athlete(0);m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});let previous=m.state.ball.y,peak=0,contactAt=0;const heights:number[]=[];
 for(let i=0;i<100&&m.state.phase==='serve';i++){m.step(1/60);a.update(m.state.players[0],m.state.time,1/60);heights.push(m.state.ball.y);peak=Math.max(peak,m.state.ball.y);assert.ok(Math.abs(m.state.ball.y-previous)<.14,'continuous ball toss');previous=m.state.ball.y;contactAt=m.state.time;}
 assert.ok(contactAt>=1.15&&contactAt<=1.25,'give service windup a readable 1.2-second motion');assert.ok(peak>3.02);assert.ok(heights.at(-2)!>heights.at(-1)!);assert.ok(Math.abs(m.state.ball.y-2.65)<1e-4);m.dispose();
});
test('charged topspin brushes up while a lob extends upward forward instead of a drive wrap',()=>{
 const c=new Vector3(-.7,1.1,.65),p=prepared('forehand',.78),flat=strokePose(p,c),spin=strokePose({...p,strokeSpin:1},c);assert.ok(spin.tip.y<flat.tip.y-.1);const lob=strokePose({...base,stroke:'lob',swing:.154},c),drive=strokePose({...base,stroke:'forehand',swing:.154},c);assert.ok(lob.tip.z>drive.tip.z+.2);assert.ok(lob.tip.x<0&&drive.tip.x>0);
});
test('real service windup keeps the handle and racket shaft outside the head',()=>{
 const m=new Match(),a=new Athlete(0);m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:false});
 // Fallback head is the same anatomical anchor used by every generated skin.
 let head:any;a.root.traverse((o:any)=>{if(o.geometry?.type==='SphereGeometry'&&o.geometry.parameters.radius===.21)head=o;});assert.ok(head);
 for(let i=0;i<100;i++){m.step(1/60);a.update(m.state.players[0],m.state.time,1/60);a.root.updateMatrixWorld(true);const racket=a.root.getObjectByName('racket-grip')!;
  for(let j=0;j<=20;j++){const p=head.worldToLocal(racket.localToWorld(new Vector3(0,.06-j*.025,0)));assert.ok(p.length()>.245,`handle/head overlap at ${m.state.time.toFixed(3)}: ${p.length()}`);}
 }m.dispose();
});
test('queued lob selects its upward preparation before the actual hit',()=>{
 const m=new Match(['lin','lin'],()=>1);m.state.phase='rally';m.state.rally=2;Object.assign(m.state.players[0],{x:0,z:10,tx:0,tz:10});m.input(0,{type:'move',x:0,z:10});m.physics.place({x:.6,y:.6,z:8.8},{x:0,y:3,z:3});Object.assign(m.state.ball,m.physics.read(),{hitter:1,bounces:1});m.input(0,{type:'shot',aim:0,depth:.5,power:.5,lob:true});m.step(1/60);assert.equal(m.state.players[0].preparation?.stroke,'lob');m.dispose();
});
