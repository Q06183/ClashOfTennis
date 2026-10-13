import {PerspectiveCamera,Vector3} from 'three';
import type {MatchState,PlayerState} from '../simulation/types.js';
import type {SurfaceId} from '../simulation/surfaces.js';

/** A solo hitting-wall preview. Never advances a scored match or an opponent. */
export class HomePractice {
  private time=0;
  sample(dt:number,characterId:string,surface:SurfaceId):MatchState{
    this.time+=Math.max(0,Math.min(dt,.08));
    const cycle=2.8,u=this.time%cycle,x=.22*Math.sin(this.time*.7);
    const contact={x:x+.55,y:1.25,z:8.65};
    const player:PlayerState={characterId,surface,x,z:9,tx:x,tz:9,stamina:1,totalStamina:1,
      moving:false,swing:u<.44?.44-u:0,stroke:'forehand',contact,
      preparation:u>2.35?{stroke:'forehand',progress:(u-2.35)/.45,contact}:undefined};
    // Two continuous ballistic arcs meet at the distant floor and the racket.
    const t=u<1.4?u:u-1.4,flight=1.4,g=9.81;
    const start=u<1.4?contact:{x:.55,y:.12,z:-5};
    const end=u<1.4?{x:.55,y:.12,z:-5}:contact;
    const vx=(end.x-start.x)/flight,vz=(end.z-start.z)/flight;
    const vy=(end.y-start.y+g*flight*flight/2)/flight;
    return {surface,mode:'singles',ends:0,time:this.time,phase:'rally',score:[0,0],players:[player],
      ball:{surface,x:start.x+vx*t,y:start.y+vy*t-g*t*t/2,z:start.z+vz*t,vx,vy:vy-g*t,vz,
        hitter:0,bounces:u<1.4?0:1,targetX:end.x,targetZ:end.z,tier:'normal'},
      server:0,fault:0,pointTimer:0,rally:Math.floor(this.time/cycle)+1,maxRally:0,
      winner:null,lastPoint:null,event:'单人热身',eventId:0};
  }
}

/** Fit the whole selected athlete into the UI-free area, not under the menu. */
export function frameHomePractice(camera:PerspectiveCamera,w:number,h:number){
  camera.clearViewOffset();camera.aspect=w/h;camera.zoom=1;camera.fov=40;
  camera.position.set(6,5.5,17);camera.lookAt(0,1,8.4);
  camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const portrait=w<=700&&h>w;
  const [left,right,top,bottom]=portrait?[.16,.84,.30,.58]:[.52,.94,.18,.88];
  const points:Vector3[]=[];
  for(const x of [-1.1,1.1])for(const y of [0,2.7])for(const z of [8.3,9.6])points.push(new Vector3(x,y,z));
  const bounds=()=>{
    const p=points.map(v=>v.clone().project(camera));
    return {left:Math.min(...p.map(v=>v.x)),right:Math.max(...p.map(v=>v.x)),
      top:Math.max(...p.map(v=>v.y)),bottom:Math.min(...p.map(v=>v.y))};
  };
  let b=bounds();
  camera.zoom=Math.min(2*(right-left)/(b.right-b.left),2*(bottom-top)/(b.top-b.bottom));
  camera.updateProjectionMatrix();b=bounds();
  const cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2;
  camera.setViewOffset(w,h,(cx-(left+right-1))*w/2,-(cy-(1-top-bottom))*h/2,w,h);
  camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
