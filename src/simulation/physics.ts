import RAPIER from '@dimforge/rapier3d-compat';
import type { Vec } from './types.js';
let initialized: Promise<void> | undefined;
export function initPhysics() { return initialized ??= RAPIER.init(); }
export class BallPhysics {
  readonly world = new RAPIER.World({x:0,y:-9.81,z:0});
  readonly body: RAPIER.RigidBody;
  constructor() {
    this.world.timestep = 1/60;
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(40,.1,50).setTranslation(0,-.1,0).setFriction(0).setRestitution(.72));
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,1,10).setCcdEnabled(true).setCanSleep(false));
    this.world.createCollider(RAPIER.ColliderDesc.ball(.12).setMass(.058).setFriction(0).setRestitution(.72), this.body);
  }
  place(position: Vec, velocity: Vec = {x:0,y:0,z:0}) {
    this.body.setTranslation(position,true); this.body.setLinvel(velocity,true);
    this.body.setAngvel({x:0,y:0,z:0},true);
  }
  step(dt: number) { this.world.timestep=dt; this.world.step(); }
  read() { const p=this.body.translation(), v=this.body.linvel(); return {x:p.x,y:p.y,z:p.z,vx:v.x,vy:v.y,vz:v.z}; }
  dispose() { this.world.free(); }
}
