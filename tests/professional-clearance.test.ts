import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {CapsuleGeometry,Mesh,SphereGeometry,Vector3} from 'three';
import {Athlete} from '../src/render/player.js';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {other,side,type Seat} from '../src/simulation/types.js';

before(initPhysics);

for(const seat of [0,1] as Seat[])for(const stroke of ['serve','smash','forehand','backhand'] as const){
 test(`actual ${stroke} clears head and torso throughout preparation and follow-through for seat ${seat}`,()=>{
  const match=new Match(['lin','lin'],()=>1),athlete=new Athlete(seat),sign=side(seat);
  try{
   if(stroke==='serve'&&seat===1){
    match.state.score=[1,0];match.state.phase='point';match.state.pointTimer=0;match.step(1/60);
   }
   const player=match.state.players[seat];
   if(stroke!=='serve'){
    const smash=stroke==='smash',depth=smash?3:10;
    match.state.phase='rally';match.state.rally=2;
    Object.assign(player,{x:0,z:depth*sign,tx:0,tz:depth*sign,vx:0,vz:0});
    match.input(seat,{type:'move',x:0,z:depth*sign});
    match.physics.place(
     {x:(smash?.25:stroke==='backhand'?-.6:.6)*sign,y:smash?2.55:1.3,z:(smash?2.75:9.5)*sign},
     {x:0,y:smash?-.5:0,z:4*sign},
    );
    Object.assign(match.state.ball,match.physics.read(),{hitter:other(seat),bounces:smash?0:1});
   }
   match.input(seat,{type:'shot',aim:0,depth:.5,power:.5,lob:false});

   // These anatomical proxies are shared with the generated-skin anchors.
   // This detects racket penetration; it does not certify GLB visual quality.
   let head:Mesh<SphereGeometry>|undefined,chest:Mesh<CapsuleGeometry>|undefined;
   athlete.root.traverse(o=>{
    if(!(o instanceof Mesh))return;
    if(o.geometry instanceof SphereGeometry&&o.geometry.parameters.radius===.21)head=o;
    if(o.geometry instanceof CapsuleGeometry&&o.geometry.parameters.radius===.255)chest=o;
   });
   assert.ok(head);assert.ok(chest);
   const racket=athlete.root.getObjectByName('racket-grip');assert.ok(racket);
   const minima={head:Infinity,chest:Infinity};
   const closest={head:'',chest:''};
   let sawPreparation=false,sawImpact=false,finished=false;
   for(let frame=0;frame<130;frame++){
    match.step(1/60);athlete.update(player,match.state.time,1/60);athlete.root.updateMatrixWorld(true);
    sawPreparation||=player.preparation?.stroke===stroke;
    sawImpact||=player.stroke===stroke&&player.swing>0;
    racket.traverse(o=>{
     // Include the grip, throat, rim and strings, not just the racket axis.
     const geometry=(o as Mesh).geometry,positions=geometry?.getAttribute('position');
     if(!positions)return;
     for(let i=0;i<positions.count;i++){
      const world=o.localToWorld(new Vector3().fromBufferAttribute(positions,i));
      const h=head!.worldToLocal(world.clone()),c=chest!.worldToLocal(world.clone());
      const distances={
       head:h.length()/head!.geometry.parameters.radius,
       chest:Math.hypot(c.x,c.z,Math.max(0,Math.abs(c.y)-chest!.geometry.parameters.height/2))/chest!.geometry.parameters.radius,
      };
      for(const part of ['head','chest'] as const){
       assert.ok(Number.isFinite(distances[part]),`${part}: non-finite racket transform`);
       if(distances[part]<minima[part]){
        minima[part]=distances[part];
        closest[part]=`time=${match.state.time.toFixed(4)}, swing=${player.swing.toFixed(4)}, ${geometry.type}, vertex=${i}`;
       }
      }
     }
    });
    // A serve becomes a rally at impact: continue until the entire swing ends.
    if(sawImpact&&player.swing===0){finished=true;break;}
   }
   assert.ok(sawPreparation,'exercise real preparation');
   assert.ok(sawImpact,'exercise an authoritative hit');
   assert.ok(finished,'exercise the complete follow-through');
   for(const part of ['head','chest'] as const){
    assert.ok(minima[part]>1,`${stroke}/${seat} racket penetrates ${part}: radius ratio=${minima[part]}, ${closest[part]}`);
   }
  }finally{match.dispose();}
 });
}
