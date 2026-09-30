import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Box3,SkinnedMesh,Vector3} from 'three';
import {getCharacter,CHARACTERS} from '../src/simulation/characters.js';
import {characterPicker} from '../src/ui/characters.js';
import {Athlete} from '../src/render/player.js';
import {model} from './helpers/athlete-model.js';
import {disposeTree} from '../src/render/dispose.js';

const hashes:Record<string,string>={
 lin:'deacbd83336f7a12247cb116a8a43a2a2c4fe2556fd3622b4dae87e21c505700',
 mei:'59b8edfd27465fec36f7d63462d68d3416dfcac5d344de8cc6eea5d8025bb570',
 noah:'834ee0ce106095fef90d2bf5ae4f3580b208483b385b2b0d80289b7022e1b544',
};
for(const id of Object.keys(hashes))test(`${id}: production selects exactly the approved pre-remesh joint revision`,async()=>{
 const c=getCharacter(id),expected=`/models/releases/joint-pivot-v1/${id}.glb`;
 assert.equal(c.model,expected,'production still points to a non-corrected/experimental model');
 const bytes=await readFile('public'+c.model);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),hashes[id]);
 const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 const extras=json.scenes[json.scene??0].extras;
 assert.equal(extras.handFaceRevision,2);assert.equal(extras.bodyProportionRevision,3);
 assert.equal(extras.wholeArmRevision,undefined);assert.equal(extras.bodyFoundationRevision,undefined);
 assert.match(characterPicker(id,false),new RegExp(`/portraits/releases/joint-pivot-v1/${id}\\.png`));
});
test('roster extension retains portraits and existing stat profiles',()=>{
 for(const c of CHARACTERS.filter(c=>!hashes[c.id])){
  assert.equal(c.model,`/models/releases/joint-pivot-v1/${c.id}.glb`);
  assert.match(characterPicker(c.id,false,true),new RegExp(`/portraits/${c.id}\\.png`));
 }
 assert.equal(getCharacter('noah').handedness,'left');
 assert.equal(getCharacter('mei').handedness,'right');
 assert.deepEqual(Object.values(getCharacter('lin').stats),[60,60,60,60,60,60]);
});
test('actual released skins preserve fixed joint lengths and racket paths on both seats',async()=>{
 for(const id of Object.keys(hashes))for(const seat of [0,1] as const){
  const c=getCharacter(id),g=await model(c.model.replace(/^\/models\//,'').replace(/\.glb$/,''));
  const a=new Athlete(seat),reference=new Athlete(seat);a.attachModel(g.scene);
  reference.attachModel((await model(`prototypes/${id}`)).scene);
  const hand=id==='noah'?-1:1,sign=seat===0?-1:1;
  try{
   for(const stroke of ['forehand','backhand','serve','volley'] as const)for(let i=0;i<=60;i++){
    const t=i/30,contact={x:(stroke==='backhand'?.65:-.65)*hand*sign,y:stroke==='serve'?2.65:1.2,z:.65*sign};
    const p={characterId:id,x:0,z:0,tx:0,tz:0,stamina:1,moving:false,stroke,shotQueued:true,contact,
     swing:t>=1?(stroke==='serve'?.72:.44)*(2-t):0,preparation:t<1?{stroke,progress:t,contact}:undefined};
    a.update(p,t,1/30);reference.update(p,t,1/30);
    const at=(athlete:Athlete,n:string)=>athlete.root.getObjectByName(n)!.getWorldPosition(new Vector3());
    assert.ok(at(a,'racket-sweet-spot').distanceTo(at(reference,'racket-sweet-spot'))<1e-8);
    for(const side of ['L','R']){
     assert.ok(Math.abs(at(a,`UpperArm_${side}`).distanceTo(at(a,`LowerArm_${side}`))-.33)<1e-7);
     assert.ok(Math.abs(at(a,`LowerArm_${side}`).distanceTo(at(a,`Hand_${side}`))-.288)<1e-7);
    }
    if(i%10===0){const box=new Box3();g.scene.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));}});
     assert.ok(box.min.y>-.15&&box.max.y<3.5);
    }
   }
  }finally{disposeTree(a.root);disposeTree(reference.root);}
 }
});
