import {Object3D,SkinnedMesh} from 'three';

/** Visibility-based selection of independently authored garments on one body rig.
 * Garments are preloaded and share actual bone identities, not just bone names.
 * This controller does not synthesize missing body surfaces or repair clipping.
 */
export class AthleteWardrobe {
  readonly outfits:readonly string[];
  readonly slots:readonly string[];
  private garments:Object3D[]=[];
  private coveredBodies:{node:Object3D;slots:string[]}[]=[];
  private hiddenSlots=new Set<string>();
  private selected:string;

  constructor(readonly root:Object3D){
    const identity=root.userData.wardrobe;
    if(!identity?.character||!identity?.rig)throw new Error('Missing wardrobe identity');
    const bodies:SkinnedMesh[]=[];
    root.traverse(node=>{
      if(node.userData.role==='body'&&node instanceof SkinnedMesh)bodies.push(node);
      if(node.userData.role==='garment')this.garments.push(node);
    });
    if(!bodies.length)throw new Error('Wardrobe requires a complete skinned body');
    const bones=new Set(bodies.flatMap(body=>body.skeleton.bones));
    for(const garment of this.garments){
      const data=garment.userData;
      if(data.character!==identity.character||data.rig!==identity.rig)
        throw new Error(`Incompatible garment: ${garment.name}`);
      if(typeof data.outfit!=='string'||!data.outfit||typeof data.slot!=='string'||!data.slot)
        throw new Error(`Missing garment slot or outfit: ${garment.name}`);
      garment.traverse(node=>{
        if(node instanceof SkinnedMesh&&node.skeleton.bones.some(bone=>!bones.has(bone)))
          throw new Error(`Garment uses a different skeleton: ${garment.name}`);
      });
    }
    this.outfits=Object.freeze([...new Set(this.garments.map(g=>g.userData.outfit as string))]
      .filter(name=>name!=='shared').sort());
    this.slots=Object.freeze([...new Set(this.garments.map(g=>g.userData.slot as string))].sort());
    if(!this.outfits.length)throw new Error('Wardrobe requires at least one outfit');
    for(const body of bodies){
      const coverage=body.userData.coveredBy;
      if(coverage===undefined)continue;
      if(!Array.isArray(coverage)||!coverage.length||
         coverage.some(slot=>typeof slot!=='string'||!this.slots.includes(slot)))
        throw new Error(`Invalid body coverage: ${body.name}`);
      this.coveredBodies.push({node:body,slots:[...coverage]});
    }
    this.selected=this.outfits.includes('reference')?'reference':this.outfits[0];
    this.apply();
  }

  get currentOutfit(){return this.selected;}

  setOutfit(outfit:string){
    if(!this.outfits.includes(outfit))throw new Error(`Unknown outfit: ${outfit}`);
    this.selected=outfit;this.apply();
  }

  setSlotVisible(slot:string,visible:boolean){
    if(!this.slots.includes(slot))throw new Error(`Unknown slot: ${slot}`);
    if(visible)this.hiddenSlots.delete(slot);else this.hiddenSlots.add(slot);
    this.apply();
  }

  private apply(){
    for(const garment of this.garments)
      garment.visible=!this.hiddenSlots.has(garment.userData.slot)
        &&(garment.userData.outfit==='shared'||garment.userData.outfit===this.selected);
    const visibleSlots=new Set(this.garments.filter(g=>g.visible).map(g=>g.userData.slot));
    // A section covered by several slots stays visible if any covering garment
    // is absent. Authors must split sections finely enough to prevent clipping.
    for(const body of this.coveredBodies)
      body.node.visible=!body.slots.every(slot=>visibleSlots.has(slot));
  }
}
