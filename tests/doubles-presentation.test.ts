import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {SnapshotPlayback} from '../src/network/playback.js';
import {FlightGuide} from '../src/render/trajectory.js';
import {CourtView} from '../src/render/view.js';
import {Object3D,PerspectiveCamera} from 'three';
before(initPhysics);
test('playback interpolates all four seats and does not blend across an end change',()=>{
 const m=new Match(['lin','lin','lin','lin'],()=>1,{mode:'doubles'});
 const a=structuredClone(m.state);a.time=1;a.phase='rally';a.rally=2;
 const b=structuredClone(a);b.time=1.1;for(const p of b.players)p.x+=1;
 const playback=new SnapshotPlayback();playback.push(a,1000);playback.push(b,1100);
 const draw=playback.sample(1125)!;
 assert.equal(draw.players.length,4);assert.ok(draw.players[3].x>a.players[3].x&&draw.players[3].x<b.players[3].x);
 const c=structuredClone(b);c.time=1.2;c.ends=1;for(const p of c.players){p.z*=-1;p.ends=1;}
 playback.push(c,1200);
 assert.equal(playback.sample(1225)!.players[3].z,b.players[3].z);
 assert.equal(playback.sample(1300)!.players[3].z,c.players[3].z);
 m.dispose();
});
test('flight guide accepts double alleys for a rally, but marks the same serve red',()=>{
 const m=new Match(['lin','lin','lin','lin'],()=>1,{mode:'doubles'});
 m.state.phase='rally';m.state.rally=2;
 Object.assign(m.state.ball,{x:5,y:1,z:-5,vx:0,vy:-1,vz:0,hitter:0,bounces:0});
 const guide=new FlightGuide();guide.update(m.state,0,true);
 const material=(guide.root.children[1] as any).material;
 assert.notEqual(material.color.getHex(),0xff453a);
 m.state.rally=1;guide.update(m.state,0,true);assert.equal(material.color.getHex(),0xff453a);
 m.dispose();
});
test('UI exposes all surfaces, doubles creation and host seat configuration without editing player art',async()=>{
 const app=await readFile('src/ui/app.ts','utf8');
 assert.match(app,/data-action="create-doubles"/);
 assert.match(app,/data-action="surfaces"/);
 assert.match(app,/type:'configure'/);
 assert.match(app,/surface:this.surface/);
});
test('third and fourth room members can render the two-player lobby preview before first network state',()=>{
 const m=new Match();
 for(const seat of [2,3]){
  const view=Object.assign(Object.create(CourtView.prototype),{
   mode:'home',seat,surface:'hard',ends:0,doubles:false,size:{w:390,h:844},camera:new PerspectiveCamera(),
   setCharacter(){},quality:{level:'balanced'},
   athletes:[0,1,2,3].map(()=>({root:new Object3D(),update(){}})),
   contactShadows:[0,1,2,3].map(()=>new Object3D()),ball:new Object3D(),shadow:new Object3D(),target:new Object3D(),marker:new Object3D(),
   trail:[Object.assign(new Object3D(),{material:{color:{setHex(){}}}})],flight:{update(){}},renderer:{render(){},domElement:{dataset:{}}},
  });
  assert.doesNotThrow(()=>view.render(m.state,1/60,m.state));
 }
 m.dispose();
});
test('both winning teammates remain visible and celebrate using their physical-end rig',()=>{
 const m=new Match(['lin','lin','lin','lin'],()=>1,{mode:'doubles'});
 m.finish(0,'测试');m.state.ends=1;
 const updates:(number|undefined)[]=[];
 const view=Object.assign(Object.create(CourtView.prototype),{
  mode:'result',seat:2,surface:'hard',ends:1,doubles:true,celebrationTime:0,size:{w:390,h:844},camera:new PerspectiveCamera(),
  setCharacter(){},quality:{level:'balanced'},
  athletes:[0,1,2,3].map(i=>({root:new Object3D(),update(_p:unknown,_t:number,_d:number,c?:number){updates[i]=c;}})),
  contactShadows:[0,1,2,3].map(()=>new Object3D()),ball:new Object3D(),shadow:new Object3D(),target:new Object3D(),marker:new Object3D(),
  trail:[Object.assign(new Object3D(),{material:{color:{setHex(){}}}})],flight:{update(){}},renderer:{render(){},domElement:{dataset:{}}},
 });
 view.render(m.state,.1,m.state);
 assert.deepEqual(view.athletes.map((a:any)=>a.root.visible),[false,true,false,true]);
 assert.equal(updates[1],.1);assert.equal(updates[3],.1);
 m.dispose();
});
test('the render module provides stable team and controlled-player markings for identical characters',async()=>{
 const source=await readFile('src/render/view.ts','utf8');
 assert.match(source,/playerMarkers/);
 assert.match(source,/seat===this.seat/);
});
