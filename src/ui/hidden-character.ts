import {getCharacter,type CharacterId} from '../simulation/characters.js';

type Store=Pick<Storage,'getItem'|'setItem'>;
const KEY='rally-hidden-master';

/** Local discovery only: the server still validates identities, not this flag. */
export class HiddenCharacterUnlock {
  unlocked=false;
  private taps=0;
  constructor(private storage:Store,private report:(error:unknown)=>void=error=>console.warn('[hidden-master] Storage unavailable',error)){
    try{this.unlocked=storage.getItem(KEY)==='1';}catch(error){this.report(error);}
  }
  reset(){this.taps=0;}
  activate():'pending'|'unlocked'|'session-only'|'already-unlocked' {
    if(this.unlocked)return 'already-unlocked';
    if(++this.taps<5)return 'pending';
    this.unlocked=true;this.reset();
    try{this.storage.setItem(KEY,'1');return 'unlocked';}
    catch(error){this.report(error);return 'session-only';}
  }
  selectable(id?:string):CharacterId {
    const character=getCharacter(id);
    return character.hidden&&!this.unlocked?'lin':character.id;
  }
}
