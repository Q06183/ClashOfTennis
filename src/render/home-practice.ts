import {PerspectiveCamera,Vector3} from 'three';
import {Match} from '../simulation/match.js';
import {reception} from '../simulation/reception.js';
import {side,type MatchState,type Seat} from '../simulation/types.js';
import type {SurfaceId} from '../simulation/surfaces.js';

/** A real, isolated two-seat rally. Only the selected athlete is rendered. */
export class HomePractice {
  private match:Match|null=null;
  private accumulator=0;
  private characterId='';
  private surface:SurfaceId='hard';
  sample(dt:number,characterId:string,surface:SurfaceId):MatchState{
    if(!this.match||characterId!==this.characterId||surface!==this.surface){
      this.dispose();this.characterId=characterId;this.surface=surface;
      this.match=new Match([characterId,'lin'],()=>.5,{surface});
    }
    this.accumulator+=Number.isFinite(dt)?Math.max(0,Math.min(dt,.08)):0;
    while(this.accumulator>=1/60){
      if(this.match.state.phase==='over'){
        this.match.dispose();this.match=new Match([characterId,'lin'],()=>.5,{surface});
      }
      this.drive(0);this.drive(1);
      this.match.step(1/60);this.accumulator-=1/60;
    }
    return this.match.state;
  }
  private drive(seat:Seat){
    const match=this.match!,s=match.state,p=s.players[seat],sign=side(seat,s);
    if(s.phase==='serve'){
      if(s.server===seat&&!p.preparation&&Math.sin(s.time*2.5)>.5)
        match.input(seat,{type:'shot',aim:0,depth:.45,power:.35,lob:false});
      return;
    }
    if(s.phase!=='rally')return;
    if(s.ball.hitter===seat){
      match.input(seat,{type:'move',x:0,z:sign*10});
      return;
    }
    // Deliberate baseline practice for all characters, including volley-first
    // players: run to the real post-bounce contact, never manufacture a hit.
    const target=reception(s.ball,p,seat);
    match.input(seat,{type:'move',x:target.x,z:target.z});
    if((s.ball.bounces>0&&match.canReturn(seat))||s.rescueWindow?.seat===seat){
      match.input(seat,{type:'shot',aim:Math.sin(s.time*.83+seat*1.7)*.42,
        depth:.55+.22*Math.abs(Math.sin(s.time*.5)),power:.35,lob:false});
    }
  }
  dispose(){this.match?.dispose();this.match=null;this.accumulator=0;}
}

/** Fit the whole selected athlete into the UI-free area, not under the menu. */
export function frameHomePractice(camera:PerspectiveCamera,w:number,h:number,player={x:0,z:9},sign=1){
  camera.clearViewOffset();camera.aspect=w/h;camera.zoom=1;camera.fov=40;
  camera.position.set(player.x+6*sign,5.5,player.z+8*sign);camera.lookAt(player.x,1,player.z-.6*sign);
  camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const portrait=w<=700&&h>w;
  const [left,right,top,bottom]=portrait?[.16,.84,.30,.58]:[.52,.94,.18,.88];
  const points:Vector3[]=[];
  for(const x of [-1.1,1.1])for(const y of [0,2.7])for(const z of [-.7,.6])points.push(new Vector3(player.x+x,y,player.z+z));
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
