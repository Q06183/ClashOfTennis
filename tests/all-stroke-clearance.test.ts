import {test} from 'node:test';import assert from 'node:assert/strict';import {CapsuleGeometry,Mesh,SphereGeometry,Vector3} from 'three';
import {Athlete} from '../src/render/player.js';import {handedness} from '../src/simulation/characters.js';import {side,type PlayerState,type Seat} from '../src/simulation/types.js';
for(const characterId of ['lin','noah','adrian','luca'])test(`${characterId} all stroke paths clear head and chest on both seats`,()=>{
 for(const seat of [0,1] as Seat[])for(const stroke of ['forehand','backhand','slice-forehand','slice-backhand','volley','lob','smash'] as const)for(const backhand of stroke==='volley'||stroke==='lob'?[false,true]:[stroke.includes('backhand')]){
  const a=new Athlete(seat),sign=side(seat),hand=handedness(characterId),contact={x:(backhand?-.65:.65)*sign*hand,y:stroke==='smash'?2.5:1.2,z:10*sign-.65*sign};
  let head:Mesh<SphereGeometry>,chest:Mesh<CapsuleGeometry>;a.root.traverse(o=>{if(o instanceof Mesh){if(o.geometry instanceof SphereGeometry&&o.geometry.parameters.radius===.21)head=o;if(o.geometry instanceof CapsuleGeometry&&o.geometry.parameters.radius===.255)chest=o;}});
  const racket=a.root.getObjectByName('racket-grip')!;
  for(let i=0;i<=90;i++){
   const t=i/45,p:PlayerState={characterId,x:0,z:10*sign,tx:0,tz:10*sign,stamina:1,moving:false,stroke,backhand,shotQueued:true,contact,swing:t>=1?.44*(2-t):0,preparation:t<1?{stroke,progress:t,contact}:undefined};
   a.update(p,i/60,1/60);a.root.updateMatrixWorld(true);
   racket.traverse(o=>{const pos=(o as Mesh).geometry?.getAttribute('position');if(!pos)return;for(let v=0;v<pos.count;v+=3){const world=o.localToWorld(new Vector3().fromBufferAttribute(pos,v)),h=head.worldToLocal(world.clone()),c=chest.worldToLocal(world.clone());assert.ok(h.length()>.21,`${seat}/${stroke}/${backhand} head ${t}`);assert.ok(Math.hypot(c.x,c.z,Math.max(0,Math.abs(c.y)-.37/2))>.255,`${seat}/${stroke}/${backhand} chest ${t}`);}});
  }
 }
});
