import {clamp,type PlayerState} from '../simulation/types.js';

// Slow loading into a continuous forward swing, not a frozen hold followed by
// a catch-up jump. Input queues the shot in simulation; it is not an animation
// clock. A late swipe must not switch from phase .52 straight to near contact.
const knots=[
 {t:0,v:0,s:1},{t:.42,v:.48,s:.8},{t:.54,v:.54,s:.5},
 {t:.68,v:.64,s:1},{t:.82,v:.82,s:1.2},{t:.94,v:.94,s:1},{t:1,v:1,s:1},
];
export function preparationPhase(p:PlayerState){
 const prep=p.preparation;if(!prep)return 1;
 const groundstroke=prep.stroke==='forehand'||prep.stroke==='backhand';
 const t=clamp(groundstroke||p.shotQueued||prep.stroke==='serve'?prep.progress:Math.min(prep.progress,.6),0,1);
 if(!groundstroke)return t;
 let i=0;while(i<knots.length-2&&t>knots[i+1].t)i++;
 const a=knots[i],b=knots[i+1],h=b.t-a.t,u=(t-a.t)/h;
 // C1 monotone remap, including derivative 1 at contact: it cannot introduce
 // a velocity discontinuity at the simulation's preparation -> swing boundary.
 return (2*u**3-3*u*u+1)*a.v+(u**3-2*u*u+u)*h*a.s+
  (-2*u**3+3*u*u)*b.v+(u**3-u*u)*h*b.s;
}
