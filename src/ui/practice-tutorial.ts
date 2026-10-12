import type {Match} from '../simulation/match.js';
import {side,type Input} from '../simulation/types.js';
import {movePlayer} from '../simulation/movement.js';
import {isInCourt} from '../simulation/rules.js';

export const TUTORIAL_VERSION='3';
export const TUTORIAL_STEPS=['发球站位','发球','接球 1/2','跑动回位','接球 2/2','切削','赢下比赛'] as const;
type Stage='move'|'serve'|'return'|'recover'|'return-again'|'slice'|'finish'|'complete';
export type TutorialPrompt={title:string;detail:string;gesture:string};
export const TUTORIAL_PACE_HINT='滑动越快，出球越快；相同用时划得越长也更有力。滑动距离越长，落点通常越深；短而慢的滑动更轻、更短。';

/** Local coach: retries the current feed and counts only legal landed learner returns. */
export class PracticeTutorial {
  stage:Stage='move';
  private moveTarget:{x:number;z:number;fromX:number;fromZ:number}|null=null;
  private learnerServe=false;
  private restoreFeed:(()=>void)|null=null;
  private outgoingFlight:number|null=null;
  private retryNotice=false;
  private finishElapsed=0;
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
      if(this.stage==='recover'&&Math.hypot(command.x,command.z-side(0,s)*9)>1.2)return;
      match.input(0,command);
      if(Math.hypot(p.tx-p.x,p.tz-p.z)<.6){this.moveTarget=null;return;}
      this.moveTarget={x:p.tx,z:p.tz,fromX:p.x,fromZ:p.z};
      return;
    }
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
  private retryFeed(){
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
      // Bot concedes this introductory match after the slice; no new serve required.
      this.finishElapsed+=dt;
      if(s.phase==='rally')match.step(dt);
      if(this.finishElapsed>=1.2||s.phase==='point'||s.phase==='over'){
        s.score=[7,0];match.finish(0,'人机陪练完成 · 你赢了！');this.stage='complete';
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
      if(s.phase==='point'||s.phase==='over'){this.retryFeed();return;}
      if(this.outgoingFlight!==null&&s.rally===this.outgoingFlight&&s.ball.hitter===0&&s.ball.bounces===1&&
        isInCourt(s.ball.targetX,s.ball.targetZ,1,s.mode,s.ends)){
        this.outgoingFlight=null;
        if(this.stage==='return'){this.normalReturns=1;this.stage='recover';this.moveTarget=null;}
        else if(this.stage==='return-again'){this.normalReturns=2;this.stage='slice';this.feed(match);}
        else {this.stage='finish';this.finishElapsed=0;}
      }
    }
  }
  retry(){this.moveTarget=null;this.learnerServe=false;}
  prompt(match:Match):TutorialPrompt{
    const s=match.state;
    if(this.completed)return {title:'你赢了，新手引导完成！',detail:'发球站位、发球、2 次普通接球、跑动回位和切削已掌握。人机已认输，接下来可以自由练习或约朋友对打。',gesture:'✓'};
    if(this.stage==='finish')return {title:'切削成功！准备赢下这场比赛',detail:'人机正在结束陪练，马上展示你的获胜庆祝。',gesture:'✓'};
    if(this.stage==='move')return {title:this.moveTarget?'正在调整发球站位':'轻点底线后，调整发球站位',detail:'跟着球场上的点按动画，点一下标记附近。实际移动到位后，再学习发球。',gesture:'点'};
    if(this.stage==='recover')return {title:this.moveTarget?'跑回中间，准备下一拍':'接球成功 1/2 · 点按中间回位',detail:'跟着点按动画，跑回自己半场中间的标记附近。到位后搭档才会送第二球。',gesture:'点'};
    if(s.phase==='point'||s.phase==='over')return {title:'没关系，再试一次',detail:'已完成的动作会保留。接球失误只重试当前来球，不需要重新发球。',gesture:'↻'};
    if(s.phase==='serve'&&s.server===0)return {title:s.players[0].preparation?'正在发球，等待落入对角区':'斜向上滑，发进对角发球区',detail:(s.players[0].x>0?'向左上斜划，球也向左上飞，发进对角区。':'向右上斜划，球也向右上飞，发进对角区。')+TUTORIAL_PACE_HINT+'没有操作不会超时。',gesture:s.players[0].x>0?'↖':'↗'};
    if(this.stage==='serve')return {title:'等待发球落地',detail:'球落入对角发球区才算完成；失误可以重试。',gesture:'↑'};
    const slice=this.stage==='slice',held=this.held(match);
    if(this.outgoingFlight!==null)return {title:'已回击，等待合法落地',detail:'球要越网并落在对方场内才算成功。下网或出界会重新送同一球。',gesture:slice?'↓':'↑'};
    return {title:held?(slice?'向下滑动，完成切削回球':`向上滑动，完成普通接球 ${this.normalReturns+1}/2`):this.retryNotice?'接球没成功，重试这一球':'搭档送球中，准备接球',
      detail:held?(slice?'切削：出球方向与滑动方向相反！向下划，球向上飞；向右下划，球向左上飞。':'普通回球：滑动方向就是出球方向，向左上划就向左上出球。')+TUTORIAL_PACE_HINT+'球场已暂停，会一直等你；直接划，不要长按。':
        `球员会自动追球，球到拍前会停住，再${slice?'向下':'向上'}滑动。无需抢拍，也不用担心错过时机。`,gesture:slice?'↓':'↑'};
  }
}
