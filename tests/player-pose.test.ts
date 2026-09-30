import {SERVE_RECOVERY} from '../src/simulation/serve-motion.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {Athlete} from '../src/render/player.js';
import {side,type PlayerState,type Seat} from '../src/simulation/types.js';
test('racket sweet spot meets the authoritative ball contact at impact for both players',()=>{
  for(const seat of [0,1] as Seat[])for(const stroke of ['forehand','backhand','serve'] as const){
    const sign=seat===0?1:-1;
    const contact={x:stroke==='serve'?.15:stroke==='backhand'?-.6:.65,y:stroke==='serve'?2.65:1.15,z:10*sign-.2*sign};
    const player={x:0,z:10*sign,tx:0,tz:10*sign,stamina:1,moving:false,swing:stroke==='serve'?SERVE_RECOVERY:.44,stroke,contact} as PlayerState;
    const athlete=new Athlete(seat);athlete.update(player,1);athlete.root.updateMatrixWorld(true);
    const sweet=athlete.root.getObjectByName('racket-sweet-spot');assert.ok(sweet,'racket needs a named contact anchor');
    const actual=sweet.getWorldPosition(new Vector3());assert.ok(actual.distanceTo(new Vector3(contact.x,contact.y,contact.z))<.09,`${seat}/${stroke}: ${actual.toArray()}`);
  }
});

test('natural AI rally contacts remain within racket reach, including wide low balls',async()=>{
  const {initPhysics}=await import('../src/simulation/physics.js');
  const {Match}=await import('../src/simulation/match.js');
  const {driveAI}=await import('../src/simulation/ai.js');
  await initPhysics();const match=new Match(['lin','lin'],()=>1);const athletes=[new Athlete(0),new Athlete(1)];let contacts=0;
  for(let i=0;i<60*480&&match.state.phase!=='over';i++){
    const rally=match.state.rally;driveAI(match,0,'standard');driveAI(match,1,'standard');match.step(1/60);
    if(match.state.rally<=rally)continue;
    const seat=match.state.ball.hitter,p=match.state.players[seat];if(!p.contact)continue;
    // Athlete encodes the physical end, while the network seat is stable
    // across changeovers. Use the same mapping as CourtView.
    const a=athletes[side(seat,match.state)>0?0:1];a.update({...p,swing:p.stroke==='serve'?SERVE_RECOVERY:.44},match.state.time);a.root.updateMatrixWorld(true);
    const actual=a.root.getObjectByName('racket-sweet-spot')!.getWorldPosition(new Vector3());
    assert.ok(actual.distanceTo(new Vector3(p.contact.x,p.contact.y,p.contact.z))<.09,`natural contact: ${JSON.stringify(p)}`);contacts++;
  }
  assert.ok(contacts>10);match.dispose();
});

test('racket reach never teleports the player away from the authoritative position',()=>{
  const a=new Athlete(1);
  const p={x:-1.455,z:-9.662,tx:0,tz:0,stamina:1,moving:false,stroke:'forehand',contact:{x:-2.824,y:.42,z:-8.772}} as const;
  for(const swing of [0,.44,.2,.001,0]){
    a.update({...p,swing},1);
    assert.ok(Math.hypot(a.root.position.x-p.x,a.root.position.z-p.z)<1e-6);
  }
});
