import {test} from 'node:test';import assert from 'node:assert/strict';import {Controls} from '../src/input/controls.js';
test('charge, lob selection, cancel, disable and release each have a single input lifecycle',t=>{
 let time=1,id=0;const frames=new Map<number,FrameRequestCallback>(),sent:any[]=[],charges:number[]=[];
 class Element extends EventTarget{classList={add(){}};style={};clientWidth=390;clientHeight=844;setAttribute(){}removeAttribute(){}append(){}remove(){}setPointerCapture(){}}
 for(const key of ['document','requestAnimationFrame','cancelAnimationFrame']){Object.defineProperty(globalThis,key,{value:undefined,writable:true,configurable:true});t.after(()=>{delete (globalThis as any)[key];});}
 t.mock.method(performance,'now',()=>time);t.mock.property(globalThis,'document',{createElementNS:()=>new Element(),body:new Element()} as any);
 t.mock.property(globalThis,'requestAnimationFrame',cb=>{frames.set(++id,cb);return id;});t.mock.property(globalThis,'cancelAnimationFrame',n=>{frames.delete(n);});
 const canvas=new Element(),c=new Controls(canvas as any,()=>({x:1,z:10}),v=>sent.push(v),()=>{},()=>{},s=>s,a=>charges.push(a));c.enabled=true;
 const event=(type:string,x=150,y=500)=>{const e=new Event(type);Object.assign(e,{pointerId:1,clientX:x,clientY:y});canvas.dispatchEvent(e);};
 const tick=(at:number)=>{time=at;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(cb=>cb(at));};
 event('pointerdown');tick(901);assert.equal(charges.at(-1),1);event('pointermove',150,300);time=1100;event('pointerup',150,300);assert.equal(sent.length,1);assert.equal(sent[0].topspin,1);assert.equal(sent[0].lob,false);assert.equal(frames.size,0);
 c.lobMode=true;time=1200;event('pointerdown');time=1500;event('pointermove',150,300);event('pointerup',150,300);assert.equal(sent.at(-1).lob,true);assert.equal(sent.at(-1).topspin,0);assert.equal(c.lobMode,false);
 c.lobMode=true;time=1550;event('pointerdown',150,300);time=1590;event('pointermove',180,500);event('pointerup',180,500);assert.equal(sent.at(-1).slice,true);assert.equal(sent.at(-1).lob,false);assert.equal(c.lobMode,false);
 time=1600;event('pointerdown');event('pointercancel');event('pointerup',150,300);assert.equal(sent.length,3);assert.equal(frames.size,0);
 event('pointerdown');c.lobMode=true;c.enabled=false;event('pointerup',150,300);assert.equal(sent.length,3);assert.equal(c.lobMode,false);assert.equal(frames.size,0);c.dispose();
});
