import {clamp,type Vec} from './types.js';
import {dropRebound} from './drop-shot.js';

export type SurfaceId='hard'|'clay'|'grass';
type SurfaceProfile={
 id:SurfaceId;name:string;title:string;description:string;
 restitution:number;pace:number;spinKick:number;spinLift:number;
 acceleration:number;braking:number;colors:readonly [number,number,number,number];
};
/** Calibrated game profiles, not laboratory measurements. Hard is the legacy
 * baseline (already zero horizontal friction), so grass does not add energy:
 * its faster play comes from the lower bounce and shorter reaction window. */
export const SURFACES:Readonly<Record<SurfaceId,Readonly<SurfaceProfile>>>={
 hard:{id:'hard',name:'硬地',title:'花园球场',description:'稳定反弹 · 均衡节奏 · 灵敏制动',
  restitution:.72,pace:1,spinKick:.12,spinLift:0,acceleration:1,braking:1,
  colors:[0x397c69,0x266c81,0x33869a,0x388fa1]},
 clay:{id:'clay',name:'红土',title:'红土球场',description:'高弹慢速 · 上旋蹿跳 · 更长制动',
  restitution:.81,pace:.82,spinKick:.20,spinLift:.18,acceleration:.90,braking:.70,
  colors:[0x9b5b40,0xb8623d,0xbf6b43,0xc47148]},
 grass:{id:'grass',name:'草地',title:'草地球场',description:'低弹快滑 · 切削贴地 · 抢攻上网',
  restitution:.54,pace:1,spinKick:.08,spinLift:0,acceleration:.95,braking:.85,
  colors:[0x547950,0x518340,0x669448,0x6d9b4e]},
};
export const isSurfaceId=(id:unknown):id is SurfaceId=>id==='hard'||id==='clay'||id==='grass';
export const surfaceProfile=(id?:unknown)=>SURFACES[isSurfaceId(id)?id:'hard'];
export type BounceBall={surface?:SurfaceId;topspin?:number;slice?:boolean;drop?:number};
/** Applies skills to the actual positive Rapier rebound. Omitting random uses
 * the expected slice response for planning; it never consumes authority RNG. */
export function adjustRebound(v:Vec,ball:BounceBall,random:()=>number=()=>.5):Vec{
 const profile=surfaceProfile(ball.surface),spin=clamp(ball.topspin??0,0,1);
 let {x,y,z}=v;
 const kick=profile.pace*(1+profile.spinKick*spin);
 x*=kick;z*=kick;y*=1+profile.spinLift*spin;
 if(ball.slice){
  const angle=(random()*2-1)*.16,pace=.8+.12*random(),vx=x,vz=z;
  x=(vx*Math.cos(angle)-vz*Math.sin(angle))*pace;
  z=(vx*Math.sin(angle)+vz*Math.cos(angle))*pace;
  y*=.58+.2*random();
 }
 return dropRebound({x,y,z},ball.drop);
}
/** Shared analytic bounce, from velocity immediately BEFORE ground contact. */
export function bounceVelocity(incoming:Vec,ball:BounceBall,random?:()=>number):Vec{
 return adjustRebound({...incoming,y:Math.abs(incoming.y)*surfaceProfile(ball.surface).restitution},ball,random);
}
