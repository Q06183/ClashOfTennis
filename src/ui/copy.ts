import {EMOTES,type RoomView} from '../simulation/types.js';

/** Blank names show as “你”; it is never used as the opponent's label. */
export const DEFAULT_NAME='你';
export const displayName=(value:string|null|undefined)=>value?.trim().slice(0,16)||DEFAULT_NAME;
/** Practice opponent naming: “陪练” in solo practice; “搭档” is reserved for doubles partners. */
export const PRACTICE_RIVAL='陪练';
export const ruleLabel=(standard:boolean)=>standard?'标准一盘 · 6 局领先 2 局':'7 分制 · 需领先 2 分';

export const MATCH_BOT_OFFER_MS=10_000;
/** Quick-match waiting copy: elapsed time, online count and the computer fallback. */
export function matchingCopy(elapsedMs:number,info:{online?:number;waiting?:number;botAfterMs?:number}){
  const seconds=Math.max(0,Math.floor(elapsedMs/1000)),limit=Math.round((info.botAfterMs??20_000)/1000);
  const clock=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  const online=info.online!==undefined?`当前在线 ${info.online} 人`:'正在统计在线人数';
  const offer=elapsedMs>=MATCH_BOT_OFFER_MS;
  const remain=Math.max(0,limit-seconds);
  return {clock,online,offer,detail:offer?(remain>0?`没有等到球友？${remain} 秒后自动安排电脑对手，也可以现在就开打。`:'正在为你安排电脑对手…'):`有球友加入会立即开赛；等待 ${limit} 秒仍无人，会自动安排电脑对手。`};
}

/** Result headline names the local player's progress, not the opponent's celebration. */
export function resultHeadline(o:{won:boolean;guided:boolean;maxRally:number;legal?:number;newBest?:boolean}){
  if(o.guided)return {eyebrow:'TUTORIAL COMPLETE · 新手引导完成',title:'你赢下了第一分，教学完成！',detail:'发球、接球、回位和切削都练过了。现在可以自由对打。'};
  if(o.won)return {eyebrow:'MATCH WON',title:'好球，这场属于你。',detail:`最长回合 ${o.maxRally} 拍${o.legal!==undefined?` · ${o.legal} 次合法落地`:''}${o.newBest?' · 新纪录！':''}`};
  return {eyebrow:'KEEP RALLYING',title:o.maxRally>=6?`最长回合 ${o.maxRally} 拍，手感来了。`:'再来一场，找回手感。',detail:`${o.legal!==undefined?`${o.legal} 次合法落地 · `:''}最长回合 ${o.maxRally} 拍${o.newBest?' · 新纪录！':''}`};
}

export const EMOTE_LIST=EMOTES;
/** Fixed quick reactions only: no free text between friends. */
export function emoteBar(disabled=false){
  return `<div class="emote-bar" role="group" aria-label="快捷表情">${EMOTES.map((e,i)=>`<button class="emote-button" data-action="emote-${i}" ${disabled?'disabled':''}>${e}</button>`).join('')}</div>`;
}
export function roomRecord(r:RoomView|null,team:0|1){
  if(!r?.matches)return '';
  const record=r.record??[0,0];
  return `本房已打 ${r.matches} 场 · 你 ${record[team]} 胜 ${record[1-team]} 负 · 下一场${r.matches%2===team?'你方':'对方'}先发球`;
}
