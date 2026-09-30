/** Add a rig without rewriting a byte of the user-selected source mesh/texture data.
 * node --import tsx scripts/assets/bind-original-athletes.ts
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Matrix4,Vector3} from 'three';

const base='artifacts/bob-saba-2026-09-30';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const smooth=(a:number,b:number,x:number)=>{
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);
};
type Joint={name:string;at:number[];tail:number[];parent?:string};
for(const character of ['bob','saba']){
  const source=`${base}/original/${character}_glb.glb`;
  const raw=readFileSync(source),jl=raw.readUInt32LE(12);
  const doc=JSON.parse(raw.toString('utf8',20,20+jl));
  if(doc.skins?.length||doc.nodes.length!==1)throw Error('Expected untouched single-mesh source');
  const original=raw.subarray(28+jl,28+jl+doc.buffers[0].byteLength);
  let binary=Buffer.from(original);
  const components:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
  const bytes:Record<number,number>={5121:1,5123:2,5125:4,5126:4};
  const read=(index:number)=>{
    const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],n=components[a.type],size=bytes[a.componentType];
    return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>{
      const offset=(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??n*size)+k*size;
      return a.componentType===5126?binary.readFloatLE(offset):binary.readUIntLE(offset,size);
    }));
  };
  const append=(rows:number[][],type:string,componentType=5126)=>{
    const n=components[type],size=bytes[componentType],pad=(4-binary.length%4)%4;
    const data=Buffer.alloc(rows.length*n*size);
    rows.forEach((row,i)=>row.forEach((x,k)=>componentType===5126?
      data.writeFloatLE(x,(i*n+k)*size):data.writeUIntLE(x,(i*n+k)*size,size)));
    const view=doc.bufferViews.length;
    doc.bufferViews.push({buffer:0,byteOffset:binary.length+pad,byteLength:data.length});
    binary=Buffer.concat([binary,Buffer.alloc(pad),data]);
    const index=doc.accessors.length;
    const accessor:any={bufferView:view,componentType,count:rows.length,type};
    if(type==='VEC3'){
      accessor.min=[0,1,2].map(k=>Math.min(...rows.map(row=>row[k])));
      accessor.max=[0,1,2].map(k=>Math.max(...rows.map(row=>row[k])));
    }
    doc.accessors.push(accessor);return index;
  };
  const prim=doc.meshes[0].primitives[0],sourceAttributes={...prim.attributes};
  const positions=read(prim.attributes.POSITION);
  const min=positions.reduce((a,p)=>a.map((v,k)=>Math.min(v,p[k])),[Infinity,Infinity,Infinity]);
  const max=positions.reduce((a,p)=>a.map((v,k)=>Math.max(v,p[k])),[-Infinity,-Infinity,-Infinity]);
  const scale=1.96/(max[1]-min[1]);
  const offset=[-(min[0]+max[0])*scale/2,-min[1]*scale,-(min[2]+max[2])*scale/2];
  const points=positions.map(p=>new Vector3(...p.map((v,k)=>v*scale+offset[k]) as [number,number,number]));
  const female=character==='saba';
  const shoulderY=female?1.565:1.475,elbowY=female?1.27:1.18,wristY=female?1.145:1.025;
  const shoulderX=female?.225:.25,elbowX=female?.374:.43,wristX=female?.492:.539;
  const hipY=female?1.045:.995,kneeY=female?.59:.56,ankleY=.13;
  const shoulderZ=-.043,wristZ=female?.012:.016;
  const headY=female?1.696:1.637,neckY=female?1.646:1.583;
  const joints:Joint[]=[
    {name:'Hips',at:[0,hipY,-.02],tail:[0,hipY+.12,-.02]},
    {name:'Spine',at:[0,hipY+.12,-.025],tail:[0,1.36,-.025],parent:'Hips'},
    {name:'Chest',at:[0,1.36,-.025],tail:[0,neckY,-.025],parent:'Spine'},
    {name:'Neck',at:[0,neckY,-.025],tail:[0,headY,-.025],parent:'Chest'},
    {name:'Head',at:[0,headY,-.025],tail:[0,1.94,-.025],parent:'Neck'},
  ];
  for(const [side,sign] of [['L',1],['R',-1]] as const){
    const at=[sign*shoulderX,shoulderY,shoulderZ],elbow=[sign*elbowX,elbowY,female?-.025:-.04];
    const wrist=[sign*wristX,wristY,wristZ],palm=[sign*(wristX+.043),wristY-.068,wristZ];
    joints.push(
      {name:`Clavicle_${side}`,at:[sign*.08,shoulderY-.015,shoulderZ],tail:at,parent:'Chest'},
      {name:`UpperArm_${side}`,at,tail:elbow,parent:`Clavicle_${side}`},
      {name:`LowerArm_${side}`,at:elbow,tail:wrist,parent:`UpperArm_${side}`},
      {name:`Hand_${side}`,at:wrist,tail:palm,parent:`LowerArm_${side}`},
      {name:`UpperLeg_${side}`,at:[sign*.14,hipY,-.02],tail:[sign*.151,kneeY,-.025],parent:'Hips'},
      {name:`LowerLeg_${side}`,at:[sign*.151,kneeY,-.025],tail:[sign*.166,ankleY,-.047],parent:`UpperLeg_${side}`},
      {name:`Foot_${side}`,at:[sign*.166,ankleY,-.047],tail:[sign*.17,.055,.11],parent:`LowerLeg_${side}`},
      {name:`Toe_${side}`,at:[sign*.17,.055,.11],tail:[sign*.17,.05,.18],parent:`Foot_${side}`},
    );
  }
  const jointIndex=new Map(joints.map((j,i)=>[j.name,i]));
  const boneIds=new Map<string,number>();
  for(const j of joints)boneIds.set(j.name,doc.nodes.length+boneIds.size);
  const rawAt=(p:number[])=>p.map((v,k)=>(v-offset[k])/scale);
  for(const j of joints){
    const origin=rawAt(j.at),parent=j.parent?rawAt(joints[jointIndex.get(j.parent)!].at):[0,0,0];
    const node:any={name:j.name,translation:origin.map((v,k)=>v-parent[k]),
      extras:{directBind:{at:j.at,tail:j.tail}}};
    const children=joints.filter(other=>other.parent===j.name).map(other=>boneIds.get(other.name));
    if(children.length)node.children=children;
    doc.nodes.push(node);
  }
  const wrapper=doc.nodes.length;
  doc.nodes.push({name:`${character}-source-space`,translation:offset,scale:[scale,scale,scale],
    children:[0,boneIds.get('Hips')]});
  doc.scenes[doc.scene??0].nodes=[wrapper];
  const upperLength=new Vector3().fromArray(joints[jointIndex.get('UpperArm_L')!].tail)
    .distanceTo(new Vector3().fromArray(joints[jointIndex.get('UpperArm_L')!].at));
  const forearmLength=new Vector3().fromArray(joints[jointIndex.get('LowerArm_L')!].tail)
    .distanceTo(new Vector3().fromArray(joints[jointIndex.get('LowerArm_L')!].at));
  const palmOffset=female?.103:.088;
  const profile={schema:'direct-original-v1',character,scale,offset,joints,hipY,kneeY,ankleY,headY,neckY,
    shoulderX,shoulderY,shoulderZ,upperLength,forearmLength,palmOffset,gripLength:forearmLength+palmOffset,
    palmCenter:female?[.553,1.055,.043]:[.578,.96,.052]};
  doc.scenes[doc.scene??0].extras={...doc.scenes[doc.scene??0].extras,directOriginalRig:profile};
  const distance=(p:Vector3,j:Joint)=>{
    const a=new Vector3().fromArray(j.at),d=new Vector3().fromArray(j.tail).sub(a);
    const u=Math.max(0,Math.min(1,p.clone().sub(a).dot(d)/d.lengthSq()));
    return p.distanceTo(a.addScaledVector(d,u));
  };
  // A continuous anatomical field, averaged over seam-equivalent vertices.
  const weights=points.map(p=>{
    const side=p.x>=0?'L':'R',ax=Math.abs(p.x);
    const w=new Float64Array(joints.length);
    const handRegion=smooth(.25,.35,ax)*smooth(.78,.94,p.y)
      *(1-smooth(shoulderY-.02,shoulderY+.08,p.y));
    const armCandidates=[`UpperArm_${side}`,`LowerArm_${side}`,`Hand_${side}`];
    const bodyCandidates=['Hips','Spine','Chest','Neck','Head'];
    const legCandidates=[`UpperLeg_${side}`,`LowerLeg_${side}`,`Foot_${side}`,`Toe_${side}`];
    const assign=(names:string[],amount:number)=>{
      let total=0;const values=names.map(n=>{const d=distance(p,joints[jointIndex.get(n)!]);const v=1/(d+.045)**4;total+=v;return v;});
      names.forEach((n,i)=>w[jointIndex.get(n)!]+=amount*values[i]/total);
    };
    const lower=(1-smooth(hipY-.13,hipY+.06,p.y))*(1-handRegion);
    if(p.y<.135)w[jointIndex.get(`Foot_${side}`)!]=1;
    else if(p.y>headY+.035)w[jointIndex.get('Head')!]=1;
    else{
      // Use one smooth longitudinal blend at each anatomical hinge, rather
      // than competing distance fields that pinch the elbow between segments.
      const shoulder=new Vector3().fromArray(joints[jointIndex.get(`UpperArm_${side}`)!].at);
      const elbow=new Vector3().fromArray(joints[jointIndex.get(`LowerArm_${side}`)!].at);
      const wrist=new Vector3().fromArray(joints[jointIndex.get(`Hand_${side}`)!].at);
      const armAxis=wrist.clone().sub(shoulder).normalize();
      const atElbow=p.clone().sub(elbow).dot(armAxis);
      const atWrist=p.clone().sub(wrist).dot(armAxis);
      const lowerMix=smooth(-.075,.075,atElbow);
      const handMix=smooth(-.025,.035,atWrist);
      w[jointIndex.get(`UpperArm_${side}`)!]+=handRegion*(1-lowerMix);
      w[jointIndex.get(`LowerArm_${side}`)!]+=handRegion*lowerMix*(1-handMix);
      w[jointIndex.get(`Hand_${side}`)!]+=handRegion*lowerMix*handMix;
      if(female&&ax<.29&&p.y>.85&&p.y<1.24){
        // Skirt keeps a coherent pelvic silhouette rather than splitting into legs.
        const hip=smooth(.83,.93,p.y)*(1-handRegion);
        w[jointIndex.get('Hips')!]+=hip;
        assign(bodyCandidates,(1-handRegion-hip)*(1-lower));
        assign(legCandidates,(1-handRegion-hip)*lower);
      }else{
        assign(legCandidates,lower);
        assign(bodyCandidates,Math.max(0,1-handRegion-lower));
      }
    }
    return w;
  });
  const weld=new Map<string,number[]>(),groupOf:number[]=[];
  points.forEach((p,i)=>{
    const key=p.toArray().map(x=>Math.round(x*1e5)).join(',');
    if(!weld.has(key))weld.set(key,[]);
    weld.get(key)!.push(i);
  });
  const groups=[...weld.values()];groups.forEach((ids,g)=>ids.forEach(i=>groupOf[i]=g));
  const faces=read(prim.indices).flat(),neighbors=groups.map(()=>new Set<number>());
  for(let i=0;i<faces.length;i+=3)for(let k=0;k<3;k++){
    const a=groupOf[faces[i+k]],b=groupOf[faces[i+(k+1)%3]];
    if(a!==b){neighbors[a].add(b);neighbors[b].add(a);}
  }
  let averaged=groups.map(ids=>{
    const out=new Float64Array(joints.length);
    for(const i of ids)weights[i].forEach((w,k)=>out[k]+=w/ids.length);return out;
  });
  for(let iteration=0;iteration<5;iteration++)averaged=averaged.map((row,i)=>{
    if(!neighbors[i].size)return row;
    const out=Float64Array.from(row,w=>w*.65);
    for(const neighbor of neighbors[i])averaged[neighbor].forEach((w,k)=>out[k]+=.35*w/neighbors[i].size);
    return out;
  });
  const indexes:number[][]=[],values:number[][]=[];
  for(let i=0;i<points.length;i++){
    const selected=[...averaged[groupOf[i]]].map((w,k)=>[k,w]).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const total=selected.reduce((s,p)=>s+p[1],0);
    indexes.push(selected.map(p=>p[0]));values.push(selected.map(p=>p[1]/total));
  }
  prim.attributes.JOINTS_0=append(indexes,'VEC4',5123);
  prim.attributes.WEIGHTS_0=append(values,'VEC4');
  // Optional grasp morphs: original POSITION stays byte-identical and morph
  // weights are zero in the exported bind pose. Curl only distal finger surface.
  const morphs:number[][][]=[];
  for(const [side,sign] of [['L',1],['R',-1]] as const){
    const wrist=new Vector3().fromArray(joints[jointIndex.get(`Hand_${side}`)!].at);
    const palm=new Vector3(...profile.palmCenter as [number,number,number]);palm.x*=sign;
    const d=palm.clone().sub(wrist).normalize();
    const normal=new Vector3(0,0,1).addScaledVector(d,-d.z).normalize();
    const lateral=d.clone().cross(normal).normalize();
    const hinge=palm.clone().addScaledVector(d,.012);
    morphs.push(points.map((p,i)=>{
      if(p.x*sign<.42||p.y>wristY+.035)return [0,0,0];
      const weight=values[i].reduce((sum,w,k)=>sum+(indexes[i][k]===jointIndex.get(`Hand_${side}`)?w:0),0);
      const rel=p.clone().sub(hinge),u=rel.dot(d),v=rel.dot(normal),cross=rel.dot(lateral);
      if(u<=0||Math.abs(cross)>.063)return [0,0,0];
      const radius=.035,angle=Math.min(2.4,u/radius);
      const bent=hinge.clone().addScaledVector(d,Math.sin(angle)*radius)
        .addScaledVector(normal,(1-Math.cos(angle))*radius+v).addScaledVector(lateral,cross);
      return bent.sub(p).multiplyScalar(weight/scale).toArray();
    }));
  }
  prim.targets=morphs.map(rows=>({POSITION:append(rows,'VEC3')}));
  doc.meshes[0].weights=[0,0];
  doc.meshes[0].extras={...doc.meshes[0].extras,targetNames:['Grip_L','Grip_R']};
  const inverses=joints.map(j=>new Matrix4().makeTranslation(...rawAt(j.at) as [number,number,number]).invert().toArray());
  doc.skins=[{name:`${character}-direct-skeleton`,skeleton:boneIds.get('Hips'),
    joints:joints.map(j=>boneIds.get(j.name)),inverseBindMatrices:append(inverses,'MAT4')}];
  doc.nodes[0].skin=0;
  doc.buffers[0].byteLength=binary.length;
  if(!binary.subarray(0,original.length).equals(original))throw Error('Source binary changed');
  for(const [k,v] of Object.entries(sourceAttributes))if(prim.attributes[k]!==v)throw Error('Source accessor replaced');
  const json=Buffer.from(JSON.stringify(doc)),jp=Buffer.alloc((4-json.length%4)%4,32),bp=Buffer.alloc((4-binary.length%4)%4);
  const header=Buffer.alloc(20),bh=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);
  header.writeUInt32LE(28+json.length+jp.length+binary.length+bp.length,8);
  header.writeUInt32LE(json.length+jp.length,12);header.writeUInt32LE(0x4e4f534a,16);
  bh.writeUInt32LE(binary.length+bp.length,0);bh.writeUInt32LE(0x004e4942,4);
  const output=Buffer.concat([header,json,jp,bh,binary,bp]);
  mkdirSync('public/models/characters',{recursive:true});
  mkdirSync(`assets/characters/${character}`,{recursive:true});
  writeFileSync(`public/models/characters/${character}.glb`,output);
  writeFileSync(`assets/characters/${character}/direct-rig.json`,JSON.stringify({
    source,sourceSha256:hash(raw),outputSha256:hash(output),originalBinarySha256:hash(original),
    originalBinaryBytes:original.length,vertices:points.length,triangles:faces.length/3,
    preserved:['POSITION','NORMAL','TEXCOORD_0','indices','materials','textures','images'],
    profile,status:'direct-rig-awaiting-match-validation',
  },null,2));
  console.log(character,points.length,'vertices preserved; rig added',output.length,'bytes');
}
