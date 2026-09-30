import {other,type Team,type Seat,type MatchMode} from './types.js';
import {serverForPoint,winnerForScore} from './rules.js';

export type ScoringFormat='tiebreak'|'standard';
export type ScoringState={
 format:ScoringFormat;games:[number,number];tiebreak:boolean;
 totalPoints:number;ends:0|1;
};
export const isScoringFormat=(value:unknown):value is ScoringFormat=>value==='tiebreak'||value==='standard';
export const createScoring=(format:ScoringFormat='tiebreak'):ScoringState=>({
 format,games:[0,0],tiebreak:format==='tiebreak',totalPoints:0,ends:0,
});
/** Mutates current-game points and set games; returns the winning TEAM. */
export function scorePoint(points:[number,number],s:ScoringState,winner:Team):Team|null{
 points[winner]++;s.totalPoints++;
 if(s.tiebreak){
  const won=winnerForScore(points);
  if(won!==null&&s.format==='standard')s.games[won]++;
  if(won===null&&(points[0]+points[1])%6===0)s.ends=(1-s.ends) as 0|1;
  return won;
 }
 if(points[winner]<4||points[winner]-points[other(winner)]<2)return null;
 s.games[winner]++;points[0]=0;points[1]=0;
 const games=s.games[0]+s.games[1];
 if(games%2===1)s.ends=(1-s.ends) as 0|1;
 if(s.games[winner]>=6&&s.games[winner]-s.games[other(winner)]>=2)return winner;
 if(s.games[0]===6&&s.games[1]===6)s.tiebreak=true;
 return null;
}
export function pointLabel(points:readonly number[],team:Team,s?:ScoringState){
 if(!s||s.tiebreak)return String(points[team]);
 if(points[0]>=3&&points[1]>=3)return points[team]>points[other(team)]?'AD':'40';
 return ['0','15','30','40'][Math.min(points[team],3)];
}
export function matchServer(points:readonly number[],mode:MatchMode='singles',s?:ScoringState):Seat{
 if(!s||s.tiebreak)return serverForPoint(points[0]+points[1],mode);
 return ((s.games[0]+s.games[1])%(mode==='doubles'?4:2)) as Seat;
}
export const pointNumber=(state:{score:readonly number[]})=>state.score[0]+state.score[1];
