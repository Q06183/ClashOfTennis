import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export function makeCourt(scene:T.Scene){
  const batches=new Map<number,T.BufferGeometry[]>();
  function box(color:number,x:number,y:number,z:number,w:number,h:number,d:number){
    const geometry=new T.BoxGeometry(w,h,d);geometry.translate(x,y,z);
    if(!batches.has(color))batches.set(color,[]);batches.get(color)!.push(geometry);
  }
  const surface=(c:number,x:number,z:number,w:number,d:number,y=.006)=>box(c,x,y,z,w,.012,d);
  surface(0x397c69,0,0,34,47,-.035);
  surface(0x266c81,0,0,11,23.77);
  surface(0x33869a,0,0,8.23,23.77,.022);
  surface(0x388fa1,0,0,8.23,12.8,.033);
  const line=0xf3edce;
  for(const x of [-5.485,-4.115,4.115,5.485])surface(line,x,0,.065,23.85,.047);
  for(const z of [-11.885,11.885])surface(line,0,z,11.04,.065,.047);
  for(const z of [-6.4,6.4])surface(line,0,z,8.23,.065,.047);
  surface(line,0,0,.065,12.8,.049);
  for(const z of [-11.7,11.7])surface(line,0,z,.065,.4,.05);
  // A physical-looking woven net, merged into one draw call.
  for(let x=-5.95;x<=5.95;x+=.22)box(0x143e40,x,.49,0,.018,.91,.018);
  for(let y=.12;y<.97;y+=.13)box(0x143e40,0,y,0,12,.018,.018);
  box(0xede8d2,0,.97,0,12.3,.065,.065);
  for(const x of [-6.05,6.05]){
    box(0x143e40,x,.57,0,.15,1.14,.15);box(0xf3edd7,x,1.16,0,.2,.08,.2);
  }
  // Low stadium walls, seating, and courtside furniture.
  for(const z of [-18,18]){
    box(0x163e42,0,1,z,28,2,.35);
    box(0xc4d6aa,0,2.04,z,28,.13,.5);
    for(let row=0;row<3;row++){
      box(0xd9c9a7,0,.35+row*.6,z+Math.sign(z)*(1+row*.95),26,.7,1.05);
      for(let col=-12;col<=12;col++){
        box((col+row)%3?0xeee6cc:0xdee68b,col,.82+row*.6,z+Math.sign(z)*(1+row*.95),.69,.15,.57);
        box((col+row)%3?0xeee6cc:0xdee68b,col,1.06+row*.6,z+Math.sign(z)*(1.26+row*.95),.69,.4,.09);
      }
    }
  }
  for(const x of [-12.8,12.8]){
    box(0x194847,x,.65,0,.25,1.3,36);
    for(let z=-17;z<18;z+=3)box(0x214f49,x,1.8,z,.08,2.4,.08);
    for(let y=1.3;y<3;y+=.3)box(0x53806a,x,y,0,.018,.02,36);
    for(let z=-17;z<18;z+=.45)box(0x53806a,x,2.1,z,.02,1.6,.018);
    for(const z of [-9,9]){
      box(0xe9d9ad,x*.68,.5,z,.8,.14,2.6);
      for(const dz of [-.9,.9])box(0x174444,x*.68,.24,z+dz,.6,.5,.1);
    }
  }
  // Light towers and a calm green backdrop.
  for(const x of [-13,13])for(const z of [-16,16]){
    box(0x335851,x,4,z,.14,8,.14);box(0xe9dfbf,x,8.1,z,1.65,.55,.32);
  }
  for(const [color,parts] of batches){
    const geometry=mergeGeometries(parts);for(const p of parts)p.dispose();
    const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color,roughness:1}));mesh.receiveShadow=true;scene.add(mesh);
  }
  const treeMat=new T.MeshStandardMaterial({color:0x528565,roughness:1});
  for(let i=0;i<24;i++){
    const x=(i%2?1:-1)*(15+(i%3)*1.4),z=-23+Math.floor(i/2)*4.1;
    const tree=new T.Mesh(new T.IcosahedronGeometry(2+(i%3)*.3,1),treeMat);tree.position.set(x,2.4+(i%3)*.4,z);tree.scale.y=1.3;scene.add(tree);
  }
  const label=(text:string,z:number,rotation:number)=>{
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ecebc9';ctx.font='bold 58px sans-serif';ctx.textAlign='center';ctx.fillText(text,512,84);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const mesh=new T.Mesh(new T.PlaneGeometry(12,1.5),new T.MeshBasicMaterial({map:texture,transparent:true,side:T.DoubleSide}));
    mesh.position.set(0,1.1,z);mesh.rotation.y=rotation;scene.add(mesh);
  };
  label('R A L L Y   C L U B',-17.78,0);label('M E E T   O N   C O U R T',17.78,Math.PI);
}
