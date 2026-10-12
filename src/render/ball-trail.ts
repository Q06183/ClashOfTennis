import type {Vec,MatchState} from '../simulation/types.js';

/** A fixed-time trail, not eight frame-old positions (which varies by FPS). */
export class BallTrail {
  private history:{time:number;point:Vec}[]=[];
  private flight=-1;
  private points=-1;
  sample(state:MatchState,count=8):Vec[]{
    const time=state.time,total=state.score[0]+state.score[1],last=this.history.at(-1);
    if(state.phase!=='rally'||state.rally!==this.flight||total!==this.points||
      (last&&time<last.time)){
      this.history=[];this.flight=state.rally;this.points=total;
    }
    if(state.phase!=='rally')return [];
    const point={x:state.ball.x,y:state.ball.y,z:state.ball.z};
    if(!this.history.length||time>this.history.at(-1)!.time)this.history.push({time,point});
    while(this.history.length>2&&this.history[1].time<time-.2)this.history.shift();
    const result:Vec[]=[];
    for(let i=0;i<count;i++){
      const at=time-(i+1)*.018;
      if(at<this.history[0].time)break;
      const right=this.history.findIndex(p=>p.time>=at),b=this.history[Math.max(0,right)];
      const a=this.history[Math.max(0,right-1)];
      const u=b.time===a.time?0:(at-a.time)/(b.time-a.time);
      result.push({x:a.point.x+(b.point.x-a.point.x)*u,y:a.point.y+(b.point.y-a.point.y)*u,z:a.point.z+(b.point.z-a.point.z)*u});
    }
    return result;
  }
}
