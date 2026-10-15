import {getCharacter,isCharacterAvailable} from '../simulation/characters.js';
import {characterPicker,revealCharacterPicker,characterScrollState,restoreCharacterScroll} from './characters.js';
import {HiddenCharacterUnlock} from './hidden-character.js';
import {readPreference,writePreference} from './preferences.js';
import {PracticeTutorial,TUTORIAL_STEPS,TUTORIAL_VERSION,TUTORIAL_PACE_HINT,TUTORIAL_TAP_SLOP} from './practice-tutorial.js';
import {tutorialGesture} from './tutorial-gesture.js';
import {rescueHint} from './rescue-hint.js';
import {shotFeedbackLabel,feedbackPosition,pointBanner,playSubhint,movementFeedbackTarget,HintGate,hintKey,staminaWidths,TIMING_LABEL} from './match-feedback.js';
import {displayName,matchingCopy,resultHeadline,ruleLabel,emoteBar,EMOTE_LIST,roomRecord} from './copy.js';
import {practiceOpenness} from '../simulation/ai.js';
import {recordPracticeResult,recentPracticeResults,rallyBestKey,saveRallyBest} from './practice-history.js';
import {containModalFocus} from './modal-focus.js';
import {homeIcon} from './home-icons.js';
import {HomePractice} from '../render/home-practice.js';
import {staminaBars,staminaLabels} from './stamina.js';
import {CameraChoice} from './camera-choice.js';
import {shotTier,SHOT_PROFILES} from '../simulation/shot-profile.js';
import { Match } from '../simulation/match.js';
import { driveAI } from '../simulation/ai.js';
import {targetZone} from './target-drill.js';
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
import {PracticeReview,isPracticeGoal,practiceGoalChoices,practiceBestKey,readPracticeBest,savePracticeBest,practiceReviewPanel,type PracticeGoal} from './practice-review.js';

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
  private homeTab:'play'|'players'='play';
  private friendsOpen=false;
  private homePractice=new HomePractice();
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
  private name=displayName(readPreference('rally-name'));
  private difficulty:'relaxed'|'standard'='relaxed';
  private cameraChoice=new CameraChoice();
  private paused=false;
  private connected=true;
  private status='';
  private latency=0;
  private busy=false;
  private help=false;
  private practicePaused=false;
  private quitConfirm=false;
  private quitWasPaused=false;
  private practiceGoal:PracticeGoal='free';
  private practiceReview:PracticeReview|null=null;
  private practiceBest=0;
  private practiceSaved=true;
  private intro=false;
  private tutorialRequired=readPreference('rally-tutorial')!==TUTORIAL_VERSION;
  private tutorial:PracticeTutorial|null=null;
  private tutorialHudKey='';
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
  private hints=new HintGate();
  private matchingSince=0;
  private matchingInfo:{online?:number;waiting?:number;botAfterMs?:number}={};
  private matchingTimer:ReturnType<typeof setInterval>|null=null;
  private lastTiming=-1;
  private emoteTimer:ReturnType<typeof setTimeout>|null=null;
  private openness=0;
  private rallyRecord=false;
  /** G6: lobs use the hook gesture; the old one-shot button is an optional assist. */
  private lobButton=readPreference('rally-lob-button')==='1';
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
      if(input.id==='nickname'){this.name=displayName(input.value);writePreference('rally-name',input.value.trim().slice(0,16));}
      if(input.id==='lob-button-toggle'){void this.action('lob-button');return;}
      if(input.id==='room-input'){input.value=input.value.replace(/\D/g,'').slice(0,6);this.code=input.value;}
    });
    document.addEventListener('keydown',e=>{
      containModalFocus(e,this.ui);
      if((e.target as HTMLElement).getAttribute('role')==='tab'&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
        e.preventDefault();
        const players=e.key==='End'||(e.key!=='Home'&&this.homeTab!=='players');
        void this.action(players?'tab-players':'tab-play').then(()=>{
          this.ui.querySelector<HTMLButtonElement>(players?'#home-tab-players':'#home-tab-play')?.focus();
        });
      }
      if(e.key==='Escape'){
        if(this.friendsOpen)void this.action('close-friends');
        else if(this.quitConfirm)void this.action('cancel-quit');
        else if(this.help)void this.action('close-help');
        else if(this.practicePaused)void this.action('resume-practice');
        else if(this.screen==='playing'&&!this.net)void this.action('pause-practice');
      }
      if(e.key==='Enter'&&(e.target as HTMLElement).id==='room-input')void this.action('join-submit');
    });
    const invite=new URL(location.href).searchParams.get('room');
    if(invite&&/^\d{6}$/.test(invite)){this.code=invite;this.screen='join';}
    this.renderScreen();
    document.querySelector('#boot')?.classList.add('hide');
    document.addEventListener('visibilitychange',()=>{
      this.lastFrame=performance.now();this.accumulator=0;this.view.recordFrame(0,false);this.playback.reset();
      if(document.hidden&&!this.net&&this.screen==='playing'){
        this.practicePaused=true;
        if(this.quitConfirm)this.quitWasPaused=true;
        this.renderScreen();
      }
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
    if(this.screen!=='playing'||this.paused||!this.connected||this.help||this.intro||this.practicePaused||this.quitConfirm)return;
    if(this.tutorial&&!this.net){
      // U3: a tap on the finger graphic or its label counts as the guided marker itself.
      const target=command.type==='move'?this.tutorial.movementTarget(this.local):null;
      if(target&&command.type==='move'&&this.view?.screenPoint){
        const want=this.view.screenPoint(target.x,target.z),got=this.view.screenPoint(command.x,command.z);
        if(Math.hypot(want.x-got.x,want.y-got.y)<=TUTORIAL_TAP_SLOP)command={type:'move',x:target.x,z:target.z};
      }
      this.tutorial.input(this.local,command);
      if(command.type==='move')this.view?.showMoveTarget?.(this.local.state.players[0].tx,this.local.state.players[0].tz);
      this.updateHud();
      return;
    }
    const target=movementFeedbackTarget(this.remote??this.local.state,this.seat,command);
    if((this.remote??this.local.state).rescueWindow&&command.type==='move')return;
    if(this.net){this.net.input(command);if(command.type==='move')this.predictedMove={x:command.x,z:command.z,until:performance.now()+750};}
    else {this.local.input(0,command);this.practiceReview?.observe(this.local.state);}
    if(target)this.view?.showMoveTarget?.(target.x,target.z);
  }
  private completeTutorial(){
    if(!this.tutorial?.completed||this.local.state.phase!=='over'||this.local.state.winner!==0)return;
    this.tutorialRequired=false;
    if(!writePreference('rally-tutorial',TUTORIAL_VERSION))this.toast('引导已通过；浏览器无法保存，刷新后可能需要重新练习');
    this.accumulator=0;this.screen='result';this.renderScreen();
  }
  private feedback(shot:Shot|null,x:number,y:number,end:boolean){
    const el=document.querySelector<HTMLElement>('#shot-feedback')!;
    if(this.feedbackTimer)clearTimeout(this.feedbackTimer);
    if(!shot||this.tutorial?.completed){el.style.display='none';return;}
    el.style.display='block';
    const tier=shotTier(shot),profile=SHOT_PROFILES[tier];
    el.dataset.tier=tier;el.style.setProperty('--shot-color',`#${profile.color.toString(16).padStart(6,'0')}`);
    const serving=(this.remote??this.local.state).phase==='serve';
    el.querySelector('span')!.textContent=shotFeedbackLabel(shot,serving);
    const position=feedbackPosition(x,y,innerWidth,innerHeight,el.offsetWidth,el.offsetHeight);
    el.style.maxWidth=`${position.maxWidth}px`;el.style.left=`${position.left}px`;el.style.top=`${position.top}px`;
    (el.querySelector('i') as HTMLElement).style.transform=`scaleX(${Math.max(.1,shot.power)})`;
    if(end)this.feedbackTimer=setTimeout(()=>el.style.display='none',550);
  }
  private chargeFeedback(amount:number,x:number,y:number){
    this.feedback({type:'shot',aim:0,depth:0,power:amount,lob:false,topspin:1},x,y,false);
    document.querySelector('#shot-feedback span')!.textContent=`蓄力上旋 ${Math.round(amount*100)}% · 滑动释放`;
  }
  private async action(action:string){
    if(action!=='hidden-master')this.hiddenMaster.reset();
    if(action==='tab-play'||action==='tab-players'){
      if(!['home','characters'].includes(this.screen)||this.net)return;
      if(this.screen==='characters'&&(this.characterReturn!=='home'||this.choosingOpponent||this.choosingBot))return;
      this.friendsOpen=false;this.surfaceOpen=false;
      this.homeTab=action==='tab-play'?'play':'players';
      if(this.homeTab==='players'){
        this.choosingOpponent=false;this.choosingBot=null;this.characterReturn='home';this.screen='characters';
      }else this.screen='home';
      this.renderScreen();return;
    }
    if(action==='friends'){
      if(this.screen!=='home'||this.busy)return;
      this.friendsOpen=true;this.renderScreen();return;
    }
    if(action==='close-friends'){this.friendsOpen=false;this.renderScreen();return;}
    if(action.startsWith('goal-')){
      const goal=action.slice(5);
      if(this.screen==='setup'&&!this.tutorialRequired&&isPracticeGoal(goal)){this.practiceGoal=goal;this.renderScreen();}
      return;
    }
    if(action==='pause-practice'){
      if(this.screen!=='playing'||this.net)return;
      this.practicePaused=true;this.accumulator=0;this.renderScreen();return;
    }
    if(action==='resume-practice'){
      if(this.net||this.quitConfirm)return;
      this.practicePaused=false;this.accumulator=0;this.lastFrame=performance.now();this.renderScreen();return;
    }
    if(action==='quit'&&this.screen==='playing'){
      this.quitWasPaused=this.practicePaused;this.quitConfirm=true;
      if(!this.net)this.practicePaused=true;
      this.accumulator=0;this.renderScreen();return;
    }
    if(action==='cancel-quit'){
      if(!this.quitConfirm)return;
      this.quitConfirm=false;this.practicePaused=this.quitWasPaused;this.accumulator=0;this.renderScreen();return;
    }
    if(action==='confirm-quit'){
      if(!this.quitConfirm)return;
      action='back';
    }
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
      if(this.screen==='playing'){
        const button=this.ui?.querySelector('#camera-distance');
        if(button){button.outerHTML=this.cameraChoice.button();this.updateHud();}
      }else this.renderScreen();
      this.toast(`${choice.distance==='near'?'近':'远'}视角已选择，当前击球结束后切换${choice.saved?'':'；本次无法保存设置'}`);
      return;
    }
    if(action==='lob-button'){
      this.lobButton=!this.lobButton;writePreference('rally-lob-button',this.lobButton?'1':'0');
      const button=this.ui.querySelector<HTMLButtonElement>('#lob-mode');if(button)button.hidden=!this.lobButton||!!this.tutorial;
      if(!this.lobButton)this.controls.lobMode=false;
      return;
    }
    if(action==='lob'){if(this.tutorial||!this.lobButton)return;this.controls.lobMode=!this.controls.lobMode;this.updateHud();return;}
    if(action==='finish-tutorial'){
      if(!this.tutorial?.completed)return;
      this.tutorial=null;await this.action('start-practice');return;
    }
    if(action==='characters'||action==='opponent-characters'){
      if(!['home','setup','room','join'].includes(this.screen))return;
      this.choosingBot=null;
      if(this.screen==='home'&&action==='characters')this.homeTab='players';
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
      if(this.screen!=='characters')return;const id=action.slice('pick-character-'.length);if(!isCharacterAvailable(id))return;
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
      this.screen=this.characterReturn;
      if(this.screen==='home')this.homeTab='play';
      this.renderScreen();
    }
    else if(action==='practice'){
      this.friendsOpen=false;
      // Explicit free practice must not inherit a first-use or replay session.
      this.tutorialRequired=false;
      this.intro=false;this.tutorial=null;this.tutorialHudKey='';
      this.screen='setup';this.renderScreen();
    }
    else if(action==='practice-tutorial'){
      if(this.screen!=='setup')return;
      this.tutorialRequired=true;this.intro=false;this.tutorial=null;
      this.tutorialHudKey='';this.renderScreen();
    }
    else if(action==='start-practice'){
      this.homePractice?.dispose();
      this.view?.clearMoveTarget?.();
      this.net?.close();this.net=null;this.remote=null;this.drawState=null;this.room=null;this.playback.reset();this.local.dispose();this.local=new Match([this.characterId,this.opponentId],Math.random,{surface:this.surface});
      this.tutorial=this.tutorialRequired?new PracticeTutorial():null;this.tutorialHudKey='';
      this.practicePaused=false;this.quitConfirm=false;this.help=false;this.intro=false;
      this.practiceReview=this.tutorial?null:new PracticeReview(this.practiceGoal??'free');
      this.practiceReview?.observe(this.local.state);this.practiceBest=0;this.practiceSaved=true;this.rallyRecord=false;
      this.openness=this.difficulty==='relaxed'?practiceOpenness(recentPracticeResults()):0;
      this.local.setTimingGrade?.(0,!this.tutorial);this.hints?.reset();this.lastTiming=-1;
      this.networkError='';
      this.seat=0;this.paused=false;this.connected=true;this.screen='playing';this.lastEvent=-1;this.accumulator=0;
      this.renderScreen();
    }
    else if(action==='match'&&!this.busy)this.connect({type:'match',name:this.name,characterId:this.characterId,surface:this.surface});
    else if(action==='match-bot'){if(this.screen==='matching'&&this.net){this.status='正在安排电脑对手…';this.net.send({type:'match-bot'});}}
    else if(action.startsWith('emote-')){
      const id=Number(action.slice(6));
      if(this.net&&this.room&&Number.isInteger(id)&&id>=0&&id<EMOTE_LIST.length)this.net.send({type:'emote',id});
    }
    else if((action==='create'||action==='create-doubles')&&!this.busy)this.connect({type:'create',name:this.name,characterId:this.characterId,mode:action==='create-doubles'?'doubles':'singles',surface:this.surface});
    else if(action==='join'){this.friendsOpen=false;this.screen='join';this.renderScreen();}
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
      this.stopMatchingClock();
      this.homeTab='play';this.friendsOpen=false;
      this.view?.clearMoveTarget?.();
      this.practicePaused=false;this.quitConfirm=false;this.practiceReview=null;
      this.net?.close();this.net=null;this.remote=null;this.room=null;this.drawState=null;this.screen='home';this.help=false;
      this.intro=false;this.tutorialRequired=readPreference('rally-tutorial')!==TUTORIAL_VERSION;
      this.tutorial=null;this.tutorialHudKey='';this.accumulator=0;
      this.busy=false;this.connected=true;this.paused=false;this.surfaceOpen=false;this.local.dispose();this.local=new Match([this.characterId,this.opponentId],Math.random,{surface:this.surface});
      history.replaceState(null,'',location.pathname);this.renderScreen();
    }
    else if(action==='rematch'){
      if(this.net){this.net.send({type:'ready'});this.toast('已准备，等待好友再来一局');}
      else await this.action('start-practice');
    }
    else if(action==='help'){this.help=true;this.renderScreen();}
    else if(action==='close-help'){this.help=false;this.accumulator=0;this.renderScreen();}
    else if(action==='replay-intro'){this.intro=true;this.tutorialRequired=true;this.renderScreen();}
    else if(action==='close-intro'){
      this.intro=false;this.tutorialRequired=true;
      if(!this.net)this.screen='setup';
      this.accumulator=0;this.renderScreen();
    }
    else if(action==='mute'){
      this.audio.toggle();
      const button=this.ui?.querySelector<HTMLButtonElement>('[data-action="mute"]');
      if(this.screen==='playing'&&button){
        button.textContent=this.audio.muted?'♪̸':'♪';
        button.setAttribute('aria-label',this.audio.muted?'开启声音':'关闭声音');
      }else this.renderScreen();
    }
    else if(action==='relaxed'||action==='standard'){
      if(this.screen!=='setup')return;
      this.difficulty=action;this.tutorialRequired=false;this.intro=false;this.tutorial=null;
      this.tutorialHudKey='';this.renderScreen();
    }
  }
  private relaxedNote(){
    const recent=recentPracticeResults().slice(-3);
    if(recent.length===3&&recent.every(Boolean))return '最近连赢 3 场，可以试试「认真对打」。';
    if(recent.length&&recent.every(won=>!won))return '最近几场有点难，陪练会再多给一些机会。';
    return '';
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
    this.homePractice?.dispose();
    this.friendsOpen=false;this.homeTab='play';
    this.view?.clearMoveTarget?.();
    this.tutorial=null;this.tutorialHudKey='';
    this.practicePaused=false;this.quitConfirm=false;this.practiceReview=null;this.help=false;this.intro=false;
    this.playback.reset();this.predictedMove=null;this.networkError='';this.lobbyReturn=false;
    this.net?.close();this.remote=null;this.drawState=null;this.busy=true;this.status='正在连接球场…';this.renderScreen();
    this.net=new NetworkClient({
      welcome:c=>{this.stopMatchingClock();this.seat=c.seat;this.busy=false;this.connected=true;this.screen=c.matched?'matching':'room';this.lastEvent=-1;this.renderScreen();},
      matching:info=>{
        this.busy=false;this.connected=true;this.matchingInfo=info??{};
        if(this.screen!=='matching'){this.matchingSince=performance.now();this.screen='matching';this.renderScreen();this.startMatchingClock();}
        else this.refreshMatching();
      },
      emote:(seat,id)=>this.showEmote(seat,id),
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
          this.help=false;this.quitConfirm=false;this.practicePaused=false;
          if(this.screen!=='result'&&!this.lobbyReturn){this.screen='result';this.renderScreen();}
        }else if(this.screen!=='playing'){
          this.lobbyReturn=false;this.help=false;this.quitConfirm=false;this.screen='playing';this.connected=true;this.renderScreen();
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
  private home(){
    const character=getCharacter(this.characterId),court=surfaceProfile(this.surface);
    return `<div class="home home-simple"><header class="masthead">${brand}${this.homeTabs()}</header>
    <main id="home-play-panel" role="tabpanel" aria-labelledby="home-tab-play" class="home-copy"><div class="home-intro"><div class="eyebrow">JUST PLAY.</div><h1>下一拍，<br/><em>就现在。</em></h1></div>
    <div class="home-player-label"><span>${character.name}</span><small>${character.role} · 当前球员</small></div>
    <section class="home-play" aria-label="开始比赛"><div class="menu">
    <button class="primary lime match-button" data-action="match" ${this.busy?'disabled':''}><span class="home-action-icon">${homeIcon('match')}</span><span class="home-action-copy"><strong>${this.busy?'连接中…':'快速匹配'}</strong><small>找真人球友 · 20 秒没人就和电脑打</small></span><span class="home-action-arrow">${homeIcon('arrow')}</span></button>
    <button class="secondary friends-button" data-action="friends" aria-haspopup="dialog" aria-expanded="${!!this.friendsOpen}" ${this.busy?'disabled':''}><span class="home-action-icon">${homeIcon('doubles')}</span><span class="home-action-copy"><strong>好友对战</strong></span><span class="home-action-arrow">${homeIcon('arrow')}</span></button>
    <button class="practice practice-entry" data-action="practice" aria-label="单人练习：新手引导、轻松对打、认真对打"><span class="home-action-icon">${homeIcon('practice')}</span><span class="home-action-copy"><strong>单人练习</strong></span><span class="home-action-arrow">${homeIcon('arrow')}</span></button>${this.networkError?`<div class="error-inline" role="alert" style="grid-column:1/-1">${escape(this.networkError)}</div>`:''}</div></section></main>
    <button class="court-tag home-court-compact" data-action="surfaces" aria-label="选择场地：${court.name}"><span class="home-action-icon">${homeIcon('court')}</span><span class="home-action-copy"><small>场地</small><strong>${court.name}</strong></span><span class="home-setting-edit">切换</span></button>
    <footer class="home-footer"><span>NO PRESSURE. JUST PLAY.</span></footer></div>`;
  }
  private homeTabs(){
    const players=this.homeTab==='players';
    return `<nav class="home-tabs" role="tablist" aria-label="首页导航"><button id="home-tab-play" role="tab" tabindex="${players?-1:0}" aria-selected="${!players}" aria-controls="home-play-panel" data-action="tab-play">${homeIcon('court')}玩球</button><button id="home-tab-players" role="tab" tabindex="${players?0:-1}" aria-selected="${players}" aria-controls="home-players-panel" data-action="tab-players">${homeIcon('player')}球员</button></nav>`;
  }
  private friendsPanel(){
    return `<div class="overlay friends-overlay" role="dialog" aria-modal="true" aria-labelledby="friends-title"><section class="panel friends-panel"><div class="panel-top"><span>PLAY WITH FRIENDS</span><button class="icon-button" data-action="close-friends" aria-label="关闭好友对战面板">×</button></div><h2 id="friends-title">约朋友，打一场。</h2><label class="name-label" for="nickname">昵称<input id="nickname" value="${escape(this.name)}" maxlength="16"/></label><div class="friends-choices"><button class="secondary" data-action="create" ${this.busy?'disabled':''}>${homeIcon('create')}<span><strong>单打开房</strong><small>邀请一位朋友 · 1 对 1</small></span>${homeIcon('arrow')}</button><button class="secondary" data-action="create-doubles" ${this.busy?'disabled':''}>${homeIcon('doubles')}<span><strong>双打开房</strong><small>好友 / 电脑 · 2 对 2</small></span>${homeIcon('arrow')}</button><button class="secondary" data-action="join" ${this.busy?'disabled':''}>${homeIcon('join')}<span><strong>加入好友房间</strong><small>输入朋友的六位房号</small></span>${homeIcon('arrow')}</button></div></section></div>`;
  }
  private panel(content:string){return `<div class="overlay"><section class="panel">${content}</section></div>`;}
  private matchingPanel(){
    const copy=matchingCopy(this.matchingSince?performance.now()-this.matchingSince:0,this.matchingInfo);
    return this.panel(`<div class="panel-top"><span>QUICK MATCH</span>${close}</div><div class="matchmaking-mark"><i></i><i></i><i></i></div><h2>正在寻找对手…</h2><div class="matchmaking-meta" role="status"><span>已等待 <b id="matching-clock">${copy.clock}</b></span><span id="matching-online">${copy.online}</span></div><p id="matching-detail">${copy.detail}</p><div class="matchmaking-player"><div class="avatar">${escape(this.name.slice(0,1))}</div><div><strong>${escape(this.name)}</strong><small>${getCharacter(this.characterId).name} · ${getCharacter(this.characterId).role}</small></div><span>匹配中</span></div><button class="primary match-bot" data-action="match-bot" ${copy.offer?'':'hidden'}>先和电脑打一场 →</button><button class="secondary" data-action="back">取消匹配</button><div class="status-line">${escape(this.status==='已连接'?'':this.status)}</div>`);
  }
  private startMatchingClock(){
    this.stopMatchingClock();
    this.matchingTimer=setInterval(()=>this.refreshMatching(),500);
  }
  private stopMatchingClock(){if(this.matchingTimer)clearInterval(this.matchingTimer);this.matchingTimer=null;}
  /** Updates the waiting panel in place; never rebuilds it under the user's finger. */
  private refreshMatching(){
    if(this.screen!=='matching'||this.room){this.stopMatchingClock();return;}
    const copy=matchingCopy(performance.now()-this.matchingSince,this.matchingInfo);
    const set=(id:string,v:string)=>{const el=document.getElementById(id);if(el&&el.textContent!==v)el.textContent=v;};
    set('matching-clock',copy.clock);set('matching-online',copy.online);set('matching-detail',copy.detail);
    const offer=this.ui.querySelector<HTMLButtonElement>('[data-action="match-bot"]');if(offer)offer.hidden=!copy.offer;
  }
  private showEmote(seat:Seat,id:number){
    const text=EMOTE_LIST[id];if(!text)return;
    const el=document.getElementById('emote-bubble');
    const who=seat===this.seat?'你':this.room?.seats[seat]?.name??'对手';
    if(el){el.textContent=`${who}：${text}`;el.dataset.mine=String(seat===this.seat);el.classList.add('visible');}
    else this.toast(`${who}：${text}`);
    if(this.emoteTimer)clearTimeout(this.emoteTimer);
    this.emoteTimer=setTimeout(()=>document.getElementById('emote-bubble')?.classList.remove('visible'),2200);
  }
  private roomPanel(){
    const r=this.room;if(!r)return this.panel(`<h2>正在打开球场</h2><p>${escape(this.status)}</p>${close}`);
    const me=r.seats[this.seat],both=r.seats.every(p=>p?.connected),shareable=!!invitationLink(location.origin,r.code);
    return this.panel(`<div class="panel-top"><span>FRIENDS ON COURT</span>${close}</div><h2>球场已为你留好。</h2><p>${shareable?'把邀请链接发给朋友，准备好就开打。':'当前地址只能在这台设备打开。手机请先打开电脑的 Wi-Fi 地址，再用房间号加入。'}</p>
      <div class="room-code" aria-label="房间号">${r.code}</div><div class="room-caption">私人球场 · 6 位房间号</div>
      <div class="copy-row"><button class="secondary" data-action="copy-code">复制房间号</button><button class="secondary" data-action="copy-link" ${shareable?'':'disabled'}>复制邀请链接 ↗</button></div>
      ${courtButton(r.surface??'hard',r.host!==this.seat)}${formatChoice(r,this.seat)}${roomSeats(r,this.seat)}
      ${roomRecord(r,teamOf(this.seat))?`<p class="room-record">${roomRecord(r,teamOf(this.seat))}</p>`:''}${r.seats.filter(m=>m&&!m.bot).length>1?emoteBar():''}<div id="emote-bubble" class="emote-bubble" role="status"></div>
      <button class="secondary" data-action="characters">更换球员 · ${getCharacter(this.characterId).name}</button><button class="primary" data-action="ready" ${!both||me?.ready?'disabled':''}>${!both?'等朋友一起上场':me?.ready?'已准备，等待朋友…':'准备开赛 →'}</button>
      <p class="small-note">${r.format==='standard'?'标准一盘 · 6 局领先 2 局，6 平进入决胜局':'7 分制短赛 · 需领先 2 分'}${r.mode==='doubles'?'<br/>右区 / 左区接发固定 · 调整席位可选择队伍与顺序':''}</p><div class="status-line">${escape(this.status)}</div>`);
  }
  private playing(){const s=this.remote??this.local.state;return `<div class="match-top"><button class="icon-button" data-action="quit" aria-label="退出比赛">‹</button><div class="match-top-actions">${this.net?'':'<button class="icon-button" data-action="pause-practice" aria-label="暂停练习">Ⅱ</button>'}<button class="icon-button" data-action="mute" aria-label="${this.audio.muted?'开启声音':'关闭声音'}">${this.audio.muted?'♪̸':'♪'}</button></div></div>
    <div class="scoreboard"><div class="score-player"><div class="score-name" id="name-me"></div><div class="score-value" id="score-me">0</div>${staminaBars('me')}</div><div class="score-divider">vs</div><div class="score-player"><div class="score-name" id="name-them"></div><div class="score-value" id="score-them">0</div>${staminaBars('them')}</div></div>
    <div class="match-meta"><div class="match-label">${surfaceProfile(s.surface).name} <span class="connection" id="connection"></span></div><div class="rally-count" id="rally-count">${ruleLabel(false)}</div><div class="team-status" id="team-status"></div></div>${this.practiceReview?.goal&&this.practiceReview.goal!=='free'?'<div class="practice-progress" id="practice-progress" role="status"></div>':''}<div id="point-slot"></div><div id="reconnect-slot"></div>
    <div class="match-bottom"><div class="serve-notice" id="serve-notice" role="status" aria-live="polite" hidden><strong id="serve-title"></strong><span id="serve-detail"></span></div><div class="hint" id="rally-hint"><strong id="match-hint">斜向滑动，发进对角发球区</strong><small id="match-subhint">绿普通 · 蓝快速 · 橙强力 · 玫红暴击</small></div><div class="court-actions">${this.cameraChoice.button()}<button class="lob-button" id="lob-mode" data-action="lob" aria-label="选择下一拍高吊球" aria-pressed="false" ${this.lobButton?'':'hidden'}>高吊</button><button class="help-button" data-action="help" aria-label="查看操作帮助">?</button></div></div>
    <div id="timing-bubble" class="timing-bubble" aria-live="polite"></div><div id="emote-bubble" class="emote-bubble" role="status"></div>${this.net&&this.room&&!this.room.matchedBot?`<div class="match-emotes">${emoteBar()}</div>`:''}`;}
  private pausePanel(){return `<div class="overlay practice-pause" role="dialog" aria-modal="true" aria-labelledby="pause-title"><section class="panel"><div class="panel-top"><span>TAKE A BREATH</span></div><h2 id="pause-title">练习已暂停</h2><p>比分、球、体力和发球计时已冻结。回来后继续，不会因为查看消息而丢分。</p><button class="primary" data-action="resume-practice">继续练习 →</button><button class="secondary" data-action="help">查看操作帮助</button><button class="secondary" data-action="quit">退出本场练习</button></section></div>`;}
  private quitPanel(){return `<div class="overlay quit-confirm" role="dialog" aria-modal="true" aria-labelledby="quit-title"><section class="panel"><div class="panel-top"><span>LEAVE THE COURT?</span></div><h2 id="quit-title">确定退出本场${this.net?'比赛':'练习'}？</h2><p>${this.net?'离开会退出房间，比赛中对方可能需要等待断线处理；此时线上比赛仍在进行。':'当前练习已暂停。退出将丢弃本场进度，不保存挑战最佳；已完成的新手引导不会丢失。'}</p><button class="primary" data-action="cancel-quit">留在球场 →</button><button class="secondary" data-action="confirm-quit">确定退出</button></section></div>`;}
  private helpPanel(){const state=this.remote??this.local.state;return this.panel(`<div class="panel-top"><span>JUST THREE MOVES</span><button class="icon-button" data-action="close-help" aria-label="关闭帮助">×</button></div><h2>好球，从这一拍开始。</h2><p>${this.net?'线上对局仍在进行，请尽快回到球场。':this.practicePaused?'练习仍暂停，关闭帮助后可继续。':'练习已暂停，关闭帮助后继续。'}</p>
    <div class="quick-help"><p><strong>轻点球场 · 跑位</strong><span>点想去的位置；接球可以提前滑动。</span></p><p><strong>向上滑动 · 回球 / 发球</strong><span>方向决定球路，距离影响深度，速度影响力量。发球斜划进对角区；接发须先落地。</span></p><p><strong>向下滑动 · 切削</strong><span>出球与滑动方向相反：右下划 → 左上出球。</span></p><p><strong>试试不同球路</strong><span>短而慢地划：短球；按住再划：上旋；向上划到顶再往回勾一下（∩）：高吊。</span></p><p><strong>击球时机</strong><span>球进入击球区时脚下圆环收紧。来球途中提前划、或球到身边立刻划都算「完美」：球更快、角度更大。</span></p></div>
    <label class="toggle-row"><input type="checkbox" id="lob-button-toggle" ${this.lobButton?'checked':''}/> 显示「高吊」辅助按钮（点一下，下一拍改为高吊）</label>
    <details class="help-details"><summary>进阶技巧、体力与${state.mode==='doubles'?'双打':'比赛'}规则</summary>
    ${state.mode==='doubles'?'<p><strong>双打规则</strong>：队友分别固定右区和左区接发，不能凌空接发；接发完成后任一队友都可回击，但不能传球给队友。发球仍须落入原对角发球区，回合中双打边廊有效。抢七首人发一分，之后四人各发两分；每六分换边。标准赛每局换发，双方队友交替发球。双打支持近 / 远视角切换；近景尽量放大，四人站位分散时自动退远，远景保留完整双打边线。</p>':''}
    <div class="tutorial-steps"><div class="tutorial-step"><b>1</b><div><strong>轻点球场，移动到位</strong><span>发球前可以点按调整站位，发球者限当前半区底线后，开始抛球后锁定位置。普通球员优先接落地球，伊内丝主动上前截击。本分消耗按20%折算到总体力，一分最多扣总体力20%；分末按角色返还部分消耗，最多90%。下一分以恢复后的总体力作为本分初始值，不再回满100%；二发不重置。跑动和击球使用“本分×总体”的有效体力，跳接概率只看总体力。</span></div></div>
    <div class="tutorial-step"><b>2</b><div><strong>向上滑动，把球打回去</strong><span>短而慢地滑动可放小球：显示“放小球”，落在网后约1～2米、低弹跳。普通及中慢速回球有落点辅助，接近边线时柔和收回，并保留底线余量；越快越用力，辅助越少，强力球和暴击球更容易出界。球场中央的小幅方向不改，边缘辅助会有意收敛角度，不再要求慢球与原始手势完全同角度。发球仍需主动斜划进对角发球区，不自动纠正发球方向。手指按住再划是上旋，右侧按钮可选高吊；近远景不改变规则。跑动时可提前滑动，保存最后一次方向和球质。</span></div></div>
    <div class="tutorial-step"><b>3</b><div><strong>认颜色，控制速度与深度</strong><span>绿普通、蓝快速、橙强力、玫红暴击、青绿上旋、金色高压、冰白切削、紫色高吊。长按蓄力上旋，下划反向切削，右侧按钮选择高吊。不必先滑动：预测普通跑动接不到、侧扑来得及时，角色会自动尝试飞身。总体力满时90%，1/3及以下10%，中间平滑变化；每记来球只抽一次。已提前滑动就直接回球；未滑动则在球拍真正够到球时，双方人物和球一起定格最多0.5秒，显示“滑动回击”。窗口内滑动立即击球，超时球继续原轨迹，不自动击中或倒带。救球保留减速和深浅波动；切削落地后仍有侧偏，接发仍须落地，出界或二跳后不能救。</span></div></div></div>
    <p>右下角“近景 / 远景”切换镜头距离；瞄准和触球定格期间不切镜头。侧扑最多横移3.5米，但受速度、加速与来球时间限制，来不及就不会瞬移补接。横移不超过1.2米使用侧身小跳，在跳出的位置脚落地后立即可移动、击球，不趴地也没有起身惩罚；更远的救球使用大跳，在落点倒地并保留0.5秒起身惩罚。两种救球都不自动跑回起跳位置；起跳后新点的移动目标在恢复后执行。触球补滑的0.5秒定格与起身惩罚独立，定格期间双方都不能移动或恢复体力。</p>
    </details><details class="help-details"><summary>画面与网络状态</summary><p id="performance-stats" class="small-note"></p><p id="performance-sync" class="small-note"></p></details><button class="primary" data-action="close-help">${this.practicePaused?'返回暂停页':'知道了，上场 →'}</button><p class="small-note">${ruleLabel(state.scoring?.format==='standard')} · 发球限时 12 秒</p>`);}
  private result(){
    const s=this.remote??this.local.state,won=s.winner===teamOf(this.seat);
    const me=this.teamName(teamOf(this.seat)),them=this.teamName(other(this.seat));
    const ready=this.room?.seats[this.seat]?.ready;
    const winner=s.winner===null?null:s.players[s.winner],winnerName=won?me:them;
    const guided=!!this.tutorial?.completed&&won;
    const review=!this.net?this.practiceReview:null;
    const head=resultHeadline({won,guided,maxRally:s.maxRally,legal:review?.players[0].legal,newBest:this.rallyRecord});
    const scores=(s.scoring?.format==='standard'?s.scoring.games:s.score);
    const record=this.net?roomRecord(this.room,teamOf(this.seat)):'';
    // Bot and practice names already carry the character; never print it twice.
    const withCharacter=(name:string)=>{const c=winner?getCharacter(winner.characterId).name:'';return s.mode==='doubles'||!c||name.endsWith(c)?name:`${name} · ${c}`;};
    // U5: the local player is the subject; a loss shows progress, not the opponent's celebration.
    return `<div class="victory-overlay"><div class="victory-title ${won?'':'quiet'}"><span>${won?(s.mode==='doubles'?'WINNING TEAM':'MATCH WINNER'):'本场结束'}</span><h2>${won?escape(withCharacter(winnerName)):`${escape(withCharacter(them))} 赢下本场`}</h2>${won?'<p>你赢了！</p>':''}</div><section class="panel victory-panel"><div class="result-body"><div class="panel-top"><span>${head.eyebrow}</span></div><h2>${head.title}</h2><p class="result-detail">${head.detail}</p>
      <div class="result-score">${scores[teamOf(this.seat)]} <span style="color:#a4af98">:</span> ${scores[other(this.seat)]}</div><div class="result-names">${escape(me)} &nbsp; / &nbsp; ${escape(them)}</div>
      <div class="result-stats"><div><strong>${s.maxRally}${this.rallyRecord?'<em class="new-best">新纪录</em>':''}</strong>最长回合</div><div><strong>${Math.floor((s.endedAt??s.time)/60)}:${String(Math.floor((s.endedAt??s.time)%60)).padStart(2,'0')}</strong>对局时间</div></div>
      ${record?`<p class="room-record">${record}</p>`:''}${this.net&&this.room&&!this.room.matchedBot?emoteBar():''}
      ${review?`<details class="result-review" open><summary>本场练习复盘${review.goal==='free'?'':` · ${review.complete?'✓ 目标达成':'继续挑战'}`}</summary>${practiceReviewPanel(review,this.practiceBest,this.practiceSaved)}</details>`:''}
      ${!this.net&&!guided&&this.difficulty==='relaxed'&&recentPracticeResults().slice(-3).length===3&&recentPracticeResults().slice(-3).every(Boolean)?'<p class="level-up">连赢 3 场！下一场试试「认真对打」。</p>':''}
      </div><div class="result-actions"><button class="primary" data-action="${guided?'finish-tutorial':'rematch'}" ${ready?'disabled':''}>${guided?'继续和陪练对打 →':ready?'已准备，等待朋友…':'再来一场 ↗'}</button>${this.net?'<button class="secondary" data-action="return-lobby">返回房间 · 调整队伍 / 场地</button>':''}<button class="secondary" data-action="back">回到首页</button></div></section></div>`;
  }
  private teamName(team:0|1){
    const s=this.remote??this.local.state;
    if(s.mode==='doubles')return (this.room?.seats??[]).flatMap((p,i)=>p&&i%2===team?[p.name]:[]).join(' / ')||`${team===0?'A':'B'} 队`;
    return this.room?.seats[team]?.name??(team===0?this.name:`陪练 · ${getCharacter(this.local.state.players[1]?.characterId??this.opponentId).name}`);
  }
  private renderScreen(characterTarget?:'detail'|'list'){
    const characterScroll=characterTarget?characterScrollState(this.ui):null;
    this.view.setMode(this.screen==='result'?'result':this.screen==='playing'?'match':'home',this.seat);
    this.controls.enabled=this.screen==='playing'&&!this.help&&!this.intro&&!this.practicePaused&&!this.quitConfirm;
    if(this.screen==='characters'){
      const picker=characterPicker(this.choosingBot?.characterId??(this.choosingOpponent?this.opponentId:this.characterId),this.choosingOpponent,this.hiddenMaster.unlocked,this.choosingBot?.seat);
      const homePicker=this.characterReturn==='home'&&!this.choosingOpponent&&!this.choosingBot;
      this.ui.innerHTML=homePicker?`<div class="home home-player-tab"><header class="masthead">${brand}${this.homeTabs()}</header><main id="home-players-panel" role="tabpanel" aria-labelledby="home-tab-players">${picker}</main></div>`:picker;
    }
    else if(this.screen==='home')this.ui.innerHTML=this.home();
    else if(this.screen==='matching')this.ui.innerHTML=this.matchingPanel();
    else if(this.screen==='room')this.ui.innerHTML=this.roomPanel();
    else if(this.screen==='join')this.ui.innerHTML=this.panel(`<div class="panel-top"><span>YOUR FRIEND IS WAITING</span>${close}</div><h2>加入朋友的球场。</h2><p>输入 6 位房间号，下一场好球等你来。</p><label class="name-label" for="nickname">昵称<input id="nickname" value="${escape(this.name)}" maxlength="16"/></label><button class="secondary" data-action="characters">球员 · ${getCharacter(this.characterId).name} / 更换</button><input id="room-input" class="code-input" aria-label="六位房间号" placeholder="000000" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" value="${escape(this.code)}"/><button class="primary" data-action="join-submit" ${this.busy?'disabled':''}>${this.busy?'正在加入…':'加入球场 →'}</button><div class="status-line">${escape(this.status)}</div>`);
    else if(this.screen==='setup')this.ui.innerHTML=this.panel(`<div class="panel-top"><span>SINGLE PLAYER · 单人练习</span>${close}</div><div class="panel-heading">Warm up.</div><h2>选一种节奏，和陪练上场。</h2><div class="select-row practice-levels" role="group" aria-label="单人练习难度"><button class="${this.tutorialRequired?'selected':''}" data-action="practice-tutorial" aria-pressed="${this.tutorialRequired}">新手引导<small>手势教学</small></button><button class="${!this.tutorialRequired&&this.difficulty==='relaxed'?'selected':''}" data-action="relaxed" aria-pressed="${!this.tutorialRequired&&this.difficulty==='relaxed'}">轻松对打<small>舒缓陪练</small></button><button class="${!this.tutorialRequired&&this.difficulty==='standard'?'selected':''}" data-action="standard" aria-pressed="${!this.tutorialRequired&&this.difficulty==='standard'}">认真对打<small>进阶挑战</small></button></div><p>${this.tutorialRequired?'跟着手势完成发球、接球、回位和切削，最后和放慢的陪练真打，赢下一分就通过。失误只重试当前这一球。':this.difficulty==='standard'?'陪练会更积极进攻，来球更快、更有挑战。检验你的跑位和控球。':`陪练放慢节奏，还会不时回出可以进攻的短球。${this.relaxedNote()}`}</p><div class="character-matchup"><button class="secondary" data-action="characters">你 · ${getCharacter(this.characterId).name}</button><button class="secondary" data-action="opponent-characters">陪练 · ${getCharacter(this.opponentId).name}</button></div><button class="primary" data-action="start-practice">${this.tutorialRequired?'开始新手引导':this.difficulty==='standard'?'开始认真对打':'开始轻松对打'} →</button><p class="small-note">${this.tutorialRequired?'约 2 分钟 · 失误原地重试':`点按移动 · 滑动击球 · ${ruleLabel(false)}`}</p>`);
    else if(this.screen==='playing'){
      const modal=this.quitConfirm||this.help||this.practicePaused;
      this.ui.innerHTML=`<div class="play-hud" ${modal?'inert':''}>${this.playing()}${this.tutorial?'<div id="tutorial-slot"></div>':''}</div>`+
        (this.quitConfirm?this.quitPanel():this.help?`<div role="dialog" aria-modal="true" aria-label="操作帮助">${this.helpPanel()}</div>`:this.practicePaused?this.pausePanel():'');
      this.tutorialHudKey='';this.lastPhase='';this.updateHud();
      if(modal)this.ui.querySelector<HTMLButtonElement>('.panel .primary')?.focus();
    }
    else this.ui.innerHTML=this.result();
    if(this.screen==='setup'){
      this.ui.querySelector('.primary')?.insertAdjacentHTML('beforebegin',courtButton(this.surface));
      if(!this.tutorialRequired)this.ui.querySelector('.character-matchup')?.insertAdjacentHTML('beforebegin',practiceGoalChoices(this.practiceGoal??'free'));
    }
    if(this.screen==='matching')this.ui.querySelector('.matchmaking-player')?.insertAdjacentHTML('afterend',courtButton(this.surface,true));
    if(this.screen==='home'&&this.friendsOpen){
      this.ui.querySelector<HTMLElement>('.home')?.setAttribute('inert','');
      this.ui.insertAdjacentHTML('beforeend',this.friendsPanel());
      this.ui.querySelector<HTMLButtonElement>('.friends-panel [data-action="create"]')?.focus();
    }
    if(this.surfaceOpen)this.ui.insertAdjacentHTML('beforeend',`<div class="overlay surface-overlay" role="dialog" aria-modal="true" aria-label="选择球场"><section class="panel"><div class="panel-top"><span>CHOOSE YOUR COURT</span><button class="icon-button" data-action="close-surfaces" aria-label="关闭场地选择">×</button></div><h2>换一片球场，换一种节奏。</h2><p>场地改变反弹、旋转与跑动制动；开赛后锁定。</p><div class="surface-options">${surfaceChoices(this.room?.surface??this.surface)}</div><button class="secondary" data-action="close-surfaces">返回</button></section></div>`);
    if(this.screen==='characters'&&characterTarget&&characterScroll){
      restoreCharacterScroll(this.ui,characterScroll);
      revealCharacterPicker(this.ui,characterTarget);
    }
    if(this.intro)this.ui.insertAdjacentHTML('beforeend',this.introPanel());
  }
  private updateHud(){
    if(this.screen!=='playing')return;
    const s=this.remote??this.local.state,me=this.seat,them=other(me);
    const text=(id:string,value:string)=>{const el=document.getElementById(id);if(el&&el.textContent!==value)el.textContent=value;};
    const serveNotice=document.getElementById('serve-notice')!;
    serveNotice.hidden=s.phase!=='serve'||this.paused||this.practicePaused||!this.connected||!!s.players[s.server].preparation;
    document.getElementById('rally-hint')!.hidden=!serveNotice.hidden;
    serveNotice.classList.toggle('your-serve',s.server===me);
    text('serve-title',s.server===me?(s.fault?'二发 · 轮到你发球':'轮到你发球'):'对手发球');
    text('serve-detail',s.server===me?'点按调整站位，斜划发进高亮对角区':'可点按调整接发位置，球发出后提前滑动');
    text('name-me',`${teamOf(s.server)===teamOf(me)?'● ':''}${this.teamName(teamOf(me))}`);
    text('name-them',`${teamOf(s.server)===them?'● ':''}${this.teamName(them)}`);
    text('score-me',pointLabel(s.score,teamOf(me),s.scoring));text('score-them',pointLabel(s.score,them,s.scoring));
    for(const [label,seat] of [['me',me],['them',them]] as const){
      const p=s.players[seat],labels=staminaLabels(p),width=staminaWidths(p);
      document.getElementById(`stamina-${label}`)!.style.width=`${width.effective}%`;
      document.getElementById(`total-stamina-${label}`)!.style.width=`${width.total}%`;
      const row=document.getElementById(`stamina-label-${label}`)!,aria=`体力 · ${labels.point} · ${labels.total}`;
      if(row.getAttribute('aria-label')!==aria){row.setAttribute('aria-label',aria);row.title=`${getCharacter(p.characterId).name} · ${labels.effective}`;}
      row.classList.toggle('low',(p.totalStamina??1)<.35);
    }
    text('lob-mode',this.controls.lobMode?'取消高吊':'高吊');
    document.getElementById('lob-mode')!.hidden=!this.lobButton||!!this.tutorial;
    document.getElementById('lob-mode')!.setAttribute('aria-pressed',String(this.controls.lobMode));
    const sync=this.playback.stats(performance.now());
    text('performance-sync',this.net?`同步 ${sync.hz||'—'} 次/秒 · 抖动 ${sync.jitterMs} ms · 最近一包 ${sync.gapMs} ms前`:'');
    text('performance-stats',`画面 ${this.view.fps||'测量中'} FPS · 自动${this.view.qualityLabel}${this.net?` · 网络 ${this.latency||'—'} ms`:''}`);
    text('connection',this.net?`${this.latency||'—'} ms`:'单人练习');
    if(this.practiceReview)text('practice-progress',this.practiceReview.progress);
    text('rally-count',s.rally>1?`${s.rally} 拍回合`:ruleLabel(false));
    text('match-hint',s.phase==='serve'?(s.server===me?(s.fault?'二发 · 轻一点，滑进对角发球区':s.players[me].preparation?.stroke==='serve'?'抛球、举拍，准备发出':'轮到你发球 · 向上斜划'):'对手发球 · 准备接球'):s.phase==='point'?`${s.event} · ${s.lastPoint===me?'你得分':'下一分加油'}`:s.players[me].shotQueued?'已预设击球 · 自动追球，到位后按滑动回击':s.ball.skill==='slice'?(s.ball.hitter===me?'切削球 · 注意下一拍':'对手切削 · 小心低弹跳和侧偏'):s.ball.skill==='smash'?(s.ball.hitter===me?'高压球！准备下一拍':'对手高压球 · 提前滑动接球'):s.ball.skill==='volley'?(s.ball.hitter===me?'截击成功 · 注意下一拍':'对手截击 · 提前滑动接球'):s.ball.rescue?(s.ball.hitter===me?'极限救球！回球变慢，尽快恢复站位':'对手极限救球 · 注意偏移后的落点'):s.players[me].rescue?'跳步救球中…':s.ball.hitter===me?(s.ball.critical?'暴击球！准备下一拍':'好球！轻点球场，调整下一拍站位'):s.ball.critical?'对手暴击球！提前滑动准备回击':s.players[me].shotQueued?'滑动已收到 · 到触球位置自动回击':'来球了，可以提前向上滑动');
    if(s.players[me].shotQueued&&s.phase==='rally')text('match-hint','击球已准备 · 到位后自动回击');
    text('match-subhint',playSubhint(s,me,this.controls.lobMode));
    if(s.phase==='rally'){
      const jump=rescueHint(s,me);if(jump)text('match-hint',jump);
      if(!jump&&(s.ball.drop??0)>.5)text('match-hint',s.ball.hitter===me?'放小球 · 网前短落点、低弹跳':'对手放小球 · 尽快上网接球');
      if(!jump&&!this.controls.lobMode&&s.ball.hitter===me&&(s.ball.placementAssist??0)>0)
        text('match-subhint','慢球辅助留边 · 越快越需要控制角度和长度');
    }
    if(s.phase==='rally'&&!this.tutorial&&s.mode!=='doubles'){
      const hint=document.getElementById('rally-hint')!,strong=document.getElementById('match-hint')!,small=document.getElementById('match-subhint')!;
      const gate=(this.hints??=new HintGate()).decide(hintKey(s,me,this.controls.lobMode),strong.textContent??'',small.textContent??'',s.score[0]+s.score[1],performance.now());
      hint.hidden=!gate.visible;if(gate.visible){text('match-hint',gate.text);text('match-subhint',gate.sub);}
    }
    this.timingFeedback(s,me);
    const zone=this.practiceReview?.drill?.zone(s);
    this.view?.setTargetZone?.(zone??null);
    const phaseKey=`${s.phase}-${s.eventId}`;
    if(this.lastPhase!==phaseKey){
      const banner=pointBanner(s,me);
      this.lastPhase=phaseKey;document.getElementById('point-slot')!.innerHTML=s.phase==='point'?`<div class="point-banner" role="status"><strong>${banner.title}</strong><span>${escape(s.event)}</span><small>${banner.advice}</small></div>`:'';
    }
    const reconnect=document.getElementById('reconnect-slot')!;
    const warning=this.paused?'朋友暂时断线 · 比赛已暂停，等待重连':!this.connected?'网络暂时断开 · 正在恢复连接':'';
    if(reconnect.textContent!==warning)reconnect.innerHTML=warning?`<div class="reconnect-banner">${warning}</div>`:'';
    if(s.scoring?.format==='standard')text('rally-count',`局 ${s.scoring.games[teamOf(me)]} : ${s.scoring.games[them]} · ${s.scoring.tiebreak?'决胜局':`${s.rally} 拍`}`);
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
    if(this.tutorial&&!this.net){
      const coach=this.tutorial,prompt=coach.prompt(this.local);
      const slot=document.getElementById('tutorial-slot'),key=JSON.stringify([coach.progress,prompt]);
      if(slot&&this.tutorialHudKey!==key){
        this.tutorialHudKey=key;
        const step=Math.min(coach.progress,TUTORIAL_STEPS.length-1),pct=Math.round(Math.min(coach.progress,TUTORIAL_STEPS.length)/TUTORIAL_STEPS.length*100);
        const more=prompt.more?`<details class="tutorial-why" ${coach.paceOpen?'open':''}><summary>为什么？</summary><p>${prompt.more}</p></details>`:'';
        slot.innerHTML=`<section class="tutorial-coach" aria-label="新手实操引导"><div class="tutorial-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${TUTORIAL_STEPS.length}" aria-valuenow="${Math.min(coach.progress,TUTORIAL_STEPS.length)}" aria-label="教学进度"><span class="tutorial-step-label">${Math.min(coach.progress+1,TUTORIAL_STEPS.length)}/${TUTORIAL_STEPS.length} · ${TUTORIAL_STEPS[step]}</span><i class="tutorial-bar"><b style="width:${pct}%"></b></i></div><div class="tutorial-instruction" role="status" aria-live="polite" aria-atomic="true"><b class="tutorial-gesture" aria-hidden="true">${prompt.gesture}</b><div><strong>${prompt.title}</strong><p>${prompt.detail}</p>${more}</div></div></section><div id="tutorial-hand-slot">${coach.held(this.local)||coach.stage==='move'||coach.stage==='recover'?tutorialGesture(prompt.gesture):''}</div>`;
      }
      serveNotice.hidden=true;document.getElementById('rally-hint')!.hidden=true;
      document.getElementById('lob-mode')!.hidden=true;
      text('connection','新手教学');
      text('rally-count',coach.stage==='finish'?`赢下一分 · 本轮已失 ${coach.finishLost} 分`:`操作入门 · 第 ${Math.min(coach.progress+1,7)} 步`);
      const miss=coach.retryNoticeShown&&coach.lastMiss?coach.lastMiss:null;
      this.view?.showMissMarker?.(miss);
      // While showing a miss, the coach card moves to the bottom so the far court (and the red ring) stays visible.
      document.querySelector('.tutorial-coach')?.classList.toggle('docked-low',!!miss);
      if(coach.stage==='finish'){serveNotice.hidden=s.phase!=='serve';document.getElementById('lob-mode')!.hidden=true;}
      this.controls.enabled=!coach.completed&&!this.help&&!this.intro&&!this.practicePaused&&!this.quitConfirm;
    }
  }
  /** G2: a short, coloured grade bubble per graded local stroke; once per flight. */
  private timingFeedback(s:MatchState,me:Seat){
    const b=s.ball,el=document.getElementById('timing-bubble');
    if(!el||s.phase!=='rally'||b.hitter!==me||!b.timing||s.rally===this.lastTiming)return;
    this.lastTiming=s.rally;
    el.textContent=TIMING_LABEL[b.timing];el.dataset.grade=b.timing;
    el.classList.remove('visible');void el.offsetWidth;el.classList.add('visible');
    if(b.timing==='perfect')this.audio.play('perfect');
  }
  private frame=(now:number)=>this.advanceFrame(now);
  private advanceFrame(now:number){
    const frameMs=now-this.lastFrame,dt=Math.min(frameMs/1000,.08);this.lastFrame=now;
    this.view.recordFrame(frameMs,!document.hidden);
    const active=this.screen==='playing'||this.screen==='result';
    const preview=!this.net&&!active;
    if(!this.net&&!preview){
      const training=this.screen==='playing';
      if(!(training&&(this.help||this.intro||this.practicePaused||this.quitConfirm||document.hidden))){
        this.accumulator+=dt;
        while(this.accumulator>=1/60){
          if(training&&this.tutorial){
            if(this.tutorial.held(this.local)){this.accumulator=0;break;}
            this.tutorial.step(this.local,1/60);this.accumulator-=1/60;
            if(this.tutorial.completed){this.completeTutorial();break;}
            continue;
          }
          if(this.screen!=='result')driveAI(this.local,1,training?this.difficulty:'standard',{openness:training?this.openness:0});
          if(training)this.practiceReview?.observe(this.local.state);
          this.local.step(1/60);this.accumulator-=1/60;
          if(training)this.practiceReview?.observe(this.local.state);
        }
      }
      if(this.local.state.phase==='over'&&this.screen==='playing'&&this.tutorial&&!this.tutorial.completed){
        this.local.dispose();this.local=new Match([this.characterId,this.opponentId],Math.random,{surface:this.surface});
        this.tutorial.retry();this.accumulator=0;
      }
      else if(this.local.state.phase==='over'&&this.screen==='playing'){
        if(this.practiceReview&&this.practiceReview.goal!=='free'){
          const key=practiceBestKey(this.surface,this.difficulty,this.characterId,this.opponentId,this.practiceReview.goal);
          this.practiceSaved=savePracticeBest(key,this.practiceReview.value);
          this.practiceBest=Math.max(readPracticeBest(key),this.practiceReview.value);
        }
        if(this.practiceReview){
          const won=this.local.state.winner===0;
          if(this.difficulty==='relaxed')recordPracticeResult(won);
          this.rallyRecord=saveRallyBest(rallyBestKey(this.surface,this.difficulty,this.characterId,this.opponentId),this.local.state.maxRally);
        }
        this.screen='result';this.help=false;this.quitConfirm=false;this.practicePaused=false;this.renderScreen();
      }
      else if(this.local.state.phase==='over'&&!active){this.local.dispose();this.local=new Match([this.characterId,this.opponentId],Math.random,{surface:this.room?.surface??this.surface});}
    }
    let state=this.remote??this.local.state;
    if(preview){
      this.homePractice??=new HomePractice();
      state=this.homePractice.sample(document.hidden?0:dt,this.characterId,this.room?.surface??this.surface);
    }
    if(this.remote){
      this.drawState=this.playback.sample(now,this.paused||!this.connected)??structuredClone(this.remote);
      const draw=this.drawState;
      if(state.rescueWindow)this.predictedMove=null;
      if(this.predictedMove&&now<this.predictedMove.until&&!this.paused&&this.connected&&state.phase==='rally'&&!state.rescueWindow){
        draw.players[this.seat].tx=this.predictedMove.x;draw.players[this.seat].tz=this.predictedMove.z;
      }
      state=draw;
    }
    this.view.render(state,dt,preview?state:this.remote??this.local.state);
    if(this.tutorial&&this.screen==='playing'){
      const hand=document.querySelector<HTMLElement>('#tutorial-hand-slot .tutorial-hand');
      const target=this.tutorial.movementTarget(this.local);
      if(hand&&target){
        const point=this.view.screenPoint(target.x,target.z);
        hand.style.left=`${Math.max(30,Math.min(innerWidth-30,point.x))}px`;
        hand.style.top=`${Math.max(240,Math.min(innerHeight-75,point.y))}px`;
      }
    }
    const actual=state;
    if(this.lastEvent!==actual.eventId&&active){
      this.lastEvent=actual.eventId;
      if((actual.event==='落地'||actual.event==='切削弹跳'))this.audio.play('bounce');
      else if(actual.phase==='point'||actual.phase==='over')this.audio.play('point');
      else if(actual.phase==='rally'&&actual.event!=='滑动回击'&&actual.event!=='未及时回击')this.audio.play('hit');
    }
    if(now-this.lastHud>90){this.updateHud();this.lastHud=now;}
    requestAnimationFrame(this.frame);
  }
  private introPanel(){return `<div class="overlay intro-overlay" role="dialog" aria-modal="true" aria-labelledby="intro-title"><section class="panel intro-panel">
    <div class="panel-top"><span>FIRST TIME ON COURT · 操作入门</span><button class="icon-button" data-action="close-intro" aria-label="进入人机实操">×</button></div>
    <h2 id="intro-title">跟着手势，赢下第一分。</h2><p>先调整发球站位并发球，再普通接球、跑动回位、接第二球，最后学习切削。</p>
    <div class="intro-gestures">
      <div class="intro-gesture"><div class="gesture-visual tap-visual" aria-hidden="true"><i></i><b>点</b></div><div><strong>轻点球场 · 移动</strong><span>点一下想去的位置，球员会自动跑过去。发球抛球后站位会锁定。</span></div></div>
      <div class="intro-gesture"><div class="gesture-visual swipe-visual" aria-hidden="true"><b>↑</b></div><div><strong>向上滑动 · 回球</strong><span>普通回球和发球：滑动方向就是出球方向。向左上划，球就向左上飞。</span></div></div>
      <div class="intro-gesture"><div class="gesture-visual swipe-visual" aria-hidden="true"><b>↓</b></div><div><strong>向下滑动 · 切削</strong><span>切削：出球方向与滑动方向相反！向下划，球向上飞；向右下划，球向左上飞。不需要长按。</span></div></div>
    </div>
    <p class="intro-note"><b>距离与速度</b>：${TUTORIAL_PACE_HINT}</p>
    <p class="intro-note">球场上会有手指动画示范点按和滑动。接球失败就重试当前来球，不回到发球。完成切削后和放慢的陪练真打，赢下一分即通过。</p>
    <button class="primary" data-action="close-intro">选陪练，开始实操 →</button>
  </section></div>`;}
}
