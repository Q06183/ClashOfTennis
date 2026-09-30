import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three';
import {Athlete} from '../src/render/player.js';
import {handedness} from '../src/simulation/characters.js';
import {SnapshotPlayback} from '../src/network/playback.js';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {driveAI} from '../src/simulation/ai.js';
import {disposeTree} from '../src/render/dispose.js';
import type {PlayerState} from '../src/simulation/types.js';

for(const id of ['lin','adrian','noah','luca'])for(const stroke of ['forehand','backhand'] as const){
 test(`${id}/${stroke}: late input leaves the solved rig unchanged, including behind-body contact`,()=>{
  for(const seat of [0,1] as const)for(const z of [.65,-.5]){
   const athlete=new Athlete(seat),sign=seat===0?-1:1;
   const contact={x:(stroke==='backhand'?.65:-.65)*sign*handedness(id),y:1.2,z:z*sign};
   const p:PlayerState={characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,swing:0,
    shotQueued:false,preparation:{stroke,progress:.96,contact}};
   try{
    athlete.update(p,1,1/60);
    const tip=athlete.root.getObjectByName('racket-sweet-spot')!;
    const torso=athlete.root.getObjectByName('athlete-torso')!;
    const before=tip.getWorldPosition(new Vector3()),rotation=torso.getWorldQuaternion(new Quaternion());
    athlete.update({...p,shotQueued:true},1+1/60,1/60);
    assert.ok(before.distanceTo(tip.getWorldPosition(new Vector3()))<.001,`input teleported the racket at z=${z}`);
    assert.ok(rotation.angleTo(torso.getWorldQuaternion(new Quaternion()))<.001,'input snapped the torso');
   }finally{disposeTree(athlete.root);}
  }
 });
}

for(const stroke of ['forehand','backhand'] as const)test(`${stroke}: running resumes gradually before follow-through ends`,()=>{
 const athlete=new Athlete(1);
 let previous:Vector3|undefined,previousSwing=0,checked=false;
 try{
  for(let i=0;i<=65;i++){
   const x=i*.1,swing=i<30?0:Math.max(0,.44-(i-30)/60);
   const p:PlayerState={characterId:'lin',x,z:0,tx:10,tz:0,stamina:1,moving:true,stroke,swing,
    contact:{x:x+(stroke==='backhand'?.65:-.65),y:1.2,z:.65}};
   athlete.update(p,i/60,1/60);
   const tip=athlete.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3()).sub(athlete.root.position);
   if(previous&&previousSwing>0&&swing===0){
    checked=true;assert.ok(tip.distanceTo(previous)<.08,'follow-through snapped directly into the running pose');
   }
   previous=tip;previousSwing=swing;
  }
  assert.ok(checked);
 }finally{disposeTree(athlete.root);}
});

test('real rallies and 20Hz snapshot playback do not teleport on groundstroke input',async()=>{
 await initPhysics();
 const match=new Match(['lin','lin'],()=>.5),playback=new SnapshotPlayback();
 const rigs=[new Athlete(0),new Athlete(1)],remote=[new Athlete(0),new Athlete(1)];
 const previous=new Map<Athlete,{tip:Vector3;queued:boolean;ground:boolean}>();
 let transitions=0;
 const inspect=(athlete:Athlete,p:PlayerState,time:number)=>{
  athlete.update(p,time,1/60);
  const tip=athlete.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
  const stroke=p.preparation?.stroke,ground=!p.rescue&&(stroke==='forehand'||stroke==='backhand');
  const prev=previous.get(athlete);
  if(prev?.ground&&ground&&!prev.queued&&p.shotQueued){
   transitions++;
   // Includes player travel and the fast forward swing (up to .283m here),
   // unlike the zero-time input-toggle test above. The old gate jumps .78m.
   assert.ok(tip.distanceTo(prev.tip)<.35,`late input skipped ${tip.distanceTo(prev.tip).toFixed(3)}m at ${time}`);
  }
  previous.set(athlete,{tip,queued:!!p.shotQueued,ground});
 };
 try{
  for(let i=0;i<1500;i++){
   driveAI(match,0,'standard');driveAI(match,1,'standard');match.step(1/60);
   for(const seat of [0,1] as const)inspect(rigs[seat],match.state.players[seat],match.state.time);
   if(i%3===0)playback.push(JSON.parse(JSON.stringify(match.state)),i*1000/60);
   const draw=playback.sample(i*1000/60);
   if(draw)for(const seat of [0,1] as const)inspect(remote[seat],draw.players[seat],draw.time);
  }
  assert.ok(transitions>=6,'fixture must exercise late input locally and through network playback');
 }finally{
  match.dispose();for(const athlete of [...rigs,...remote])disposeTree(athlete.root);
 }
});
