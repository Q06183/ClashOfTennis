/** Browser privacy modes may deny even reading localStorage. */
export function readPreference(key:string):string|null {
  try{return localStorage.getItem(key);}
  catch(error){console.warn(`[preferences] Could not read ${key}`,error);return null;}
}
export function writePreference(key:string,value:string):boolean {
  try{localStorage.setItem(key,value);return true;}
  catch(error){console.warn(`[preferences] Could not save ${key}`,error);return false;}
}
