/** Shape-preserving cubic Hermite: pass through authored keys with continuous
 * velocity and no scalar overshoot; geometric clearance is checked separately. */
export function motionValue<T extends {t:number}>(keys:readonly T[],time:number,value:(key:T)=>number){
 let i=0;while(i<keys.length-2&&time>keys[i+1].t)i++;
 const a=keys[i],b=keys[i+1],h=b.t-a.t,u=Math.max(0,Math.min(1,(time-a.t)/h));
 const slope=(j:number)=>{
  if(j===0||j===keys.length-1)return 0;
  const h0=keys[j].t-keys[j-1].t,h1=keys[j+1].t-keys[j].t;
  const d0=(value(keys[j])-value(keys[j-1]))/h0,d1=(value(keys[j+1])-value(keys[j]))/h1;
  if(d0*d1<=0)return 0;
  const w0=2*h1+h0,w1=h1+2*h0;return (w0+w1)/(w0/d0+w1/d1);
 };
 return (2*u*u*u-3*u*u+1)*value(a)+(u*u*u-2*u*u+u)*h*slope(i)+(-2*u*u*u+3*u*u)*value(b)+(u*u*u-u*u)*h*slope(i+1);
}
