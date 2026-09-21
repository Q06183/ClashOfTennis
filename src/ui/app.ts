import { Match } from '../simulation/match.js';
import { driveAI } from '../simulation/ai.js';
import { other, side, type Input, type MatchState, type RoomView, type Seat, type Shot } from '../simulation/types.js';
import { CourtView } from '../render/view.js';
import { Controls } from '../input/controls.js';
import { NetworkClient } from '../network/client.js';
import { CourtAudio } from './audio.js';

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type Screen='home'|'join'|'setup'|'room'|'playing'|'result';
const brand='<div class="brand"><img src="/icon.svg" alt=""/><div>Rally Club<small>好友网球俱乐部</small></div></div>';
const close='<button class="icon-button" data-action="back" aria-label="返回">×</button>';

export class App {
  private ui=document.querySelector<HTMLDivElement>('#ui')!;
  private view:CourtView;
  private controls:Controls;
  private audio=new CourtAudio();
  private screen:Screen='home';
  private local=new Match();
  private net:NetworkClient|null=null;
  private remote:MatchState|null=null;
  private drawState:MatchState|null=null;
  private room:RoomView|null=null;
  private seat:Seat=0;
  private name=localStorage.getItem('rally-name')||'球友';
  private difficulty:'relaxed'|'standard'='relaxed';
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
    this.controls=new Controls(this.view.renderer.domElement,(x,y)=>this.view.courtPoint(x,y),i=>this.input(i),(s,x,y,end)=>this.feedback(s,x,y,end),()=>this.audio.unlock(),
      (shot,dx,dy)=>this.view.aimShot(shot,(this.drawState??this.remote??this.local.state).ball,dx,dy));
    this.ui.addEventListener('click',e=>{
      const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if(button&&!button.disabled){this.audio.unlock();void this.action(button.dataset.action!);}
    });
    this.ui.addEventListener('input',e=>{
      const input=e.target as HTMLInputElement;
      if(input.id==='nickname'){this.name=input.value.trim().slice(0,16)||'球友';localStorage.setItem('rally-name',this.name);}
      if(input.id==='room-input'){input.value=input.value.replace(/\D/g,'').slice(0,6);this.code=input.value;}
    });
    this.ui.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.target as HTMLElement).id==='room-input')void this.action('join-submit');});
    const invite=new URL(location.href).searchParams.get('room');
    if(invite&&/^\d{6}$/.test(invite)){this.code=invite;this.screen='join';}
    this.renderScreen();
    document.querySelector('#boot')?.classList.add('hide');
    requestAnimationFrame(this.frame);
    // Refresh recovery is bound to this tab's previous seat, never the invite link.
    const stored=sessionStorage.getItem('rally-seat');
    if(stored){try{const c=JSON.parse(stored);if(c.code&&c.token)this.connect({type:'resume',...c});}catch{sessionStorage.removeItem('rally-seat');}}
  }
  private toast(message:string){
    const el=document.querySelector<HTMLElement>('#toast')!;el.textContent=message;el.classList.add('visible');
    if(this.toastTimer)clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);
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
    el.querySelector('span')!.textContent=shot.lob?'高吊球':shot.power>.7?'强力击球':shot.depth<.28?'短球':'稳稳回球';
    (el.querySelector('i') as HTMLElement).style.transform=`scaleX(${Math.max(.1,shot.power)})`;
    if(end)this.feedbackTimer=setTimeout(()=>el.style.display='none',550);
  }
  private async action(action:string){
    if(action==='practice'){this.screen='setup';this.renderScreen();}
    else if(action==='start-practice'){
      this.net?.close();this.net=null;this.remote=null;this.room=null;this.local.dispose();this.local=new Match();
      this.networkError='';
      this.seat=0;this.paused=false;this.connected=true;this.screen='playing';this.lastEvent=-1;this.accumulator=0;
      this.help=!localStorage.getItem('rally-tutorial');this.renderScreen();
    }
    else if(action==='create'&&!this.busy)this.connect({type:'create',name:this.name});
    else if(action==='join'){this.screen='join';this.renderScreen();}
    else if(action==='join-submit'&&!this.busy){
      if(!/^\d{6}$/.test(this.code)){this.toast('请输入朋友的 6 位房间号');return;}
      this.connect({type:'join',code:this.code,name:this.name});
    }
    else if(action==='ready')this.net?.send({type:'ready'});
    else if(action==='copy-code')await this.copy(this.room?.code??'');
    else if(action==='copy-link')await this.copy(`${location.origin}/?room=${this.room?.code}`);
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
    else if(action==='close-help'){this.help=false;localStorage.setItem('rally-tutorial','1');this.accumulator=0;this.renderScreen();}
    else if(action==='mute'){this.audio.toggle();this.renderScreen();}
    else if(action==='relaxed'||action==='standard'){this.difficulty=action;this.renderScreen();}
  }
  private async copy(value:string){
    try{await navigator.clipboard.writeText(value);this.toast('已复制，发给朋友就能加入');}
    catch{
      const panel=this.ui.querySelector('.panel');if(!panel)return;
      let input=panel.querySelector<HTMLInputElement>('.copy-fallback');
      if(!input){input=document.createElement('input');input.className='copy-fallback';input.readOnly=true;input.setAttribute('aria-label','手动复制邀请内容');panel.append(input);}
      input.value=value;input.select();this.toast('长按或选中文本，手动复制');
    }
  }
  private connect(action:unknown){
    this.networkError='';
    this.net?.close();this.remote=null;this.drawState=null;this.busy=true;this.status='正在连接球场…';this.renderScreen();
    this.net=new NetworkClient({
      welcome:c=>{this.seat=c.seat;this.busy=false;this.connected=true;this.screen='room';this.lastEvent=-1;this.renderScreen();},
      room:r=>{
        this.room=r;this.paused=r.paused;
        if(this.screen==='room'||this.screen==='result')this.renderScreen();
      },
      state:(s,paused)=>{
        this.remote=s;this.paused=paused;
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
    <button class="practice" data-action="practice">先热热身 · 单人练习 <span>→</span></button>${this.networkError?`<div class="error-inline" role="alert" style="grid-column:1/-1">${escape(this.networkError)}</div>`:''}</div></main>
    <aside class="court-tag"><strong>01</strong><span>THE GARDEN COURT<br/>花园球场 · 硬地</span></aside>
    <footer class="home-footer"><b>点按跑位 / 滑动击球 / 好友对战</b><span>NO PRESSURE. JUST PLAY.</span></footer></div>`;}
  private panel(content:string){return `<div class="overlay"><section class="panel">${content}</section></div>`;}
  private roomPanel(){
    const r=this.room;if(!r)return this.panel(`<h2>正在打开球场</h2><p>${escape(this.status)}</p>${close}`);
    const me=r.seats[this.seat],both=r.seats.every(p=>p?.connected);
    return this.panel(`<div class="panel-top"><span>FRIENDS ON COURT</span>${close}</div><h2>球场已为你留好。</h2><p>把邀请链接发给朋友，准备好就开打。</p>
      <div class="room-code" aria-label="房间号">${r.code}</div><div class="room-caption">私人球场 · 6 位房间号</div>
      <div class="copy-row"><button class="secondary" data-action="copy-code">复制房间号</button><button class="secondary" data-action="copy-link">复制邀请链接 ↗</button></div>
      <div class="seats">${r.seats.map((p,i)=>`<div class="seat"><div class="avatar ${i?'orange':''}">${p?escape(p.name.slice(0,1)):'＋'}</div><div class="seat-name">${p?escape(p.name):'等待朋友加入'}${i===this.seat?' · 你':''}</div><span class="seat-status">${p?p.connected?p.ready?'已准备':'已就位':'重连中':'空位'}</span></div>`).join('')}</div>
      <button class="primary" data-action="ready" ${!both||me?.ready?'disabled':''}>${!both?'等朋友一起上场':me?.ready?'已准备，等待朋友…':'准备开赛 →'}</button>
      <p class="small-note">7 分制 · 领先 2 分获胜 · 双方能力相同</p><div class="status-line">${escape(this.status)}</div>`);
  }
  private playing(){return `<div class="match-top"><button class="icon-button" data-action="quit" aria-label="退出比赛">‹</button><div class="match-label">GARDEN COURT <span class="connection" id="connection"></span></div><button class="icon-button" data-action="mute" aria-label="${this.audio.muted?'开启声音':'关闭声音'}">${this.audio.muted?'♪̸':'♪'}</button></div>
    <div class="scoreboard"><div class="score-player"><div class="score-name" id="name-me"></div><div class="score-value" id="score-me">0</div><div class="stamina"><i id="stamina-me"></i></div></div><div class="score-divider">vs</div><div class="score-player"><div class="score-name" id="name-them"></div><div class="score-value" id="score-them">0</div><div class="stamina"><i id="stamina-them"></i></div></div></div>
    <div class="rally-count" id="rally-count">FIRST TO 7</div><div id="point-slot"></div><div id="reconnect-slot"></div>
    <div class="match-bottom"><div class="hint"><strong id="match-hint">斜向滑动，发进对角发球区</strong><small id="match-subhint">快滑打强球 · 长滑打深球 · 轻点地面跑位</small></div><button class="help-button" data-action="help" aria-label="查看操作帮助">?</button></div>`;}
  private helpPanel(){return this.panel(`<div class="panel-top"><span>JUST THREE MOVES</span><button class="icon-button" data-action="close-help" aria-label="关闭帮助">×</button></div><h2>好球，从这一拍开始。</h2><p>${this.net?'线上对局仍在进行，请尽快回到球场。':'先记住三个动作，马上就能打出回合。'}</p>
    <div class="tutorial-steps"><div class="tutorial-step"><b>1</b><div><strong>轻点球场，移动到位</strong><span>人物会辅助追球。回球后，点地面选择你的下一个站位。</span></div></div>
    <div class="tutorial-step"><b>2</b><div><strong>向上滑动，把球打回去</strong><span>从屏幕下方向上滑。球从触球点沿滑动方向飞出。发球请斜向对角发球区。滑得越长，打得越深；滑得越快，力量越大。可在来球接近时提前滑动。</span></div></div>
    <div class="tutorial-step"><b>3</b><div><strong>变换节奏，调动对手</strong><span>短滑放短球；按住约半秒再滑打高吊。靠近球网可截击，接发球必须等球落地。</span></div></div></div>
    <button class="primary" data-action="close-help">知道了，上场 →</button><p class="small-note">先到 7 分且领先 2 分获胜 · 发球限时 12 秒</p>`);}
  private result(){
    const s=this.remote??this.local.state,won=s.winner===this.seat;
    const me=this.room?.seats[this.seat]?.name??this.name,them=this.room?.seats[other(this.seat)]?.name??'练习搭档';
    const ready=this.room?.seats[this.seat]?.ready;
    return this.panel(`<div class="panel-top"><span>THAT WAS A GOOD RALLY</span>${close}</div><div class="panel-heading">${won?'Well played.':'One more?'}</div><h2>${won?'好球，这场属于你。':'再来一场，找回手感。'}</h2><p>${escape(s.event)}</p>
      <div class="result-score">${s.score[this.seat]} <span style="color:#a4af98">:</span> ${s.score[other(this.seat)]}</div><div class="result-names">${escape(me)} &nbsp; / &nbsp; ${escape(them)}</div>
      <div class="result-stats"><div><strong>${s.maxRally}</strong>最长回合</div><div><strong>${Math.floor(s.time/60)}:${String(Math.floor(s.time%60)).padStart(2,'0')}</strong>对局时间</div></div>
      <button class="primary" data-action="rematch" ${ready?'disabled':''}>${ready?'已准备，等待朋友…':'再来一场 ↗'}</button><button class="secondary" data-action="back">回到首页</button>`);
  }
  private renderScreen(){
    this.view.setMode(this.screen==='playing'||this.screen==='result'?'match':'home',this.seat);
    this.controls.enabled=this.screen==='playing'&&!this.help;
    if(this.screen==='home')this.ui.innerHTML=this.home();
    else if(this.screen==='room')this.ui.innerHTML=this.roomPanel();
    else if(this.screen==='join')this.ui.innerHTML=this.panel(`<div class="panel-top"><span>YOUR FRIEND IS WAITING</span>${close}</div><h2>加入朋友的球场。</h2><p>输入 6 位房间号，下一场好球等你来。</p><label class="name-label" for="nickname">昵称<input id="nickname" value="${escape(this.name)}" maxlength="16"/></label><input id="room-input" class="code-input" aria-label="六位房间号" placeholder="000000" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" value="${escape(this.code)}"/><button class="primary" data-action="join-submit" ${this.busy?'disabled':''}>${this.busy?'正在加入…':'加入球场 →'}</button><div class="status-line">${escape(this.status)}</div>`);
    else if(this.screen==='setup')this.ui.innerHTML=this.panel(`<div class="panel-top"><span>TAKE A FEW PRACTICE SWINGS</span>${close}</div><div class="panel-heading">Warm up.</div><h2>先和搭档热热身。</h2><p>同一片球场，同样的操作。找找击球节奏，再叫上朋友。</p><div class="select-row"><button class="${this.difficulty==='relaxed'?'selected':''}" data-action="relaxed">轻松练习</button><button class="${this.difficulty==='standard'?'selected':''}" data-action="standard">认真对打</button></div><button class="primary" data-action="start-practice">开始练习 →</button><p class="small-note">点按移动 · 滑动击球 · 7 分制</p>`);
    else if(this.screen==='playing'){this.ui.innerHTML=this.playing()+(this.help?this.helpPanel():'');this.lastPhase='';this.updateHud();}
    else this.ui.innerHTML=this.result();
  }
  private updateHud(){
    if(this.screen!=='playing')return;
    const s=this.remote??this.local.state,me=this.seat,them=other(me);
    const text=(id:string,value:string)=>{const el=document.getElementById(id);if(el&&el.textContent!==value)el.textContent=value;};
    text('name-me',`${s.server===me?'● ':''}${this.room?.seats[me]?.name??this.name} · 你`);
    text('name-them',`${s.server===them?'● ':''}${this.room?.seats[them]?.name??'练习搭档'}`);
    text('score-me',String(s.score[me]));text('score-them',String(s.score[them]));
    document.getElementById('stamina-me')!.style.width=`${s.players[me].stamina*100}%`;
    document.getElementById('stamina-them')!.style.width=`${s.players[them].stamina*100}%`;
    text('connection',this.net?`${this.latency||'—'} ms`:'单人练习');
    text('rally-count',s.rally>1?`${s.rally} 拍回合  /  RALLY`:'FIRST TO 7 · 领先两分');
    text('match-hint',s.phase==='serve'?(s.server===me?(s.fault?'二发 · 轻一点，滑进对角发球区':'斜向滑动，发进对角发球区'):'对手发球 · 准备接球'):s.phase==='point'?`${s.event} · ${s.lastPoint===me?'你得分':'下一分加油'}`:s.ball.hitter===me?'好球！轻点球场，调整下一拍站位':'来球了，向上滑动回击');
    text('match-subhint',s.phase==='rally'?'快滑更有力 · 长滑更深 · 按住半秒再滑打高吊':'快滑打强球 · 长滑打深球 · 轻点地面跑位');
    const phaseKey=`${s.phase}-${s.eventId}`;
    if(this.lastPhase!==phaseKey){
      this.lastPhase=phaseKey;document.getElementById('point-slot')!.innerHTML=s.phase==='point'?`<div class="point-banner"><strong>${s.fault?'Second serve':s.lastPoint===me?'Your point':'Good try'}</strong><span>${escape(s.event)}</span></div>`:'';
    }
    const reconnect=document.getElementById('reconnect-slot')!;
    const warning=this.paused?'朋友暂时断线 · 比赛已暂停，等待重连':!this.connected?'网络暂时断开 · 正在恢复连接':'';
    if(reconnect.textContent!==warning)reconnect.innerHTML=warning?`<div class="reconnect-banner">${warning}</div>`:'';
  }
  private frame=(now:number)=>{
    const dt=Math.min((now-this.lastFrame)/1000,.08);this.lastFrame=now;
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
      if(!this.drawState||this.drawState.phase!==state.phase||this.drawState.ball.hitter!==state.ball.hitter)this.drawState=structuredClone(state);
      const draw=this.drawState,alpha=1-Math.exp(-dt*24);
      for(const seat of [0,1] as Seat[]){
        const p=state.players[seat],d=draw.players[seat];
        const x=d.x+(p.x-d.x)*alpha,z=d.z+(p.z-d.z)*alpha;
        Object.assign(d,p,{x,z});
        if(seat===this.seat&&this.predictedMove&&now<this.predictedMove.until&&!this.paused&&this.connected&&state.phase==='rally'){
          const target=this.predictedMove,dx=target.x-d.x,dz=target.z-d.z,dist=Math.hypot(dx,dz);
          if(dist>.1&&Math.hypot(d.x-p.x,d.z-p.z)<.65){const step=Math.min(dist,dt*5);d.x+=dx/dist*step;d.z+=dz/dist*step;}
        }
      }
      const x=draw.ball.x+(state.ball.x-draw.ball.x)*alpha,y=draw.ball.y+(state.ball.y-draw.ball.y)*alpha,z=draw.ball.z+(state.ball.z-draw.ball.z)*alpha;
      Object.assign(draw.ball,state.ball,{x,y,z});Object.assign(draw,{time:state.time,phase:state.phase});state=draw;
    }
    this.view.render(state,dt,this.remote??this.local.state);
    const actual=this.remote??this.local.state;
    if(this.lastEvent!==actual.eventId&&active){
      this.lastEvent=actual.eventId;
      if(actual.event==='落地')this.audio.play('bounce');
      else if(actual.phase==='point'||actual.phase==='over')this.audio.play('point');
      else if(actual.phase==='rally')this.audio.play('hit');
    }
    if(now-this.lastHud>90){this.updateHud();this.lastHud=now;}
    requestAnimationFrame(this.frame);
  };
}
