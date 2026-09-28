import {Vector3} from 'three';
import type {MatchState} from '../simulation/types.js';

export function victoryPlayer(state:MatchState){
 if(state.phase!=='over'||state.winner===null)return null;
 return {seat:state.winner,player:state.players[state.winner]};
}
export function victoryPose(time:number){
 const beat=time*Math.PI*2,bounce=.11*Math.abs(Math.sin(beat));
 return {
  lift:bounce,turn:.22*Math.sin(beat*.5),drop:.05+.05*(1-Math.abs(Math.sin(beat))),
  tip:new Vector3(-.55+.28*Math.sin(beat*.5),2.05+.25*Math.sin(beat),.5),
  shaft:new Vector3(-.2,.95,.2).normalize(),
  hand:new Vector3(.5,1.8+.23*Math.cos(beat),.15),
  feet:[new Vector3(.24,.105+Math.max(0,Math.sin(beat))*.13,.08),
        new Vector3(-.24,.105+Math.max(0,-Math.sin(beat))*.13,-.08)],
 };
}
