import {getCharacter} from '../simulation/characters.js';
import * as T from 'three';
import { makeCourt,setCourtSurface } from './court.js';
import {surfaceProfile,type SurfaceId} from '../simulation/surfaces.js';
import { Athlete } from './player.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import { side, other, teamOf, seatsFor, type MatchState, type Seat, type Shot } from '../simulation/types.js';
import { shotDirection,serveDirection,captureSwipeAim } from '../input/aim.js';
import { FlightGuide } from './trajectory.js';
import {disposeTree} from './dispose.js';
import {SHOT_PROFILES} from '../simulation/shot-profile.js';
import {frameMatch,frameDoublesMatch,type CameraDistance} from './camera.js';
import {FrameQuality,QUALITY,type QualityLevel} from './quality.js';
import {AimCameraLock} from './aim-camera.js';
import {victoryPlayer,frameVictory} from './victory.js';
import {SelfMarker} from './self-marker.js';
export class CourtView {
  readonly renderer:T.WebGLRenderer;
  readonly camera=new T.PerspectiveCamera(43,1,.1,130);
  readonly scene=new T.Scene();
  // Render slots encode physical ends; stable network identities are mapped
  // onto these slots on an end change. No athlete rig/pose changes needed.
  private athletes:Athlete[]=[new Athlete(0),new Athlete(1),new Athlete(0),new Athlete(1)];
  private surface:SurfaceId='hard';
  private ends:0|1=0;
  private doubles=false;
  private ball:T.Mesh;
  private shadow:T.Mesh;
  private target:T.Mesh;
  private marker:T.Mesh;
  private trail:T.Mesh[]=[];
  private flight=new FlightGuide();
  private ray=new T.Raycaster();
  private plane=new T.Plane(new T.Vector3(0,1,0),0);
  private disposed=false;
  private modelCache=new Map<string,Promise<T.Group>>();
  private characterIds=['','','',''];
  private loadedModels:T.Group[]=[];
  private mode:'home'|'match'|'result'='home';
  private celebrationTime=0;
  private frozenContactTime:number|null=null;
  private seat:Seat=0;
  private aimCamera=new AimCameraLock();
  private cameraDistance:CameraDistance='near';
  private appliedCameraDistance:CameraDistance='near';
  private cameraPlayers:{x:number;z:number}[]=[];
  private focus={x:0,depth:11};
  private stadiumEnds:T.Group[];
  private size={w:0,h:0};
  private resizeObserver:ResizeObserver;
  private quality=new FrameQuality(matchMedia('(pointer: coarse)').matches);
  private sun=new T.DirectionalLight(0xffe3b0,3.5);
  private contactShadows:T.Mesh[]=[];
  private playerMarkers:T.Mesh[]=[];
  private selfMarker=new SelfMarker();
  get fps(){return this.quality.fps;}
  get qualityLabel(){return QUALITY[this.quality.level].label;}
  constructor(private container:HTMLElement,onContext:(lost:boolean)=>void){
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,QUALITY[this.quality.level].maxDpr));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    const canvas=this.renderer.domElement;canvas.setAttribute('aria-label','3D 网球场，点按跑位，向上滑动击球');container.append(canvas);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onContext(true);});
    canvas.addEventListener('webglcontextrestored',()=>onContext(false));
    this.scene.background=new T.Color(0xb8d1c2);this.scene.fog=new T.Fog(0xb8d1c2,48,100);
    this.scene.add(new T.HemisphereLight(0xfff8df,0x405e64,1.8));
    const sun=this.sun;sun.position.set(-10,24,8);sun.castShadow=true;
    sun.shadow.mapSize.setScalar(QUALITY[this.quality.level].shadowSize);sun.shadow.camera.left=-16;sun.shadow.camera.right=16;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;sun.shadow.bias=-.001;
    this.scene.add(sun,this.flight.root,this.selfMarker.root);this.stadiumEnds=makeCourt(this.scene);
    for(const a of this.athletes)this.scene.add(a.root);
    for(let i=0;i<4;i++){
      const shadow=new T.Mesh(new T.CircleGeometry(.38,20),new T.MeshBasicMaterial({color:0x17352c,transparent:true,opacity:.2,depthWrite:false}));
      shadow.rotation.x=-Math.PI/2;shadow.visible=false;this.scene.add(shadow);this.contactShadows.push(shadow);
      const marker=new T.Mesh(new T.RingGeometry(.39,.46,28),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.85,depthWrite:false,side:T.DoubleSide}));
      marker.rotation.x=-Math.PI/2;marker.visible=false;marker.name=`player-marker-${i}`;this.scene.add(marker);this.playerMarkers.push(marker);
    }
    this.ball=new T.Mesh(new T.SphereGeometry(.075,14,10),new T.MeshStandardMaterial({color:0xe4ff3a,emissive:0x717a03,emissiveIntensity:.35,roughness:.7}));this.ball.castShadow=true;this.scene.add(this.ball);
    this.shadow=new T.Mesh(new T.CircleGeometry(.24,20),new T.MeshBasicMaterial({color:0x132f29,transparent:true,opacity:.38,depthWrite:false}));this.shadow.rotation.x=-Math.PI/2;this.scene.add(this.shadow);
    this.target=new T.Mesh(new T.RingGeometry(.34,.41,40),new T.MeshBasicMaterial({color:0xf6f2b7,transparent:true,opacity:.65,side:T.DoubleSide,depthWrite:false}));this.target.rotation.x=-Math.PI/2;this.scene.add(this.target);
    this.marker=new T.Mesh(new T.RingGeometry(.4,.45,36),new T.MeshBasicMaterial({color:0xdfff84,transparent:true,opacity:.65,side:T.DoubleSide}));this.marker.rotation.x=-Math.PI/2;this.scene.add(this.marker);
    for(let i=0;i<8;i++){
      const t=new T.Mesh(new T.SphereGeometry(.06*(1-i/10),6,4),new T.MeshBasicMaterial({color:0xf0ff85,transparent:true,opacity:.65*(1-i/8),depthWrite:false,toneMapped:false}));this.trail.push(t);this.scene.add(t);
    }
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    canvas.dataset.quality=this.quality.level;
  }
  configureQuality(level:QualityLevel){
    this.quality.level=level;const profile=QUALITY[level];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,profile.maxDpr));
    const shadowsChanged=this.renderer.shadowMap.enabled!==(profile.shadowSize>0);
    this.renderer.shadowMap.enabled=profile.shadowSize>0;
    this.sun.shadow.map?.dispose();this.sun.shadow.map=null;
    this.sun.shadow.mapSize.setScalar(Math.max(1,profile.shadowSize));
    if(shadowsChanged)this.scene.traverse(o=>{
      if(o instanceof T.Mesh)for(const material of Array.isArray(o.material)?o.material:[o.material])material.needsUpdate=true;
    });
    this.renderer.domElement.dataset.quality=level;this.resize();
  }
  recordFrame(ms:number,visible:boolean){
    const changed=this.quality.sample(ms,visible);if(changed)this.configureQuality(changed);
  }
  private setCharacter(seat:Seat,id?:string){
    const character=getCharacter(id);if(this.characterIds[seat]===character.id)return;
    this.characterIds[seat]=character.id;const athlete=this.athletes[seat];athlete.clearModel();
    const canvas=this.renderer.domElement;canvas.dataset[`athlete${seat}`]='loading';
    let promise=this.modelCache.get(character.model);
    if(!promise){promise=new GLTFLoader().loadAsync(character.model).then(g=>{if(this.disposed){disposeTree(g.scene);return g.scene;}this.loadedModels.push(g.scene);return g.scene;});this.modelCache.set(character.model,promise);}
    promise.then(model=>{
      if(this.disposed||this.characterIds[seat]!==character.id)return;
      athlete.attachModel(clone(model));canvas.dataset[`athlete${seat}`]=character.id;canvas.dataset.athleteSource='lux3d';
    }).catch(()=>{if(this.characterIds[seat]===character.id){canvas.dataset[`athlete${seat}`]='fallback';canvas.dataset.athleteSource='fallback';}this.modelCache.delete(character.model);});
  }
  setMode(mode:'home'|'match'|'result',seat:Seat=0){
    if(this.mode===mode&&this.seat===seat)return;
    this.aimCamera.reset();
    this.celebrationTime=0;
    this.mode=mode;this.seat=seat;this.focus={x:0,depth:11};
    this.stadiumEnds.forEach((end,i)=>{end.visible=mode==='home'||i!==(teamOf(seat)^this.ends);});this.resize(true);
  }
  setSurface(surface:SurfaceId){
    if(surface===this.surface)return;
    this.surface=surface;setCourtSurface(this.scene,surface);
    this.renderer.domElement.dataset.surface=surface;
  }
  private resize(forceCamera=false){
    const w=this.container.clientWidth,h=this.container.clientHeight;
    const changed=w!==this.size.w||h!==this.size.h;
    this.renderer.setSize(w,h,false);
    if(!changed&&!forceCamera)return;
    this.aimCamera.reset();
    this.size={w,h};this.camera.aspect=w/h;
    if(this.mode==='home'){
      this.camera.clearViewOffset();
      this.camera.zoom=1;
      this.camera.fov=w>h?39:49;this.camera.position.set(19,23,25);this.camera.lookAt(w>h?-4:0,0,0);
    } else {
      this.appliedCameraDistance=this.cameraDistance;
      const seat=(teamOf(this.seat)^this.ends) as Seat;
      if(this.doubles)frameDoublesMatch(this.camera,w,h,seat,this.focus.x,this.focus.depth,this.cameraPlayers??[],this.appliedCameraDistance);
      else frameMatch(this.camera,w,h,seat,this.focus.x,this.focus.depth,undefined,this.appliedCameraDistance);
    }
    this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  }
  aimShot(shot:Shot,state:MatchState,dx:number,dy:number):Shot{
    const serve=state.phase==='serve'&&state.server===this.seat;
    const ball=serve?{...state.ball,y:2.65}:state.ball;
    this.aimCamera.shot(state,this.seat);
    return {...shot,swipeAim:captureSwipeAim(this.camera,shot,dx,dy,this.size.w,this.size.h),directionX:serve?serveDirection(this.camera,ball,state.players[this.seat],shot,dx,dy,this.size.w,this.size.h,side(this.seat,state)):shotDirection(this.camera,ball,shot,dx,dy,this.size.w,this.size.h,side(this.seat,state))};
  }
  setAiming(active:boolean){this.aimCamera.pointer(active);}
  setCameraDistance(distance:CameraDistance){this.cameraDistance=distance;}
  private updateCamera(state:MatchState,dt:number){
    if(state.rescueWindow)return;
    if(this.aimCamera.update(state,dt))return;
    this.appliedCameraDistance=this.cameraDistance;
    const p=state.players[this.seat],alpha=1-Math.exp(-Math.min(dt,.08)*7);
    this.focus.x+=(p.x-this.focus.x)*alpha;
    this.focus.depth+=(p.z*side(this.seat,state)-this.focus.depth)*alpha;
    const seat=(teamOf(this.seat)^this.ends) as Seat;
    if(this.doubles)frameDoublesMatch(this.camera,this.size.w,this.size.h,seat,this.focus.x,this.focus.depth,state.players,this.appliedCameraDistance);
    else frameMatch(this.camera,this.size.w,this.size.h,seat,this.focus.x,this.focus.depth,state.players[other(this.seat)],this.appliedCameraDistance);
  }
  courtPoint(x:number,y:number){
    const rect=this.container.getBoundingClientRect();
    this.ray.setFromCamera(new T.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),this.camera);
    const v=new T.Vector3();return this.ray.ray.intersectPlane(this.plane,v)?{x:v.x,z:v.z}:null;
  }
  render(state:MatchState,dt:number,authoritative:MatchState=state){
    this.setSurface(surfaceProfile(state.surface).id);
    this.cameraPlayers=state.players.map(p=>({x:p.x,z:p.z}));
    if(this.ends!==(state.ends??0)||this.doubles!==(state.mode==='doubles')){
      this.ends=state.ends??0;this.doubles=state.mode==='doubles';this.aimCamera.reset();this.focus={x:0,depth:11};
      this.stadiumEnds.forEach((end,i)=>{end.visible=this.mode==='home'||i!==(teamOf(this.seat)^this.ends);});this.resize(true);
    }
    const winner=this.mode==='result'?victoryPlayer(authoritative):null;
    if(winner){
      this.celebrationTime+=dt;
      frameVictory(this.camera,this.size.w,this.size.h,winner.player,side(winner.seat,state));
      if(this.doubles){
        const mate=state.players[winner.seat+2];
        // Fit both original stations; don't teleport or hide the partner.
        const center={x:(winner.player.x+mate.x)/2,z:(winner.player.z+mate.z)/2};
        frameVictory(this.camera,this.size.w,this.size.h,center,side(winner.seat,state));
        this.camera.zoom*=Math.min(1,2.5/(Math.hypot(winner.player.x-mate.x,winner.player.z-mate.z)+2));
        this.camera.updateProjectionMatrix();
      }
    }
    if(this.mode==='match'){
      this.updateCamera(state,dt);
    }
    const repeatHold=!!state.rescueWindow&&this.frozenContactTime===state.time;
    this.frozenContactTime=state.rescueWindow?state.time:null;
    for(const a of this.athletes)a.root.visible=false;
    for(const shadow of this.contactShadows)shadow.visible=false;
    for(const marker of this.playerMarkers??[])marker.visible=false;
    for(const seat of seatsFor(state.mode)){
      const slot=(seat^this.ends) as Seat;
      const source=state.players[seat],p=winner?{...source,preparation:undefined,rescue:undefined,swing:0,moving:false,tx:source.x,tz:source.z}:source;
      const celebrating=!!winner&&teamOf(seat)===winner.seat;
      this.setCharacter(slot,p.characterId);this.athletes[slot].root.visible=!winner||celebrating;
      if(!repeatHold)this.athletes[slot].update(p,state.time,dt,celebrating?this.celebrationTime:undefined);
      this.contactShadows[slot].position.set(p.x,.065,p.z);this.contactShadows[slot].visible=this.quality.level==='low';
      const marker=this.playerMarkers?.[seat];
      if(marker){
        marker.position.set(p.x,.075,p.z);marker.visible=this.doubles&&seat!==this.seat&&(!winner||celebrating);
        marker.scale.setScalar(seat===this.seat?1.2:1);
        (marker.material as T.MeshBasicMaterial).color.setHex(seat===this.seat?0xffffcf:teamOf(seat)===0?0x7ae2ff:0xffb46a);
      }
    }
    this.renderer.domElement.dataset.players=String(state.players.length);
    const b=state.ball;
    this.ball.visible=!winner;this.shadow.visible=!winner;
    this.flight.update(state,this.seat,this.mode==='match',authoritative);
    for(let i=this.trail.length-1;i>0;i--)this.trail[i].position.copy(this.trail[i-1].position);
    this.trail[0].position.copy(this.ball.position);
    this.ball.position.set(b.x,b.y,b.z);if(!state.rescueWindow)this.ball.rotation.z+=dt*12;
    this.shadow.position.set(b.x,.07,b.z);this.shadow.scale.setScalar(1+b.y*.09);
    this.target.position.set(b.targetX,.075,b.targetZ);
    this.target.visible=false;
    const localPlayer=state.players[this.seat];
    this.selfMarker?.update(state,this.seat,this.camera,this.size.h,this.mode==='match');
    if(localPlayer)this.marker.position.set(localPlayer.tx,.08,localPlayer.tz);
    this.marker.visible=!!localPlayer&&this.mode==='match'&&state.phase==='rally';
    const trailVisible=!winner&&state.phase==='rally';for(const t of this.trail){t.visible=trailVisible;(t.material as T.MeshBasicMaterial).color.setHex(SHOT_PROFILES[b.tier??(b.critical?'critical':'normal')].color);}
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){
    this.disposed=true;
    this.resizeObserver.disconnect();for(const a of this.athletes)a.clearModel();
    for(const model of this.loadedModels)this.scene.add(model);disposeTree(this.scene);this.modelCache.clear();this.loadedModels=[];
    this.renderer.dispose();this.renderer.domElement.remove();
  }
}
