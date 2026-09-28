import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPreference,writePreference} from '../src/ui/preferences.js';
import {readSeat,saveSeat,clearSeat} from '../src/network/session.js';

test('denied tab storage leaves startup recovery optional and cleanup safe',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),warn=console.warn;
 console.warn=()=>{};
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw Error('SecurityError');}});
 try{
  assert.equal(readSeat(),null);assert.equal(saveSeat('test'),false);
  assert.doesNotThrow(clearSeat);
 }finally{
  console.warn=warn;
  if(descriptor)Object.defineProperty(globalThis,'sessionStorage',descriptor);
  else Reflect.deleteProperty(globalThis,'sessionStorage');
 }
});

test('blocked browser storage does not prevent startup reads or session-only choices',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const warn=console.warn,errors:unknown[][]=[];
 console.warn=(...args)=>{errors.push(args);};
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('SecurityError');}});
 try{
  assert.equal(readPreference('rally-character'),null);
  assert.equal(readPreference('rally-muted'),null);
  assert.equal(writePreference('rally-character','wuming'),false);
  assert.equal(errors.length,3);
 }finally{
  console.warn=warn;
  if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);
  else Reflect.deleteProperty(globalThis,'localStorage');
 }
});
test('normal browser preferences survive roundtrip unchanged',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}}});
 try{assert.equal(writePreference('rally-character','wuming'),true);assert.equal(readPreference('rally-character'),'wuming');}
 finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');}
});
