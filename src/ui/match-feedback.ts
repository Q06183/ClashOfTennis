import {dropStrength} from '../simulation/drop-shot.js';
import {SHOT_PROFILES,shotTier} from '../simulation/shot-profile.js';
import {placementAssist} from '../simulation/pace-control.js';
import type {MatchState,Seat,Shot,Input} from '../simulation/types.js';
import {teamOf,side,clamp} from '../simulation/types.js';
import {COURT,courtHalfWidth,MOVEMENT_HALF_WIDTH} from '../simulation/rules.js';
import {pointAdvice} from './practice-review.js';

export function shotFeedbackLabel(shot:Shot,serving:boolean){
  if(serving)return `${shot.slice?'反向发球':SHOT_PROFILES[shotTier(shot)].label} · 对角发球区`;
  const label=SHOT_PROFILES[shotTier(shot)].label;
  const quality=shot.slice||shot.lob||(shot.topspin??0)>0?label:dropStrength(shot)>.5?'放小球':label;
  return `${quality} · ${placementAssist(shot.power)>.8?'稳健落点':placementAssist(shot.power)>.2?'注意控线':'高风险压线'}`;
}

/** Keep an entire feedback bubble in the viewport, including short landscape. */
export function feedbackPosition(x:number,y:number,width:number,height:number,bubbleWidth=220,bubbleHeight=54){
  const margin=8,w=Math.min(bubbleWidth,Math.max(0,width-margin*2));
  const left=Math.max(margin+w/2,Math.min(width-margin-w/2,x));
  const top=Math.max(margin+bubbleHeight,Math.min(height-margin,y-30));
  return {left,top,maxWidth:Math.max(0,width-margin*2)};
}

export function pointBanner(s:MatchState,seat:Seat){
  const retry=s.fault>0||s.event.includes('擦网');
  const won=s.lastPoint===teamOf(seat);
  const title=s.event.includes('擦网')?'擦网重发':retry?'准备二发':won?'我方得分':'对方得分';
  const advice=retry||!won?pointAdvice(s.event):'好球！下一分继续控线，击球后及时回位。';
  return {title,advice};
}

export function playSubhint(s:MatchState,seat:Seat,lob:boolean){
  if(lob)return '下一拍高吊 · 再点可取消';
  if((s.ball.topspin??0)>0)return '上旋来球 · 留意落地前冲';
  if((s.players[seat].totalStamina??1)<.35)return '体力偏低 · 放慢球速，减少长距离跑动';
  if(s.players[seat].shotQueued)return '无需重复划动 · 新手势可更新球路';
  return '短慢划放小球 · 长按上旋';
}

/** Presentation mirrors legal movement bounds; this is never a server ACK. */
export function movementFeedbackTarget(s:MatchState,seat:Seat,command:Input){
  if(command.type!=='move'||s.phase==='point'||s.phase==='over'||s.rescueWindow||
    !Number.isFinite(command.x)||!Number.isFinite(command.z))return null;
  const sign=side(seat,s);
  if(s.phase==='serve'&&s.server===seat){
    if(s.players[seat].preparation)return null;
    const half=sign*((s.score[0]+s.score[1])%2===0?1:-1);
    return {x:half*clamp(command.x*half,.25,courtHalfWidth(s.mode)-.15),
      z:sign*clamp(command.z*sign,COURT.halfLength+.25,16.3)};
  }
  return {x:clamp(command.x,-MOVEMENT_HALF_WIDTH,MOVEMENT_HALF_WIDTH),z:sign*clamp(command.z*sign,.9,16.3)};
}
