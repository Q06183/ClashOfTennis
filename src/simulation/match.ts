import { BallPhysics } from './physics.js';
import {reception} from './reception.js';
import { COURT, isInCourt, isInServiceBox, serverForPoint, winnerForScore } from './rules.js';
import { clamp, other, side, type Input, type MatchState, type PlayerState, type Seat, type Shot } from './types.js';

const player = (seat: Seat): PlayerState => ({x:0,z:side(seat)*10,tx:0,tz:side(seat)*10,stamina:1,swing:0,stroke:'forehand',moving:false});
export class Match {
  readonly physics = new BallPhysics();
  readonly state: MatchState;
  private pending: [{shot:Shot;until:number}|null,{shot:Shot;until:number}|null] = [null,null];
  private manualUntil = [0,0];
  private serveElapsed = 0;
  private serveMotion:{shot:Shot;elapsed:number}|null=null;
  private bouncePoint:{x:number;z:number}|null=null;
  private sinceHit = 0;
  private serviceFlight = false;
  private faultReset = false;
  private impact: {x:number;z:number}|null = null;
  constructor() {
    this.state = {time:0,phase:'serve',score:[0,0],players:[player(0),player(1)],
      ball:{x:0,y:2.5,z:11.8,vx:0,vy:0,vz:0,bounces:0,hitter:0,targetX:0,targetZ:-5},
      server:0,fault:0,pointTimer:0,rally:0,maxRally:0,winner:null,event:'准备发球',eventId:0,lastPoint:null};
    this.resetPoint();
  }
  private announce(event: string) { this.state.event=event; this.state.eventId++; }
  private clearPreparation() {
    this.pending=[null,null];this.serveMotion=null;
    for(const p of this.state.players){p.preparation=undefined;p.shotQueued=false;}
  }
  private resetPoint() {
    const s=this.state, total=s.score[0]+s.score[1];
    s.phase='serve'; s.server=serverForPoint(total); s.rally=0; s.pointTimer=0;
    this.pending=[null,null]; this.manualUntil=[0,0]; this.serveElapsed=0; this.serviceFlight=false;this.impact=null;this.serveMotion=null;this.bouncePoint=null;
    const serveSide=side(s.server)*(total%2===0?1:-1);
    s.players.forEach((p,i) => {
      p.x=i===s.server?serveSide*1.5:-serveSide*1.5;
      p.z=side(i as Seat)*(i===s.server?12.4:10.3); p.tx=p.x;p.tz=p.z;p.moving=false;p.swing=0;p.preparation=undefined;p.shotQueued=false;
      if(!this.faultReset) p.stamina=clamp(p.stamina+.2,0,1);
    });
    const p=s.players[s.server];
    this.physics.place({x:p.x,y:1.25,z:p.z-.25*side(s.server)});
    Object.assign(s.ball,this.physics.read(),{bounces:0,hitter:s.server,targetX:-serveSide*2,targetZ:-side(s.server)*4.8});
    this.announce(s.fault?'二发 · 稳一点':'滑动发球');
    this.faultReset=false;
  }
  input(seat: Seat, cmd: Input) {
    if(seat!==0&&seat!==1 || !cmd || this.state.phase==='over'||this.state.phase==='point') return;
    const s=this.state,p=s.players[seat];
    if(cmd.type==='move') {
      if(!Number.isFinite(cmd.x)||!Number.isFinite(cmd.z)||s.phase==='serve') return;
      p.tx=clamp(cmd.x,-6,6);p.tz=side(seat)*clamp(cmd.z*side(seat),.9,14.7);
      this.manualUntil[seat]=s.time+.8; return;
    }
    if(cmd.type!=='shot'||![cmd.aim,cmd.depth,cmd.power].every(Number.isFinite)||typeof cmd.lob!=='boolean') return;
    if(cmd.directionX!==undefined&&!Number.isFinite(cmd.directionX))return;
    const shot:Shot={type:'shot',aim:clamp(cmd.aim,-1.2,1.2),depth:clamp(cmd.depth,0,1),power:clamp(cmd.power,0,1),lob:cmd.lob};
    if(cmd.directionX!==undefined)shot.directionX=clamp(cmd.directionX,-.8,.8);
    if(s.phase==='serve') { if(seat===s.server&&!this.serveMotion){this.serveMotion={shot,elapsed:0};p.stroke='serve';p.preparation={stroke:'serve',progress:0,contact:{x:p.x,y:2.65,z:p.z-.25*side(seat)}};} return; }
    if(s.ball.hitter===seat) return;
    this.pending[seat]={shot,until:s.time+2.6};p.shotQueued=true;
  }
  private hit(seat: Seat, shot: Shot, serve=false) {
    const s=this.state,p=s.players[seat],b=s.ball,sign=side(seat);
    const total=s.score[0]+s.score[1], serveSide=sign*(total%2===0?1:-1);
    const stretch=serve?0:clamp(Math.hypot(p.x-b.x,p.z-b.z)-.6,0,1.2);
    let targetX=shot.aim*4.45*sign;
    let targetZ=-sign*(2.8+shot.depth*8.6);
    if(serve) {
      targetX=-serveSide*1.75+shot.aim*2.25*sign;
      targetZ=-sign*(3.4+shot.depth*2.6+(shot.power>.94?.65:0));
    } else if(stretch>.65) {
      targetX+=Math.sign(targetX||1)*stretch*.25;
    }
    const start={x:b.x,y:serve?2.65:Math.max(.42,b.y),z:b.z};
    if(shot.directionX!==undefined)targetX=start.x+shot.directionX*Math.abs(targetZ-start.z)*sign;
    const distance=Math.hypot(targetX-start.x,targetZ-start.z);
    const power=shot.power*(.65+.35*p.stamina)*(1-.2*stretch);
    let flight=clamp(distance/(11+power*12),.48,1.85)+(shot.lob?.85:0);
    const crossing=-start.z/(targetZ-start.z);
    // A ballistic arc over the net; high power reduces margin but never teleports the ball.
    for(let i=0;i<12;i++) {
      const vy=(.12-start.y+4.905*flight*flight)/flight;
      const netY=start.y+vy*flight*crossing-4.905*(flight*crossing)**2;
      if(netY>=1.16+(shot.lob?.7:0)) break;
      flight+=.055;
    }
    const velocity={x:(targetX-start.x)/flight,y:(.12-start.y+4.905*flight*flight)/flight,z:(targetZ-start.z)/flight};
    this.physics.place(start,velocity);
    Object.assign(b,this.physics.read(),{hitter:seat,bounces:0,targetX,targetZ});
    s.phase='rally';s.rally++;s.maxRally=Math.max(s.maxRally,s.rally);
    p.swing=.44;p.backhand=(b.x-p.x)*sign<0;
    p.stroke=serve?'serve':!this.bouncePoint?'volley':shot.lob?'lob':p.backhand?'backhand':'forehand';
    p.preparation=undefined;p.shotQueued=false;
    p.contact={...start};
    p.stamina=clamp(p.stamina-.022-.028*power,0,1);
    this.sinceHit=0;this.serviceFlight=serve;this.pending[seat]=null;this.impact=null;this.bouncePoint=null;
    // A recovery tap belongs to the previous flight. Fresh incoming-ball taps
    // can still override assistance, but a stale one must not delay the split step.
    this.manualUntil[other(seat)]=0;
    this.announce(serve?'发球':p.stroke==='lob'?'高吊球':p.stroke==='volley'?'截击':power>.7?'强力回球':'回球');
  }
  private faultOrPoint(reason: string) {
    const s=this.state;
    if(this.serviceFlight&&s.fault===0) {
      s.fault=1;s.phase='point';s.pointTimer=1.2;this.faultReset=true;
      this.clearPreparation();
      this.announce(`一发${reason} · 准备二发`);
    } else this.award(other(s.ball.hitter),this.serviceFlight?'双误':reason);
  }
  private award(winner: Seat, reason: string) {
    const s=this.state;
    s.score[winner]++;s.lastPoint=winner;s.fault=0;s.winner=winnerForScore(s.score);
    s.phase=s.winner===null?'point':'over';s.pointTimer=1.8;this.faultReset=false;
    this.announce(reason);this.clearPreparation();
  }
  finish(winner: Seat, reason: string) {
    this.state.winner=winner;this.state.phase='over';this.state.lastPoint=winner;this.announce(reason);
    this.clearPreparation();for(const p of this.state.players){p.swing=0;p.moving=false;}
  }
  step(dt: number) {
    if(this.state.phase==='over') return;
    const s=this.state;s.time+=dt;
    for(const p of s.players) p.swing=Math.max(0,p.swing-dt);
    if(s.phase==='point') { s.pointTimer-=dt;if(s.pointTimer<=0)this.resetPoint();return; }
    if(s.phase==='serve') {
      this.serveElapsed+=dt;
      if(this.serveMotion){
        const motion=this.serveMotion;motion.elapsed+=dt;const u=clamp(motion.elapsed/.8,0,1),p=s.players[s.server];
        p.preparation={stroke:'serve',progress:u,contact:{x:p.x,y:2.65,z:p.z-.25*side(s.server)}};
        this.physics.place({x:p.x,y:1.25+4.6*u-3.2*u*u,z:p.z-.25*side(s.server)});Object.assign(s.ball,this.physics.read());
        if(u>=1){this.serveMotion=null;this.hit(s.server,motion.shot,true);}return;
      }
      if(this.serveElapsed>12) this.award(other(s.server),'发球超时');
      return;
    }
    this.sinceHit+=dt;
    const before={...s.ball};
    // Rapier CCD can report restitution one frame after contact. Preserve the
    // continuous contact point before the ball travels past a court line.
    if(before.vy<0&&!this.impact&&before.y+before.vy*dt-4.905*dt*dt<=COURT.ballRadius){
      const t=clamp((before.vy+Math.sqrt(before.vy*before.vy+19.62*Math.max(0,before.y-COURT.ballRadius)))/9.81,0,dt);
      this.impact={x:before.x+before.vx*t,z:before.z+before.vz*t};
    }
    this.physics.step(dt);Object.assign(s.ball,this.physics.read());
    const b=s.ball,receiver=other(b.hitter);
    // Continuous crossing check prevents fast shots tunnelling through the net.
    if(before.z*b.z<=0 && Math.abs(before.z-b.z)>.0001) {
      const alpha=before.z/(before.z-b.z),y=before.y+(b.y-before.y)*alpha;
      if(y<COURT.net+COURT.ballRadius) { this.faultOrPoint('下网');return; }
    }
    if(before.vy<0 && b.vy>0 && b.y<.45) {
      b.bounces++;
      const contact=this.impact??b;this.impact=null;
      if(b.bounces===1) {
        if(!isInCourt(contact.x,contact.z,receiver)||(this.serviceFlight&&!isInServiceBox(contact.x,contact.z,s.server,s.score[0]+s.score[1]))) {
          this.faultOrPoint('出界');return;
        }
        this.bouncePoint={x:contact.x,z:contact.z};this.announce('落地');
      } else {this.award(b.hitter,'二跳');return;}
    }
    if(Math.abs(b.z)>22||Math.abs(b.x)>14||this.sinceHit>5) {
      if(b.bounces) this.award(b.hitter,'未接到球');else this.faultOrPoint('出界');return;
    }
    for(const seat of [0,1] as Seat[]) {
      const p=s.players[seat],ownSide=side(seat);
      if(seat===receiver&&s.time>this.manualUntil[seat]) {
        const receiving=reception(b,p,seat);
        // At the net, retain the chosen volley position instead of retreating to a bounce.
        if(Math.abs(p.z)>6||this.serviceFlight){p.tx=receiving.x;p.tz=receiving.z;}
      }
      if(seat===receiver){
        const receiving=reception(b,p,seat),volley=Math.abs(p.z)<6&&!this.serviceFlight&&b.bounces===0;
        const soon=volley?Math.hypot(b.x-p.x,b.z-p.z)/Math.max(1,Math.hypot(b.vx,b.vz)):receiving.time;
        if(soon<.65){p.preparation={stroke:volley?'volley':receiving.backhand?'backhand':'forehand',progress:clamp(1-soon/.65,0,1),contact:volley?{x:b.x,y:b.y,z:b.z}:receiving.point};p.backhand=receiving.backhand;}
      }
      const dx=p.tx-p.x,dz=p.tz-p.z,distance=Math.hypot(dx,dz);
      const speed=6.8*(.55+.45*p.stamina),move=Math.min(distance,speed*dt);
      p.moving=distance>.08;
      if(distance>.001) {p.x+=dx/distance*move;p.z+=dz/distance*move;}
      p.stamina=clamp(p.stamina-(p.moving?.013:-.006)*dt,0,1);
      const pending=this.pending[seat];
      if(pending&&pending.until<s.time){this.pending[seat]=null;p.shotQueued=false;}
      if(pending&&pending.until>=s.time&&seat===receiver&&this.sinceHit>.06&&b.z*ownSide>.35&&b.y>.25&&b.y<3.1&&
         (!this.serviceFlight||b.bounces>0)&&
         (Math.abs(p.z)<6||b.bounces>0)&&
         (Math.abs(p.z)<6||!this.bouncePoint||b.y>.48&&Math.hypot(b.x-this.bouncePoint.x,b.z-this.bouncePoint.z)>1.5)&&
         Math.hypot(b.x-(p.x+.31*ownSide),b.y-1.39,b.z-(p.z-.08*ownSide))<1.28) {
        this.hit(seat,pending.shot);break;
      }
    }
  }
  dispose() { this.physics.dispose(); }
}
