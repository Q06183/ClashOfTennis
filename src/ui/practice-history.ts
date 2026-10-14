import {readPreference,writePreference} from './preferences.js';

/** Browser-local only. Never sent anywhere; corrupted values are ignored. */
const RESULTS_KEY='rally-practice-results-v1';
const RALLY_KEY='rally-practice-rally-best-v1';

export function recentPracticeResults():boolean[]{
  const raw=readPreference(RESULTS_KEY);
  if(!raw||!/^[01]{0,10}$/.test(raw))return [];
  return [...raw].map(c=>c==='1');
}
/** Keeps the last ten finished practice matches (true = learner won). */
export function recordPracticeResult(won:boolean){
  const next=[...recentPracticeResults(),won].slice(-10);
  return writePreference(RESULTS_KEY,next.map(v=>v?'1':'0').join(''));
}
/** Longest rally record per court × difficulty × both players. */
export function rallyBestKey(surface:string,difficulty:string,player:string,opponent:string){
  return [RALLY_KEY,surface,difficulty,player,opponent].join('/');
}
export function readRallyBest(key:string){
  const raw=readPreference(key);
  return raw&&/^\d{1,4}$/.test(raw)?Number(raw):0;
}
/** Returns whether this match set a new record (and was saved). */
export function saveRallyBest(key:string,value:number){
  if(!Number.isSafeInteger(value)||value<=0)return false;
  const previous=readRallyBest(key);
  if(value<=previous)return false;
  writePreference(key,String(value));
  return true;
}
/** “Try serious” suggestion after three straight relaxed wins. */
export function suggestStandard(recent:readonly boolean[]){
  return recent.length>=3&&recent.slice(-3).every(Boolean);
}
