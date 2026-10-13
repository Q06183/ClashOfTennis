import {BallPhysics} from './physics.js';
import {adjustRebound} from './surfaces.js';
import type {BallState,DeadBallState} from './types.js';

/** Leave a stopped ball briefly, then fade it out on the authority clock. */
export const DEAD_BALL_CLEANUP={hold:.6,fade:.6,maxAge:45} as const;
export function deadBallOpacity(ball:Pick<DeadBallState,'age'|'settledAt'>){
  if(ball.settledAt===undefined)return 1;
  return Math.max(0,Math.min(1,1-(ball.age-ball.settledAt-DEAD_BALL_CLEANUP.hold)/DEAD_BALL_CLEANUP.fade));
}

/** Independent cosmetic worlds: dead balls cannot alter authority RNG or play. */
export class DeadBalls {
  readonly states:DeadBallState[]=[];
  private bodies=new Map<number,BallPhysics>();
  private nextId=1;
  add(ball:BallState,groundJustBounced=false,netCollision=false){
    if(Math.hypot(ball.vx,ball.vy,ball.vz)<.05)return;
    const state:DeadBallState={...structuredClone(ball),id:this.nextId++,age:0,wallHits:0,settled:false};
    const physics=new BallPhysics(ball.surface,{enclosure:true,net:true});
    const velocity=groundJustBounced?adjustRebound({x:ball.vx,y:ball.vy,z:ball.vz},ball):{x:ball.vx,y:ball.vy,z:ball.vz};
    Object.assign(state,{vx:velocity.x,vy:velocity.y,vz:velocity.z});
    if(netCollision){
      state.z=-Math.sign(ball.vz)*.15;velocity.z=-ball.vz*.12;
      velocity.x*=.6;velocity.y=Math.min(0,velocity.y)*.4;
      Object.assign(state,{vx:velocity.x,vy:velocity.y,vz:velocity.z});
    }
    physics.place(state,velocity,ball.topspin);this.states.push(state);this.bodies.set(state.id,physics);
    while(this.states.length>3){const old=this.states.shift()!;this.bodies.get(old.id)?.dispose();this.bodies.delete(old.id);}
  }
  step(dt:number){
    if(!Number.isFinite(dt)||dt<=0)return;
    for(const b of this.states){
      b.age+=dt;
      const physics=this.bodies.get(b.id);if(!physics)continue;
      const before={...b};
      physics.step(dt);Object.assign(b,physics.read());
      if((before.vx*b.vx<0&&Math.abs(before.vx)>1)||(before.vz*b.vz<0&&Math.abs(before.vz)>1))b.wallHits++;
      if(before.vy<0&&b.vy>0&&b.y<.45){
        b.bounces++;
        const v=adjustRebound({x:b.vx,y:b.vy,z:b.vz},b);
        b.vx=v.x;b.vy=v.y;b.vz=v.z;
        b.topspin=(b.topspin??0)*.55;physics.setTopspin(b.topspin);
        physics.body.setLinvel(v,true);
      }
      // Smooth ground drag only; preserve airborne flight, spin and rebounds.
      if(b.y<.18&&Math.abs(b.vy)<1){
        const damping=Math.exp(-1.4*dt);
        b.vx*=damping;b.vz*=damping;physics.body.setLinvel({x:b.vx,y:b.vy,z:b.vz},true);
      }
      if((b.y<.18&&Math.hypot(b.vx,b.vz)<.08&&Math.abs(b.vy)<.3)||b.y<-2||b.age>DEAD_BALL_CLEANUP.maxAge){
        b.settled=true;b.settledAt=b.age;b.vx=0;b.vy=0;b.vz=0;physics.dispose();this.bodies.delete(b.id);
      }
    }
    // Mutate the array in place: Match.state.deadBalls references this array.
    for(let i=this.states.length-1;i>=0;i--){
      const b=this.states[i];
      if(b.settledAt!==undefined&&b.age-b.settledAt>=DEAD_BALL_CLEANUP.hold+DEAD_BALL_CLEANUP.fade){
        this.bodies.get(b.id)?.dispose();this.bodies.delete(b.id);this.states.splice(i,1);
      }
    }
  }
  clear(){for(const physics of this.bodies.values())physics.dispose();this.bodies.clear();this.states.length=0;}
}
