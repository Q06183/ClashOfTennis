import {characterEffects} from './characters.js';
import {clamp,type PlayerState} from './types.js';

export const STAMINA={pointWeight:.2,baseRefund:.6,maxRefund:.9,idleRecovery:.006};
const unit=(n:number)=>Number.isFinite(n)?clamp(n,0,1):0;
export const effectiveStamina=(p:Pick<PlayerState,'stamina'|'totalStamina'>)=>unit(p.stamina)*unit(p.totalStamina??1);
export const pointRecoveryRate=(id?:string)=>clamp(STAMINA.baseRefund*characterEffects(id).recovery,0,STAMINA.maxRefund);

export function beginPointStamina(p:PlayerState){
 p.stamina=1;p.totalStamina=unit(p.totalStamina??1);
 p.pointStaminaSpent=0;p.pointStaminaCost=0;p.pointStaminaSettled=false;
}
/** Charge only actual point-bar usage, and never more than one full bar/point.
 * Idle recovery cannot create another 20% budget or refund match fatigue. */
export function spendStamina(p:PlayerState,amount:number){
 if(!Number.isFinite(amount)||amount<=0||p.pointStaminaSettled)return;
 const used=Math.min(unit(p.stamina),amount),spent=unit(p.pointStaminaSpent??0);
 p.stamina=unit(p.stamina-used);
 const charged=Math.min(used,1-spent)*STAMINA.pointWeight,total=unit(p.totalStamina??1);
 const actual=Math.min(total,charged);
 p.totalStamina=total-actual;p.pointStaminaSpent=unit(spent+used);
 p.pointStaminaCost=(p.pointStaminaCost??0)+actual;
}
export function recoverPointStamina(p:PlayerState,amount:number){
 if(!Number.isFinite(amount)||amount<=0||p.pointStaminaSettled)return;
 p.stamina=unit(p.stamina+amount);
}
export function settlePointStamina(p:PlayerState){
 if(p.pointStaminaSettled)return;
 const cost=clamp(p.pointStaminaCost??0,0,STAMINA.pointWeight);
 p.totalStamina=unit((p.totalStamina??1)+cost*pointRecoveryRate(p.characterId));
 p.pointStaminaSettled=true;
}
