/** Finger and trail stay above the canvas but never intercept real pointer input. */
export function tutorialGesture(gesture:string){
  const kind=gesture==='点'?'tap':gesture==='↓'?'down':gesture==='↖'?'up-left':gesture==='↗'?'up-right':'up';
  if(!['点','↓','↑','↖','↗'].includes(gesture))return '';
  const outgoing=gesture==='↓'?'↑':gesture;
  const direction=kind==='tap'?'':`<div class="tutorial-outgoing" data-direction="${outgoing}"><svg class="outgoing-arrow" viewBox="0 0 40 100"><path d="M20 90V12M7 26L20 12L33 26" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>出球 ${outgoing}<small>${gesture==='↓'?'与滑动反向':'与滑动同向'}</small></span></div>`;
  return `<div class="tutorial-hand ${kind}" aria-hidden="true"><i class="hand-trail"></i><i class="hand-ripple"></i><svg class="hand-finger" viewBox="0 0 48 56"><path d="M18 30V8a5 5 0 0 1 10 0v17c1-5 8-5 9 0 5-2 9 1 9 6v9c0 8-5 13-12 13H23c-5 0-8-3-11-7L3 32c-3-5 3-10 7-6l8 9Z" fill="#fff8df" stroke="#244d40" stroke-width="2.5" stroke-linejoin="round"/></svg><span>${kind==='tap'?'点这里':`滑动 ${gesture}`}</span>${direction}</div>`;
}
