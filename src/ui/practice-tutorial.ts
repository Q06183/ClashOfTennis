import type {Match} from '../simulation/match.js';
import {side,clamp,type Input} from '../simulation/types.js';
import {movePlayer} from '../simulation/movement.js';
import {isInCourt,COURT,MOVEMENT_HALF_WIDTH} from '../simulation/rules.js';
import {driveAI} from '../simulation/ai.js';

export const TUTORIAL_VERSION='3';
export const TUTORIAL_STEPS=['发球站位','发球','接球 1/2','跑动回位','接球 2/2','切削','赢下一分'] as const;
/** Final lesson: real points against a slowed partner; one won point passes, three lost points restart. */
export const TUTORIAL_FINAL={points:3} as const;
/** Recovery tap tolerance (m): wide enough for a fingertip, still requiring a real run back. */
export const TUTORIAL_RECOVER_RADIUS=2;
/** Screen-space forgiveness (CSS px) around the guided tap marker, covering its label. */
export const TUTORIAL_TAP_SLOP=72;
type Stage='move'|'serve'|'return'|'recover'|'return-again'|'slice'|'finish'|'complete';
export type TutorialPrompt={title:string;detail:string;gesture:string;more?:string};
export type TutorialMiss={reason:string;x:number;z:number};
export const TUTORIAL_PACE_HINT='滑动越快，出球越快；相同用时划得越长也更有力。滑动距离越长，落点通常越深；短而慢的滑动更轻、更短。';

/** Local coach: retries the current feed and counts only legal landed learner returns. */
export class PracticeTutorial {
  stage:Stage='move';
  private moveTarget:{x:number;z:number;fromX:number;fromZ:number}|null=null;
  private learnerServe=false;
  private restoreFeed:(()=>void)|null=null;
  private outgoingFlight:number|null=null;
  private retryNotice=false;
  private finishLosses=0;
  private paceShown=false;
  /** Last failed attempt: observable reason and where the ball actually ended. */
  lastMiss:TutorialMiss|null=null;
  finishResets=0;
  normalReturns=0;
  get completed(){return this.stage==='complete';}
  get progress(){return ['move','serve','return','recover','return-again','slice','finish','complete'].indexOf(this.stage);}
  get receiving(){return this.stage==='return'||this.stage==='return-again'||this.stage==='slice';}
  movementTarget(match:Match){
    const p=match.state.players[0],sign=side(0,match.state);
    return this.stage==='move'?{x:p.x+sign,z:sign*12.9}:this.stage==='recover'?{x:0,z:sign*9}:null;
  }
  held(match:Match){
    const s=match.state;
    if(this.completed)return true;
    if(this.stage==='move'||this.stage==='recover')return !this.moveTarget;
    if(s.phase==='serve'&&s.server===0&&!s.players[0].preparation)return true;
    return this.receiving&&this.outgoingFlight===null&&s.phase==='rally'&&
      s.ball.bounces===1&&match.canReturn(0,this.stage==='slice');
  }
  input(match:Match,command:Input){
    if(this.completed)return;
    const s=match.state,p=s.players[0];
    if(this.stage==='move'||this.stage==='recover'){
      if(command.type!=='move'||![command.x,command.z].every(Number.isFinite))return;
      if(this.stage==='recover'&&Math.hypot(command.x,command.z-side(0,s)*9)>TUTORIAL_RECOVER_RADIUS)return;
      match.input(0,command);
      if(Math.hypot(p.tx-p.x,p.tz-p.z)<.6){this.moveTarget=null;return;}
      this.moveTarget={x:p.tx,z:p.tz,fromX:p.x,fromZ:p.z};
      return;
    }
    if(this.stage==='finish'){match.input(0,command);return;}
    if(this.stage==='serve'&&s.phase==='serve'&&s.server===0){
      if(command.type==='shot'&&!command.slice&&!command.lob){
        match.input(0,command);
        if(p.preparation?.stroke==='serve')this.learnerServe=true;
      }
      return;
    }
    if(!this.receiving||!this.held(match)||command.type!=='shot')return;
    if(this.stage!=='slice'&&(command.slice||command.lob||(command.topspin??0)>0))return;
    if(this.stage==='slice'&&!command.slice)return;
    const flight=s.rally;
    match.input(0,command);
    if(s.ball.hitter===0&&s.rally===flight+1)this.outgoingFlight=s.rally;
  }
  private feed(match:Match){
    match.practiceFeed();this.restoreFeed=match.practiceCheckpoint();
    this.outgoingFlight=null;this.retryNotice=false;
  }
  /** First ground contact (or net crossing) of the learner's current return. */
  private landing:{x:number;z:number}|null=null;
  private trackLanding(match:Match){
    const b=match.state.ball;
    if(this.outgoingFlight===null||b.hitter!==0){this.landing=null;return;}
    if(!this.landing&&b.y<.3&&b.vy>0)this.landing={x:b.x,z:b.z};
    // Ball leaving the court area in the air: mark where it crossed the runoff.
    if(!this.landing&&(Math.abs(b.x)>MOVEMENT_HALF_WIDTH-1||Math.abs(b.z)>COURT.halfLength+2.5))
      this.landing={x:clamp(b.x,-(MOVEMENT_HALF_WIDTH-1),MOVEMENT_HALF_WIDTH-1),z:clamp(b.z,-(COURT.halfLength+2.5),COURT.halfLength+2.5)};
  }
  private retryFeed(match:Match){
    const s=match.state,b=s.ball;
    // Mark where the ball actually went wrong: its first landing, the net, or the
    // aim target when it flew straight into the enclosure.
    const at=s.event.includes('下网')?{x:clamp(b.x,-COURT.halfWidth,COURT.halfWidth),z:0}:this.landing??{x:clamp(b.targetX,-(MOVEMENT_HALF_WIDTH-1),MOVEMENT_HALF_WIDTH-1),z:clamp(b.targetZ,-(COURT.halfLength+2.5),COURT.halfLength+2.5)};
    // Keep the marker just outside the lines so the near camera can actually show it.
    const limitX=COURT.halfWidth+1.2,limitZ=COURT.halfLength+1.5;
    this.lastMiss={reason:s.event,x:clamp(at.x,-limitX,limitX),z:clamp(at.z,-limitZ,limitZ)};this.landing=null;
    this.restoreFeed?.();this.outgoingFlight=null;this.retryNotice=true;
  }
  step(match:Match,dt:number){
    if(this.held(match))return;
    const s=match.state;
    if(this.stage==='recover'){
      // The outgoing ball is held while the learner really runs back to cover center.
      const p=s.players[0],t=this.moveTarget!;
      s.time+=dt;p.swing=Math.max(0,p.swing-dt);movePlayer(p,0,dt);
      if(Math.hypot(p.x-t.x,p.z-t.z)<.22&&Math.hypot(p.x-t.fromX,p.z-t.fromZ)>.35){
        this.moveTarget=null;this.stage='return-again';this.feed(match);
      }
      return;
    }
    if(this.stage==='finish'){
      // Real points: the slowed partner only reacts to balls close to it.
      if(s.phase==='serve'&&s.server===1&&!s.players[1].preparation)
        match.input(1,{type:'shot',aim:0,depth:.4,power:.3,lob:false});
      else driveAI(match,1,'relaxed',{openness:1});
      const before=s.eventId;match.step(dt);
      if(s.eventId!==before&&(s.phase==='point'||s.phase==='over')&&s.lastPoint!==null&&!s.fault){
        if(s.lastPoint===0){match.finish(0,'教学完成 · 你赢下了第一分');this.stage='complete';return;}
        if(++this.finishLosses>=TUTORIAL_FINAL.points){this.finishLosses=0;this.finishResets++;match.practiceRestart();}
      }
      return;
    }
    if(s.phase==='serve'&&s.server===1&&!s.players[1].preparation)
      match.input(1,{type:'shot',aim:0,depth:.45,power:.35,lob:false});
    match.step(dt);
    if(this.stage==='move'&&this.moveTarget){
      const p=s.players[0],t=this.moveTarget;
      if(Math.hypot(p.x-t.x,p.z-t.z)<.22&&Math.hypot(p.x-t.fromX,p.z-t.fromZ)>.35){
        this.moveTarget=null;this.stage='serve';
      }
    }
    // A real serve must land legally, not merely start its toss animation.
    if(s.phase==='point'||s.phase==='over')this.learnerServe=false;
    if(this.stage==='serve'&&this.learnerServe&&s.phase==='rally'&&
      s.rally===1&&s.ball.hitter===0&&s.ball.bounces===1){
      this.stage='return';this.feed(match);return;
    }
    if(this.receiving){
      this.trackLanding(match);
      if(s.phase==='point'||s.phase==='over'){this.retryFeed(match);return;}
      if(this.outgoingFlight!==null&&s.rally===this.outgoingFlight&&s.ball.hitter===0&&s.ball.bounces===1&&
        isInCourt(s.ball.targetX,s.ball.targetZ,1,s.mode,s.ends)){
        this.outgoingFlight=null;
        if(this.stage==='return'){this.normalReturns=1;this.stage='recover';this.moveTarget=null;}
        else if(this.stage==='return-again'){this.normalReturns=2;this.stage='slice';this.feed(match);}
        else {this.stage='finish';this.finishLosses=0;match.practiceRestart();}
      }
    }
  }
  retry(){this.moveTarget=null;this.learnerServe=false;}
  /** Points lost in the final lesson before the three-point reset. */
  get finishLost(){return this.finishLosses;}
  /** Physics explanation is shown open once, then folded behind “为什么？”. */
  private pace(){const first=!this.paceShown;this.paceShown=true;return first;}
  paceOpen=true;
  get retryNoticeShown(){return this.retryNotice&&this.receiving&&this.outgoingFlight===null;}
  prompt(match:Match):TutorialPrompt{
    const s=match.state;
    const withPace=(p:TutorialPrompt):TutorialPrompt=>{this.paceOpen=this.pace();return {...p,more:TUTORIAL_PACE_HINT};};
    if(this.completed)return {title:'你赢下了第一分，教学完成！',detail:'接下来可以自由练习或约朋友对打。',gesture:'✓'};
    if(this.stage==='finish'){
      if(s.phase==='serve'&&s.server===0)return {title:s.players[0].preparation?'发球中…':'赢下一分 · 你来发球',detail:`斜划发进对角区，再把陪练的回球打到它够不到的两侧。还剩 ${TUTORIAL_FINAL.points-this.finishLosses} 分机会。`,gesture:s.players[0].x>0?'↖':'↗'};
      return {title:'赢下一分即可通过',detail:`陪练放慢了，只接打到身边的球。把球打向两侧！还剩 ${TUTORIAL_FINAL.points-this.finishLosses} 分机会${this.finishResets?'（已重新开始）':''}。`,gesture:'↑'};
    }
    if(this.stage==='move')return {title:this.moveTarget?'正在移动到发球位':'点一下发光的标记，移动站位',detail:'点地面上的圆环附近就行，球员会跑过去。',gesture:'点'};
    if(this.stage==='recover')return {title:this.moveTarget?'跑回中间，准备下一拍':'接球成功 1/2 · 点中间的圆环回位',detail:'回到中间，陪练才会送第二球。',gesture:'点'};
    if(s.phase==='point'||s.phase==='over')return {title:'没关系，再试一次',detail:'已完成的步骤会保留，只重试当前这一球。',gesture:'↻'};
    if(s.phase==='serve'&&s.server===0){
      const left=s.players[0].x>0;
      return s.players[0].preparation?{title:'正在发球，等待落入对角区',detail:'球落进高亮的对角发球区就算成功。',gesture:left?'↖':'↗'}:
        withPace({title:'斜向上滑，发进对角发球区',detail:left?'向左上斜划，球也向左上飞。没有操作不会超时。':'向右上斜划，球也向右上飞。没有操作不会超时。',gesture:left?'↖':'↗'});
    }
    if(this.stage==='serve')return {title:'等待发球落地',detail:'球落入对角发球区才算完成；失误可以重试。',gesture:'↑'};
    const slice=this.stage==='slice',held=this.held(match);
    if(this.outgoingFlight!==null)return {title:'已回击，等待落地',detail:'越网并落在对方场内才算成功。',gesture:slice?'↓':'↑'};
    if(held)return withPace(slice?{title:'向下滑动，完成切削回球',detail:'切削：出球方向与滑动方向相反！向下划，球向上飞；向右下划，球向左上飞。直接划，不要长按。',gesture:'↓'}:
      {title:`向上滑动，完成普通接球 ${this.normalReturns+1}/2`,detail:'普通回球：滑动方向就是出球方向，向左上划就向左上出球。球场已暂停，直接划，不要长按。',gesture:'↑'});
    if(this.retryNotice&&this.lastMiss)return {title:`${missTitle(this.lastMiss.reason)} · 再试一次`,detail:missAdvice(this.lastMiss.reason),gesture:'↻'};
    return {title:'陪练送球中，准备接球',detail:`球到拍前会停住，再${slice?'向下':'向上'}滑动。`,gesture:slice?'↓':'↑'};
  }
}
const missTitle=(reason:string)=>reason.includes('出界')?'出界了':reason.includes('下网')?'下网了':reason==='二跳'||reason==='未接到球'?'没接到':'这球没成功';
/** One concrete correction per observable outcome. */
export function missAdvice(reason:string){
  if(reason.includes('出界'))return '划短一点，方向往场内收。红圈是刚才的落点。';
  if(reason.includes('下网'))return '划长一点，给球留出过网高度。红圈是球停下的位置。';
  if(reason==='二跳'||reason==='未接到球')return '等球在拍前停住再滑动；需要时先点按跑到落点附近。';
  return '保持滑动方向，再试一次。';
}
