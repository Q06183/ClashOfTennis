/** An invitation must address the server, not the recipient's own device. */
export function invitationLink(origin:string,code:string):string|null {
  if(!/^\d{6}$/.test(code))return null;
  try{
    const url=new URL(origin),host=url.hostname.toLowerCase().replace(/\.$/,'');
    if(!['http:','https:'].includes(url.protocol)||host==='localhost'||host.endsWith('.localhost')||host==='[::1]'||host==='0.0.0.0'||/^127\./.test(host))return null;
    return `${url.origin}/?room=${code}`;
  }catch{return null;}
}
