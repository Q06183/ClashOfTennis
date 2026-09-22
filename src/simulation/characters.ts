export type CharacterId='lin'|'mei'|'rafa'|'sora'|'ines'|'leo'|'noah'|'adrian'|'luca';
export type CharacterStats={movement:number;forehand:number;backhand:number;volley:number;serve:number;stamina:number};
export type Character={id:CharacterId;name:string;role:string;strength:string;weakness:string;color:string;model:string;handedness:'right'|'left';backhandStyle:'two-handed'|'one-handed';returnStyle?:'volley-first';stats:CharacterStats};
export const CHARACTERS:readonly Character[]=[
 {id:'lin',name:'林岳',role:'均衡全场',strength:'六项均衡，适合适应各种打法',weakness:'没有单项爆发优势',color:'#d5c6a1',model:'/models/athlete.glb',handedness:'right',backhandStyle:'two-handed',stats:{movement:60,forehand:60,backhand:60,volley:60,serve:60,stamina:60}},
 {id:'mei',name:'梅岚',role:'跑动耐力',strength:'追球快，长回合体力更充足',weakness:'发球与网前压制较弱',color:'#409d99',model:'/models/characters/mei.glb',handedness:'right',backhandStyle:'two-handed',stats:{movement:78,forehand:54,backhand:66,volley:44,serve:42,stamina:76}},
 {id:'rafa',name:'拉斐',role:'正手进攻',strength:'正手加速，发球辅助抢攻',weakness:'反手和长回合耐力较弱',color:'#cb684c',model:'/models/characters/rafa.glb',handedness:'right',backhandStyle:'two-handed',stats:{movement:60,forehand:82,backhand:46,volley:54,serve:66,stamina:52}},
 {id:'sora',name:'空野',role:'反手控制',strength:'反手强，移动灵活',weakness:'发球和正手压制较弱',color:'#527dcb',model:'/models/characters/sora.glb',handedness:'right',backhandStyle:'two-handed',stats:{movement:64,forehand:52,backhand:82,volley:58,serve:48,stamina:56}},
 {id:'ines',name:'伊内丝',role:'网前截击',returnStyle:'volley-first',strength:'主动沿来球路线上前截击，截击球速有优势',weakness:'消耗快，底线相持偏弱',color:'#a577ba',model:'/models/characters/ines.glb',handedness:'right',backhandStyle:'two-handed',stats:{movement:68,forehand:54,backhand:52,volley:82,serve:62,stamina:42}},
 {id:'leo',name:'里奥',role:'发球进攻',strength:'发球强，正手和截击辅助进攻',weakness:'移动慢，体力和反手偏弱',color:'#537f51',model:'/models/characters/leo.glb',handedness:'right',backhandStyle:'two-handed',stats:{movement:48,forehand:68,backhand:50,volley:66,serve:84,stamina:44}},
 {id:'noah',name:'诺亚',role:'左手强攻',strength:'左手正手加速，左右侧接球习惯与右手球员相反',weakness:'反手与网前控制偏弱',color:'#246c92',model:'/models/characters/noah.glb',handedness:'left',backhandStyle:'two-handed',stats:{movement:62,forehand:80,backhand:48,volley:44,serve:66,stamina:60}},
 {id:'adrian',name:'阿德里安',role:'单反进攻',strength:'单手反手伸展挥拍，反手球速有优势',weakness:'移动和长回合耐力较弱',color:'#985e35',model:'/models/characters/adrian.glb',handedness:'right',backhandStyle:'one-handed',stats:{movement:52,forehand:64,backhand:82,volley:64,serve:50,stamina:48}},
 {id:'luca',name:'露卡',role:'左手单反 · 网前',strength:'左手单反配合灵活上网，截击球速突出',weakness:'发球和底线反手压制偏弱',color:'#855a96',model:'/models/characters/luca.glb',handedness:'left',backhandStyle:'one-handed',stats:{movement:70,forehand:56,backhand:52,volley:80,serve:44,stamina:58}},
];
export const isCharacterId=(id:unknown):id is CharacterId=>typeof id==='string'&&CHARACTERS.some(c=>c.id===id);
export const getCharacter=(id?:string):Character=>CHARACTERS.find(c=>c.id===id)??CHARACTERS[0];
const effects=new Map(CHARACTERS.map(c=>{const s=c.stats;return [c.id,{movement:1+(s.movement-60)*.0012,forehand:1+(s.forehand-60)*.0012,backhand:1+(s.backhand-60)*.0025,volley:1+(s.volley-60)*.0025,serve:1+(s.serve-60)*.0025,drain:1-(s.stamina-60)*.002,recovery:1+(s.stamina-60)*.002}];}));
export const characterEffects=(id?:string)=>effects.get(getCharacter(id).id)!;

/** Canonical stroke space is right-handed; aiming stays in world/screen space. */
export const handedness=(id?:string):1|-1=>getCharacter(id).handedness==='left'?-1:1;
export const singleBackhand=(id?:string)=>getCharacter(id).backhandStyle==='one-handed';
