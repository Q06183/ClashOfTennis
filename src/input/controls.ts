import {topspinCharge} from '../simulation/flight.js';
import { interpretGesture } from './gesture.js';
import type { Input, Shot } from '../simulation/types.js';
import { SwipeTrail } from './swipe-trail.js';
export class Controls {
  private start:{id:number;x:number;y:number;time:number;firstMove:number}|null=null;
  private active=false;
  private chargeFrame=0;
  lobMode=false;
  private trail=new SwipeTrail();
  get enabled(){return this.active;}
  set enabled(value:boolean){this.active=value;if(!value){this.lobMode=false;if(this.start)this.cancel();}}
  constructor(private canvas:HTMLCanvasElement,private movePoint:(x:number,y:number)=>{x:number;z:number}|null,
    private send:(i:Input)=>void,private feedback:(shot:Shot|null,x:number,y:number,end:boolean)=>void,private unlock:()=>void,
    private aimShot:(shot:Shot,dx:number,dy:number)=>Shot,private charge:(amount:number,x:number,y:number)=>void=()=>{}){
    canvas.addEventListener('pointerdown',this.down);
    canvas.addEventListener('pointermove',this.move);
    canvas.addEventListener('pointerup',this.up);
    canvas.addEventListener('pointercancel',this.cancel);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
  }
  private down=(e:PointerEvent)=>{
    if(!this.enabled||this.start)return;
    e.preventDefault();this.unlock();this.canvas.setPointerCapture(e.pointerId);
    this.start={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),firstMove:0};
    this.trail.begin(e.clientX,e.clientY);this.chargeFrame=requestAnimationFrame(this.tickCharge);
  };
  private tickCharge=()=>{
    const s=this.start;if(!s)return;
    if(!s.firstMove&&!this.lobMode){const hold=performance.now()-s.time;if(hold>=150)this.charge(topspinCharge(hold),s.x,s.y);}
    this.chargeFrame=requestAnimationFrame(this.tickCharge);
  };
  private gesture(e:PointerEvent){
    const s=this.start!;const shot=interpretGesture({dx:e.clientX-s.x,dy:e.clientY-s.y,duration:performance.now()-s.time,
      hold:s.firstMove?s.firstMove-s.time:performance.now()-s.time,width:this.canvas.clientWidth,height:this.canvas.clientHeight});
    return shot&&this.lobMode&&!shot.slice?{...shot,lob:true,topspin:0,critical:false}:shot;
  }
  private move=(e:PointerEvent)=>{
    const s=this.start;if(!s||e.pointerId!==s.id)return;
    if(!s.firstMove&&Math.hypot(e.clientX-s.x,e.clientY-s.y)>12)s.firstMove=performance.now();
    this.trail.move(e.clientX,e.clientY);
    this.feedback(this.gesture(e),e.clientX,e.clientY,false);
  };
  private up=(e:PointerEvent)=>{
    const s=this.start;if(!s||e.pointerId!==s.id)return;
    const shot=this.gesture(e);
    if(shot){this.send(this.aimShot(shot,e.clientX-s.x,e.clientY-s.y));this.lobMode=false;}
    else if(Math.hypot(e.clientX-s.x,e.clientY-s.y)<18){const p=this.movePoint(e.clientX,e.clientY);if(p)this.send({type:'move',...p});}
    this.feedback(shot,e.clientX,e.clientY,true);this.trail.end();this.start=null;cancelAnimationFrame(this.chargeFrame);
  };
  private cancel=()=>{cancelAnimationFrame(this.chargeFrame);this.start=null;this.trail.clear();this.feedback(null,0,0,true);};
  dispose(){this.cancel();this.trail.dispose();this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.cancel);}
}
