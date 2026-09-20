export class CourtAudio {
  private context:AudioContext|null=null;
  muted=localStorage.getItem('rally-muted')==='1';
  unlock(){try{this.context??=new AudioContext();void this.context.resume();}catch{}}
  toggle(){this.muted=!this.muted;localStorage.setItem('rally-muted',this.muted?'1':'0');return this.muted;}
  play(kind:'hit'|'bounce'|'point'){
    if(this.muted||!this.context||this.context.state!=='running')return;
    const ctx=this.context,osc=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;
    osc.type=kind==='point'?'sine':'triangle';osc.frequency.setValueAtTime(kind==='hit'?620:kind==='bounce'?190:520,now);
    osc.frequency.exponentialRampToValueAtTime(kind==='point'?780:80,now+.09);
    gain.gain.setValueAtTime(kind==='point'?.09:.14,now);gain.gain.exponentialRampToValueAtTime(.001,now+.16);
    osc.connect(gain).connect(ctx.destination);osc.start(now);osc.stop(now+.17);
  }
}
