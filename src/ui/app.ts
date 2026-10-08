import {getCharacter,isCharacterId} from '../simulation/characters.js';
import {characterPicker,revealCharacterPicker} from './characters.js';
import {HiddenCharacterUnlock} from './hidden-character.js';
import {readPreference,writePreference} from './preferences.js';
import {rescueHint,rescueChanceText} from './rescue-hint.js';
import {staminaBars,staminaLabels} from './stamina.js';
import {CameraChoice} from './camera-choice.js';
import {effectiveStamina} from '../simulation/stamina.js';
import {shotTier,SHOT_PROFILES} from '../simulation/shot-profile.js';
import {dropStrength} from '../simulation/drop-shot.js';
import {placementAssist} from '../simulation/pace-control.js';
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
import {surfaceProfile,isSurfaceId,type SurfaceId} from '../simulation/surfaces.js';
import {courtButton,surfaceChoices,roomSeats,formatChoice} from './match-settings.js';
import {pointLabel,isScoringFormat} from '../simulation/scoring.js';
import {teamOf,partner} from '../simulation/types.js';

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type Screen='home'|'join'|'setup'|'matching'|'room'|'playing'|'result'|'characters';
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
  private choosingBot:{seat:Seat;characterId:string}|null=null;
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
  private surface:SurfaceId=surfaceProfile(readPreference('rally-surface')).id;
  private surfaceOpen=false;
  private lobbyReturn=false;
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
    this.local.dispose();this.local=new Match([this.characterId,this.opponentId],Math.random,{surface:this.surface});
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
  private canChooseBot(seat:number){
    return !!this.room&&this.room.host===this.seat&&Number.isInteger(seat)&&
      !!this.room.seats[seat]?.bot&&(!this.room.playing||this.remote?.phase==='over');
  }
  private input(command:Input){
    if(this.screen!=='playing'||this.paused||!this.connected||this.help)return;
    if((this.remote??this.local.state).rescueWindow&&command.type==='move')return;
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
    el.querySelector('span')!.textContent=serving?(shot.slice?'反向发球':profile.label):dropStrength(shot)>.5?'放小球':`${profile.label} · ${placementAssist(shot.power)>.8?'稳健落点':placementAssist(shot.power)>.2?'注意控线':'高风险压线'}`;
    (el.querySelector('i') as HTMLElement).style.transform=`scaleX(${Math.max(.1,shot.power)})`;
    if(end)this.feedbackTimer=setTimeout(()=>el.style.display='none',550);
  }
  private chargeFeedback(amount:number,x:number,y:number){
    this.feedback({type:'shot',aim:0,depth:0,power:amount,lob:false,topspin:1},x,y,false);
    document.querySelector('#shot-feedback span')!.textContent=`蓄力上旋 ${Math.round(amount*100)}% · 滑动释放`;
  }
  private async action(action:string){
    if(action!=='hidden-master')this.hiddenMaster.reset();
    if(action==='surfaces'){
      if(this.screen==='playing'||this.screen==='result'||this.screen==='matching')return;
      if(this.room&&this.room.host!==this.seat){this.toast('由房主选择场地');return;}
      this.surfaceOpen=true;this.renderScreen();return;
    }
    if(action==='close-surfaces'){this.surfaceOpen=false;this.renderScreen();return;}
    if(action.startsWith('surface-')){
      const id=action.slice(8);if(!this.surfaceOpen||!isSurfaceId(id))return;
      this.surfaceOpen=false;
      if(this.room){this.net?.send({type:'configure',surface:id});}
      else {this.surface=id;writePreference('rally-surface',id);this.local.dispose();this.local=new Match([this.characterId,this.opponentId],Math.random,{surface:this.surface});}
      this.renderScreen();return;
    }
    if(action.startsWith('bot-')){
      if(!this.room||this.room.host!==this.seat)return;
      const [,index,operation]=action.split('-'),seat=Number(index);
      if(operation==='character'){
        if(this.screen!=='room'||!this.canChooseBot(seat))return;
        this.choosingBot={seat:seat as Seat,characterId:this.hiddenMaster.selectable(this.room.seats[seat]!.characterId)};
        this.choosingOpponent=false;this.characterReturn='room';this.screen='characters';this.renderScreen();return;
      }
      if(operation!=='add'&&operation!=='remove')return;
      this.net?.send({type:'configure',bot:{seat,enabled:operation==='add',characterId:this.opponentId}});return;
    }
    if(action.startsWith('move-')){
      if(!this.room||this.room.host!==this.seat)return;
      const [,from,to]=action.split('-');this.net?.send({type:'configure',move:{from:Number(from),to:Number(to)}});return;
    }
    if(action.startsWith('format-')){
      const format=action.slice(7);if(isScoringFormat(format))this.net?.send({type:'configure',format});return;
    }
    if(action==='return-lobby'&&this.net){this.lobbyReturn=true;this.screen='room';this.renderScreen();return;}
    if(action==='camera-distance'){
      const choice=this.cameraChoice.toggle();this.view.setCameraDistance(choice.distance);
      this.renderScreen();
      this.toast(`${choice.distance==='near'?'近':'远'}视角已选择，当前击球结束后切换${choice.saved?'':'；本次无法保存设置'}`);
      return;
    }
    if(action==='lob'){this.controls.lobMode=!this.controls.lobMode;this.updateHud();return;}
    if(action==='characters'||action==='opponent-characters'){
      if(!['home','setup','room','join'].includes(this.screen))return;
      this.choosingBot=null;
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
      if(this.choosingBot){this.choosingBot.characterId=id;}
      else if(this.choosingOpponent){this.opponentId=id;this.saveCharacter('rally-opponent',id);}
      else{this.characterId=id;this.saveCharacter('rally-character',id);if(this.net&&this.room)this.net.send({type:'select-character',characterId:id});}
      this.renderScreen('detail');
    }
    else if(action==='character-list'){
      if(this.screen==='characters')revealCharacterPicker(this.ui,'list');
    }
    else if(action==='confirm-characters'||action==='close-characters'){
      if(this.screen!=='characters')return;
      if(this.choosingBot){
        const {seat,characterId}=this.choosingBot;
        if(action==='confirm-characters'){
          if(!this.canChooseBot(seat))this.toast('电脑席位已变化，或比赛已开始，请返回房间确认');
          else if(this.room!.seats[seat]!.characterId!==characterId)this.net?.send({type:'configure',bot:{seat,enabled:true,characterId}});
        }
        this.choosingBot=null;this.screen=this.characterReturn;this.renderScreen();return;
      }
      if(action==='confirm-characters'&&!this.choosingOpponent&&this.net&&this.room&&
         (!this.room.playing||this.remote?.phase==='over')&&this.room.seats[this.seat]?.characterId!==this.characterId){
        this.net.send({type:'select-character',characterId:this.characterId});
      }
      this.screen=this.characterReturn;this.renderScreen();
    }
    else if(action==='practice'){this.screen='setup';this.renderScreen();}
    else if(action==='start-practice'){
      this.net?.close();this.net=null;this.remote=null;this.drawState=null;this.room=null;this.playback.reset();this.local.dispose();this.local=new Match([this.characterId,this.opponentId],Math.random,{surface:this.surface});
      this.networkError='';
      this.seat=0;this.paused=false;this.connected=true;this.screen='playing';this.lastEvent=-1;this.accumulator=0;
      this.help=!readPreference('rally-tutorial');this.renderScreen();
    }
    else if(action==='match'&&!this.busy)this.connect({type:'match',name:this.name,characterId:this.characterId,surface:this.surface});
    else if((action==='create'||action==='create-doubles')&&!this.busy)this.connect({type:'create',name:this.name,characterId:this.characterId,mode:action==='create-doubles'?'doubles':'singles',surface:this.surface});
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
      this.busy=false;this.connected=true;this.paused=false;this.surfaceOpen=false;this.local.dispose();this.local=new Match([this.characterId,this.opponentId],Math.random,{surface:this.surface});
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
    this.playback.reset();this.predictedMove=null;this.networkError='';this.lobbyReturn=false;
    this.net?.close();this.remote=null;this.drawState=null;this.busy=true;this.status='正在连接球场…';this.renderScreen();
    this.net=new NetworkClient({
      welcome:c=>{this.seat=c.seat;this.busy=false;this.connected=true;this.screen=c.matched?'matching':'room';this.lastEvent=-1;this.renderScreen();},
      matching:()=>{this.busy=false;this.connected=true;this.status='正在寻找同样在匹配的球友…';this.screen='matching';this.renderScreen();},
      room:r=>{
        this.room=r;this.paused=r.paused;
        if(!r.playing){
          this.remote=null;this.drawState=null;this.playback.reset();
          // A selection broadcasts the room back; keep its attributes open for reading.
          if(this.screen!=='characters'||(this.choosingBot&&!this.canChooseBot(this.choosingBot.seat))){
            this.choosingBot=null;this.screen='room';
          }
          if(this.local.state.surface!==r.surface){this.local.dispose();this.local=new Match([this.characterId,this.opponentId],Math.random,{surface:r.surface});}
        }
        if(r.seats[this.seat]?.characterId)this.characterId=this.hiddenMaster.selectable(r.seats[this.seat]!.characterId);
        if(this.screen==='room'||this.screen==='result'||this.screen==='matching')this.renderScreen();
      },
      state:(s,paused)=>{
        this.remote=s;this.paused=paused;this.playback.push(s,performance.now());
        if(s.phase==='over'){
          if(this.screen!=='result'&&!this.lobbyReturn){this.screen='result';this.renderScreen();}
        }else if(this.screen!=='playing'){
          this.lobbyReturn=false;this.screen='playing';this.connected=true;this.renderScreen();
        }
      },
      status:s=>{
        this.status=s;this.connected=s==='已连接';
        if(this.screen==='room'||this.screen==='join'||this.screen==='home'||this.screen==='matching')this.renderScreen();
      },
      error:s=>{this.busy=false;this.toast(s);this.status=s;this.renderScreen();},
      terminal:s=>{
        this.net=null;this.remote=null;this.drawState=null;this.room=null;this.busy=false;this.paused=false;this.connected=true;
        this.screen='home';this.help=false;this.networkError=s;this.status='';this.predictedMove=null;
        this.local.dispose();this.local=new Match([this.characterId,this.opponentId],Math.random,{surface:this.surface});this.renderScreen();
      },
      latency:ms=>this.latency=ms
    });
    this.net.connect(action);
  }
  private home(){return `<div class="home"><header class="masthead">${brand}<div class="edition">PLAY FOR THE RALLY</div></header>
    <main class="home-copy"><div class="eyebrow">A LITTLE COURT. A GOOD TIME.</div><h1>Rally<br/><em>together.</em></h1>
    <p class="subtitle">约一场，刚刚好。</p><p class="description">一片球场，一位朋友。<br/>把好球留给彼此，把胜负留在场上。</p>
    <div class="menu"><label class="name-label" for="nickname">你的昵称<input id="nickname" maxlength="16" value="${escape(this.name)}" autocomplete="nickname"/></label>
    <button class="primary lime match-button" data-action="match" ${this.busy?'disabled':''}>${this.busy?'连接中…':'快速匹配'} <span>⚡</span></button>
    <button class="primary" data-action="create" ${this.busy?'disabled':''}>单打开房 <span>↗</span></button>
    <button class="secondary" data-action="join">加入房间 <span>＋</span></button>
    <button class="secondary doubles-button" data-action="create-doubles" ${this.busy?'disabled':''}>双打开房 · 2 对 2 <span>好友 / 电脑 ↗</span></button>
    <button class="character-choice" data-action="characters">球员：${getCharacter(this.characterId).name} · ${getCharacter(this.characterId).role} <span>更换 →</span></button>
    <button class="practice" data-action="practice">先热热身 · 单人练习 <span>→</span></button>${this.networkError?`<div class="error-inline" role="alert" style="grid-column:1/-1">${escape(this.networkError)}</div>`:''}</div></main>
    <button class="court-tag" data-action="surfaces" aria-label="选择场地：${surfaceProfile(this.surface).name}"><strong>${this.surface==='hard'?'01':this.surface==='clay'?'02':'03'}</strong><span>CHOOSE YOUR COURT<br/>${surfaceProfile(this.surface).title} · ${surfaceProfile(this.surface).name} ›</span></button>
    <footer class="home-footer"><b>点按跑位 / 滑动击球 / 好友对战</b><span>NO PRESSURE. JUST PLAY.</span></footer></div>`;}
  private panel(content:string){return `<div class="overlay"><section class="panel">${content}</section></div>`;}
  private matchingPanel(){return this.panel(`<div class="panel-top"><span>QUICK MATCH</span>${close}</div><div class="matchmaking-mark"><i></i><i></i><i></i></div><h2>正在寻找对手…</h2><p>另一位正在匹配的球友出现后，会直接为你们开赛。</p><div class="matchmaking-player"><div class="avatar">${escape(this.name.slice(0,1))}</div><div><strong>${escape(this.name)}</strong><small>${getCharacter(this.characterId).name} · ${getCharacter(this.characterId).role}</small></div><span>匹配中</span></div><button class="secondary" data-action="back">取消匹配</button><div class="status-line">${escape(this.status)}</div>`);}
  private roomPanel(){
    const r=this.room;if(!r)return this.panel(`<h2>正在打开球场</h2><p>${escape(this.status)}</p>${close}`);
    const me=r.seats[this.seat],both=r.seats.every(p=>p?.connected),shareable=!!invitationLink(location.origin,r.code);
    return this.panel(`<div class="panel-top"><span>FRIENDS ON COURT</span>${close}</div><h2>球场已为你留好。</h2><p>${shareable?'把邀请链接发给朋友，准备好就开打。':'当前地址只能在这台设备打开。手机请先打开电脑的 Wi-Fi 地址，再用房间号加入。'}</p>
      <div class="room-code" aria-label="房间号">${r.code}</div><div class="room-caption">私人球场 · 6 位房间号</div>
      <div class="copy-row"><button class="secondary" data-action="copy-code">复制房间号</button><button class="secondary" data-action="copy-link" ${shareable?'':'disabled'}>复制邀请链接 ↗</button></div>
      ${courtButton(r.surface??'hard',r.host!==this.seat)}${formatChoice(r,this.seat)}${roomSeats(r,this.seat)}
      <button class="secondary" data-action="characters">更换球员 · ${getCharacter(this.characterId).name}</button><button class="primary" data-action="ready" ${!both||me?.ready?'disabled':''}>${!both?'等朋友一起上场':me?.ready?'已准备，等待朋友…':'准备开赛 →'}</button>
      <p class="small-note">${r.format==='standard'?'标准一盘 · 六局领先两局，六平抢七':'抢七短赛 · 先到 7 分且领先 2 分'}${r.mode==='doubles'?'<br/>右区 / 左区接发固定 · 调整席位可选择队伍与顺序':''}</p><div class="status-line">${escape(this.status)}</div>`);
  }
  private playing(){const s=this.remote??this.local.state;return `<div class="match-top"><button class="icon-button" data-action="quit" aria-label="退出比赛">‹</button><div class="match-label">${surfaceProfile(s.surface).title} · ${surfaceProfile(s.surface).name} <span class="connection" id="connection"></span></div><button class="icon-button" data-action="mute" aria-label="${this.audio.muted?'开启声音':'关闭声音'}">${this.audio.muted?'♪̸':'♪'}</button></div>
    <div class="scoreboard"><div class="score-player"><div class="score-name" id="name-me"></div><div class="score-value" id="score-me">0</div>${staminaBars('me')}</div><div class="score-divider">vs</div><div class="score-player"><div class="score-name" id="name-them"></div><div class="score-value" id="score-them">0</div>${staminaBars('them')}</div></div>
    <div class="rally-count" id="rally-count">FIRST TO 7</div><div class="team-status" id="team-status"></div><div id="point-slot"></div><div id="reconnect-slot"></div>
    <div class="match-bottom"><div class="serve-notice" id="serve-notice" role="status" aria-live="polite" hidden><strong id="serve-title"></strong><span id="serve-detail"></span></div><div class="hint" id="rally-hint"><strong id="match-hint">斜向滑动，发进对角发球区</strong><small id="match-subhint">绿普通 · 蓝快速 · 橙强力 · 玫红暴击</small></div><div class="court-actions">${s.mode==='doubles'?'<span class="lob-button" title="双打保留全场视野，避免裁掉队友">双打全场</span>':this.cameraChoice.button()}<button class="lob-button" id="lob-mode" data-action="lob" aria-label="选择下一拍高吊球" aria-pressed="false">高吊</button><button class="help-button" data-action="help" aria-label="查看操作帮助">?</button></div></div>`;}
  private helpPanel(){const state=this.remote??this.local.state;return this.panel(`<div class="panel-top"><span>JUST THREE MOVES</span><button class="icon-button" data-action="close-help" aria-label="关闭帮助">×</button></div><h2>好球，从这一拍开始。</h2><p>${this.net?'线上对局仍在进行，请尽快回到球场。':'先记住三个动作，马上就能打出回合。'}</p>
    ${state.mode==='doubles'?'<p><strong>双打规则</strong>：队友分别固定右区和左区接发，不能凌空接发；接发完成后任一队友都可回击，但不能传球给队友。发球仍须落入原对角发球区，回合中双打边廊有效。抢七首人发一分，之后四人各发两分；每六分换边。标准赛每局换发，双方队友交替发球。双打固定全场镜头，避免裁掉队友。</p>':''}
    <div class="tutorial-steps"><div class="tutorial-step"><b>1</b><div><strong>轻点球场，移动到位</strong><span>发球前可以点按调整站位，发球者限当前半区底线后，开始抛球后锁定位置。普通球员优先接落地球，伊内丝主动上前截击。本分消耗按20%折算到总体力，一分最多扣总体力20%；分末按角色返还部分消耗，最多90%。下一分以恢复后的总体力作为本分初始值，不再回满100%；二发不重置。跑动和击球使用“本分×总体”的有效体力，跳接概率只看总体力。</span></div></div>
    <div class="tutorial-step"><b>2</b><div><strong>向上滑动，把球打回去</strong><span>短而慢地滑动可放小球：显示“放小球”，落在网后约1～2米、低弹跳。普通及中慢速回球有落点辅助，接近边线时柔和收回，并保留底线余量；越快越用力，辅助越少，强力球和暴击球更容易出界。球场中央的小幅方向不改，边缘辅助会有意收敛角度，不再要求慢球与原始手势完全同角度。发球仍需主动斜划进对角发球区，不自动纠正发球方向。手指按住再划是上旋，右侧按钮可选高吊；近远景不改变规则。跑动时可提前滑动，保存最后一次方向和球质。</span></div></div>
    <div class="tutorial-step"><b>3</b><div><strong>认颜色，控制速度与深度</strong><span>绿普通、蓝快速、橙强力、玫红暴击、青绿上旋、金色高压、冰白切削、紫色高吊。长按蓄力上旋，下划反向切削，右侧按钮选择高吊。不必先滑动：预测普通跑动接不到、侧扑来得及时，角色会自动尝试飞身。总体力满时90%，1/3及以下10%，中间平滑变化；每记来球只抽一次。已提前滑动就直接回球；未滑动则在球拍真正够到球时，双方人物和球一起定格最多0.5秒，显示“滑动回击”。窗口内滑动立即击球，超时球继续原轨迹，不自动击中或倒带。救球保留减速和深浅波动；切削落地后仍有侧偏，接发仍须落地，出界或二跳后不能救。</span></div></div></div>
    <p>右下角“近景 / 远景”切换镜头距离；瞄准和触球定格期间不切镜头。侧扑最多横移3.5米，但受速度、加速与来球时间限制，来不及就不会瞬移补接。横移不超过1.2米使用侧身小跳，在跳出的位置脚落地后立即可移动、击球，不趴地也没有起身惩罚；更远的救球使用大跳，在落点倒地并保留0.5秒起身惩罚。两种救球都不自动跑回起跳位置；起跳后新点的移动目标在恢复后执行。触球补滑的0.5秒定格与起身惩罚独立，定格期间双方都不能移动或恢复体力。</p>
    <p id="performance-stats" class="small-note"></p><p id="performance-sync" class="small-note"></p><button class="primary" data-action="close-help">知道了，上场 →</button><p class="small-note">${state.scoring?.format==='standard'?'标准一盘 · 六局领先两局，六平抢七':'先到 7 分且领先 2 分获胜'} · 发球限时 12 秒</p>`);}
  private result(){
    const s=this.remote??this.local.state,won=s.winner===teamOf(this.seat);
    const me=this.teamName(teamOf(this.seat)),them=this.teamName(other(this.seat));
    const ready=this.room?.seats[this.seat]?.ready;
    const winner=s.winner===null?null:s.players[s.winner],winnerName=won?me:them;
    return `<div class="victory-overlay"><div class="victory-title"><span>${s.mode==='doubles'?'WINNING TEAM':'MATCH WINNER'}</span><h2>${escape(winnerName)}${s.mode==='doubles'?'':` · ${winner?getCharacter(winner.characterId).name:''}`}</h2><p>${won?'你赢了！':'获胜方庆祝中'} · 持拍庆祝</p></div><section class="panel victory-panel"><div class="panel-top"><span>THAT WAS A GOOD RALLY</span>${close}</div><h2>${won?'好球，这场属于你。':'再来一场，找回手感。'}</h2><p>${escape(s.event)}</p>
      <div class="result-score">${(s.scoring?.format==='standard'?s.scoring.games:s.score)[teamOf(this.seat)]} <span style="color:#a4af98">:</span> ${(s.scoring?.format==='standard'?s.scoring.games:s.score)[other(this.seat)]}</div><div class="result-names">${escape(me)} &nbsp; / &nbsp; ${escape(them)}</div>
      <div class="result-stats"><div><strong>${s.maxRally}</strong>最长回合</div><div><strong>${Math.floor(s.time/60)}:${String(Math.floor(s.time%60)).padStart(2,'0')}</strong>对局时间</div></div>
      <button class="primary" data-action="rematch" ${ready?'disabled':''}>${ready?'已准备，等待朋友…':'再来一场 ↗'}</button>${this.net?'<button class="secondary" data-action="return-lobby">返回房间 · 调整队伍 / 场地</button>':''}<button class="secondary" data-action="back">回到首页</button></section></div>`;
  }
  private teamName(team:0|1){
    const s=this.remote??this.local.state;
    if(s.mode==='doubles')return (this.room?.seats??[]).flatMap((p,i)=>p&&i%2===team?[p.name]:[]).join(' / ')||`${team===0?'A':'B'} 队`;
    return this.room?.seats[team]?.name??(team===0?this.name:'练习搭档');
  }
  private renderScreen(characterTarget?:'detail'|'list'){
    const characterScroll=characterTarget?this.ui.querySelector('.character-panel')?.scrollTop:undefined;
    this.view.setMode(this.screen==='result'?'result':this.screen==='playing'?'match':'home',this.seat);
    this.controls.enabled=this.screen==='playing'&&!this.help;
    if(this.screen==='characters')this.ui.innerHTML=characterPicker(this.choosingBot?.characterId??(this.choosingOpponent?this.opponentId:this.characterId),this.choosingOpponent,this.hiddenMaster.unlocked,this.choosingBot?.seat);
    else if(this.screen==='home')this.ui.innerHTML=this.home();
    else if(this.screen==='matching')this.ui.innerHTML=this.matchingPanel();
    else if(this.screen==='room')this.ui.innerHTML=this.roomPanel();
    else if(this.screen==='join')this.ui.innerHTML=this.panel(`<div class="panel-top"><span>YOUR FRIEND IS WAITING</span>${close}</div><h2>加入朋友的球场。</h2><p>输入 6 位房间号，下一场好球等你来。</p><label class="name-label" for="nickname">昵称<input id="nickname" value="${escape(this.name)}" maxlength="16"/></label><button class="secondary" data-action="characters">球员 · ${getCharacter(this.characterId).name} / 更换</button><input id="room-input" class="code-input" aria-label="六位房间号" placeholder="000000" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" value="${escape(this.code)}"/><button class="primary" data-action="join-submit" ${this.busy?'disabled':''}>${this.busy?'正在加入…':'加入球场 →'}</button><div class="status-line">${escape(this.status)}</div>`);
    else if(this.screen==='setup')this.ui.innerHTML=this.panel(`<div class="panel-top"><span>TAKE A FEW PRACTICE SWINGS</span>${close}</div><div class="panel-heading">Warm up.</div><h2>先和搭档热热身。</h2><p>同一片球场，同样的操作。找找击球节奏，再叫上朋友。</p><div class="character-matchup"><button class="secondary" data-action="characters">你 · ${getCharacter(this.characterId).name}</button><button class="secondary" data-action="opponent-characters">搭档 · ${getCharacter(this.opponentId).name}</button></div><div class="select-row"><button class="${this.difficulty==='relaxed'?'selected':''}" data-action="relaxed">轻松练习</button><button class="${this.difficulty==='standard'?'selected':''}" data-action="standard">认真对打</button></div><button class="primary" data-action="start-practice">开始练习 →</button><p class="small-note">点按移动 · 滑动击球 · 7 分制</p>`);
    else if(this.screen==='playing'){this.ui.innerHTML=this.playing()+(this.help?this.helpPanel():'');this.lastPhase='';this.updateHud();}
    else this.ui.innerHTML=this.result();
    if(this.screen==='setup')this.ui.querySelector('[data-action="start-practice"]')?.insertAdjacentHTML('beforebegin',courtButton(this.surface));
    if(this.screen==='matching')this.ui.querySelector('.matchmaking-player')?.insertAdjacentHTML('afterend',courtButton(this.surface,true));
    if(this.surfaceOpen)this.ui.insertAdjacentHTML('beforeend',`<div class="overlay surface-overlay" role="dialog" aria-modal="true" aria-label="选择球场"><section class="panel"><div class="panel-top"><span>CHOOSE YOUR COURT</span><button class="icon-button" data-action="close-surfaces" aria-label="关闭场地选择">×</button></div><h2>换一片球场，换一种节奏。</h2><p>场地改变反弹、旋转与跑动制动；开赛后锁定。</p><div class="surface-options">${surfaceChoices(this.room?.surface??this.surface)}</div><button class="secondary" data-action="close-surfaces">返回</button></section></div>`);
    if(this.screen==='characters'&&characterTarget){
      const panel=this.ui.querySelector('.character-panel');
      if(panel&&characterScroll!==undefined)panel.scrollTop=characterScroll;
      revealCharacterPicker(this.ui,characterTarget);
    }
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
    text('name-me',`${teamOf(s.server)===teamOf(me)?'● ':''}${this.teamName(teamOf(me))}`);
    text('name-them',`${teamOf(s.server)===them?'● ':''}${this.teamName(them)}`);
    text('score-me',pointLabel(s.score,teamOf(me),s.scoring));text('score-them',pointLabel(s.score,them,s.scoring));
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
      if(!jump&&!this.controls.lobMode&&s.ball.hitter===me&&(s.ball.placementAssist??0)>0)
        text('match-subhint','慢球辅助留边 · 越快越需要控制角度和长度');
    }
    const phaseKey=`${s.phase}-${s.eventId}`;
    if(this.lastPhase!==phaseKey){
      this.lastPhase=phaseKey;document.getElementById('point-slot')!.innerHTML=s.phase==='point'?`<div class="point-banner"><strong>${s.event.includes('擦网')?'Let':s.fault?'Second serve':s.lastPoint===teamOf(me)?'Your point':'Good try'}</strong><span>${escape(s.event)}</span></div>`:'';
    }
    const reconnect=document.getElementById('reconnect-slot')!;
    const warning=this.paused?'朋友暂时断线 · 比赛已暂停，等待重连':!this.connected?'网络暂时断开 · 正在恢复连接':'';
    if(reconnect.textContent!==warning)reconnect.innerHTML=warning?`<div class="reconnect-banner">${warning}</div>`:'';
    if(s.scoring?.format==='standard')text('rally-count',`局 ${s.scoring.games[teamOf(me)]} : ${s.scoring.games[them]} · ${s.scoring.tiebreak?'抢七':`${s.rally} 拍`}`);
    if(s.mode==='doubles'){
      const mate=partner(me),mateName=this.room?.seats[mate]?.name??'队友',serverName=this.room?.seats[s.server]?.name??'球员';
      const theirMate=partner(them),theirMateName=this.room?.seats[theirMate]?.name??'对手';
      text('team-status',`队友 ${mateName} ${Math.round(s.players[mate].stamina*100)}% · 对方 ${theirMateName} ${Math.round(s.players[theirMate].stamina*100)}%`);
      if(s.phase==='serve'){
        const receiver=s.receiver===me?'你':this.room?.seats[s.receiver??them]?.name??'对手';
        text('serve-title',s.server===me?(s.fault?'二发 · 轮到你':'轮到你发球'):`${serverName} 发球`);
        text('serve-detail',s.server===me?'发进对角区；队友守网前':`${receiver} 接发 · 队友协防，不能抢接发球`);
      }else if(s.phase==='point'){
        text('match-hint',`${s.event} · ${s.lastPoint===teamOf(me)?'我方得分':'准备下一分'}`);
      }else if(s.rescueWindow){
        text('match-hint',rescueHint(s,me)!);
      }else if(teamOf(s.ball.hitter)===teamOf(me)&&s.ball.hitter!==me){
        text('match-hint','队友已回球 · 移动补位，覆盖另一半场');
      }
    }
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
      else if(this.local.state.phase==='over'&&!active){this.local.dispose();this.local=new Match([this.characterId,this.opponentId],Math.random,{surface:this.room?.surface??this.surface});}
    }
    let state=this.remote??this.local.state;
    if(this.remote){
      this.drawState=this.playback.sample(now,this.paused||!this.connected)??structuredClone(this.remote);
      const draw=this.drawState;
      if(state.rescueWindow)this.predictedMove=null;
      if(this.predictedMove&&now<this.predictedMove.until&&!this.paused&&this.connected&&state.phase==='rally'&&!state.rescueWindow){
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
      else if(actual.phase==='rally'&&actual.event!=='滑动回击'&&actual.event!=='未及时回击')this.audio.play('hit');
    }
    if(now-this.lastHud>90){this.updateHud();this.lastHud=now;}
    requestAnimationFrame(this.frame);
  };
}
