// Verschlüsselung, identisch zur App (AES-GCM, Schlüssel aus Passwort per PBKDF2).
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=u=>Buffer.from(u).toString("base64"),unb64=s=>new Uint8Array(Buffer.from(s,"base64"));
async function key(pass,salt){const k=await crypto.subtle.importKey("raw",enc.encode(pass),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:150000,hash:"SHA-256"},k,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
export async function verschluesseln(obj,pass){const s=crypto.getRandomValues(new Uint8Array(16)),i=crypto.getRandomValues(new Uint8Array(12));
  const c=await crypto.subtle.encrypt({name:"AES-GCM",iv:i},await key(pass,s),enc.encode(JSON.stringify(obj)));return JSON.stringify({v:1,s:b64(s),i:b64(i),c:b64(new Uint8Array(c))})}
export async function entschluesseln(text,pass){const o=JSON.parse(text);
  const p=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(o.i)},await key(pass,unb64(o.s)),unb64(o.c));return JSON.parse(dec.decode(p))}
