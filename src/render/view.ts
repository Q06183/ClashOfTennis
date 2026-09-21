import * as T from 'three';
import { makeCourt } from './court.js';
import { Athlete } from './player.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import { clamp, side, type MatchState, type Seat, type Shot, type Vec } from '../simulation/types.js';
import { swipeDirection } from '../input/aim.js';
import { FlightGuide } from './trajectory.js';
import {disposeTree} from './dispose.js';
import {frameMatch} from './camera.js';
export class CourtView {
  readonly renderer:T.WebGLRenderer;
  readonly camera=new T.PerspectiveCamera(43,1,.1,130);
  readonly scene=new T.Scene();
  private athletes:[Athlete,Athlete]=[new Athlete(0),new Athlete(1)];
  private ball:T.Mesh;
  private shadow:T.Mesh;
  private target:T.Mesh;
  private marker:T.Mesh;
  private trail:T.Mesh[]=[];
  private flight=new FlightGuide();
  private ray=new T.Raycaster();
  private plane=new T.Plane(new T.Vector3(0,1,0),0);
  private disposed=false;
  private mode:'home'|'match'='home';
  private seat:Seat=0;
  private focus={x:0,depth:11};
  private stadiumEnds:T.Group[];
  private size={w:0,h:0};
  private resizeObserver:ResizeObserver;
  constructor(private container:HTMLElement,onContext:(lost:boolean)=>void){
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    const canvas=this.renderer.domElement;canvas.setAttribute('aria-label','3D 网球场，点按跑位，向上滑动击球');container.append(canvas);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onContext(true);});
    canvas.addEventListener('webglcontextrestored',()=>onContext(false));
    this.scene.background=new T.Color(0xb8d1c2);this.scene.fog=new T.Fog(0xb8d1c2,48,100);
    this.scene.add(new T.HemisphereLight(0xfff8df,0x405e64,1.8));
    const sun=new T.DirectionalLight(0xffe3b0,3.5);sun.position.set(-10,24,8);sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-16;sun.shadow.camera.right=16;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;sun.shadow.bias=-.001;
    this.scene.add(sun,this.flight.root);this.stadiumEnds=makeCourt(this.scene);
    for(const a of this.athletes)this.scene.add(a.root);
    new GLTFLoader().load('/models/athlete.glb?v=1',gltf=>{
      if(this.disposed){disposeTree(gltf.scene);return;}
      for(const a of this.athletes){
        const model=clone(gltf.scene);
        if(a.seat===1)model.traverse(o=>{
          if(!(o instanceof T.Mesh))return;
          const tint=(source:T.Material)=>{
            const mat=source.clone();
            mat.onBeforeCompile=shader=>{
              shader.vertexShader='varying vec3 kitPosition;\n'+shader.vertexShader;
              shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nkitPosition=position;');
              shader.fragmentShader='varying vec3 kitPosition;\n'+shader.fragmentShader;
              shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
                float cream=1.0-smoothstep(0.18,0.34,max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b))-min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b)));
                float shirt=step(0.99,kitPosition.y)*(1.0-step(1.48,kitPosition.y))*(1.0-step(0.44,abs(kitPosition.x)));
                diffuseColor.rgb*=mix(vec3(1.0),vec3(1.0,0.36,0.14),cream*shirt);`);
            };mat.customProgramCacheKey=()=> 'away-shirt';return mat;
          };
          o.material=Array.isArray(o.material)?o.material.map(tint):tint(o.material);
        });
        a.attachModel(model);
      }
      canvas.dataset.athleteSource='lux3d';
    },undefined,()=>{canvas.dataset.athleteSource='fallback';});
    this.ball=new T.Mesh(new T.SphereGeometry(.075,14,10),new T.MeshStandardMaterial({color:0xe4ff3a,emissive:0x717a03,emissiveIntensity:.35,roughness:.7}));this.ball.castShadow=true;this.scene.add(this.ball);
    this.shadow=new T.Mesh(new T.CircleGeometry(.24,20),new T.MeshBasicMaterial({color:0x132f29,transparent:true,opacity:.38,depthWrite:false}));this.shadow.rotation.x=-Math.PI/2;this.scene.add(this.shadow);
    this.target=new T.Mesh(new T.RingGeometry(.34,.41,40),new T.MeshBasicMaterial({color:0xf6f2b7,transparent:true,opacity:.65,side:T.DoubleSide,depthWrite:false}));this.target.rotation.x=-Math.PI/2;this.scene.add(this.target);
    this.marker=new T.Mesh(new T.RingGeometry(.4,.45,36),new T.MeshBasicMaterial({color:0xdfff84,transparent:true,opacity:.65,side:T.DoubleSide}));this.marker.rotation.x=-Math.PI/2;this.scene.add(this.marker);
    for(let i=0;i<8;i++){
      const t=new T.Mesh(new T.SphereGeometry(.06*(1-i/10),6,4),new T.MeshBasicMaterial({color:0xf0ff85,transparent:true,opacity:.35*(1-i/8),depthWrite:false}));this.trail.push(t);this.scene.add(t);
    }
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
  }
  setMode(mode:'home'|'match',seat:Seat=0){
    this.mode=mode;this.seat=seat;this.focus={x:0,depth:11};
    this.stadiumEnds.forEach((end,i)=>{end.visible=mode==='home'||i!==seat;});this.resize();
  }
  private resize(){
    const w=this.container.clientWidth,h=this.container.clientHeight;this.size={w,h};this.renderer.setSize(w,h,false);this.camera.aspect=w/h;
    if(this.mode==='home'){
      this.camera.fov=w>h?39:49;this.camera.position.set(19,23,25);this.camera.lookAt(w>h?-4:0,0,0);
    } else {
      frameMatch(this.camera,w,h,this.seat,this.focus.x,this.focus.depth);
    }
    this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  }
  aimShot(shot:Shot,ball:Vec,dx:number,dy:number):Shot{
    return {...shot,directionX:swipeDirection(this.camera,ball,dx,dy,this.size.w,this.size.h,side(this.seat))};
  }
  courtPoint(x:number,y:number){
    const rect=this.container.getBoundingClientRect();
    this.ray.setFromCamera(new T.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),this.camera);
    const v=new T.Vector3();return this.ray.ray.intersectPlane(this.plane,v)?{x:v.x,z:v.z}:null;
  }
  render(state:MatchState,dt:number,authoritative:MatchState=state){
    if(this.mode==='match'){
      const p=state.players[this.seat],alpha=1-Math.exp(-Math.min(dt,.08)*7);
      this.focus.x+=(p.x-this.focus.x)*alpha;
      this.focus.depth+=(p.z*side(this.seat)-this.focus.depth)*alpha;
      // Limit camera lag after point resets and at the edge of the close view.
      this.focus.x=clamp(this.focus.x,p.x-.6,p.x+.6);
      this.focus.depth=clamp(this.focus.depth,p.z*side(this.seat)-.6,p.z*side(this.seat)+.6);
      frameMatch(this.camera,this.size.w,this.size.h,this.seat,this.focus.x,this.focus.depth);
    }
    for(const seat of [0,1] as Seat[])this.athletes[seat].update(state.players[seat],state.time,dt);
    const b=state.ball;
    this.flight.update(state,this.seat,this.mode==='match',authoritative);
    for(let i=this.trail.length-1;i>0;i--)this.trail[i].position.copy(this.trail[i-1].position);
    this.trail[0].position.copy(this.ball.position);
    this.ball.position.set(b.x,b.y,b.z);this.ball.rotation.z+=dt*12;
    this.shadow.position.set(b.x,.07,b.z);this.shadow.scale.setScalar(1+b.y*.09);
    this.target.position.set(b.targetX,.075,b.targetZ);
    this.target.visible=false;
    this.marker.position.set(state.players[this.seat].tx,.08,state.players[this.seat].tz);
    this.marker.visible=this.mode==='match'&&state.phase==='rally';
    const trailVisible=state.phase==='rally';for(const t of this.trail){t.visible=trailVisible;(t.material as T.MeshBasicMaterial).color.setHex(b.critical?0xffad35:0xf0ff85);}
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){
    this.disposed=true;
    this.resizeObserver.disconnect();disposeTree(this.scene);
    this.renderer.dispose();this.renderer.domElement.remove();
  }
}
