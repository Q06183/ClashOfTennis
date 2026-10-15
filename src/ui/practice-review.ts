import type {MatchState, Team} from '../simulation/types.js';
import {readPreference,writePreference} from './preferences.js';
import {TargetDrill,TARGET_DRILL} from './target-drill.js';

export const PRACTICE_GOALS={
  free:{title:'自由对打',detail:'没有额外目标，按自己的节奏练习。',target:0},
  control:{title:'稳健回球',detail:'本场自己累计 5 次合法落地回球；发球不计。',target:5},
  rally:{title:'长回合',detail:'双方打出 6 拍回合，含发球；比赛照常继续。',target:6},
  variety:{title:'多样球路',detail:'自己 3 类回球各至少一次合法落地。',target:3},
  target:{title:'目标区',detail:`对方场地的角落会亮起目标区，回球落进去得 1 星，集满 ${TARGET_DRILL.stars} 星。`,target:TARGET_DRILL.stars}
} as const;
export type PracticeGoal=keyof typeof PRACTICE_GOALS;
export const isPracticeGoal=(value:string):value is PracticeGoal=>Object.hasOwn(PRACTICE_GOALS,value);
export type PracticeNumbers={
  returns:number;legal:number;out:number;net:number;missed:number;doubleFault:number;timeout:number;
  styles:Set<string>;perfect:number;winners:number;
};
const empty=():PracticeNumbers=>({returns:0,legal:0,out:0,net:0,missed:0,doubleFault:0,timeout:0,styles:new Set(),perfect:0,winners:0});

/** Advice names an observable outcome, never guesses "unforced" errors or intent. */
export function pointAdvice(reason:string){
  if(reason.includes('擦网'))return '擦网重发，保持对角发球方向。';
  if(reason.includes('双误'))return '二发试着减小力度，把方向收进对角发球区。';
  if(reason.includes('超时'))return '发球需在 12 秒内滑动发出；练习中有事可先暂停。';
  if(reason.includes('接发球未落地'))return '接发球先等落地，再滑动回击。';
  if(reason.includes('接发顺序'))return '双打按固定左右区接发，不要替队友抢接。';
  if(reason.includes('同队'))return '回球必须过网给对手，不能连续传给队友。';
  if(reason.includes('触身'))return '提前移动，留出挥拍空间，避免球击中身体。';
  if(reason.includes('出界'))return '缩短一点滑动，把方向向场内收，先稳住落点。';
  if(reason.includes('下网'))return '稍增加滑动长度，给回球留出过网高度。';
  if(reason==='二跳'||reason==='未接到球')return '提前点按跑位，来球接近时就滑动准备回击。';
  return '先用中慢速控住落点，击球后及时回位。';
}
const styleOf=(s:MatchState)=>{
  const b=s.ball;
  return b.skill==='smash'?'高压':b.skill==='volley'?'截击':b.slice?'切削':
    b.tier==='lob'?'高吊':(b.topspin??0)>0?'上旋':(b.drop??0)>.5?'短球':'普通';
};

/** Local normal practice only. Observe after every input, AI input and simulation tick. */
export class PracticeReview {
  readonly players=[empty(),empty()];
  maxRally=0;
  private eventId=-1;
  private rally=0;
  private points=-1;
  private flight:{hitter:Team;style:string;legal:boolean}|null=null;
  readonly drill:TargetDrill|null;
  constructor(readonly goal:PracticeGoal='free'){this.drill=goal==='target'?new TargetDrill():null;}
  observe(s:MatchState){
    const points=s.score[0]+s.score[1];
    if(points!==this.points||s.rally<this.rally){
      this.flight=null;this.rally=0;this.points=points;
    }
    this.maxRally=Math.max(this.maxRally,s.rally);
    if(s.phase==='rally'&&s.rally>this.rally){
      this.flight=s.rally>1?{hitter:(s.ball.hitter%2) as Team,style:styleOf(s),legal:false}:null;
      if(this.flight){this.players[this.flight.hitter].returns++;if(s.ball.timing==='perfect')this.players[this.flight.hitter].perfect++;}
    }
    this.rally=s.rally;
    this.drill?.observe(s);
    if(this.flight&&!this.flight.legal&&s.phase==='rally'&&s.ball.bounces===1){
      this.flight.legal=true;
      const p=this.players[this.flight.hitter];p.legal++;p.styles.add(this.flight.style);
    }
    if(s.eventId===this.eventId)return;
    this.eventId=s.eventId;
    if(s.phase!=='point'&&s.phase!=='over')return;
    const reason=s.event,hitter=(s.ball.hitter%2) as Team;
    // Fault/let retries have no point winner and must not count as lost points.
    if(s.lastPoint===null||reason.includes('一发')||reason.includes('擦网'))return;
    const loser=(1-s.lastPoint) as Team,p=this.players[loser];
    if(reason==='双误')p.doubleFault++;
    else if(reason==='发球超时')p.timeout++;
    else if(reason==='二跳'||reason==='未接到球'){p.missed++;if(s.rally>1&&hitter===s.lastPoint)this.players[hitter].winners++;}
    else if(s.rally>1&&reason==='出界')this.players[hitter].out++;
    else if(s.rally>1&&reason==='下网')this.players[hitter].net++;
  }
  get value(){
    const p=this.players[0];
    return this.goal==='control'?p.legal:this.goal==='rally'?this.maxRally:this.goal==='variety'?p.styles.size:this.goal==='target'?this.drill!.stars:0;
  }
  get complete(){return this.goal!=='free'&&this.value>=PRACTICE_GOALS[this.goal].target;}
  get progress(){
    const g=PRACTICE_GOALS[this.goal];
    if(this.drill)return `${g.title} · ${this.drill.label}${this.complete?' · ✓ 已达成':''}`;
    return `${g.title} · ${Math.min(this.value,g.target)} / ${g.target}${this.complete?' · ✓ 已达成':''}`;
  }
  /** Most frequent observable error for the learner, or null when there were none. */
  get mainIssue(){
    const p=this.players[0];
    const choices:[number,string,string][]=[[p.timeout,'发球超时','发球超时'],[p.doubleFault,'双误','双误'],[p.out,'出界','回球出界'],[p.net,'下网','回球下网'],[p.missed,'未接到球','漏接']];
    const worst=choices.sort((a,b)=>b[0]-a[0])[0];
    return worst[0]?{count:worst[0],reason:worst[1],label:worst[2]}:null;
  }
  get advice(){return pointAdvice(this.mainIssue?.reason??'');}
}

export function practiceGoalChoices(goal:PracticeGoal){
  return `<fieldset class="practice-goals"><legend>本场目标 · 可选</legend><div role="group" aria-label="练习目标">${Object.entries(PRACTICE_GOALS).map(([id,g])=>`<button data-action="goal-${id}" aria-pressed="${goal===id}" class="${goal===id?'selected':''}">${g.title}</button>`).join('')}</div><p>${PRACTICE_GOALS[goal].detail}</p></fieldset>`;
}
export function practiceBestKey(surface:string,difficulty:string,player:string,opponent:string,goal:PracticeGoal){
  return ['rally-practice-best-v1',surface,difficulty,player,opponent,goal].join('/');
}
export function readPracticeBest(key:string):number{
  const raw=readPreference(key);
  if(!raw||!/^\d+$/.test(raw))return 0;
  const n=Number(raw);return Number.isSafeInteger(n)?n:0;
}
export function savePracticeBest(key:string,value:number){
  if(!Number.isSafeInteger(value)||value<0)return false;
  return value<=readPracticeBest(key)||writePreference(key,String(value));
}
export function practiceReviewPanel(review:PracticeReview,best:number,saved:boolean){
  const p=review.players[0],issue=review.mainIssue;
  const rate=p.returns?Math.round(p.legal/p.returns*100):0;
  const cell=(value:number|string,label:string,tone='')=>`<div class="${tone}"><b>${value}</b><span>${label}</span></div>`;
  return `<section class="practice-review" aria-label="本场练习复盘"><p class="review-lead">${issue?`本场最多的失误：<strong>${issue.label} ×${issue.count}</strong><br/>下一场：${review.advice}`:`本场没有明显失误。下一场：${review.advice}`}</p><div class="review-grid">${cell(p.returns,'回球')}${cell(`${p.legal}${p.returns?`<small>${rate}%</small>`:''}`,'合法落地','good')}${cell(p.perfect,'完美击球','good')}${cell(p.winners,'制胜球','good')}${cell(p.out,'出界','bad')}${cell(p.net,'下网','bad')}${cell(p.missed,'漏接','bad')}${cell(p.doubleFault+p.timeout,'双误/超时','bad')}</div><small>合法落地不含发球；对手落地前截击不计，也不算失误。制胜球：对方没碰到或二跳的回球。</small>${review.goal==='free'?'':`<div class="goal-result"><strong>${review.progress}</strong><small>本机同场地、难度及球员组合最佳：${best}${saved?'':' · 本次无法保存'}${review.goal==='variety'?'<br/>本场球路：'+([...p.styles].join('、')||'暂无合法落地回球'):''}</small></div>`}</section>`;
}
