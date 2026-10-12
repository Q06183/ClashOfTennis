import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {Controls} from '../src/input/controls.js';
import {shotFeedbackLabel,feedbackPosition,pointBanner,playSubhint,movementFeedbackTarget} from '../src/ui/match-feedback.js';
import {containModalFocus} from '../src/ui/modal-focus.js';
import {App} from '../src/ui/app.js';
import {Match} from '../src/simulation/match.js';
import {initPhysics} from '../src/simulation/physics.js';
import {CourtView} from '../src/render/view.js';
import {readFileSync} from 'node:fs';

before(initPhysics);
test('feedback names chosen spin/flight instead of mislabelling a gentle lob as drop',()=>{
  const shot={type:'shot' as const,aim:0,depth:0,power:.12,lob:false};
  assert.match(shotFeedbackLabel(shot,false),/放小球/);
  assert.match(shotFeedbackLabel({...shot,lob:true},false),/高吊/);
  assert.doesNotMatch(shotFeedbackLabel({...shot,lob:true},false),/放小球/);
  assert.match(shotFeedbackLabel({...shot,topspin:1},false),/上旋/);
  assert.match(shotFeedbackLabel({...shot,slice:true},false),/切削/);
  assert.match(shotFeedbackLabel({...shot,slice:true},true),/反向发球/);
});
test('feedback bubbles remain inside phone and short landscape viewports',()=>{
  for(const [w,h] of [[320,568],[390,844],[844,390],[667,320]]){
    for(const x of [0,w/2,w])for(const y of [0,h/2,h]){
      const p=feedbackPosition(x,y,w,h,240,60);
      assert.ok(p.left-120>=8);assert.ok(p.left+120<=w-8);
      assert.ok(p.top-60>=8);assert.ok(p.top<=h-8);
    }
  }
});
test('Chinese point feedback has correct doubles ownership and differentiates first fault and let',()=>{
  const m=new Match(),s=m.state;
  try{
    s.lastPoint=0;s.event='二跳';
    assert.equal(pointBanner(s,2).title,'我方得分');
    assert.equal(pointBanner(s,3).title,'对方得分');
    s.fault=1;s.event='一发下网 · 准备二发';assert.equal(pointBanner(s,0).title,'准备二发');
    s.event='发球擦网 · 重发';assert.equal(pointBanner(s,0).title,'擦网重发');
    s.players[0].shotQueued=true;
    assert.match(playSubhint(s,0,false),/无需重复/);
    s.players[0].totalStamina=.2;assert.match(playSubhint(s,0,false),/体力偏低/);
    assert.match(playSubhint(s,0,true),/高吊/);
  }finally{m.dispose();}
});

test('input rejects right click and secondary fingers, aligns tap deadzone, delays charge and releases capture',t=>{
  let now=1,frame=0;
  const sent:any[]=[],charges:number[]=[],frames=new Map<number,FrameRequestCallback>();
  class Element extends EventTarget{
    classList={add(){}};style={};clientWidth=390;clientHeight=844;
    capture=new Set<number>();released:number[]=[];
    setAttribute(){}removeAttribute(){}append(){}remove(){}
    setPointerCapture(id:number){this.capture.add(id);}
    hasPointerCapture(id:number){return this.capture.has(id);}
    releasePointerCapture(id:number){this.capture.delete(id);this.released.push(id);}
  }
  for(const key of ['document','requestAnimationFrame','cancelAnimationFrame']){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value:undefined,writable:true,configurable:true});
    t.after(()=>descriptor?Object.defineProperty(globalThis,key,descriptor):Reflect.deleteProperty(globalThis,key));
  }
  t.mock.method(performance,'now',()=>now);
  t.mock.property(globalThis,'document',{createElementNS:()=>new Element(),body:new Element()} as any);
  t.mock.property(globalThis,'requestAnimationFrame',cb=>{frames.set(++frame,cb);return frame;});
  t.mock.property(globalThis,'cancelAnimationFrame',id=>frames.delete(id));
  const canvas=new Element(),controls=new Controls(canvas as any,()=>({x:1,z:10}),c=>sent.push(c),()=>{},()=>{},s=>s,n=>charges.push(n));
  controls.enabled=true;
  const event=(type:string,x=150,y=500,id=1,button=0,isPrimary=true)=>{
    const e=new Event(type);Object.assign(e,{pointerId:id,clientX:x,clientY:y,button,isPrimary});canvas.dispatchEvent(e);
  };
  const tick=(time:number)=>{now=time;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(c=>c(now));};
  try{
    event('pointerdown',150,500,1,2);event('pointerup');assert.equal(sent.length,0);
    event('pointerdown',150,500,2,0,false);assert.equal(canvas.capture.size,0);
    event('pointerdown');tick(200);assert.equal(charges.length,0);
    tick(401);assert.ok(charges.length>0);
    event('pointerup');assert.equal(sent.length,0,'charge without swipe cancels without moving');
    assert.deepEqual(canvas.released,[1]);
    now=500;event('pointerdown');event('pointercancel',0,0,2);
    assert.ok(canvas.capture.has(1),'other finger cannot cancel active gesture');
    now=550;event('pointerup',167.7,500);
    assert.equal(sent.length,0,'17.7px invalid sideways swipe exceeds 390px normalized tap slop');
    now=600;event('pointerdown');event('pointerup',165,500);assert.equal(sent[0].type,'move');
    controls.lobMode=true;now=700;event('pointerdown');event('pointercancel');
    assert.equal(controls.lobMode,true,'cancelled gesture does not consume selected lob');
    assert.equal(frames.size,0);assert.equal(canvas.capture.size,0);
  }finally{controls.dispose();}
});

test('camera and sound toggles do not rebuild the live court HUD or clear one-shot lob selection',async()=>{
  let renders=0,updates=0;
  const mute={textContent:'',setAttribute(){}},camera={outerHTML:''};
  const app=Object.assign(Object.create(App.prototype),{
    screen:'playing',hiddenMaster:{reset(){}},controls:{lobMode:true},
    cameraChoice:{toggle(){return {distance:'far',saved:true};},button(){return '<button>远景</button>';}},
    audio:{muted:false,toggle(){this.muted=!this.muted;}},
    view:{setCameraDistance(){}},ui:{querySelector(s:string){return s==='[data-action="mute"]'?mute:camera;}},
    renderScreen(){renders++;},updateHud(){updates++;},toast(){}
  }) as any;
  await app.action('camera-distance');await app.action('mute');
  assert.equal(renders,0);assert.equal(updates,1);assert.ok(app.controls.lobMode);
  assert.match(camera.outerHTML,/远景/);assert.equal(mute.textContent,'♪̸');
});

test('movement feedback is explicit and transient; result body scrolls independently of primary actions',()=>{
  const view=Object.create(CourtView.prototype) as any;
  view.showMoveTarget(2,12);assert.deepEqual(view.moveFeedback,{x:2,z:12,remaining:.9});
  view.clearMoveTarget();assert.equal(view.moveFeedback,null);
  const source=readFileSync('src/render/view.ts','utf8');
  assert.doesNotMatch(source,/this\.marker\.position\.set\(localPlayer\.tx/);
  const css=readFileSync('src/ui/match-design.css','utf8');
  assert.match(css,/\.match-top \.icon-button\{width:44px;height:44px/);
  assert.match(css,/\.result-body\{[^}]*overflow-y:auto/);
  assert.match(css,/\.result-actions\{flex:none/);
  const m=new Match();
  try{
    m.finish(1,'二跳');
    const app=Object.assign(Object.create(App.prototype),{local:m,seat:0,name:'测试',cameraChoice:{},net:null}) as any;
    const html=app.result();assert.match(html,/class="result-body"/);assert.match(html,/class="result-actions"/);
  }finally{m.dispose();}
});

test('tap feedback follows legal movement bounds across seats, ends, service half and live pauses',()=>{
  for(const seat of [0,1,2,3] as const)for(const ends of [0,1] as const){
    const m=new Match(['lin','lin','lin','lin'],Math.random,{mode:'doubles'}),s=m.state;
    try{
      s.ends=ends;s.server=seat;
      for(const score of [[0,0],[1,0]] as [number,number][]){
        s.score=score;
        const command={type:'move' as const,x:-100,z:100};
        const expected=movementFeedbackTarget(s,seat,command)!;
        m.input(seat,command);
        assert.deepEqual(expected,{x:s.players[seat].tx,z:s.players[seat].tz});
      }
      s.phase='rally';const command={type:'move' as const,x:100,z:-100};
      const expected=movementFeedbackTarget(s,seat,command)!;
      m.input(seat,command);assert.deepEqual(expected,{x:s.players[seat].tx,z:s.players[seat].tz});
      s.phase='point';assert.equal(movementFeedbackTarget(s,seat,command),null);
      s.phase='serve';s.players[seat].preparation={stroke:'serve',progress:.3,contact:{x:0,y:2,z:12}};
      assert.equal(movementFeedbackTarget(s,seat,command),null);
    }finally{m.dispose();}
  }
});

test('modal Tab wraps through visible controls and excludes inert HUD or hidden details',t=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{activeElement:null}});
  t.after(()=>descriptor?Object.defineProperty(globalThis,'document',descriptor):Reflect.deleteProperty(globalThis,'document'));
  let focused='',prevented=0;
  const control=(name:string,visible=true,inert=false)=>({
    closest(){return inert?{}:null;},getClientRects(){return visible?[{}]:[];},
    focus(){focused=name;}
  });
  const first=control('first'),last=control('last');
  const dialog={querySelectorAll:()=>[first,control('hidden',false),control('inert',true,true),last],contains:(value:unknown)=>value===first||value===last};
  const root={querySelectorAll:()=>[dialog]} as any;
  const event=(shiftKey:boolean)=>({key:'Tab',shiftKey,preventDefault(){prevented++;}} as KeyboardEvent);
  (document as any).activeElement=last;containModalFocus(event(false),root);assert.equal(focused,'first');
  (document as any).activeElement=first;containModalFocus(event(true),root);assert.equal(focused,'last');
  (document as any).activeElement=null;containModalFocus(event(false),root);assert.equal(focused,'first');
  assert.equal(prevented,3);
});
