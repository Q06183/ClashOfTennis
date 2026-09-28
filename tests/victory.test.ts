import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Box3,SkinnedMesh,PerspectiveCamera,Object3D} from 'three';
import {Athlete} from '../src/render/player.js';
import {victoryPlayer} from '../src/render/victory.js';
import type {MatchState} from '../src/simulation/types.js';
import {disposeTree} from '../src/render/dispose.js';
import {CHARACTERS} from '../src/simulation/characters.js';
import {model} from './helpers/athlete-model.js';
import {App} from '../src/ui/app.js';
import {CourtView} from '../src/render/view.js';

test('both viewers select the authoritative winner for the result celebration without changing match state',()=>{
 const state={winner:1,phase:'over',players:[{characterId:'lin',x:0,z:12},{characterId:'mei',x:2,z:-10}]} as MatchState;
 const before=structuredClone(state);
 assert.equal(victoryPlayer(state)?.seat,1);
 assert.equal(victoryPlayer(state)?.player.characterId,'mei');
 assert.deepEqual(state,before);
 assert.equal(victoryPlayer({...state,phase:'rally'}),null);
});
test('victory dance visibly moves racket, feet and torso for both handedness styles',()=>{
 for(const id of ['lin','noah']){
  const a=new Athlete(0),p={characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,stroke:'forehand' as const,swing:0,moving:false};
  const tips:Vector3[]=[],heights:number[]=[];
  try{
   for(let i=0;i<120;i++){
    a.update(p,1,1/60,i/60);
    tips.push(a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3()));
    heights.push(a.root.position.y);
   }
   assert.ok(Math.max(...heights)-Math.min(...heights)>.08);
   assert.ok(tips[15].distanceTo(tips[70])>.25);
   a.update(p,1,1/60);assert.equal(a.root.position.y,0,'new match clears the celebration');
  }finally{disposeTree(a.root);}
 }
});
test('every actual character model can celebrate without exploding or losing its racket',async()=>{
 for(const c of CHARACTERS){
  const a=new Athlete(1);a.attachModel((await model(c.id==='lin'?'athlete':`characters/${c.id}`)).scene);
  try{
   for(let frame=0;frame<60;frame++){
    a.update({characterId:c.id,x:0,z:0,tx:0,tz:0,stamina:1,stroke:'forehand',swing:0,moving:false},1,1/30,frame/30);
    const box=new Box3();
    a.root.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));}});
    const size=box.getSize(new Vector3());
    assert.ok(size.toArray().every(Number.isFinite)&&size.x<3&&size.y<3.4&&size.z<3,c.id);
    const racket=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
    assert.ok(racket.toArray().every(Number.isFinite)&&racket.length()<3.5);
   }
  }finally{disposeTree(a.root);}
 }
});
test('result overlay names the actual winning opponent rather than always presenting the local player',()=>{
 const state={phase:'over',winner:1,players:[{characterId:'lin'},{characterId:'mei'}],score:[3,7],maxRally:12,time:85,event:'二跳'} as MatchState;
 const app={remote:state,seat:0,name:'玩家A',room:{seats:[{name:'玩家A'},{name:'赢家B'}]}};
 const html=(App.prototype as any).result.call(app);
 assert.match(html,/赢家B · 梅岚/);assert.match(html,/持拍庆祝/);assert.match(html,/victory-panel/);
 assert.match(html,/data-action="rematch"/);assert.match(html,/data-action="back"/);
});
test('the actual result renderer animates only the server winner on either client and never mutates state',()=>{
 for(const winner of [0,1] as const)for(const viewer of [0,1] as const){
  const p=(x:number,z:number)=>({characterId:'lin',x,z,tx:x,tz:z,stamina:1,stroke:'forehand' as const,swing:0,moving:false});
  const s={phase:'over',winner,players:[p(0,12),p(2,-10)],time:35,ball:{x:0,y:1,z:0,targetX:0,targetZ:0},score:[winner===0?7:3,winner===1?7:3]} as MatchState;
  const before=structuredClone(s),seen:(number|undefined)[]=[];
  const view=Object.assign(Object.create(CourtView.prototype),{
   mode:'result',seat:viewer,celebrationTime:0,size:{w:390,h:844},camera:new PerspectiveCamera(),
   scene:{},setCharacter(){},quality:{level:'balanced'},
   athletes:[0,1].map(i=>({root:new Object3D(),update(_p:unknown,_t:number,_d:number,celebration?:number){seen[i]=celebration;}})),
   contactShadows:[new Object3D(),new Object3D()],ball:new Object3D(),shadow:new Object3D(),target:new Object3D(),marker:new Object3D(),
   trail:[Object.assign(new Object3D(),{material:{color:{setHex(){}}}})],flight:{update(){}},renderer:{render(){}},
  }) as any;
  view.render(s,.1,s);
  assert.equal(view.athletes[winner].root.visible,true);
  assert.equal(view.athletes[winner===0?1:0].root.visible,false);
  assert.equal(seen[winner],.1);assert.equal(seen[winner===0?1:0],undefined);
  assert.deepEqual(s,before);
 }
});
