import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CameraChoice} from '../src/ui/camera-choice.js';
import {App} from '../src/ui/app.js';

test('camera picker defaults near, persists far and switches through the actual App action',async t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}}});
 t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');});
 const cameraChoice=new CameraChoice();assert.equal(cameraChoice.distance,'near');
 assert.match(cameraChoice.button(),/当前近视角，切换为远视角/);
 const modes:string[]=[];
 const app=Object.assign(Object.create(App.prototype),{cameraChoice,hiddenMaster:{reset(){}},view:{setCameraDistance:(m:string)=>modes.push(m)},renderScreen(){},toast(){}});
 await app.action('camera-distance');assert.deepEqual(modes,['far']);
 assert.equal(new CameraChoice().distance,'far');assert.match(cameraChoice.button(),/当前远视角，切换为近视角/);
 await app.action('camera-distance');assert.deepEqual(modes,['far','near']);
 data.set('rally-camera-distance','garbage');assert.equal(new CameraChoice().distance,'near');
});
test('camera settings failure still permits changing distance in this session',t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),warn=console.warn;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('blocked');}});console.warn=()=>{};
 t.after(()=>{console.warn=warn;if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');});
 const choice=new CameraChoice();assert.deepEqual(choice.toggle(),{distance:'far',saved:false});
 assert.match(choice.button(),/远景/);
});
