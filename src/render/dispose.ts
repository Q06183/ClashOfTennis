import * as T from 'three';
/** Cloned skins share geometry and maps; release every owned GPU resource once. */
export function disposeTree(root:T.Object3D){
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>(),skeletons=new Set<T.Skeleton>();
  root.traverse(o=>{
    if(o instanceof T.SkinnedMesh)skeletons.add(o.skeleton);
    if(o instanceof T.Mesh||o instanceof T.Line){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}
  });
  for(const m of materials)for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value);
  for(const resource of [...geometries,...materials,...textures,...skeletons])resource.dispose();
}
