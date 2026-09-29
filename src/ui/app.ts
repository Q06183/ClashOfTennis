import {getCharacter,isCharacterId} from '../simulation/characters.js';
import {characterPicker} from './characters.js';
import {HiddenCharacterUnlock} from './hidden-character.js';
import {readPreference,writePreference} from './preferences.js';
import {rescueHint,rescueChanceText} from './rescue-hint.js';
import {staminaBars,staminaLabels} from './stamina.js';
import {CameraChoice} from './camera-choice.js';
import {effectiveStamina} from '../simulation/stamina.js';
import {shotTier,SHOT_PROFILES} from '../simulation/shot-profile.js';
import {dropStrength} from '../simulation/drop-shot.js';
import { Match } from '../simulation/match.js';
import { driveAI } from '../simulation/ai.js';
import { other, side, type Input, type MatchState, type RoomView, type Seat, type Shot } from '../simulation/types.js';
import { CourtView } from '../render/view.js';
import { Controls } from '../input/controls.js';
import { NetworkClient } from '../network/client.js';
import {readSeat,clearSeat} from '../network/session.js';
import {SnapshotPlayback} from '../network/playback.js';
import {invitationLink} from '../network/invite.js';
import { CourtAudio } from './audio.js';

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type Screen='home'|'join'|'setup'|'room'|'playing'|'result'|'characters';
const brand='<div class="brand"><img src="/icon.svg" alt=""/><div>Rally Club<small>好友网球俱乐部</small></div></div>';
const close='<button class="icon-button" data-action="back" aria-label="返回">×</button>';

export class App {
  private ui=document.querySelector<HTMLDivElement>('#ui')!;
  private view:CourtView;
  private controls:Controls;
  private audio=new CourtAudio();
  private screen:Screen='home';
  private hiddenMaster=new HiddenCharacterUnlock({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)});
  private characterId=this.hiddenMaster.selectable(readPreference('rally-character')??undefined);
  private opponentId=this.hiddenMaster.selectable(readPreference('rally-opponent')??undefined);
  private characterReturn:Screen='home';
  private choosingOpponent=false;
  private local=new Match();
  private net:NetworkClient|null=null;
  private remote:MatchState|null=null;
  private drawState:MatchState|null=null;
  private playback=new SnapshotPlayback();
  private room:RoomView|null=null;
  private seat:Seat=0;
  private name=readPreference('rally-name')||'球友';
  private difficulty:'relaxed'|'standard'='relaxed';
  private cameraChoice=new CameraChoice();
  private paused=false;
  private connected=true;
  private status='';
  private latency=0;
  private busy=false;
  private help=false;
  private toastTimer:ReturnType<typeof setTimeout>|null=null;
  private feedbackTimer:ReturnType<typeof setTimeout>|null=null;
  private lastEvent=-1;
  private lastPhase='';
  private lastFrame=performance.now();
  private accumulator=0;
  private lastHud=0;
  private code='';
  private networkError='';
  private predictedMove:{x:number;z:number;until:number}|null=null;
  constructor(){
    this.view=new CourtView(document.querySelector('#court')!,lost=>{
      this.connected=!lost;
      if(lost)this.toast('图形连接中断，正在恢复球场…');
      else this.toast('球场画面已恢复');
    });
    this.view.setCameraDistance(this.cameraChoice.distance);
    this.controls=new Controls(this.view.renderer.domElement,(x,y)=>this.view.courtPoint(x,y),i=>this.input(i),(s,x,y,end)=>this.feedback(s,x,y,end),()=>this.audio.unlock(),
      (shot,dx,dy)=>this.view.aimShot(shot,(this.drawState??this.remote??this.local.state),dx,dy),(amount,x,y)=>this.chargeFeedback(amount,x,y),
      active=>this.view.setAiming(active));
    this.ui.addEventListener('click',e=>{
      const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if(button&&!button.disabled){this.audio.unlock();void this.action(button.dataset.action!);}
    });
    this.ui.addEventListener('input',e=>{
      const input=e.target as HTMLInputElement;
      if(input.id==='nickname'){this.name=input.value.trim().slice(0,16)||'球友';writePreference('rally-name',this.name);}
      if(input.id==='room-input'){input.value=input.value.replace(/\D/g,'').slice(0,6);this.code=input.value;}
    });
    this.ui.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.target as HTMLElement).id==='room-input')void this.action('join-submit');});
    const invite=new URL(location.href).searchParams.get('room');
    if(invite&&/^\d{6}$/.test(invite)){this.code=invite;this.screen='join';}
    this.renderScreen();
    document.querySelector('#boot')?.classList.add('hide');
    document.addEventListener('visibilitychange',()=>{
      this.lastFrame=performance.now();this.accumulator=0;this.view.recordFrame(0,false);this.playback.reset();
    });
    requestAnimationFrame(this.frame);
    // Refresh recovery is bound to this tab's previous seat, never the invite link.
    const stored=readSeat();
    if(stored){try{const c=JSON.parse(stored);if(c.code&&c.token)this.connect({type:'resume',...c});}catch{clearSeat();}}
  }
  private toast(message:string){
    const el=document.querySelector<HTMLElement>('#toast')!;el.textContent=message;el.classList.add('visible');
    if(this.toastTimer)clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);
  }
  private saveCharacter(key:string,id:string){
    if(!writePreference(key,id))this.toast('已选择球员；浏览器无法保存，刷新后需重新选择');
  }
  private input(command:Input){
    if(this.screen!=='playing'||this.paused||!this.connected||this.help)return;
    if(this.net){this.net.input(command);if(command.type==='move')this.predictedMove={x:command.x,z:command.z,until:performance.now()+750};}
    else this.local.input(0,command);
  }
  private feedback(shot:Shot|null,x:number,y:number,end:boolean){
    const el=document.querySelector<HTMLElement>('#shot-feedback')!;
    if(this.feedbackTimer)clearTimeout(this.feedbackTimer);
    if(!shot){el.style.display='none';return;}
    el.style.display='block';el.style.left=`${Math.max(65,Math.min(innerWidth-65,x))}px`;el.style.top=`${Math.max(160,y-30)}px`;
    const tier=shotTier(shot),profile=SHOT_PROFILES[tier];
    el.dataset.tier=tier;el.style.setProperty('--shot-color',`#${profile.color.toString(16).padStart(6,'0')}`);
    const serving=(this.remote??this.local.state).phase==='serve';
    el.querySelector('span')!.textContent=serving?(shot.slice?'反向发球':profile.label):dropStrength(shot)>.5?'放小球':profile.label;
    (el.querySelector('i') as HTMLElement).style.transform=`scaleX(${Math.max(.1,shot.power)})`;
    if(end)this.feedbackTimer=setTimeout(()=>el.style.display='none',550);
  }
  private chargeFeedback(amount:number,x:number,y:number){
    this.feedback({type:'shot',aim:0,depth:0,power:amount,lob:false,topspin:1},x,y,false);
    document.querySelector('#shot-feedback span')!.textContent=`蓄力上旋 ${Math.round(amount*100)}% · 滑动释放`;
  }
  private async action(action:string){
    if(action!=='hidden-master')this.hiddenMaster.reset();
    if(action==='camera-distance'){
      const choice=this.cameraChoice.toggle();this.view.setCameraDistance(choice.distance);
      this.renderScreen();
      this.toast(`${choice.distance==='near'?'近':'远'}视角已选择，当前击球结束后切换${choice.saved?'':'；本次无法保存设置'}`);
      return;
    }
    if(action==='lob'){this.controls.lobMode=!this.controls.lobMode;this.updateHud();return;}
    if(action==='characters'||action==='opponent-characters'){
      if(!['home','setup','room','join'].includes(this.screen))return;
      this.characterReturn=this.screen;this.choosingOpponent=action==='opponent-characters';this.screen='characters';this.renderScreen();
    }
    else if(action==='hidden-master'){
      if(this.screen!=='characters')return;
      const result=this.hiddenMaster.activate();
      if(result==='unlocked'||result==='session-only'){
        this.renderScreen();
        this.toast(result==='unlocked'?'隐藏大佬「无名」已解锁 · 全属性 99':'无名已在本次会话解锁；浏览器无法保存，刷新后需重新解锁');
      }
    }
    else if(action.startsWith('pick-character-')){
      if(this.screen!=='characters')return;const id=action.slice('pick-character-'.length);if(!isCharacterId(id))return;
      if(this.hiddenMaster.selectable(id)!==id)return;
      if(this.choosingOpponent){this.opponentId=id;this.saveCharacter('rally-opponent',id);}
      else{this.characterId=id;this.saveCharacter('rally-character',id);if(this.net&&this.room)this.net.send({type:'select-character',characterId:id});}
      this.renderScreen();
    }
    else if(action==='confirm-characters'||action==='close-characters'){
      if(this.screen!=='characters')return;
      if(action==='confirm-characters'&&!this.choosingOpponent&&this.net&&this.room&&
         (!this.room.playing||this.remote?.phase==='over')&&this.room.seats[this.seat]?.characterId!==this.characterId){
        this.net.send({type:'select-character',characterId:this.characterId});
      }
      this.screen=this.characterReturn;this.renderScreen();
    }
    else if(action==='practice'){this.screen='setup';this.renderScreen();}
    else if(action==='start-practice'){
      this.net?.close();this.net=null;this.remote=null;this.drawState=null;this.room=null;this.playback.reset();this.local.dispose();this.local=new Match([this.characterId,this.opponentId]);
      this.networkError='';
      this.seat=0;this.paused=false;this.connected=true;this.screen='playing';this.lastEvent=-1;this.accumulator=0;
      this.help=!readPreference('rally-tutorial');this.renderScreen();
    }
    else if(action==='create'&&!this.busy)this.connect({type:'create',name:this.name,characterId:this.characterId});
    else if(action==='join'){this.screen='join';this.renderScreen();}
    else if(action==='join-submit'&&!this.busy){
      if(!/^\d{6}$/.test(this.code)){this.toast('请输入朋友的 6 位房间号');return;}
      this.connect({type:'join',code:this.code,name:this.name,characterId:this.characterId});
    }
    else if(action==='ready')this.net?.send({type:'ready'});
    else if(action==='copy-code')await this.copy(this.room?.code??'','已复制房间号，请朋友打开同一游戏地址后加入');
    else if(action==='copy-link'){
      const link=invitationLink(location.origin,this.room?.code??'');
      if(link)await this.copy(link,'已复制邀请链接，请确认朋友能访问这个游戏地址');
      else this.toast('当前是本机地址。请用电脑的 Wi-Fi 地址打开游戏后分享。');
    }
    else if(action==='back'||action==='quit'){
      this.net?.close();this.net=null;this.remote=null;this.room=null;this.drawState=null;this.screen='home';this.help=false;
      this.busy=false;this.connected=true;this.paused=false;this.local.dispose();this.local=new Match();
      history.replaceState(null,'',location.pathname);this.renderScreen();
    }
    else if(action==='rematch'){
      if(this.net){this.net.send({type:'ready'});this.toast('已准备，等待好友再来一局');}
      else await this.action('start-practice');
    }
    else if(action==='help'){this.help=true;this.renderScreen();}
    else if(action==='close-help'){this.help=false;writePreference('rally-tutorial','1');this.accumulator=0;this.renderScreen();}
    else if(action==='mute'){this.audio.toggle();this.renderScreen();}
    else if(action==='relaxed'||action==='standard'){this.difficulty=action;this.renderScreen();}
  }
  private async copy(value:string,message:string){
    try{await navigator.clipboard.writeText(value);this.toast(message);}
    catch{
      const panel=this.ui.querySelector('.panel');if(!panel)return;
      let input=panel.querySelector<HTMLInputElement>('.copy-fallback');
      if(!input){input=document.createElement('input');input.className='copy-fallback';input.readOnly=true;input.setAttribute('aria-label','手动复制邀请内容');panel.append(input);}
      input.value=value;input.select();this.toast('长按或选中文本，手动复制');
    }
  }
  private connect(action:unknown){
    this.playback.reset();this.predictedMove=null;this.networkError='';
    this.net?.close();this.remote=null;this.drawState=null;this.busy=true;this.status='正在连接球场…';this.renderScreen();
    this.net=new NetworkClient({
      welcome:c=>{this.seat=c.seat;this.busy=false;this.connected=true;this.screen='room';this.lastEvent=-1;this.renderScreen();},
      room:r=>{
        this.room=r;this.paused=r.paused;
        if(r.seats[this.seat]?.characterId)this.characterId=this.hiddenMaster.selectable(r.seats[this.seat]!.characterId);
        if(this.screen==='room'||this.screen==='result')this.renderScreen();
      },
      state:(s,paused)=>{
        this.remote=s;this.paused=paused;this.playback.push(s,performance.now());
        if(s.phase==='over'){
          if(this.screen!=='result'){this.screen='result';this.renderScreen();}
        }else if(this.screen!=='playing'){
          this.screen='playing';this.connected=true;this.renderScreen();
        }
      },
      status:s=>{
        this.status=s;this.connected=s==='已连接';
        if(this.screen==='room'||this.screen==='join'||this.screen==='home')this.renderScreen();
      },
      error:s=>{this.busy=false;this.toast(s);this.status=s;this.renderScreen();},
      terminal:s=>{
        this.net=null;this.remote=null;this.drawState=null;this.room=null;this.busy=false;this.paused=false;this.connected=true;
        this.screen='home';this.help=false;this.networkError=s;this.status='';this.predictedMove=null;
        this.local.dispose();this.local=new Match();this.renderScreen();
      },
      latency:ms=>this.latency=ms
    });
    this.net.connect(action);
  }
  private home(){return `<div class="home"><header class="masthead">${brand}<div class="edition">PLAY FOR THE RALLY</div></header>
    <main class="home-copy"><div class="eyebrow">A LITTLE COURT. A GOOD TIME.</div><h1>Rally<br/><em>together.</em></h1>
    <p class="subtitle">约一场，刚刚好。</p><p class="description">一片球场，一位朋友。<br/>把好球留给彼此，把胜负留在场上。</p>
    <div class="menu"><label class="name-label" for="nickname">你的昵称<input id="nickname" maxlength="16" value="${escape(this.name)}" autocomplete="nickname"/></label>
    <button class="primary" data-action="create" ${this.busy?'disabled':''}>${this.busy?'连接中…':'邀请好友'} <span>↗</span></button>
    <button class="secondary" data-action="join">加入房间 <span>＋</span></button>
    <button class="character-choice" data-action="characters">球员：${getCharacter(this.characterId).name} · ${getCharacter(this.characterId).role} <span>更换 →</span></button>
    <button class="practice" data-action="practice">先热热身 · 单人练习 <span>→</span></button>${this.networkError?`<div class="error-inline" role="alert" style="grid-column:1/-1">${escape(this.networkError)}</div>`:''}</div></main>
    <aside class="court-tag"><strong>01</strong><span>THE GARDEN COURT<br/>花园球场 · 硬地</span></aside>
    <footer class="home-footer"><b>点按跑位 / 滑动击球 / 好友对战</b><span>NO PRESSURE. JUST PLAY.</span></footer></div>`;}
  private panel(content:string){return `<div class="overlay"><section class="panel">${content}</section></div>`;}
  private roomPanel(){
    const r=this.room;if(!r)return this.panel(`<h2>正在打开球场</h2><p>${escape(this.status)}</p>${close}`);
    const me=r.seats[this.seat],both=r.seats.every(p=>p?.connected),shareable=!!invitationLink(location.origin,r.code);
    return this.panel(`<div class="panel-top"><span>FRIENDS ON COURT</span>${close}</div><h2>球场已为你留好。</h2><p>${shareable?'把邀请链接发给朋友，准备好就开打。':'当前地址只能在这台设备打开。手机请先打开电脑的 Wi-Fi 地址，再用房间号加入。'}</p>
      <div class="room-code" aria-label="房间号">${r.code}</div><div class="room-caption">私人球场 · 6 位房间号</div>
      <div class="copy-row"><button class="secondary" data-action="copy-code">复制房间号</button><button class="secondary" data-action="copy-link" ${shareable?'':'disabled'}>复制邀请链接 ↗</button></div>
      <div class="seats">${r.seats.map((p,i)=>`<div class="seat"><div class="avatar ${i?'orange':''}">${p?escape(p.name.slice(0,1)):'＋'}</div><div class="seat-name">${p?escape(p.name):'等待朋友加入'}${i===this.seat?' · 你':''}${p?`<small>${getCharacter(p.characterId).name} · ${getCharacter(p.characterId).role}</small>`:''}</div><span class="seat-status">${p?p.connected?p.ready?'已准备':'已就位':'重连中':'空位'}</span></div>`).join('')}</div>
      <button class="secondary" data-action="characters">更换球员 · ${getCharacter(this.characterId).name}</button><button class="primary" data-action="ready" ${!both||me?.ready?'disabled':''}>${!both?'等朋友一起上场':me?.ready?'已准备，等待朋友…':'准备开赛 →'}</button>
      <p class="small-note">7 分制 · 领先 2 分获胜 · 角色各有所长 · 全部免费</p><div class="status-line">${escape(this.status)}</div>`);
  }
  private playing(){return `<div class="match-top"><button class="icon-button" data-action="quit" aria-label="退出比赛">‹</button><div class="match-label">GARDEN COURT <span class="connection" id="connection"></span></div><button class="icon-button" data-action="mute" aria-label="${this.audio.muted?'开启声音':'关闭声音'}">${this.audio.muted?'♪̸':'♪'}</button></div>
    <div class="scoreboard"><div class="score-player"><div class="score-name" id="name-me"></div><div class="score-value" id="score-me">0</div>${staminaBars('me')}</div><div class="score-divider">vs</div><div class="score-player"><div class="score-name" id="name-them"></div><div class="score-value" id="score-them">0</div>${staminaBars('them')}</div></div>
    <div class="rally-count" id="rally-count">FIRST TO 7</div><div id="point-slot"></div><div id="reconnect-slot"></div>
    <div class="match-bottom"><div class="serve-notice" id="serve-notice" role="status" aria-live="polite" hidden><strong id="serve-title"></strong><span id="serve-detail"></span></div><div class="hint" id="rally-hint"><strong id="match-hint">斜向滑动，发进对角发球区</strong><small id="match-subhint">绿普通 · 蓝快速 · 橙强力 · 玫红暴击</small></div><div class="court-actions">${this.cameraChoice.button()}<button class="lob-button" id="lob-mode" data-action="lob" aria-label="选择下一拍高吊球" aria-pressed="false">高吊</button><button class="help-button" data-action="help" aria-label="查看操作帮助">?</button></div></div>`;}
  private helpPanel(){return this.panel(`<div class="panel-top"><span>JUST THREE MOVES</span><button class="icon-button" data-action="close-help" aria-label="关闭帮助">×</button></div><h2>好球，从这一拍开始。</h2><p>${this.net?'线上对局仍在进行，请尽快回到球场。':'先记住三个动作，马上就能打出回合。'}</p>
    <div class="tutorial-steps"><div class="tutorial-step"><b>1</b><div><strong>轻点球场，移动到位</strong><span>发球前可以点按调整站位，发球者限当前半区底线后，开始抛球后锁定位置。普通球员优先接落地球，伊内丝主动上前截击。本分消耗按20%折算到总体力，一分最多扣总体力20%；分末按角色返还部分消耗，最多90%。下一分以恢复后的总体力作为本分初始值，不再回满100%；二发不重置。跑动和击球使用“本分×总体”的有效体力，跳接概率只看总体力。</span></div></div>
    <div class="tutorial-step"><b>2</b><div><strong>向上滑动，把球打回去</strong><span>短而慢地滑动可放小球：显示“放小球”，轻落在网后约1～2米，弹跳低、落地后明显减速。遇到高球也不会自动加力扣杀；发球不使用小球规则。中长滑动平滑过渡到原来的深球；手指按住不动再划才是蓄力上旋。球从球拍实际触球点飞出，方向按屏幕滑动角度计算，斜划过大仍可能从边线出界。球仍按真实抛物线下落，后半程不是屏幕直线。近景和远景只缩放，不改变场地比例。跑动时可提前滑动，保存最后一次方向和球质。</span></div></div>
    <div class="tutorial-step"><b>3</b><div><strong>认颜色，控制速度与深度</strong><span>绿普通、蓝快速、橙强力、玫红暴击、青绿上旋、金色高压、冰白切削、紫色高吊。长按蓄力上旋，下划反向切削，右侧按钮选择高吊。正常站位、跑动或等待来球能接到时不触发飞身；只有普通方式来不及、侧扑可及的球才抽签。总体力满时90%，1/3及以下10%，中间平滑变化。每记来球只抽一次，重复滑动不能刷签。跳接使用最后手势的方向、深度和球种，保留减速及深浅波动；救球和切削不再随机改变滑动指定的出球方向。切削落地后仍有低弹跳和侧偏；接发仍必须落地，出界或二跳后不能救。</span></div></div></div>
    <p>右下角“近景 / 远景”可切换镜头距离，默认近景并记住选择；正在瞄准时会等当前击球结束再切换。救球只向左右侧扑，人物单次横移最多3.5米，实际仍需球拍够到；持拍手伸向球，随后趴地缓冲，再用双手撑地、花0.5秒起身；从起跳到约1.18秒恢复期间不能再次移动或击球，可以提前输入下一拍。</p>
    <p id="performance-stats" class="small-note"></p><p id="performance-sync" class="small-note"></p><button class="primary" data-action="close-help">知道了，上场 →</button><p class="small-note">先到 7 分且领先 2 分获胜 · 发球限时 12 秒</p>`);}
  private result(){
    const s=this.remote??this.local.state,won=s.winner===this.seat;
    const me=this.room?.seats[this.seat]?.name??this.name,them=this.room?.seats[other(this.seat)]?.name??'练习搭档';
    const ready=this.room?.seats[this.seat]?.ready;
    const winner=s.winner===null?null:s.players[s.winner],winnerName=s.winner===this.seat?me:them;
    return `<div class="victory-overlay"><div class="victory-title"><span>MATCH WINNER</span><h2>${escape(winnerName)} · ${winner?getCharacter(winner.characterId).name:''}</h2><p>${won?'你赢了！':'获胜方庆祝中'} · 持拍庆祝</p></div><section class="panel victory-panel"><div class="panel-top"><span>THAT WAS A GOOD RALLY</span>${close}</div><h2>${won?'好球，这场属于你。':'再来一场，找回手感。'}</h2><p>${escape(s.event)}</p>
      <div class="result-score">${s.score[this.seat]} <span style="color:#a4af98">:</span> ${s.score[other(this.seat)]}</div><div class="result-names">${escape(me)} &nbsp; / &nbsp; ${escape(them)}</div>
      <div class="result-stats"><div><strong>${s.maxRally}</strong>最长回合</div><div><strong>${Math.floor(s.time/60)}:${String(Math.floor(s.time%60)).padStart(2,'0')}</strong>对局时间</div></div>
      <button class="primary" data-action="rematch" ${ready?'disabled':''}>${ready?'已准备，等待朋友…':'再来一场 ↗'}</button><button class="secondary" data-action="back">回到首页</button></section></div>`;
  }
  private renderScreen(){
    this.view.setMode(this.screen==='result'?'result':this.screen==='playing'?'match':'home',this.seat);
    this.controls.enabled=this.screen==='playing'&&!this.help;
    if(this.screen==='characters')this.ui.innerHTML=characterPicker(this.choosingOpponent?this.opponentId:this.characterId,this.choosingOpponent,this.hiddenMaster.unlocked);
    else if(this.screen==='home')this.ui.innerHTML=this.home();
    else if(this.screen==='room')this.ui.innerHTML=this.roomPanel();
    else if(this.screen==='join')this.ui.innerHTML=this.panel(`<div class="panel-top"><span>YOUR FRIEND IS WAITING</span>${close}</div><h2>加入朋友的球场。</h2><p>输入 6 位房间号，下一场好球等你来。</p><label class="name-label" for="nickname">昵称<input id="nickname" value="${escape(this.name)}" maxlength="16"/></label><button class="secondary" data-action="characters">球员 · ${getCharacter(this.characterId).name} / 更换</button><input id="room-input" class="code-input" aria-label="六位房间号" placeholder="000000" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" value="${escape(this.code)}"/><button class="primary" data-action="join-submit" ${this.busy?'disabled':''}>${this.busy?'正在加入…':'加入球场 →'}</button><div class="status-line">${escape(this.status)}</div>`);
    else if(this.screen==='setup')this.ui.innerHTML=this.panel(`<div class="panel-top"><span>TAKE A FEW PRACTICE SWINGS</span>${close}</div><div class="panel-heading">Warm up.</div><h2>先和搭档热热身。</h2><p>同一片球场，同样的操作。找找击球节奏，再叫上朋友。</p><div class="character-matchup"><button class="secondary" data-action="characters">你 · ${getCharacter(this.characterId).name}</button><button class="secondary" data-action="opponent-characters">搭档 · ${getCharacter(this.opponentId).name}</button></div><div class="select-row"><button class="${this.difficulty==='relaxed'?'selected':''}" data-action="relaxed">轻松练习</button><button class="${this.difficulty==='standard'?'selected':''}" data-action="standard">认真对打</button></div><button class="primary" data-action="start-practice">开始练习 →</button><p class="small-note">点按移动 · 滑动击球 · 7 分制</p>`);
    else if(this.screen==='playing'){this.ui.innerHTML=this.playing()+(this.help?this.helpPanel():'');this.lastPhase='';this.updateHud();}
    else this.ui.innerHTML=this.result();
  }
  private updateHud(){
    if(this.screen!=='playing')return;
    const s=this.remote??this.local.state,me=this.seat,them=other(me);
    const text=(id:string,value:string)=>{const el=document.getElementById(id);if(el&&el.textContent!==value)el.textContent=value;};
    const serveNotice=document.getElementById('serve-notice')!;
    serveNotice.hidden=s.phase!=='serve'||this.paused||!this.connected||!!s.players[s.server].preparation;
    document.getElementById('rally-hint')!.hidden=!serveNotice.hidden;
    serveNotice.classList.toggle('your-serve',s.server===me);
    text('serve-title',s.server===me?(s.fault?'二发 · 轮到你发球':'轮到你发球'):'对手发球');
    text('serve-detail',s.server===me?'点按底线后调整站位，滑动发进对角区':'可点按调整接发位置，球发出后提前滑动');
    text('name-me',`${s.server===me?'● ':''}${this.room?.seats[me]?.name??this.name} · 你`);
    text('name-them',`${s.server===them?'● ':''}${this.room?.seats[them]?.name??'练习搭档'}`);
    text('score-me',String(s.score[me]));text('score-them',String(s.score[them]));
    document.getElementById('stamina-me')!.style.width=`${s.players[me].stamina*100}%`;
    document.getElementById('stamina-them')!.style.width=`${s.players[them].stamina*100}%`;
    for(const [label,seat] of [['me',me],['them',them]] as const){
      const p=s.players[seat],labels=staminaLabels(p);
      text(`stamina-label-${label}`,labels.point);
      text(`total-stamina-label-${label}`,labels.total);
      document.getElementById(`total-stamina-${label}`)!.style.width=`${(p.totalStamina??1)*100}%`;
      document.getElementById(`stamina-label-${label}`)!.title=`${getCharacter(p.characterId).name} · ${labels.effective}`;
    }
    text('lob-mode',this.controls.lobMode?'取消高吊':'高吊');
    document.getElementById('lob-mode')!.setAttribute('aria-pressed',String(this.controls.lobMode));
    const sync=this.playback.stats(performance.now());
    text('performance-sync',this.net?`同步 ${sync.hz||'—'} 次/秒 · 抖动 ${sync.jitterMs} ms · 最近一包 ${sync.gapMs} ms前`:'');
    text('performance-stats',`画面 ${this.view.fps||'测量中'} FPS · 自动${this.view.qualityLabel}${this.net?` · 网络 ${this.latency||'—'} ms`:''}`);
    text('connection',this.net?`${this.latency||'—'} ms`:'单人练习');
    text('rally-count',s.rally>1?`${s.rally} 拍回合  /  RALLY`:'FIRST TO 7 · 领先两分');
    text('match-hint',s.phase==='serve'?(s.server===me?(s.fault?'二发 · 轻一点，滑进对角发球区':s.players[me].preparation?.stroke==='serve'?'抛球、举拍，准备发出':'轮到你发球 · 向上斜划'):'对手发球 · 准备接球'):s.phase==='point'?`${s.event} · ${s.lastPoint===me?'你得分':'下一分加油'}`:s.players[me].shotQueued?'已预设击球 · 自动追球，到位后按滑动回击':s.ball.skill==='slice'?(s.ball.hitter===me?'切削球 · 注意下一拍':'对手切削 · 小心低弹跳和侧偏'):s.ball.skill==='smash'?(s.ball.hitter===me?'高压球！准备下一拍':'对手高压球 · 提前滑动接球'):s.ball.skill==='volley'?(s.ball.hitter===me?'截击成功 · 注意下一拍':'对手截击 · 提前滑动接球'):s.ball.rescue?(s.ball.hitter===me?'极限救球！回球变慢，尽快恢复站位':'对手极限救球 · 注意偏移后的落点'):s.players[me].rescue?'跳步救球中…':s.ball.hitter===me?(s.ball.critical?'暴击球！准备下一拍':'好球！轻点球场，调整下一拍站位'):s.ball.critical?'对手暴击球！提前滑动准备回击':s.players[me].shotQueued?'滑动已收到 · 到触球位置自动回击':'来球了，可以提前向上滑动');
    text('match-subhint',this.controls.lobMode?'下一拍：高吊球 · 再点按钮可取消':s.ball.topspin?'上旋球 · 注意落地前冲':'长按上旋 · 下划切削 · 右侧选高吊');
    if(s.phase==='rally'){
      const jump=rescueHint(s,me);if(jump)text('match-hint',jump);
      if(!jump&&(s.ball.drop??0)>.5)text('match-hint',s.ball.hitter===me?'放小球 · 网前短落点、低弹跳':'对手放小球 · 尽快上网接球');
      if(!this.controls.lobMode&&!s.ball.topspin)text('match-subhint',rescueChanceText(s.players[me].totalStamina??1));
    }
    const phaseKey=`${s.phase}-${s.eventId}`;
    if(this.lastPhase!==phaseKey){
      this.lastPhase=phaseKey;document.getElementById('point-slot')!.innerHTML=s.phase==='point'?`<div class="point-banner"><strong>${s.fault?'Second serve':s.lastPoint===me?'Your point':'Good try'}</strong><span>${escape(s.event)}</span></div>`:'';
    }
    const reconnect=document.getElementById('reconnect-slot')!;
    const warning=this.paused?'朋友暂时断线 · 比赛已暂停，等待重连':!this.connected?'网络暂时断开 · 正在恢复连接':'';
    if(reconnect.textContent!==warning)reconnect.innerHTML=warning?`<div class="reconnect-banner">${warning}</div>`:'';
  }
  private frame=(now:number)=>{
    const frameMs=now-this.lastFrame,dt=Math.min(frameMs/1000,.08);this.lastFrame=now;
    this.view.recordFrame(frameMs,!document.hidden);
    const active=this.screen==='playing'||this.screen==='result';
    if(!this.net){
      const training=this.screen==='playing';
      if(!(training&&this.help)){
        this.accumulator+=dt;
        while(this.accumulator>=1/60){
          if(!training&&this.screen!=='result')driveAI(this.local,0,'standard');
          if(this.screen!=='result')driveAI(this.local,1,training?this.difficulty:'standard');
          this.local.step(1/60);this.accumulator-=1/60;
        }
      }
      if(this.local.state.phase==='over'&&this.screen==='playing'){this.screen='result';this.renderScreen();}
      else if(this.local.state.phase==='over'&&!active){this.local.dispose();this.local=new Match();}
    }
    let state=this.remote??this.local.state;
    if(this.remote){
      this.drawState=this.playback.sample(now,this.paused||!this.connected)??structuredClone(this.remote);
      const draw=this.drawState;
      if(this.predictedMove&&now<this.predictedMove.until&&!this.paused&&this.connected&&state.phase==='rally'){
        draw.players[this.seat].tx=this.predictedMove.x;draw.players[this.seat].tz=this.predictedMove.z;
      }
      state=draw;
    }
    this.view.render(state,dt,this.remote??this.local.state);
    const actual=state;
    if(this.lastEvent!==actual.eventId&&active){
      this.lastEvent=actual.eventId;
      if((actual.event==='落地'||actual.event==='切削弹跳'))this.audio.play('bounce');
      else if(actual.phase==='point'||actual.phase==='over')this.audio.play('point');
      else if(actual.phase==='rally')this.audio.play('hit');
    }
    if(now-this.lastHud>90){this.updateHud();this.lastHud=now;}
    requestAnimationFrame(this.frame);
  };
}
