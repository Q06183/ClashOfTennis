import {SERVE_DURATION,serveBallHeight} from './serve-motion.js';
import {flightGravity,spinAmount} from './flight.js';
import {canSmash,canVolley,airInterception} from './skills.js';
import {getCharacter,characterEffects} from './characters.js';
import { BallPhysics } from './physics.js';
import {shotDepth,shotTier,SHOT_PROFILES} from './shot-profile.js';
import {reception} from './reception.js';
import {canReachContact} from './athlete.js';
import {RESCUE,rescueTarget,moveRescue,canReachRescue} from './rescue.js';
import {movePlayer} from './movement.js';
import { COURT, isInCourt, isInServiceBox, serverForPoint, winnerForScore } from './rules.js';
import { clamp, other, side, type BallState, type Input, type MatchState, type PlayerState, type Seat, type Shot } from './types.js';

const player = (seat: Seat, characterId: string): PlayerState => ({characterId:getCharacter(characterId).id,x:0,z:side(seat)*10,tx:0,tz:side(seat)*10,stamina:1,swing:0,stroke:'forehand',moving:false});
export class Match {
  readonly physics = new BallPhysics();
  readonly state: MatchState;
  private pending: [{shot:Shot;flight:number}|null,{shot:Shot;flight:number}|null] = [null,null];
  private recentContact:{at:number;flight:number;seat:Seat;ball:BallState}|null=null;
  private rescueAttempt=[-1,-1];
  private manualUntil = [0,0];
  private serveElapsed = 0;
  private serveMotion:{shot:Shot;elapsed:number}|null=null;
  private bouncePoint:{x:number;z:number}|null=null;
  private sinceHit = 0;
  private serviceFlight = false;
  private faultReset = false;
  private impact: {x:number;z:number}|null = null;
  constructor(characters:readonly [string,string]=['lin','lin'],private random:()=>number=Math.random) {
    this.state = {time:0,phase:'serve',score:[0,0],players:[player(0,characters[0]),player(1,characters[1])],
      ball:{x:0,y:2.5,z:11.8,vx:0,vy:0,vz:0,bounces:0,hitter:0,targetX:0,targetZ:-5},
      server:0,fault:0,pointTimer:0,rally:0,maxRally:0,winner:null,event:'准备发球',eventId:0,lastPoint:null};
    this.resetPoint();
  }
  private announce(event: string) { this.state.event=event; this.state.eventId++; }
  private clearPreparation() {
    this.pending=[null,null];this.serveMotion=null;this.recentContact=null;
    for(const p of this.state.players)p.rescue=undefined;
    for(const p of this.state.players){p.preparation=undefined;p.shotQueued=false;}
  }
  private resetPoint() {
    const s=this.state, total=s.score[0]+s.score[1];
    this.recentContact=null;this.rescueAttempt=[-1,-1];for(const p of s.players)p.rescue=undefined;
    s.phase='serve'; s.server=serverForPoint(total); s.rally=0; s.pointTimer=0;
    this.pending=[null,null]; this.manualUntil=[0,0]; this.serveElapsed=0; this.serviceFlight=false;this.impact=null;this.serveMotion=null;this.bouncePoint=null;
    const serveSide=side(s.server)*(total%2===0?1:-1);
    s.players.forEach((p,i) => {
      p.x=i===s.server?serveSide*1.5:-serveSide*1.5;
      p.z=side(i as Seat)*(i===s.server?12.4:10.3); p.tx=p.x;p.tz=p.z;p.vx=0;p.vz=0;p.moving=false;p.swing=0;p.strokeSpin=0;p.preparation=undefined;p.shotQueued=false;
      if(!this.faultReset) p.stamina=clamp(p.stamina+.2*characterEffects(p.characterId).recovery,0,1);
    });
    const p=s.players[s.server];
    this.physics.place({x:p.x,y:1.25,z:p.z-.25*side(s.server)});
    Object.assign(s.ball,this.physics.read(),{bounces:0,hitter:s.server,targetX:-serveSide*2,targetZ:-side(s.server)*4.8,critical:false,tier:undefined,rescue:false,topspin:0,slice:false,skill:undefined});
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
    if(cmd.slice!==undefined&&typeof cmd.slice!=='boolean')return;
    if(cmd.topspin!==undefined&&(typeof cmd.topspin!=='number'||!Number.isFinite(cmd.topspin)))return;
    if(cmd.critical!==undefined&&typeof cmd.critical!=='boolean')return;
    if(cmd.directionX!==undefined&&!Number.isFinite(cmd.directionX))return;
    const shot:Shot={type:'shot',aim:clamp(cmd.aim,-1.2,1.2),depth:clamp(cmd.depth,0,1),power:clamp(cmd.power,0,1),lob:cmd.lob&&!cmd.slice,slice:cmd.slice===true,topspin:cmd.lob||cmd.slice?0:spinAmount(cmd.topspin),critical:cmd.critical===true&&cmd.power>=.9&&!cmd.lob&&!cmd.slice};
    if(cmd.directionX!==undefined)shot.directionX=clamp(cmd.directionX,-4,4);
    if(s.phase==='serve') { if(seat===s.server&&!this.serveMotion){this.serveMotion={shot,elapsed:0};p.stroke='serve';p.preparation={stroke:'serve',progress:0,contact:{x:p.x,y:2.65,z:p.z-.25*side(seat)}};} return; }
    if(s.ball.hitter===seat) return;
    this.pending[seat]={shot,flight:s.rally};p.shotQueued=true;p.strokeSpin=shot.topspin??0;
    const recent=this.recentContact;
    // Cover the presentation buffer and small delivery jitter without undoing
    // a bounce/point or extending physical racket reach at the current position.
    if(recent&&recent.seat===seat&&recent.flight===s.rally&&s.time-recent.at<=.16&&
       recent.ball.bounces===s.ball.bounces&&!p.rescue&&this.returnLegal(seat,recent.ball)&&this.returnReachable(seat,recent.ball)){
      Object.assign(s.ball,recent.ball);this.hit(seat,shot);
    }
  }
  private returnLegal(seat:Seat,b:BallState=this.state.ball){
    const p=this.state.players[seat];
    return this.state.phase==='rally'&&seat===other(b.hitter)&&this.sinceHit>.06&&
      !p.rescue?.hit&&b.z*side(seat)>.35&&b.y>.25&&b.y<3.1&&
      (!this.serviceFlight||b.bounces>0);
  }
  private returnReachable(seat:Seat,b:BallState=this.state.ball){
    const p=this.state.players[seat],sign=side(seat);
    return p.rescue?canReachRescue(b,p,seat,this.state.time):canSmash(b,p,seat)|| (b.bounces===0?canVolley(b,p,seat):canReachContact(-(b.x-p.x)*sign,b.y,-(b.z-p.z)*sign,(b.x-p.x)*sign<0,!!this.pending[seat]?.shot.slice));
  }
  private hit(seat: Seat, shot: Shot, serve=false) {
    const s=this.state,p=s.players[seat],b=s.ball,sign=side(seat);
    const total=s.score[0]+s.score[1], serveSide=sign*(total%2===0?1:-1);
    const stretch=serve?0:clamp(Math.hypot(p.x-b.x,p.z-b.z)-.6,0,1.2);
    let targetX=shot.aim*4.45*sign;
    const rescue=!serve&&!!p.rescue&&!p.rescue.hit;
    const smash=!serve&&!rescue&&canSmash(b,p,seat),volley=!serve&&!rescue&&!smash&&b.bounces===0;
    if(rescue)shot={...shot,power:.25,critical:false,lob:false,topspin:0,slice:false};
    else if(smash)shot={...shot,power:Math.max(.75,shot.power),critical:false,lob:false,topspin:0,slice:false};
    else if(volley)shot={...shot,topspin:0};
    if(serve)shot={...shot,slice:false};
    const slice=shot.slice===true;
    const tier=smash?'smash':shotTier(shot),topspin=spinAmount(shot.topspin),gravity=flightGravity({topspin});
    let targetZ=-sign*shotDepth(shot,serve);
    if(serve) {
      targetX=-serveSide*1.75+shot.aim*2.25*sign;
    } else if(stretch>.65) {
      targetX+=Math.sign(targetX||1)*stretch*.25;
    }
    const start={x:b.x,y:serve?2.65:b.y,z:b.z};
    if(shot.directionX!==undefined)targetX=start.x+shot.directionX*Math.abs(targetZ-start.z)*sign;
    if(slice){const spread=.4+.65*shot.power;targetX+=(this.random()*2-1)*spread;targetZ+=(this.random()*2-1)*(.5+.45*shot.power);}
    if(rescue){targetX+=(this.random()*2-1)*1.6;targetZ+=(this.random()*2-1)*1.8;}
    const distance=Math.hypot(targetX-start.x,targetZ-start.z);
    const power=shot.power*(.65+.35*p.stamina)*(1-.2*stretch);
    const critical=tier==='critical';
    const backhand=(b.x-p.x)*sign<0;
    const attribute=serve||smash?'serve':volley?'volley':backhand?'backhand':'forehand';
    const effects=characterEffects(p.characterId),strokeSpeed=effects[attribute];
    let flight=clamp(distance/((11+power*12)*(smash?1.25:critical?1.14:1)*strokeSpeed),smash?.32:critical?.42:.48,1.85)+(shot.lob?.85:0);
    const crossing=-start.z/(targetZ-start.z);
    // Exact net clearance keeps tier speed increases while retaining real arcs.
    if(crossing>0&&crossing<1){
      const baseHeight=start.y*(1-crossing)+.12*crossing;
      const minimum=Math.sqrt(Math.max(0,(1.16+(shot.lob?.7:0)-baseHeight)/((gravity/2)*crossing*(1-crossing))));
      flight=Math.max(flight,minimum+.002);
    }
    if(slice)flight*=1.15;
    if(rescue)flight*=RESCUE.slowdown;
    const velocity={x:(targetX-start.x)/flight,y:(.12-start.y+(gravity/2)*flight*flight)/flight,z:(targetZ-start.z)/flight};
    this.physics.place(start,velocity,topspin);
    Object.assign(b,this.physics.read(),{hitter:seat,bounces:0,targetX,targetZ,critical,tier,rescue,topspin,slice,skill:smash?'smash':slice?'slice':volley?'volley':undefined});
    s.phase='rally';s.rally++;s.maxRally=Math.max(s.maxRally,s.rally);
    p.swing=.44;p.strokeSpin=topspin;p.backhand=(b.x-p.x)*sign<0;
    p.stroke=serve?'serve':smash?'smash':slice?(p.backhand?'slice-backhand':'slice-forehand'):volley?'volley':shot.lob?'lob':p.backhand?'backhand':'forehand';
    p.preparation=undefined;p.shotQueued=false;
    p.contact={...start};if(rescue&&p.rescue){p.rescue.hit=true;p.rescue.contact={...start};}
    p.stamina=clamp(p.stamina-(.022+.028*power)*effects.drain*strokeSpeed,0,1);
    this.recentContact=null;this.sinceHit=0;this.serviceFlight=serve;this.pending[seat]=null;this.impact=null;this.bouncePoint=null;
    // A recovery tap belongs to the previous flight. Fresh incoming-ball taps
    // can still override assistance, but a stale one must not delay the split step.
    this.manualUntil[other(seat)]=0;
    this.announce(rescue?'极限救球':smash?'高压球':slice?(p.backhand?'反手切削':'正手切削'):volley?'截击':serve?`${SHOT_PROFILES[tier].label.replace('球','')}发球`:SHOT_PROFILES[tier].label);
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
    this.clearPreparation();for(const p of this.state.players){p.swing=0;p.moving=false;p.vx=0;p.vz=0;}
  }
  step(dt: number) {
    if(this.state.phase==='over') return;
    const s=this.state;s.time+=dt;
    for(const p of s.players) p.swing=Math.max(0,p.swing-dt);
    if(s.phase==='point') { s.pointTimer-=dt;if(s.pointTimer<=0)this.resetPoint();return; }
    if(s.phase==='serve') {
      this.serveElapsed+=dt;
      if(this.serveMotion){
        const motion=this.serveMotion;motion.elapsed+=dt;const u=clamp(motion.elapsed/SERVE_DURATION,0,1),p=s.players[s.server];
        p.preparation={stroke:'serve',progress:u,contact:{x:p.x,y:2.65,z:p.z-.25*side(s.server)}};
        this.physics.place({x:p.x,y:serveBallHeight(u),z:p.z-.25*side(s.server)});Object.assign(s.ball,this.physics.read());
        if(u>=1){this.serveMotion=null;this.hit(s.server,motion.shot,true);}return;
      }
      if(this.serveElapsed>12) this.award(other(s.server),'发球超时');
      return;
    }
    this.sinceHit+=dt;
    const before={...s.ball},gravity=flightGravity(s.ball);
    // Rapier CCD can report restitution one frame after contact. Preserve the
    // continuous contact point before the ball travels past a court line.
    if(before.vy<0&&!this.impact&&before.y+before.vy*dt-(gravity/2)*dt*dt<=COURT.ballRadius){
      const t=clamp((before.vy+Math.sqrt(before.vy*before.vy+2*gravity*Math.max(0,before.y-COURT.ballRadius)))/gravity,0,dt);
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
        this.bouncePoint={x:contact.x,z:contact.z};
        if(b.topspin){const kick=1+.12*b.topspin;b.vx*=kick;b.vz*=kick;b.topspin*=.55;this.physics.body.setLinvel({x:b.vx,y:b.vy,z:b.vz},true);this.physics.setTopspin(b.topspin);}
        if(b.slice){
          // Randomness belongs to the authority at the bounce, never to either renderer.
          const angle=(this.random()*2-1)*.16,pace=.8+.12*this.random(),vx=b.vx,vz=b.vz;
          b.vx=(vx*Math.cos(angle)-vz*Math.sin(angle))*pace;b.vz=(vx*Math.sin(angle)+vz*Math.cos(angle))*pace;b.vy*=.58+.2*this.random();
          this.physics.body.setLinvel({x:b.vx,y:b.vy,z:b.vz},true);
        }
        this.announce(b.slice?'切削弹跳':'落地');
      } else {this.award(b.hitter,'二跳');return;}
    }
    if(Math.abs(b.z)>22||Math.abs(b.x)>14||this.sinceHit>5) {
      if(b.bounces) this.award(b.hitter,'未接到球');else this.faultOrPoint('出界');return;
    }
    for(const seat of [0,1] as Seat[]) {
      const p=s.players[seat],ownSide=side(seat);
      if(seat===receiver&&!p.rescue){
        const air=!this.serviceFlight&&b.bounces===0&&Math.abs(p.z)<=7.4;
        const receiving=air?airInterception(b,p,seat):reception(b,p,seat);
        if(s.time>this.manualUntil[seat]||air&&p.shotQueued){p.tx=receiving.x;p.tz=receiving.z;}
        const soon=receiving.time;
        if(soon<.65){
          const smash=air&&'smash' in receiving&&receiving.smash;
          const slice=this.pending[seat]?.shot.slice;
          p.preparation={stroke:smash?'smash':slice?(receiving.backhand?'slice-backhand':'slice-forehand'):air?'volley':this.pending[seat]?.shot.lob?'lob':receiving.backhand?'backhand':'forehand',progress:clamp(1-soon/.65,0,1),contact:receiving.point};p.backhand=receiving.backhand;
        }
      }
      if(!moveRescue(p,s.time,dt))movePlayer(p,seat,dt);
      const endurance=characterEffects(p.characterId);
      p.stamina=clamp(p.stamina-(p.moving?.013*endurance.drain:-.006*endurance.recovery)*dt,0,1);
      const legal=this.returnLegal(seat),reachable=legal&&this.returnReachable(seat);
      if(reachable&&!p.rescue)this.recentContact={at:s.time,flight:s.rally,seat,ball:{...b}};
      const pending=this.pending[seat];
      if(pending&&pending.flight!==s.rally){this.pending[seat]=null;p.shotQueued=false;}
      if(pending&&pending.flight===s.rally&&legal){
        if(reachable){this.hit(seat,pending.shot);break;}
        if(!p.rescue&&this.rescueAttempt[seat]!==s.rally){
          const target=rescueTarget(b,p,seat);
          if(target){
            this.rescueAttempt[seat]=s.rally;
            if(this.random()<RESCUE.chance){
              p.rescue={startedAt:s.time,fromX:p.x,fromZ:p.z,toX:target.x,toZ:target.z,contact:target.contact,hit:false};
              p.stamina=clamp(p.stamina-.1,0,1);p.preparation=undefined;
            }
          }
        }
      }
    }
  }
  dispose() { this.physics.dispose(); }
}
