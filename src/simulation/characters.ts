export type CharacterId='lin'|'mei'|'rafa'|'sora'|'ines'|'leo'|'noah'|'adrian'|'luca'|'wuming';
export type CharacterStats={movement:number;forehand:number;backhand:number;volley:number;serve:number;stamina:number};
export type Character={id:CharacterId;name:string;role:string;strength:string;weakness:string;color:string;model:string;portrait?:string;handedness:'right'|'left';backhandStyle:'two-handed'|'one-handed';returnStyle?:'volley-first';hidden?:boolean;stats:CharacterStats};
export const CHARACTERS:readonly Character[]=[
 {id:'lin',name:'林岳',role:'均衡全场',strength:'六项均为基准水平，跑动、击球和体力没有属性加减成',weakness:'没有专项优势，需要靠落点和击球时机取胜',color:'#d5c6a1',model:'/models/releases/joint-pivot-v1/lin.glb',portrait:'/portraits/releases/joint-pivot-v1/lin.png',handedness:'right',backhandStyle:'two-handed',stats:{movement:60,forehand:60,backhand:60,volley:60,serve:60,stamina:60}},
 {id:'mei',name:'梅岚',role:'跑动耐力',strength:'移动与起步快，反手更有力，耗体少且恢复快，擅长长回合追球',weakness:'发球和截击球速明显偏低，正手也略弱，不宜硬拼网前',color:'#409d99',model:'/models/releases/joint-pivot-v1/mei.glb',portrait:'/portraits/releases/joint-pivot-v1/mei.png',handedness:'right',backhandStyle:'two-handed',stats:{movement:78,forehand:54,backhand:66,volley:44,serve:42,stamina:76}},
 {id:'rafa',name:'拉斐',role:'正手进攻',strength:'正手加速突出，配合强发球抢先压制，移动保持基准水平',weakness:'反手和截击较慢，耗体更多、恢复更慢，适合主动缩短回合',color:'#cb684c',model:'/models/releases/joint-pivot-v1/rafa.glb',handedness:'right',backhandStyle:'two-handed',stats:{movement:60,forehand:82,backhand:46,volley:54,serve:66,stamina:52}},
 {id:'sora',name:'空野',role:'反手控制',strength:'反手球速突出，起步与移动略快，适合反手对拉和变线',weakness:'发球明显较慢，正手和截击偏弱，耗体略多且恢复略慢',color:'#527dcb',model:'/models/releases/joint-pivot-v1/sora.glb',handedness:'right',backhandStyle:'two-handed',stats:{movement:64,forehand:52,backhand:82,volley:58,serve:48,stamina:56}},
 {id:'ines',name:'伊内丝',role:'网前截击',returnStyle:'volley-first',strength:'主动沿来球路线上前截击，截击球速突出，移动和发球也有加成',weakness:'体力消耗高、恢复慢，正反手底线球偏弱，不宜久拖回合',color:'#a577ba',model:'/models/releases/joint-pivot-v1/ines.glb',handedness:'right',backhandStyle:'two-handed',stats:{movement:68,forehand:54,backhand:52,volley:82,serve:62,stamina:42}},
 {id:'leo',name:'里奥',role:'发球进攻',strength:'发球球速是普通球员中最强，正手与截击辅助前几拍抢攻',weakness:'移动和起步较慢，反手偏弱，耗体高且恢复慢',color:'#537f51',model:'/models/releases/joint-pivot-v1/leo.glb',handedness:'right',backhandStyle:'two-handed',stats:{movement:48,forehand:68,backhand:50,volley:66,serve:84,stamina:44}},
 {id:'noah',name:'诺亚',role:'左手强攻',strength:'左手强正手配合发球压制，移动略快、体力保持基准；正反手侧与右手球员相反',weakness:'反手和截击球速明显偏低，尽量用正手组织进攻',color:'#246c92',model:'/models/releases/joint-pivot-v1/noah.glb',portrait:'/portraits/releases/joint-pivot-v1/noah.png',handedness:'left',backhandStyle:'two-handed',stats:{movement:62,forehand:80,backhand:48,volley:44,serve:66,stamina:60}},
 {id:'adrian',name:'阿德里安',role:'单反进攻',strength:'单手反手球速突出，正手和截击也有加成，适合反手主动进攻',weakness:'移动与起步较慢，发球偏弱，耗体更多、恢复更慢',color:'#985e35',model:'/models/releases/joint-pivot-v1/adrian.glb',handedness:'right',backhandStyle:'one-handed',stats:{movement:52,forehand:64,backhand:82,volley:64,serve:50,stamina:48}},
 {id:'luca',name:'露卡',role:'左手单反 · 网前',strength:'移动与起步快，截击球速突出，适合左手单反配合主动上网',weakness:'发球和底线反手较慢，正手略弱，体力消耗与恢复略逊基准',color:'#855a96',model:'/models/releases/joint-pivot-v1/luca.glb',handedness:'left',backhandStyle:'one-handed',stats:{movement:70,forehand:56,backhand:52,volley:80,serve:44,stamina:58}},
 {id:'wuming',name:'无名',role:'隐藏大佬',hidden:true,strength:'六项属性全部 99，移动迅速、各类击球强劲，耗体少且恢复快',weakness:'非平衡彩蛋角色；仍会消耗体力，仍须合法触球、过网与落点',color:'#d8b45c',model:'/models/releases/joint-pivot-v1/wuming.glb',handedness:'right',backhandStyle:'two-handed',stats:{movement:99,forehand:99,backhand:99,volley:99,serve:99,stamina:99}},
];
export const STANDARD_CHARACTERS=CHARACTERS.filter(c=>!c.hidden);
export const isCharacterId=(id:unknown):id is CharacterId=>typeof id==='string'&&CHARACTERS.some(c=>c.id===id);
export const getCharacter=(id?:string):Character=>CHARACTERS.find(c=>c.id===id)??CHARACTERS[0];
const effects=new Map(CHARACTERS.map(c=>{
 const s=c.stats;
 // One scale for the whole roster: amplify deviations around neutral 1,
 // including below-60 weaknesses. Panel stats and the neutral baseline stay put.
 const bonus=10;
 return [c.id,{
  movement:1+(s.movement-60)*.0012*bonus,forehand:1+(s.forehand-60)*.0012*bonus,
  backhand:1+(s.backhand-60)*.0025*bonus,volley:1+(s.volley-60)*.0025*bonus,serve:1+(s.serve-60)*.0025*bonus,
  drain:1-(s.stamina-60)*.002*bonus,recovery:1+(s.stamina-60)*.002*bonus,
 }];
}));
export const characterEffects=(id?:string)=>effects.get(getCharacter(id).id)!;

/** Canonical stroke space is right-handed; aiming stays in world/screen space. */
export const handedness=(id?:string):1|-1=>getCharacter(id).handedness==='left'?-1:1;
export const singleBackhand=(id?:string)=>getCharacter(id).backhandStyle==='one-handed';
