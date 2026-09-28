const KEY='rally-seat';
export function readSeat():string|null {
  try{return sessionStorage.getItem(KEY);}
  catch(error){console.warn('[network] Could not read saved seat',error);return null;}
}
export function saveSeat(value:string):boolean {
  try{sessionStorage.setItem(KEY,value);return true;}
  catch(error){console.warn('[network] Could not save seat; refresh recovery unavailable',error);return false;}
}
export function clearSeat(){
  try{sessionStorage.removeItem(KEY);}
  catch(error){console.warn('[network] Could not clear saved seat',error);}
}
