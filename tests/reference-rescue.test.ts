import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,SkinnedMesh,Box3} from 'three';
import {rescuePose} from '../src/simulation/rescue.js';
import {Athlete} from '../src/render/player.js';
import type {PlayerState} from '../src/simulation/types.js';
import {model} from './helpers/athlete-model.js';
import {CHARACTERS,handedness} from '../src/simulation/characters.js';
import {disposeTree} from '../src/render/dispose.js';

const player=(recovery:'step-out'|'supported-fall'):PlayerState=>({
 characterId:'lin',x:1,z:10,tx:1,tz:10,stamina:1,moving:false,stroke:'forehand',swing:0,
 rescue:{startedAt:0,fromX:0,fromZ:10,toX:1,toZ:10,contact:{x:1.6,y:1.2,z:9.6},hit:true,stroke:'forehand',recovery},
});

test('all ten migrated skins survive both recovery families with no ground penetration',async()=>{
 for(const c of CHARACTERS)for(const recovery of ['step-out','supported-fall'] as const){
  const a=new Athlete(0),p=player(recovery);p.characterId=c.id;
  p.x*=handedness(c.id);p.rescue!.toX*=handedness(c.id);p.rescue!.contact.x*=handedness(c.id);
  a.attachModel((await model(c.id==='lin'?'athlete':`characters/${c.id}`)).scene);
  try{
   for(let i=0;i<=36;i++){
    a.update(p,i/30,1/30);const box=new Box3();
    a.root.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();for(let v=0;v<o.geometry.attributes.position.count;v++)box.expandByPoint(o.localToWorld(o.getVertexPosition(v,new Vector3())));}});
    const size=box.getSize(new Vector3());
    assert.ok(size.toArray().every(Number.isFinite)&&Math.max(size.x,size.y,size.z)<3.5,`${c.id}/${recovery} bounds`);
    assert.ok(box.min.y>-.12,`${c.id}/${recovery}/${i}: penetrates court ${box.min.y}`);
   }
  }finally{disposeTree(a.root);}
 }
});
test('step-out and supported-fall share the exact reach pose but have distinct landings',()=>{
 const step=player('step-out'),fall=player('supported-fall');
 assert.deepEqual(rescuePose(step,.2),rescuePose(fall,.2),'do not change contact geometry');
 assert.ok(rescuePose(step,.62).pitch<.3,'foot landing must not turn prone');
 assert.ok(rescuePose(step,.62).hipHeight>.6,'foot landing keeps hips above knees');
 assert.ok(rescuePose(fall,.62).pitch>1.4,'keep the observed supported recovery');
});
test('step-out lands asymmetrically, leaves hands off the floor and stays continuous',()=>{
 for(const id of ['lin','noah'])for(const seat of [0,1] as const){
  const a=new Athlete(seat),p=player('step-out');p.characterId=id;
  let previous:Vector3[]|undefined,asymmetric=false;
  for(let i=1;i<=118;i++){
   const t=i/100;a.update(p,t,.01);
   const feet=[0,1].map(j=>a.root.getObjectByName(`foot-${j}`)!.getWorldPosition(new Vector3()));
   const hands=['racket-grip','left-hand-grip'].map(n=>a.root.getObjectByName(n)!.getWorldPosition(new Vector3()));
   if(t>.50&&t<.85){assert.ok(hands.every(h=>h.y>.55),'no prone hand plant on step-out');assert.ok(feet.every(f=>f.y>.06&&f.y<.32));}
   if(t>.4&&t<.6&&Math.abs(feet[0].y-feet[1].y)>.025)asymmetric=true;
   const points=[...feet,...hands];
   if(previous)for(let j=0;j<points.length;j++)assert.ok(points[j].distanceTo(previous[j])<.16,`${id}/${seat}/${t}: joint pop`);
   previous=points;
  }
  assert.ok(asymmetric,'lead foot should land before trailing foot');
 }
});
