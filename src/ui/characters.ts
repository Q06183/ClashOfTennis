import {CHARACTERS,getCharacter,characterEffects} from '../simulation/characters.js';
export function characterPicker(selected:string,opponent:boolean){
 const c=getCharacter(selected),e=characterEffects(c.id),pct=(n:number)=>`${n>=1?'+':''}${Math.round((n-1)*1000)/10}%`;
 const stats=[['移动','movement'],['正手','forehand'],['反手','backhand'],['截击','volley'],['发球','serve'],['体力','stamina']] as const;
 return `<div class="overlay"><section class="panel character-panel"><div class="panel-top"><span>${opponent?'练习对手':'选择你的球员'}</span><button class="icon-button" data-action="close-characters" aria-label="返回角色选择前的页面">×</button></div><h2>找到你的打法。</h2><p>六位球员免费使用，各有所长。属性不会改变滑动方向或接球范围。</p>
 <div class="character-grid">${CHARACTERS.map(x=>`<button class="character-card ${x.id===c.id?'selected':''}" style="--character-color:${x.color}" data-action="pick-character-${x.id}" aria-pressed="${x.id===c.id}"><img src="/portraits/${x.id}.png" alt="${x.name}人物外观"/><strong>${x.name}</strong><span>${x.role}</span></button>`).join('')}</div>
 <div class="character-detail" style="--character-color:${c.color}"><h3>${c.name}<span>${c.role}</span></h3><p><b>擅长</b> ${c.strength}<br/><b>短板</b> ${c.weakness}</p><div class="character-stats">${stats.map(([label,key])=>`<div><span>${label}</span><meter min="0" max="100" value="${c.stats[key]}">${c.stats[key]}</meter><b>${c.stats[key]}</b></div>`).join('')}</div>
 <details><summary>这些属性如何影响比赛？</summary><p>相对林岳：移动与起步 ${pct(e.movement)}；正手球速 ${pct(e.forehand)}、反手 ${pct(e.backhand)}、截击 ${pct(e.volley)}、发球 ${pct(e.serve)}；体力消耗 ${pct(e.drain)}、恢复 ${pct(e.recovery)}。击球仍受过网高度和当前体力约束。更强的击球会略多消耗体力。球速档位由你的手势决定。</p></details></div>
 <button class="primary" data-action="close-characters">${opponent?'使用这位练习对手':'使用这位球员'} →</button><p class="small-note">同角色也可对战 · 开赛后锁定选择</p></section></div>`;
}
