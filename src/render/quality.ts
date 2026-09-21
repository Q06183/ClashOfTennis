export type QualityLevel='low'|'balanced'|'high';
export const QUALITY={
 low:{maxDpr:1,shadowSize:0,label:'流畅'},
 balanced:{maxDpr:1.25,shadowSize:512,label:'均衡'},
 high:{maxDpr:1.8,shadowSize:1024,label:'清晰'},
} as const;
const levels:QualityLevel[]=['low','balanced','high'];
/** Rendering only: use sustained visible frame intervals, never alter simulation. */
export class FrameQuality {
 level:QualityLevel;
 fps=0;
 private ceiling:number;
 private elapsed=0;
 private frames=0;
 private slow=0;
 private stable=0;
 private settle=2000;
 constructor(mobile:boolean){this.ceiling=mobile?1:2;this.level=levels[this.ceiling];}
 sample(ms:number,visible=true):QualityLevel|null{
  if(!visible||!Number.isFinite(ms)||ms<=0){this.elapsed=0;this.frames=0;this.slow=0;this.stable=0;this.settle=2000;return null;}
  if(this.settle>0){this.settle-=ms;return null;}
  this.elapsed+=ms;this.frames++;if(ms>24)this.slow++;
  if(this.elapsed<2500)return null;
  const mean=this.elapsed/this.frames,slow=this.slow/this.frames,index=levels.indexOf(this.level);
  this.fps=Math.round(1000/mean);
  this.stable=mean<18&&slow<.05?this.stable+this.elapsed:0;
  this.elapsed=0;this.frames=0;this.slow=0;
  const next=mean>24&&slow>.25&&index>0?index-1:this.stable>=30000&&index<this.ceiling?index+1:index;
  if(next===index)return null;
  this.level=levels[next];this.stable=0;this.settle=3000;return this.level;
 }
}
