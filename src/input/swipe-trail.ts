/** Screen-space touch feedback, intentionally independent of world/ball trails. */
export class SwipeTrail {
  private svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  private path=document.createElementNS('http://www.w3.org/2000/svg','path');
  private origin={x:0,y:0};
  private timer:ReturnType<typeof setTimeout>|null=null;
  constructor(){
    this.svg.classList.add('swipe-trail');this.svg.setAttribute('aria-hidden','true');
    this.path.setAttribute('fill','#eaffb1');this.path.setAttribute('stroke','#ffffff');this.path.setAttribute('stroke-width','1.5');
    this.svg.append(this.path);document.body.append(this.svg);
  }
  begin(x:number,y:number){this.clear();this.origin={x,y};this.svg.style.opacity='1';this.svg.style.transition='none';}
  move(x:number,y:number){
    const {x:sx,y:sy}=this.origin,dx=x-sx,dy=y-sy,length=Math.hypot(dx,dy);
    if(length<8)return;
    const radius=Math.min(13,4+length*.035),nx=-dy/length*radius,ny=dx/length*radius;
    const neckX=x-dx/length*radius,neckY=y-dy/length*radius;
    this.path.setAttribute('d',`M ${sx} ${sy} Q ${sx+dx*.6+nx*.45} ${sy+dy*.6+ny*.45} ${neckX+nx} ${neckY+ny} Q ${x+dx/length*radius} ${y+dy/length*radius} ${neckX-nx} ${neckY-ny} Q ${sx+dx*.6-nx*.45} ${sy+dy*.6-ny*.45} ${sx} ${sy} Z`);
  }
  end(){this.svg.style.transition='opacity 260ms ease-out';this.svg.style.opacity='0';this.timer=setTimeout(()=>this.path.removeAttribute('d'),270);}
  clear(){if(this.timer)clearTimeout(this.timer);this.path.removeAttribute('d');this.svg.style.opacity='0';}
  dispose(){this.clear();this.svg.remove();}
}
