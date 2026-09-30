import {SURFACES,surfaceProfile,type SurfaceId} from '../simulation/surfaces.js';
import {getCharacter} from '../simulation/characters.js';
import {teamOf,type RoomView,type Seat} from '../simulation/types.js';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function courtButton(surface:SurfaceId,locked=false){
 const p=surfaceProfile(surface);
 return `<button class="surface-current" data-action="surfaces" ${locked?'disabled':''} aria-label="选择场地：${p.name}"><i style="background:#${p.colors[2].toString(16)}"></i><span>${p.title} · ${p.name}</span><b>${locked?'已锁定':'切换 ›'}</b></button>`;
}
export function surfaceChoices(selected:SurfaceId){
 return Object.values(SURFACES).map(p=>`<button class="surface-option ${selected===p.id?'selected':''}" data-action="surface-${p.id}" aria-pressed="${selected===p.id}"><i class="surface-swatch ${p.id}" style="--surface:#${p.colors[2].toString(16)}"></i><span><strong>${p.title} · ${p.name}</strong><small>${p.description}</small></span><b>${selected===p.id?'✓':'›'}</b></button>`).join('');
}
export function roomSeats(r:RoomView,seat:Seat){
 const host=r.host===seat,indices=r.mode==='doubles'?[[0,2],[1,3]]:[[0],[1]];
 return `<div class="team-lobby">${indices.map((ids,team)=>`<section class="lobby-team team-${team}"><h3>${r.mode==='doubles'?`${team===0?'A':'B'} 队`:'球员'}${teamOf(seat)===team?' · 你的队伍':''}</h3>${ids.map(i=>{
  const p=r.seats[i];
  return `<div class="lobby-slot"><div class="slot-heading"><strong>${p?escape(p.name):'等待好友'}</strong><span>${i===seat?'你':p?.bot?'电脑':p?.connected?p.ready?'已准备':'已就位':p?'断线':'空位'}${r.host===i?' · 房主':''}</span></div><small>${p?escape(getCharacter(p.characterId).name):'可邀请真人或添加电脑'} · ${i<2?'右区接发':'左区接发'}</small>${host?`<div class="slot-actions">${!p||p.bot?`<button class="slot-button" data-action="bot-${i}-${p?.bot?'remove':'add'}">${p?.bot?'移除电脑':'添加电脑'}</button>`:''}${p?`<details><summary>调整席位</summary><div>${r.seats.map((_,j)=>j!==i?`<button class="slot-button" data-action="move-${i}-${j}">换到 ${j%2===0?'A':'B'}${j<2?'1':'2'}</button>`:'').join('')}</div></details>`:''}</div>`:''}</div>`;
 }).join('')}</section>`).join('')}</div>`;
}
export function formatChoice(r:RoomView,seat:Seat){
 const locked=r.host!==seat;
 return `<div class="select-row format-choice" role="group" aria-label="比赛赛制"><button data-action="format-tiebreak" class="${r.format!=='standard'?'selected':''}" ${locked?'disabled':''}>抢七短赛</button><button data-action="format-standard" class="${r.format==='standard'?'selected':''}" ${locked?'disabled':''}>标准一盘</button></div>`;
}
