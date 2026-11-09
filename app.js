/* Ki Aktien Helfer – eigenständige App.
   Live-Kurse: Finnhub (eigener Schlüssel). KI-Teil: ki.json, wird von Claude regelmäßig neu geschrieben. */
"use strict";
const $=s=>document.querySelector(s);
const fmt=(v,d=2)=>(+v).toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
const sgn=v=>(v>0?"+":"")+fmt(v,1)+" %";
const pct=c=>`<span class="num ${c>0.05?"up":c<-0.05?"down":"flat"}">${c>0?"+":""}${fmt(c)} %</span>`;
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const PREVIEW=!!window.KAH_PREVIEW;
/* Europa: Kürzel mit Börsen-Endung, alte Kurz-Kürzel werden umgestellt */
const EU_SUF=/\.(DE|F|AS|PA|MI|L|SW|VI|MC|BR|CO|ST|HE|OL|LS|IR)$/;
const LEGACY={BTC:"BTC-EUR",ETH:"ETH-EUR",GOLD:"4GLD.DE",SIE:"SIE.DE",ALV:"ALV.DE",DTE:"DTE.DE",MBG:"MBG.DE",BMW:"BMW.DE",VOW3:"VOW3.DE",BAS:"BAS.DE",BAYN:"BAYN.DE",ADS:"ADS.DE",IFX:"IFX.DE",RHM:"RHM.DE",MUV2:"MUV2.DE",DBK:"DBK.DE",DHL:"DHL.DE",AIR:"AIR.DE"};
const isEU=s=>EU_SUF.test(s||"");
const curOf=s=>{const q=S.quotes[s];if(q&&q.cur)return q.cur;const st=KI&&(KI.stocks||[]).find(x=>x.s===s);if(st&&st.cur)return st.cur;return isEU(s)?"EUR":"USD"};
const kindOf=s=>{const m=(S.markt||[]).find(x=>x.s===s);return m?m.k.split(":")[0]:(s||"").startsWith("^")?"idx":/-EUR$/.test(s||"")?"krypto":""};
const cs=s=>kindOf(s)==="idx"?"Pkt.":({EUR:"€",USD:"$",GBp:"p",GBP:"£",CHF:"CHF"}[curOf(s)]||curOf(s));
const enc=s=>encodeURIComponent(s);
const nameOf=s=>{const k=KI&&(KI.stocks||[]).find(x=>x.s===s);if(k)return k.n;const m=(S.markt||[]).find(x=>x.s===s);if(m)return m.n;const c=KI&&(KI.catalog||[]).find(x=>x.s===s);if(c)return c.n;const d=S.depot.find(x=>x.s===s);return d?d.n:s};
const KIND_TXT={idx:"Index",etf:"ETF",roh:"Rohstoff",krypto:"Kryptowährung",fx:"Währung",alt:"ETF"};
const ALT_INFO={"Weniger USA":"Gleiche Welt, kleinerer US-Anteil. World ex USA lässt die USA ganz weg und lässt sich mit einem S&P-500-ETF in eigener Gewichtung kombinieren. ACWI nimmt Schwellenländer dazu (USA ca. 64 % statt 73 %). Gleichgewichtet heißt: jede Firma gleich viel, weniger Abhängigkeit von den großen Tech-Werten.",
 "Europa":"Europäische Unternehmen. Unabhängiger vom US-Markt und vom Dollar, dafür stärker an die Wirtschaft in Europa gebunden.",
 "Schwellenländer":"China, Indien, Taiwan und andere. Mehr Wachstumschancen, aber stärkere Schwankungen und politische Risiken.",
 "Defensiver":"Firmen mit stabilen Gewinnen oder hohen Dividenden. Fallen in Krisen oft weniger, steigen in Boomphasen aber langsamer. Der US-Anteil bleibt teils hoch.",
 "Anleihen und Geldmarkt":"Deutlich schwankungsärmer als Aktien. Der Geldmarkt-ETF wirkt ähnlich wie Tagesgeld. Staatsanleihen verlieren an Wert, wenn die Zinsen steigen.",
 "Gold":"Gilt als Krisenschutz, bringt aber keine Zinsen oder Dividenden. Xetra-Gold ist mit echtem Gold hinterlegt."};
const AMPEL=["","🟩","🟨","🟥"],AMPEL_TXT=["","unauffällig","erhöht","hoch"];
const toEUR=(v,s)=>{const c=curOf(s);return c==="EUR"?v:c==="USD"?v/(S.fx||1.1):v};
const xetraOffen=()=>{const p=new Intl.DateTimeFormat("en-US",{timeZone:"Europe/Berlin",weekday:"short",hour:"numeric",minute:"numeric",hour12:false}).formatToParts(new Date()),g=k=>p.find(x=>x.type===k).value,m=+g("hour")*60+ +g("minute");return !["Sat","Sun"].includes(g("weekday"))&&m>=540&&m<1050};

/* ---------- Speicher (auf dem Gerät, mit Sicherung als Datei) ---------- */
const DEF={v:1,
 settings:{name:"",accent:"#0f6b5c",theme:"auto",investor:"ausgewogen",alertDefault:-10,thinkDefault:7,
   start:{alerts:true,markt:true,news:true,depot:true},fhKey:"",kiUrl:"ki.json",refreshMin:15,ghRepo:"",ghToken:"",syncPass:"",
   notify:{warn:true,loss:true,target:true,move:5,news:true,kh:true,sparplan:true,earnings:true,model:true,briefing:true,night:true}},
 depot:[{s:"AAPL",n:"Apple",q:5,k:300,a:-10,demo:true}],
 fin:{demo:true,model:"",dismissRec:"",goal:{n:"Notgroschen",z:5000,g:1800},items:[
  {n:"Gehalt",b:2600,t:"ein"},{n:"Miete",b:850,t:"fix"},{n:"Versicherungen",b:120,t:"fix"},{n:"Handy und Internet",b:55,t:"fix"},{n:"Streaming-Abos",b:25,t:"fix"},
  {n:"Lebensmittel",b:350,t:"var"},{n:"Freizeit",b:200,t:"var"},{n:"ETF-Sparplan",b:200,t:"spar"},{n:"Rücklage",b:150,t:"spar"}]},
 kh:{list:[],saved:0,bought:0},updates:{},quotes:{},lastLive:0,kiCache:null,watch:[],inboxDone:[],syncAt:0,syncHash:"",syncInfo:""};
let S;
function load(){try{S=JSON.parse(localStorage.getItem("kah")||"null")}catch(e){S=null}
 S=Object.assign(structuredClone(DEF),S||{});S.settings=Object.assign(structuredClone(DEF.settings),S.settings||{});S.settings.start=Object.assign({},DEF.settings.start,S.settings.start||{});S.settings.notify=Object.assign({},DEF.settings.notify,S.settings.notify||{})}
function migrate(){(S.depot||[]).forEach(d=>{if(LEGACY[d.s])d.s=LEGACY[d.s]});S.watch=(S.watch||[]).map(w=>LEGACY[w]||w)}
function save(){try{localStorage.setItem("kah",JSON.stringify(S))}catch(e){}if(typeof syncPlan==="function")syncPlan()}
load();migrate();

/* ---------- KI-Datei ---------- */
let KI=null,kiErr="";
async function loadKI(){
 try{const r=await fetch(S.settings.kiUrl||"ki.json",{cache:"no-store"});if(!r.ok)throw new Error(r.status);KI=await r.json();S.kiCache=KI;save();kiErr=""}
 catch(e){KI=S.kiCache;kiErr="KI-Datei nicht erreichbar, zeige letzten Stand."}
 if(!KI)KI={stocks:[],news:[],indices:[],sectors:[],calendar:[],catalog:[],updates:[],model:{trendDamping:.5,bandFactor:1,newsWeight:1}};
}

/* ---------- Live-Kurse (Finnhub) ---------- */
const SECTOR_ETF=[["XLK","Technologie"],["XLV","Gesundheit"],["XLF","Finanzen"],["XLE","Energie"],["XLY","Konsum"],["XLI","Industrie"]];
const INDEX_ETF=[["SPY","S&P 500"],["QQQ","Nasdaq 100"],["DIA","Dow Jones"]];
let busy=false,liveErr="";
async function fh(path){const r=await fetch(`https://finnhub.io/api/v1/${path}&token=${encodeURIComponent(S.settings.fhKey)}`);if(r.status===401||r.status===403)throw new Error("key");if(r.status===429)throw new Error("limit");if(!r.ok)throw new Error("net");return r.json()}
function kurseUrl(){let r=S.settings.ghRepo;if(!r&&/github\.io$/.test(location.hostname))r=location.hostname.split(".")[0]+"/"+location.pathname.split("/")[1];return r?`https://raw.githubusercontent.com/${r}/kurse/kurse.json?t=${Math.floor(Date.now()/12e4)}`:null}
async function euLaden(){const u=kurseUrl();if(!u)return;try{const r=await fetch(u,{cache:"no-store"});if(!r.ok)return;const k=await r.json();
 Object.entries(k.q||{}).forEach(([s,q])=>{const old=S.quotes[s];if(!old||isEU(s)||!S.settings.fhKey||(q.t||0)>(old.t||0))S.quotes[s]={c:q.c,dp:q.dp,t:q.t||k.t,cur:q.cur}});
 S.euIdx=k.idx||[];S.euSec=k.sec||[];if(k.h)S.hist=k.h;if(k.markt)S.markt=k.markt;S.warn=k.w||{};if(k.fx&&k.fx.EURUSD)S.fx=k.fx.EURUSD;S.euT=k.t;delete S.euErr;A=analyzeAll()}catch(e){S.euErr="EU-Kurse nicht erreichbar"}}
async function refreshLive(manual){
 if(PREVIEW){if(manual)toast("In der Vorschau gibt es keine Live-Kurse. In der installierten App schon.");return}
 if(busy)return;busy=true;spin(true);liveErr="";
 await euLaden();
 if(!S.settings.fhKey){busy=false;spin(false);S.lastLive=Date.now();save();A=analyzeAll();render(true);if(manual)toast(S.euT?"EU-Kurse aktualisiert. Für US-Kurse Finnhub-Schlüssel eintragen.":"Für Live-Kurse Finnhub-Schlüssel eintragen");return}
 const syms=[...new Set([...KI.stocks.map(s=>s.s),...S.depot.map(d=>d.s),...S.watch,...INDEX_ETF.map(x=>x[0]),...SECTOR_ETF.map(x=>x[0])])].filter(s=>/^[A-Z][A-Z.]{0,5}$/.test(s)&&!isEU(s)&&!["BTC","ETH","GOLD"].includes(s));
 for(const s of syms){try{const q=await fh(`quote?symbol=${s}`);if(q&&q.c)S.quotes[s]={c:q.c,dp:q.dp??0,pc:q.pc,t:q.t*1000,cur:"USD"}}
  catch(e){liveErr=e.message==="key"?"Finnhub-Schlüssel ungültig. Bitte in den Einstellungen prüfen.":e.message==="limit"?"Abfragelimit erreicht, nächster Versuch beim nächsten Intervall.":"Keine Verbindung zum Kursdienst.";if(e.message!=="net")break}}
 S.lastLive=Date.now();save();busy=false;spin(false);A=analyzeAll();render(true);if(liveErr)toast(liveErr);else if(manual)toast("Kurse aktualisiert")}
const newsCache={};
async function liveNews(s){if(PREVIEW||!S.settings.fhKey)return null;const c=newsCache[s];if(c&&Date.now()-c.t<18e5)return c.d;
 const to=new Date(),from=new Date(Date.now()-5*864e5),d=x=>x.toISOString().slice(0,10);
 try{const n=await fh(`company-news?symbol=${s}&from=${d(from)}&to=${d(to)}`);newsCache[s]={t:Date.now(),d:(n||[]).slice(0,6)};return newsCache[s].d}catch(e){return null}}
function marketOpen(){const p=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",weekday:"short",hour:"numeric",minute:"numeric",hour12:false}).formatToParts(new Date());const g=k=>p.find(x=>x.type===k).value;
 const wd=g("weekday"),m=+g("hour")*60+ +g("minute");return !["Sat","Sun"].includes(wd)&&m>=570&&m<960}


/* ---------- Abgleich mit GitHub (verschlüsselt) ---------- */
const te=new TextEncoder(),td=new TextDecoder(),b64=u=>btoa(String.fromCharCode(...u)),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function cKey(pass,salt){const k=await crypto.subtle.importKey("raw",te.encode(pass),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:150000,hash:"SHA-256"},k,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function encJ(o,pass){const sa=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const c=await crypto.subtle.encrypt({name:"AES-GCM",iv},await cKey(pass,sa),te.encode(JSON.stringify(o)));return JSON.stringify({v:1,s:b64(sa),i:b64(iv),c:b64(new Uint8Array(c))})}
async function decJ(t,pass){const o=JSON.parse(t);return JSON.parse(td.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(o.i)},await cKey(pass,unb64(o.s)),unb64(o.c))))}
const syncOn=()=>!PREVIEW&&S.settings.ghRepo&&S.settings.ghToken&&S.settings.syncPass;
async function gh(path,opt={}){const r=await fetch(`https://api.github.com/repos/${S.settings.ghRepo}/contents/${path}`,Object.assign({headers:{Authorization:`Bearer ${S.settings.ghToken}`,Accept:"application/vnd.github+json"}},opt));
 if(r.status===404)return null;if(r.status===401||r.status===403)throw new Error("GitHub-Schlüssel ungültig oder ohne Schreibrecht");if(!r.ok)throw new Error("GitHub "+r.status);return r.json()}
function payload(){const [rec]=recommend();return {depot:S.depot.filter(d=>!d.demo),fin:S.fin,kh:S.kh,updates:S.updates,watch:S.watch,notify:S.settings.notify,investor:S.settings.investor,
 model:S.fin.model||"",modelName:S.fin.model?MODELS[S.fin.model].n:"",rec,recName:MODELS[rec].n,inboxDone:S.inboxDone.slice(-200)}}
let syncT=null,syncBusy=false;
let wecken=false;
function syncPlan(schnell){if(!syncOn()||!KI)return;if(schnell)wecken=true;const h=JSON.stringify(payload());if(h===S.syncHash&&!schnell)return;clearTimeout(syncT);syncT=setTimeout(syncPush,schnell?1500:20000)}
async function weckeWachmann(){try{const r=await fetch(`https://api.github.com/repos/${S.settings.ghRepo}/actions/workflows/wachmann.yml/dispatches`,{method:"POST",headers:{Authorization:`Bearer ${S.settings.ghToken}`,Accept:"application/vnd.github+json"},body:JSON.stringify({ref:"main"})});
 S.weckOk=r.status===204;try{localStorage.setItem("kah",JSON.stringify(S))}catch(e){}}catch(e){S.weckOk=false}
 [90,240,420].forEach(sec=>setTimeout(()=>refreshLive(),sec*1000))}
async function syncPush(){if(!syncOn()||syncBusy)return;syncBusy=true;try{const p=payload(),h=JSON.stringify(p);p.updatedAt=Date.now();const cur=await gh("data/state.enc");
 await gh("data/state.enc",{method:"PUT",body:JSON.stringify({message:"App: Daten aktualisiert",content:btoa(await encJ(p,S.settings.syncPass)),sha:cur?cur.sha:undefined})});
 S.syncAt=p.updatedAt;S.syncHash=h;S.syncInfo="";if(wecken){wecken=false;weckeWachmann()}try{localStorage.setItem("kah",JSON.stringify(S))}catch(e){}}catch(e){S.syncInfo=e.message;toast("Abgleich: "+e.message)}syncBusy=false}
async function syncPull(){if(!syncOn())return;try{const r=await gh("data/state.enc");if(r){const o=await decJ(atob(r.content.replace(/\n/g,"")),S.settings.syncPass);
  if(o.updatedAt>S.syncAt){Object.assign(S,{depot:o.depot.length?o.depot:S.depot.filter(d=>d.demo),fin:o.fin,kh:o.kh,updates:o.updates||{},watch:o.watch||[],inboxDone:o.inboxDone||[]});
   Object.assign(S.settings.notify,o.notify||{});if(o.investor)S.settings.investor=o.investor;S.syncAt=o.updatedAt;S.syncHash=JSON.stringify(payload())}}
 const ib=await gh("data/inbox.enc");if(ib){const {events}=await decJ(atob(ib.content.replace(/\n/g,"")),S.settings.syncPass);let n=0;
  for(const e of events||[]){if(S.inboxDone.includes(e.id))continue;S.inboxDone.push(e.id);n++;const it=e.item,i=S.kh.list.findIndex(x=>String(x.id)===String(it.id));
   if(e.type==="kh-new"&&i<0)S.kh.list.push(it);if(e.type==="kh-buy"){if(i>=0)S.kh.list.splice(i,1);S.kh.bought+=it.p}if(e.type==="kh-skip"){if(i>=0)S.kh.list.splice(i,1);S.kh.saved+=it.p}}
  if(n)toast(`${n} Aktion(en) aus Telegram übernommen`)}
 S.syncInfo="";save()}catch(e){S.syncInfo=e.message.includes("decrypt")||e.name==="OperationError"?"Sync-Passwort passt nicht zu den Daten auf GitHub.":e.message}}

/* ---------- Rechenmodell (mit freigegebenen Lern-Updates) ---------- */
function params(){const p=Object.assign({trendDamping:.5,bandFactor:1,newsWeight:1},KI.model||{});(KI.updates||[]).forEach(u=>{if(S.updates[u.id]==="ok")Object.assign(p,u.change||{})});return p}
function analyze(st){
 const P=params();const old=st.closes.slice().reverse();const q=S.quotes[st.s];
 let last=old[old.length-1],chg=(last/old[old.length-2]-1)*100,live=false;
 if(q&&(st.pseudo||q.t>Date.parse(KI.dataAsOf||0)+864e5*0.5)){live=true;chg=q.dp;if(Math.abs(q.c-last)/last>1e-6&&!(st.pseudo&&Date.now()-q.t<864e5&&old.length&&st.heute)){old.push(q.c)}else old[old.length-1]=q.c;last=q.c}
 const r=[];for(let i=1;i<old.length;i++)r.push(Math.log(old[i]/old[i-1]));
 const mu=mean(r),sd=Math.sqrt(mean(r.map(x=>(x-mu)**2)));
 const sma=n=>mean(old.slice(-n)),s10=sma(10),s30=sma(30);
 const ch20=(last/old[Math.max(0,old.length-21)]-1)*100,ch3m=(last/old[0]-1)*100;
 let peak=old[0],dd=0;old.forEach(v=>{peak=Math.max(peak,v);dd=Math.min(dd,(v/peak-1)*100)});
 const score=(s10/s30-1)*100+ch20/4,dir=score>1?"up":score<-1?"down":"flat";
 const H=st.h==="kurz"?20:63,drift=P.trendDamping*mu*H+(st.bias||0)*P.newsWeight/100,band=sd*Math.sqrt(H)*P.bandFactor;
 const mid=last*Math.exp(drift),lo=last*Math.exp(drift-band),hi=last*Math.exp(drift+band),vol=sd*Math.sqrt(252)*100;
 return {st,old,last,chg,live,dir,ch20,ch3m,dd,H,mid,lo,hi,vol,band,drift,min:Math.min(...old),max:Math.max(...old),
  pm:(mid/last-1)*100,pl:(lo/last-1)*100,ph:(hi/last-1)*100,risk:vol<20?1:vol<35?2:3}}
let A={};const analyzeAll=()=>{const o={};(KI.stocks||[]).forEach(s=>{try{o[s.s]=analyze(s)}catch(e){}});
 Object.entries(S.hist||{}).forEach(([s,c])=>{if(o[s]||!c||c.length<25)return;const k=kindOf(s);try{o[s]=analyze({s,n:nameOf(s),h:"lang",bias:0,closes:c,cat:KIND_TXT[k]||"Ohne KI-Einschätzung",pseudo:true,kind:k,heute:true})}catch(e){}});return o};
const priceOf=s=>A[s]?A[s].last:S.quotes[s]?S.quotes[s].c:null;

/* ---------- Bausteine ---------- */
const DIR={up:["↗","Trend aufwärts"],down:["↘","Trend abwärts"],flat:["→","Trend seitwärts"]};
const RISK=["","niedrig","mittel","hoch"];
const imp=l=>`<span class="imp l${l}"><i></i><i></i><i></i> ${["","Niedrig","Mittel","Hoch"][l]}</span>`;
function spark(a,w=72,h=26){const d=a.old,mn=a.min,mx=a.max;const pts=d.map((v,i)=>`${(i/(d.length-1)*w).toFixed(1)},${(h-2-(v-mn)/(mx-mn||1)*(h-4)).toFixed(1)}`).join(" ");
 return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(${a.ch3m>=0?"--up":"--down"})" stroke-width="1.6"/></svg>`}
function bigChart(a){const W=340,H=190,L=40,R=8,T=10,B=24,n=a.old.length,tot=n-1+a.H;
 const ymin=Math.min(a.min,a.lo)*.98,ymax=Math.max(a.max,a.hi)*1.02,x=i=>L+i/tot*(W-L-R),y=v=>T+(ymax-v)/(ymax-ymin)*(H-T-B);
 const grid=[0,1,2,3].map(k=>{const v=ymin+(ymax-ymin)*k/3;return `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="2" y="${y(v)+3}">${fmt(v,0)}</text>`}).join("");
 const hist=a.old.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");let up="",dn="";const i0=n-1;
 for(let k=0;k<=a.H;k++){const f=k/a.H,c=a.last*Math.exp(a.drift*f),w=a.band*Math.sqrt(f);up+=`${x(i0+k).toFixed(1)},${y(c*Math.exp(w)).toFixed(1)} `;dn=`${x(i0+k).toFixed(1)},${y(c*Math.exp(-w)).toFixed(1)} `+dn}
 const col=a.pm>=0?"--up":"--down",soft=a.pm>=0?"--up-soft":"--down-soft";
 return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Kursverlauf und Prognose">${grid}
 <line x1="${x(i0)}" x2="${x(i0)}" y1="${T}" y2="${H-B}" stroke="var(--muted)" stroke-dasharray="2 3"/>
 <polygon points="${up}${dn}" fill="var(${soft})" stroke="var(${col})" stroke-width=".6" stroke-opacity=".5"/>
 <polyline points="${hist}" fill="none" stroke="var(--fg)" stroke-width="1.6"/>
 <line x1="${x(i0)}" y1="${y(a.last)}" x2="${x(tot)}" y2="${y(a.mid)}" stroke="var(${col})" stroke-width="2" stroke-dasharray="5 3"/>
 <circle cx="${x(i0)}" cy="${y(a.last)}" r="3.5" fill="var(--fg)"/><circle cx="${x(tot)}" cy="${y(a.mid)}" r="3.5" fill="var(${col})"/>
 <text x="${L}" y="${H-6}">vor 3 Mon.</text><text x="${x(i0)-14}" y="${H-6}">heute</text><text x="${W-R-44}" y="${H-6}">+${a.H===20?"4 Wo.":"3 Mon."}</text></svg>
 <div class="legend"><span style="--c:var(--fg)">Verlauf</span><span style="--c:var(${col})">Erwartung</span><span style="--c:var(${soft})">wahrscheinlicher Bereich</span></div></div>`}
function riskMeter(a){const p=Math.min(a.vol/70*100,100);return `<div class="meter"><div class="lab"><b>Risiko</b><span>${RISK[a.risk]} · Schwankung ${fmt(a.vol,0)} %/Jahr</span></div>
 <div class="scale risk"><span class="pin" style="left:${p}%"></span></div><div class="ticks"><span>ruhig</span><span>mittel</span><span>stark schwankend</span></div></div>`}
function potMeter(a){const Sx=30,pos=v=>Math.max(0,Math.min(100,50+v/Sx*50)),c=a.pm>=0?"--up":"--down";
 return `<div class="meter"><div class="lab"><b>Möglicher Gewinn/Verlust</b><span>in ${a.H===20?"4 Wochen":"3 Monaten"}</span></div>
 <div class="scale pot"><span class="band" style="left:${pos(a.pl)}%;width:${pos(a.ph)-pos(a.pl)}%;background:var(${a.pm>=0?"--up-soft":"--down-soft"});outline:1px solid var(${c})"></span><span class="zero" style="left:50%"></span><span class="pin" style="left:${pos(a.pm)}%;background:var(${c})"></span></div>
 <div class="ticks"><span>−30 %</span><span>0</span><span>+30 %</span></div>
 <div class="facts" style="margin-top:10px"><div><b>Schlecht</b><span class="num down">${sgn(a.pl)}</span></div><div><b>Gut</b><span class="num up">${sgn(a.ph)}</span></div><div><b>Erwartung</b><span class="num ${a.pm>=0?"up":"down"}">${sgn(a.pm)}</span></div><div><b>Kursziel-Bereich</b><span class="num">${fmt(a.lo,0)}–${fmt(a.hi,0)} ${cs(a.st.s)}</span></div></div></div>`}
const fitsInvestor=a=>S.settings.investor==="vorsichtig"?a.risk<=2:S.settings.investor==="mutig"?true:a.risk<=2||a.st.h==="lang";
function sortedStocks(list){const t=S.settings.investor;return list.slice().sort((x,y)=>{const a=A[x.s],b=A[y.s];return t==="vorsichtig"?a.vol-b.vol:t==="mutig"?b.ph-a.ph:(b.pm-b.vol/20)-(a.pm-a.vol/20)})}
const newsItem=n=>`<button class="item" data-go="news-${n.id}"><div class="l"><div class="t">${n.t}</div><div class="s">${n.sum}</div><div class="meta">${imp(n.imp)}<span class="tag ${n.kind[1]}">${n.kind[0]}</span><span class="tag" style="background:none;color:var(--muted);padding:0">${n.cat}</span></div></div><span class="go">›</span></button>`;
const stockItem=s=>{const a=A[s.s];if(!a)return"";return `<button class="item" data-go="aktie-${enc(s.s)}"><div class="l"><div class="t">${s.n}</div><div class="s"><span class="num">${esc(s.s)}</span> · ${s.pseudo?(KIND_TXT[s.kind]||"ohne Einschätzung"):s.h==="lang"?"Langfristig":"Kurzfristig"} · <span class="${a.dir}">${DIR[a.dir][0]} ${DIR[a.dir][1].replace("Trend ","")}</span></div></div>${spark(a)}<div class="r"><div class="num" data-px="${s.s}">${fmt(a.last)} ${cs(s.s)}</div>${pct(a.chg)}</div></button>`};
const findCat=q=>{q=q.trim().toLowerCase();if(!q)return[];return (KI.catalog||[]).filter(c=>c.s.toLowerCase().startsWith(q)||c.n.toLowerCase().includes(q)||(c.a||"").includes(q)).slice(0,5)};

/* ---------- Sparmodelle ---------- */
const MODELS={
 m503020:{n:"50/30/20-Regel",d:"Die Hälfte für Notwendiges, knapp ein Drittel für Wünsche, ein Fünftel wird gespart.",fit:"Stabiles Einkommen und Fixkosten bis etwa die Hälfte der Einnahmen.",pro:"Einfach, ausgewogen, bewährt.",con:"In teuren Städten oft nicht erreichbar.",t:{fix:50,var:30,spar:20}},
 m702010:{n:"70/20/10-Regel",d:"70 % zum Leben, 20 % sparen, 10 % für Extras wie Schuldenabbau, Weiterbildung oder Spenden.",fit:"Hohe Fixkosten, zum Beispiel durch Miete.",pro:"Realistisch bei hohen Lebenskosten.",con:"Weniger Spielraum für Wünsche.",t:{fix:45,var:25,spar:20}},
 payfirst:{n:"Erst sparen, dann leben",d:"Direkt nach dem Gehalt geht ein fester Betrag (10–20 %) per Dauerauftrag weg. Den Rest gibst du frei aus, ohne Budget.",fit:"Wenn du keine Lust auf Budgets hast oder deine Ausgaben schwanken.",pro:"Sehr wenig Aufwand, Sparen passiert automatisch.",con:"Keine Kontrolle, wofür der Rest draufgeht.",t:{spar:15}},
 umschlag:{n:"Umschlag-Methode",d:"Jeder Alltagsbereich (Lebensmittel, Freizeit, Shopping) bekommt einen festen Monatsbetrag. Ist er leer, ist er leer.",fit:"Wenn Alltagsausgaben regelmäßig aus dem Ruder laufen.",pro:"Klare Grenzen, gut gegen Impulskäufe.",con:"Mehr Aufwand beim Mitverfolgen.",t:{var:25,spar:15}},
 notgroschen:{n:"Notgroschen zuerst",d:"Alles, was übrig bleibt, geht zuerst in eine Rücklage, bis 3 Monatsausgaben erreicht sind. Erst danach wird stärker in Aktien angelegt.",fit:"Wenn du noch keine Rücklage für Notfälle hast.",pro:"Schützt vor teuren Krediten und Notverkäufen von Aktien.",con:"Aktien müssen eine Weile warten.",t:{spar:20}}};
function finNums(){const sum=t=>S.fin.items.filter(i=>i.t===t).reduce((x,i)=>x+i.b,0);const ein=sum("ein"),fix=sum("fix"),vr=sum("var"),sp=sum("spar");const p=v=>ein?v/ein*100:0;
 return {ein,fix,vr,sp,aus:fix+vr,rest:ein-fix-vr-sp,pf:p(fix),pv:p(vr),ps:p(sp)}}
function recommend(){const f=finNums();if(!f.ein)return ["m503020","Trag deine Einnahmen ein, dann wird die Empfehlung genauer."];
 if(S.fin.goal.g<f.aus*3)return ["notgroschen",`Deine Rücklage (${fmt(S.fin.goal.g,0)} €) deckt weniger als 3 Monatsausgaben (${fmt(f.aus*3,0)} €).`];
 if(f.pf>55)return ["m702010",`Deine Fixkosten liegen bei ${fmt(f.pf,0)} % der Einnahmen, das ist hoch.`];
 if(f.pv>35)return ["umschlag",`Für den Alltag gehen ${fmt(f.pv,0)} % drauf, da helfen feste Grenzen.`];
 if(f.ps<10)return ["payfirst",`Deine Sparquote liegt bei ${fmt(f.ps,0)} %. Automatisches Sparen hilft am schnellsten.`];
 return ["m503020","Deine Zahlen sind ausgewogen, der Klassiker passt gut."]}

/* ---------- Hinweise ---------- */
function alerts(){const out=[],now=Date.now();
 S.depot.forEach(d=>{const w=(S.warn||{})[d.s];if(w&&w.lv>=2)out.push(["",`${AMPEL[w.lv]} <b>Frühwarnung ${esc(d.n)}:</b> ${esc(w.gr[0]||"")}${w.gr.length>1?` (+${w.gr.length-1} weitere)`:""} <a href="#aktie-${enc(d.s)}">Ansehen ›</a>`])});
 (KI.updates||[]).filter(u=>!S.updates[u.id]).forEach(u=>out.push(["info",`<b>Neuer Update-Brief:</b> <a href="#update-${u.id}">${u.title}</a>`]));
 S.kh.list.filter(x=>x.due<=now).forEach(x=>out.push(["",`<b>Kaufhilfe:</b> Bedenkzeit für „${esc(x.n)}“ ist vorbei. <a href="#finanzen" data-fsub="kaufhilfe">Entscheiden ›</a>`]));
 S.depot.forEach(d=>{const p=priceOf(d.s);if(p){const ch=(p/d.k-1)*100;if(ch<=d.a)out.push(["",`<b>${esc(d.n)}:</b> ${sgn(ch)} seit Kauf, deine Meldegrenze (${d.a} %) ist erreicht.`])}
  (KI.news||[]).filter(n=>n.imp>=2&&n.stocks.includes(d.s)).forEach(n=>out.push(["",`<b>${esc(d.n)}:</b> <a href="#news-${n.id}">${n.t}</a>`]))});
 const [rec,why]=recommend();if(S.fin.model&&rec!==S.fin.model&&S.fin.dismissRec!==rec)out.push(["info",`<b>Sparmodell:</b> „${MODELS[rec].n}“ könnte jetzt besser zu dir passen. ${why} <a href="#finanzen" data-fsub="modell">Ansehen ›</a>`]);
 return out}

/* ---------- Ansichten ---------- */
let region="alle",filter="alle",newsFilter="alle",finSub="uebersicht",pick=null,imp0=null,kq=null;
const greet=()=>{const h=new Date().getHours();return h<11?"Guten Morgen":h<18?"Hallo":"Guten Abend"};
const V={
 start(){const st=S.settings.start,al=alerts(),top=(KI.news||[]).filter(n=>n.imp===3);
  return `<div class="hello">${greet()}${S.settings.name?", "+esc(S.settings.name):""}</div><div class="note" style="margin:0">${new Date().toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long"})} · Xetra ${xetraOffen()?'<b class="up">offen</b>':"zu"} · USA ${marketOpen()?'<b class="up">offen</b>':"zu"}</div>
  ${st.alerts&&al.length?`<h2>Hinweise für dich</h2>${al.map(([c,x])=>`<div class="alert ${c}"><span class="ic">${c?"i":"!"}</span><div>${x}</div></div>`).join("")}`:""}
  ${st.markt?`<h2>Markt</h2>${marktRows()}`:""}
  ${st.news&&top.length?`<h2>Wichtig gerade</h2><div class="list">${top.map(newsItem).join("")}</div><button class="back" data-tab="news">Alle Nachrichten ›</button>`:""}
  ${st.depot?`<h2>Mein Depot</h2>${depotRows(false)}`:""}`},
 news(){const list=(KI.news||[]).filter(n=>newsFilter==="alle"||(newsFilter==="hoch"?n.imp===3:n.stocks.some(s=>S.depot.some(d=>d.s===s))));
  return `<h1>Nachrichten</h1><div class="filters">${[["alle","Alle"],["hoch","Nur wichtige"],["meine","Mein Depot"]].map(([k,l])=>`<button class="chip" data-nf="${k}" aria-pressed="${newsFilter===k}">${l}</button>`).join("")}</div>
  ${list.length?`<div class="list">${list.slice().sort((a,b)=>b.imp-a.imp).map(newsItem).join("")}</div>`:'<div class="empty">Keine passenden Nachrichten.</div>'}
  <h2>Termine</h2><div class="cal">${(KI.calendar||[]).map(c=>`<div class="d"><div class="day">${c.day.replace(" ","<br>")}</div><ul>${c.items.map(x=>`<li>${x}</li>`).join("")}</ul></div>`).join("")}</div>`},
 markt(){const live=SECTOR_ETF.filter(([s])=>S.quotes[s]&&S.quotes[s].cur!=="EUR");const usSec=live.length?live.map(([s,n])=>({n,c:S.quotes[s].dp,p:"USA"})):(KI.sectors||[]),euSec=(S.euSec||[]).map(x=>({n:x.n,c:x.dp,p:"Europa"}));const secs=[...euSec,...usSec];const mx=Math.max(3,...secs.map(s=>Math.abs(s.c)));
  return `<h1>Markt</h1>${marktRows()}
  <h2>Branchen</h2><div class="bars">${secs.map(s=>{const w=Math.min(Math.abs(s.c)/mx*50,50);return `<div class="bar"><div>${s.n}<div class="note" style="margin:0">${s.p}</div></div><div class="track"><span style="${s.c<0?"right":"left"}:50%;width:${Math.max(w,1)}%;background:var(${s.c<0?"--down":"--up"})"></span><i class="mid" style="width:1px;opacity:1;background:var(--muted)"></i></div><div style="text-align:right">${pct(s.c)}</div></div>`}).join("")}</div>
  <p class="note">Gemessen an Branchen-ETFs. Europa: iShares STOXX Europe 600 Branchen-ETFs auf Xetra.</p><h2>Trends der beobachteten Werte</h2><div class="list">${sortedStocks(KI.stocks||[]).map(stockItem).join("")}</div>`},
 aktien(){const list=sortedStocks((KI.stocks||[]).filter(s=>(filter==="alle"||s.h===filter)&&(region==="alle"||(region==="eu")===isEU(s.s))));const ups=(KI.updates||[]);
  const mk=(S.markt||[]),eigene=[...new Set([...S.depot.filter(d=>!d.demo).map(d=>d.s),...S.watch])].filter(x=>!(KI.stocks||[]).some(k=>k.s===x));
  const mItem=m=>{const a=A[m.s],q=S.quotes[m.s];return a?stockItem(a.st):`<button class="item" data-go="aktie-${enc(m.s)}"><div class="l"><div class="t">${esc(m.n)}</div><div class="s">${KIND_TXT[m.k]||""}</div></div><div class="r">${q?`<div class="num">${fmt(q.c)} ${cs(m.s)}</div>${pct(q.dp)}`:""}</div></button>`};
  const grp=[["idx","Indizes"],["etf","Welt-ETFs"],["krypto","Krypto"],["roh","Rohstoffe"],["fx","Währung"]];
  const alts=mk.filter(m=>m.k.startsWith("alt:")),altG=[...new Set(alts.map(m=>m.k.slice(4)))];
  return `<h1>Aktien</h1>${mk.length?`<h2 style="margin-top:8px">Wichtige Marktwerte</h2>${grp.map(([k,l])=>{const g=mk.filter(m=>m.k===k);return g.length?`<h3>${l}</h3><div class="list">${g.map(mItem).join("")}</div>`:""}).join("")}`:""}
  ${alts.length?`<h2>Alternativen zum MSCI World</h2><p class="note" style="margin-top:-4px">Der MSCI World besteht zu gut 70 % aus US-Aktien. Diese Bausteine verteilen das Risiko anders. Kein Baustein ist „sicher“, sie schwanken nur unterschiedlich stark.</p>
   ${altG.map(g=>`<h3>${g}</h3><p class="note" style="margin:-4px 0 6px">${ALT_INFO[g]||""}</p><div class="list">${alts.filter(m=>m.k==="alt:"+g).map(mItem).join("")}</div>`).join("")}`:""}
  ${eigene.length?`<h2>Deine weiteren Werte</h2><div class="list">${eigene.map(x=>A[x]?stockItem(A[x].st):`<button class="item" data-go="aktie-${enc(x)}"><div class="l"><div class="t">${esc(nameOf(x))}</div><div class="s">Daten werden geladen …</div></div><span class="go">›</span></button>`).join("")}</div>`:""}
  <h2>Mit KI-Einschätzung</h2><div class="filters">${[["alle","Alle"],["lang","Langfristig"],["kurz","Kurzfristig"]].map(([k,l])=>`<button class="chip" data-f="${k}" aria-pressed="${filter===k}">${l}</button>`).join("")}</div>
  <div class="filters">${[["alle","Alle Regionen"],["eu","Europa"],["us","USA"]].map(([k,l])=>`<button class="chip" data-rg="${k}" aria-pressed="${region===k}">${l}</button>`).join("")}</div>
  ${list.length?`<div class="list">${list.map(stockItem).join("")}</div>`:'<div class="empty">Noch keine Werte in dieser Auswahl. Neue Werte bekommen beim nächsten KI-Update eine Einschätzung.</div>'}
  <h3>Weitere Aktie beobachten</h3><div class="panel"><form id="fw"><label class="f full">Name oder Kürzel<input id="ws" autocomplete="off" placeholder="z. B. Tesla oder SIE"><div id="wsg"></div></label><button class="btn full">Beobachten</button></form>
  ${S.watch.length?`<p class="note">Beobachtet: ${S.watch.map(w=>`${esc(w)} <button class="x" data-unwatch="${esc(w)}" aria-label="${esc(w)} nicht mehr beobachten">×</button>`).join(" ")}. Neue Werte erscheinen nach dem nächsten Morgen-Update mit Einschätzung.</p>`:""}</div>
  <p class="note">Sortiert für deinen Anleger-Typ „${S.settings.investor}“. Einschätzungen zeigen Gründe und Risiken, keine Kauf- oder Verkaufsempfehlung.</p>
  <h2>Lern-Updates</h2>${ups.length?`<div class="list">${ups.map(u=>`<button class="item" data-go="update-${u.id}"><div class="l"><div class="t">${u.title} ${u.example?'<span class="demo">Beispiel</span>':""}</div><div class="s">${new Date(u.date).toLocaleDateString("de-DE")} · ${S.updates[u.id]==="ok"?'<span class="up">übernommen</span>':S.updates[u.id]==="no"?"abgelehnt":'<b>wartet auf dich</b>'}</div></div><span class="go">›</span></button>`).join("")}</div>`:'<div class="empty">Noch keine Lern-Updates.</div>'}`},
 depot(){const own=(KI.news||[]).filter(n=>n.stocks.some(s=>S.depot.some(d=>d.s===s)));let tot=0,cost=0;S.depot.forEach(d=>{const p=priceOf(d.s);if(p){tot+=toEUR(p*d.q,d.s);cost+=toEUR(d.k*d.q,d.s)}});
  return `<h1>Mein Depot</h1>${cost?`<div class="price"><span class="big">${fmt(tot)} €</span>${pct((tot/cost-1)*100)}</div><p class="note" style="margin-top:0">Wert der Positionen mit Kurs${S.depot.some(d=>curOf(d.s)==="USD")?`, Dollar-Werte umgerechnet (1 € = ${fmt(S.fx||1.1,4)} $)`:""}</p>`:""}${depotRows(true)}
  <h3>Aktie eintragen</h3><div class="panel"><form id="f">
  <label class="f full">Aktie (Name oder Kürzel)<input id="fs" autocomplete="off" placeholder="z. B. Siemens oder NVDA" value="${pick?esc(pick.n):""}"><div id="sg"></div></label>
  <label class="f">Stück<input id="fq" type="number" inputmode="decimal" step="any" min="0" required></label><label class="f">Kaufpreis (<span id="fk-cur">${pick?cs(pick.s):"Kurswährung"}</span>)<input id="fk" type="number" inputmode="decimal" step="any" min="0" required value="${pick&&priceOf(pick.s)?priceOf(pick.s):""}"></label>
  <label class="f">Melden bei Verlust ab (%)<input id="fa" type="number" value="${S.settings.alertDefault}" max="0"></label><label class="f">Kursziel (optional)<input id="fz" type="number" inputmode="decimal" step="any" min="0"></label>
  <label class="f full">Nachkauf-Tag im Monat (optional)<input id="ft" type="number" min="1" max="28" placeholder="z. B. 1 für Monatsanfang"></label><button class="btn full">Eintragen</button></form></div>
  <h2>Meine News</h2>${own.length?`<div class="list">${own.map(newsItem).join("")}</div>`:'<div class="empty">Noch keine Nachrichten zu deinen Werten.</div>'}`},
 finanzen(){return `<h1>Finanzen</h1><div class="filters">${[["uebersicht","Übersicht"],["modell","Sparmodell"],["tipps","Tipps"],["kaufhilfe","Kaufhilfe"],["import","Kontoauszug"]].map(([k,l])=>`<button class="chip" data-fs="${k}" aria-pressed="${finSub===k}">${l}</button>`).join("")}</div>`+FIN[finSub]()}
};
function marktRows(){const row=(n,sub,c,dp,cur)=>`<div class="row"><div class="l">${n}<div class="sub">${sub}</div></div><div class="r"><div class="num">${fmt(c)}${cur?" "+cur:""}</div>${pct(dp)}</div></div>`;
 const eu=(S.euIdx||[]),us=INDEX_ETF.filter(([s])=>S.quotes[s]&&S.quotes[s].cur!=="EUR");let h="";
 const link=(s,html)=>A[s]||S.markt?`<button class="item" style="padding:0 4px" data-go="aktie-${enc(s)}">${html.replace('class="row"','class="row" style="flex:1;border:0"')}</button>`:html;
 if(eu.length)h+=`<h3>Europa · Xetra ${xetraOffen()?'<b class="up">offen</b>':"geschlossen"}</h3><div class="list">${eu.map(i=>link(i.s,row(i.n,"Punkte",i.c,i.dp,""))).join("")}</div>`;
 if(us.length)h+=`<h3>USA · ${marketOpen()?'<b class="up">offen</b>':"geschlossen"}</h3><div class="list">${us.map(([s,n])=>link(s,row(n,`über ${s}`,S.quotes[s].c,S.quotes[s].dp,"$"))).join("")}</div>`;
 if(!h)h=`<div class="list">${(KI.indices||[]).map(i=>row(i.n,i.s,i.v,i.c,"")).join("")}</div>`;
 const t=S.euT?new Date(S.euT).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}):null;
 return h+`<p class="note">${t?`EU-Kurse von ${t} Uhr (ca. 15 Min. verzögert)`:`Stand ${KI.dataAsOf?new Date(KI.dataAsOf).toLocaleDateString("de-DE"):"?"}`}${S.settings.fhKey?" · US live":" · Für US-Live-Kurse Finnhub-Schlüssel eintragen"}</p>`}
function depotRows(full){if(!S.depot.length)return `<div class="empty">Noch nichts eingetragen. Unter „Depot“ fügst du deine erste Aktie hinzu.</div>`;
 return `<div class="list">${S.depot.map((d,i)=>{const a=A[d.s],p=priceOf(d.s),ch=p?(p/d.k-1)*100:null,al=ch!==null&&ch<=d.a;
  return `<div class="row"><div class="l"><b>${esc(d.n)}</b> ${d.demo?'<span class="demo">Beispiel</span>':""}<div class="sub">${fmt(d.q,d.q%1?2:0)} Stk. · Kauf ${fmt(d.k)} ${cs(d.s)} · Meldung ab ${d.a} %${d.z?` · Ziel ${fmt(d.z)} ${cs(d.s)}`:""}${d.tag?` · Nachkauf am ${d.tag}.`:""}</div>${al?'<span class="tag down">Meldegrenze erreicht</span>':""}${(S.warn||{})[d.s]&&S.warn[d.s].lv>=2?` <span class="tag ${S.warn[d.s].lv>=3?"down":"warn"}">${AMPEL[S.warn[d.s].lv]} Frühwarnung ${AMPEL_TXT[S.warn[d.s].lv]}</span>`:""}${a?`<div class="sub">${DIR[a.dir][0]} ${DIR[a.dir][1]}</div>`:""}</div>
  <div class="r">${p?`<div class="num">${fmt(p*d.q)} ${cs(d.s)}</div>${pct(ch)}`:'<span class="sub">Kurs folgt</span>'}${full?`<br><button class="x" data-go="aktie-${enc(d.s)}">Ansehen ›</button> <button class="x" data-del="${i}">Entfernen</button>`:`<br><button class="x" data-go="aktie-${enc(d.s)}">Ansehen ›</button>`}</div></div>`}).join("")}</div>`}

/* ---------- Finanzen ---------- */
const FIN={
 uebersicht(){const f=finNums(),g=S.fin.goal,seg=(v,c)=>f.ein>0&&v>0?`<span style="width:${Math.min(v/f.ein*100,100)}%;background:var(${c})"></span>`:"",m=MODELS[S.fin.model];
  const group=(t,l)=>{const it=S.fin.items.map((x,i)=>[x,i]).filter(([x])=>x.t===t);return it.length?`<h3>${l}</h3><div class="list">${it.map(([x,i])=>`<div class="row"><div class="l">${esc(x.n)}</div><div class="r"><span class="num">${fmt(x.b)} €</span> <button class="x" data-fdel="${i}" aria-label="${esc(x.n)} entfernen">×</button></div></div>`).join("")}</div>`:""};
  return `${S.fin.demo?'<p class="note" style="margin-top:0"><span class="demo">Beispielwerte</span> bis zu deinem ersten Eintrag</p>':""}
  <div class="panel"><div class="price"><span class="big">${fmt(f.rest)} €</span><span class="note" style="margin:0">frei pro Monat</span></div>
  <div class="split">${seg(f.fix,"--muted")}${seg(f.vr,"--warn")}${seg(f.sp,"--accent")}</div>
  <div class="keys"><span style="--c:var(--muted)">Fixkosten ${fmt(f.fix,0)} €</span><span style="--c:var(--warn)">Alltag ${fmt(f.vr,0)} €</span><span style="--c:var(--accent)">Sparen ${fmt(f.sp,0)} €</span></div>
  <p class="note">Einnahmen ${fmt(f.ein,0)} € · Sparquote <b>${fmt(f.ps,0)} %</b>${S.kh.saved?` · Durch Kaufhilfe gespart <b>${fmt(S.kh.saved,0)} €</b>`:""}</p>
  <p class="note">Dein Sparmodell: ${m?`<b>${m.n}</b>`:`noch keins gewählt. <a href="#finanzen" data-fsub="modell">Jetzt wählen ›</a>`}</p></div>
  <h3>Sparziel</h3><div class="panel goal"><div class="row" style="border:0;padding:0 0 8px"><b>${esc(g.n)}</b><span class="num">${fmt(g.g,0)} / ${fmt(g.z,0)} €</span></div>
  <div class="track"><span style="left:0;width:${Math.min(g.g/(g.z||1)*100,100)}%;background:var(--accent)"></span></div>
  <p class="note">${f.sp>0&&g.g<g.z?`Mit ${fmt(f.sp,0)} € Sparen im Monat in etwa ${Math.ceil((g.z-g.g)/f.sp)} Monaten erreicht.`:g.g>=g.z?"Ziel erreicht.":""}</p>
  <form id="fg" style="margin-top:8px"><label class="f full">Name<input id="g-n" value="${esc(g.n)}"></label><label class="f">Ziel (€)<input id="g-z" type="number" inputmode="decimal" min="0" value="${g.z}"></label><label class="f">Schon gespart (€)<input id="g-g" type="number" inputmode="decimal" min="0" value="${g.g}"></label><button class="btn ghost full">Sparziel speichern</button></form></div>
  ${group("ein","Einnahmen")}${group("fix","Fixkosten")}${group("var","Alltag")}${group("spar","Sparen und Anlegen")}
  <h3>Eintrag hinzufügen</h3><div class="panel"><form id="ff"><label class="f full">Bezeichnung<input id="fin-n" required placeholder="z. B. Fitnessstudio"></label>
  <label class="f">Betrag pro Monat (€)<input id="fin-b" type="number" inputmode="decimal" step="any" min="0" required></label><label class="f">Art<select id="fin-t"><option value="fix">Fixkosten</option><option value="var">Alltag</option><option value="spar">Sparen</option><option value="ein">Einnahme</option></select></label>
  <button class="btn full">Hinzufügen</button></form></div>`},
 modell(){const [rec,why]=recommend(),f=finNums();
  return `<div class="alert info"><span class="ic">i</span><div><b>Empfehlung für dich: ${MODELS[rec].n}</b><br>${why}</div></div>
  ${Object.entries(MODELS).map(([k,m])=>{const sel=S.fin.model===k;return `<div class="model ${sel?"sel":""}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h4>${m.n}</h4>${sel?'<span class="tag">Gewählt</span>':k===rec?'<span class="tag up">Empfohlen</span>':""}</div>
  <p style="margin:6px 0">${m.d}</p><p class="note" style="margin:0 0 6px"><b>Passt zu:</b> ${m.fit}</p>
  <div class="pc" style="font-size:14px"><div><b class="up">Vorteil</b><div>${m.pro}</div></div><div><b class="down">Nachteil</b><div>${m.con}</div></div></div>
  ${m.t.spar?`<p class="note">Ziel Sparen: ${m.t.spar} % · bei dir gerade ${fmt(f.ps,0)} %</p>`:""}
  ${sel?"":`<div class="btns" style="margin-bottom:0"><button class="btn ${k===rec?"":"ghost"}" data-model="${k}">Dieses Modell nutzen</button></div>`}</div>`}).join("")}
  <p class="note">Die App prüft bei jeder Änderung deiner Zahlen, ob ein anderes Modell besser passt, und meldet sich dann auf der Startseite. Wechseln kannst du jederzeit.</p>`},
 tipps(){const f=finNums(),m=MODELS[S.fin.model||recommend()[0]],tips=[];
  if(!f.ein)tips.push("Trag zuerst deine Einnahmen ein, dann werden die Tipps genauer.");
  if(m.t.spar){const soll=f.ein*m.t.spar/100;tips.push(f.sp>=soll?`Du sparst ${fmt(f.sp,0)} € und erfüllst damit das Ziel deines Modells (${m.t.spar} %). Gut so.`:`Für „${m.n}“ fehlen dir ${fmt(soll-f.sp,0)} € Sparen im Monat. Am einfachsten per Dauerauftrag direkt nach dem Gehalt.`)}
  if(m.t.fix&&f.pf>m.t.fix)tips.push(`Deine Fixkosten (${fmt(f.pf,0)} %) liegen über den ${m.t.fix} % des Modells. Verträge wie Handy, Strom und Versicherungen lassen sich oft am leichtesten senken.`);
  if(m.t.var&&f.pv>m.t.var)tips.push(`Alltag: ${fmt(f.pv,0)} % statt ${m.t.var} %. Lege dir für Lebensmittel und Freizeit feste Monatsbeträge fest. Die Kaufhilfe hilft bei Spontankäufen.`);
  const abos=S.fin.items.filter(i=>/abo|stream|netflix|spotify|disney|prime|fitness|gym/i.test(i.n)),ab=abos.reduce((x,i)=>x+i.b,0);if(abos.length)tips.push(`Abos kosten dich ${fmt(ab,0)} € im Monat, also ${fmt(ab*12,0)} € im Jahr. Nutzt du alle wirklich?`);
  tips.push(S.fin.goal.g>=f.aus*3?"Deine Rücklage deckt mehr als 3 Monatsausgaben. Zusätzliches Geld kann langfristig angelegt werden, zum Beispiel in einen breit gestreuten ETF.":`Rücklage: empfohlen sind 3 bis 6 Monatsausgaben, bei dir also ${fmt(f.aus*3,0)} bis ${fmt(f.aus*6,0)} €. Erst diesen Puffer aufbauen, dann stärker in Aktien gehen.`);
  return `<p class="note" style="margin-top:0">Tipps passend zu deinem Modell „${m.n}“${S.fin.model?"":" (empfohlen, noch nicht gewählt)"}.</p>
  <div class="list">${tips.map(t=>`<div class="row" style="justify-content:flex-start"><span style="color:var(--accent);font-weight:800">›</span><div class="l">${t}</div></div>`).join("")}</div>
  <p class="note">Allgemeine Faustregeln, keine persönliche Finanzberatung.</p>`},
 kaufhilfe(){const now=Date.now(),due=S.kh.list.filter(x=>x.due<=now),wait=S.kh.list.filter(x=>x.due>now);
  return `<p class="note" style="margin-top:0">10 Fragen gegen Impulskäufe.</p>
  ${S.kh.saved||S.kh.bought?`<div class="facts" style="margin-bottom:12px"><div><b>Nicht gekauft, also gespart</b><span class="num up">${fmt(S.kh.saved,0)} €</span></div><div><b>Bewusst gekauft</b><span class="num">${fmt(S.kh.bought,0)} €</span></div></div>`:""}
  ${due.length?`<h3>Bedenkzeit abgelaufen</h3>${due.map(x=>`<div class="alert"><div style="flex:1"><b>${esc(x.n)}</b> · ${fmt(x.p,0)} €${khInfo(x)}Willst du es immer noch?<div class="btns" style="margin:8px 0 0"><button class="btn" data-kb="${x.id}">Ja, kaufen</button><button class="btn ghost" data-kn="${x.id}">Will ich nicht mehr</button></div></div></div>`).join("")}`:""}
  ${kq?quiz():`<div class="panel"><form id="fk2"><label class="f full">Was möchtest du kaufen?<input id="k-n" required placeholder="z. B. Winterjacke"></label><label class="f full">Preis (€)<input id="k-p" type="number" inputmode="decimal" min="0" step="any" required></label><label class="f full">Beschreibung (optional)<input id="k-d" placeholder="z. B. Größe M, dunkelblau"></label><label class="f full">Link zum Produkt (optional)<input id="k-u" type="url" inputmode="url" placeholder="https://…"></label><button class="btn full">Fragen starten</button></form></div>`}
  ${wait.length?`<h3>In Bedenkzeit</h3><div class="list">${wait.map(x=>`<div class="row"><div class="l"><b>${esc(x.n)}</b>${khInfo(x)}<div class="sub">${fmt(x.p,0)} € · Erinnerung am ${new Date(x.due).toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"})}</div></div><div class="r"><button class="x" data-kn="${x.id}">Doch nicht</button></div></div>`).join("")}</div>`:""}`},
 import(){return `<div class="panel"><p>Exportiere deine Umsätze in der Banking-App oder im Online-Banking als <b>CSV-Datei</b> (meist unter „Umsätze“ → „Exportieren“). Ein Monat oder mehr ist ideal.</p>
  <label class="btn" style="display:block" for="csv">CSV-Datei auswählen</label><input id="csv" type="file" accept=".csv,text/csv,text/plain" hidden>
  <p class="note">Die Datei wird nur auf deinem Gerät gelesen.</p></div>${imp0?importResult(imp0):""}`}
};
const khLink=u=>{try{const h=new URL(u).hostname.replace(/^www\./,"");return `<a class="src" href="${esc(u)}" target="_blank" rel="noopener">${esc(h)} ↗</a>`}catch(e){return ""}};
const khInfo=x=>`${x.d?`<div class="sub" style="white-space:normal">${esc(x.d)}</div>`:""}${x.u?`<div style="font-size:13px">${khLink(x.u)}</div>`:""}`;
const QS=[["Brauche ich es wirklich, und nicht nur gerade jetzt?",1],["Habe ich schon etwas Ähnliches, das noch gut ist?",0],["Würde ich es auch ohne Rabatt zum vollen Preis kaufen?",1],["Werde ich es oft nutzen (mindestens 30-mal)?",1],["Hatte ich den Kauf schon vor heute geplant?",1],["Kann ich es bezahlen, ohne mein Sparziel zu gefährden?",1],["Würde ich es in einer Woche immer noch wollen?",1],["Passt es zu Dingen, die ich schon habe?",1],["Kaufe ich gerade aus Langeweile, Frust oder als Belohnung?",0],["Gibt es eine günstigere oder gebrauchte Lösung, die reicht?",0]];
function quiz(){const i=kq.a.length;if(i<QS.length)return `<div class="panel" style="animation:enter .25s var(--ease)"><div class="note" style="margin:0">${esc(kq.n)} · ${fmt(kq.p,0)} € · Frage ${i+1} von 10</div>
 <div class="track" style="margin:8px 0 14px;height:6px"><span style="left:0;width:${i*10}%;background:var(--accent)"></span></div>
 <p style="font-size:19px;font-weight:600;line-height:1.35">${QS[i][0]}</p><div class="btns"><button class="btn" data-qa="1">Ja</button><button class="btn ghost" data-qa="0">Nein</button></div>${i?'<button class="x" data-qback>‹ Vorige Frage</button>':""}</div>`;
 const sc=kq.a.reduce((x,a,j)=>x+(a===QS[j][1]?1:0),0),v=sc>=8?["Spricht viel dafür","up","Der Kauf wirkt durchdacht."]:sc>=5?["Lieber drüber schlafen","flat","Einiges spricht dafür, einiges dagegen. Eine Bedenkzeit hilft."]:["Eher ein Impulskauf","down","Die meisten Antworten sprechen gegen den Kauf."],td=S.settings.thinkDefault;
 return `<div class="panel"><div class="note" style="margin:0">${esc(kq.n)} · ${fmt(kq.p,0)} €</div><h1>${sc} von 10 Punkten</h1><div class="trend ${v[1]}"><div>${v[0]}<small>${v[2]}</small></div></div>
 <h3>Was jetzt?</h3><div class="btns"><button class="btn ${sc>=8?"":"ghost"}" data-kd="buy">Kaufen</button><button class="btn ${sc<5?"":"ghost"}" data-kd="skip">Lasse ich</button></div>
 <h3>Oder Bedenkzeit</h3><div class="btns">${[[1,"1 Tag"],[7,"1 Woche"],[30,"30 Tage"]].map(([d,l])=>`<button class="btn ${d==td&&sc>=5&&sc<8?"":"ghost"}" data-kd="${d}">${l}</button>`).join("")}</div></div>`}
function importResult(r){if(r.err)return `<div class="alert"><span class="ic">!</span><div>${r.err}</div></div>`;const m=r.months||1,cats=Object.entries(r.cat).sort((a,b)=>b[1]-a[1]);
 return `<h2>Ergebnis</h2><p class="note" style="margin-top:-6px">${r.n} Buchungen · ${r.from} bis ${r.to} · pro Monat (${m} Monat${m>1?"e":""})</p>
 <div class="facts"><div><b>Einnahmen</b><span class="num up">${fmt(r.ein/m,0)} €</span></div><div><b>Ausgaben</b><span class="num down">${fmt(r.aus/m,0)} €</span></div><div><b>Gespart / angelegt</b><span class="num">${fmt(r.spar/m,0)} €</span></div><div><b>Übrig</b><span class="num ${r.ein-r.aus-r.spar>=0?"up":"down"}">${fmt((r.ein-r.aus-r.spar)/m,0)} €</span></div></div>
 <h3>Ausgaben nach Bereich</h3><div class="list">${cats.map(([c,v])=>`<div class="row"><div class="l">${c}</div><div class="r num">${fmt(v/m,0)} €</div></div>`).join("")}</div>
 <div class="btns"><button class="btn" data-imp-apply>Als meine Monatswerte übernehmen</button></div><p class="note">Sortiert nach Stichworten (z. B. REWE → Lebensmittel). Nicht erkannte Buchungen landen unter „Sonstiges“.</p>`}
const RULES=[["Miete und Wohnen",/miete|wohnung|hausverwaltung|nebenkosten|strom|stadtwerke|\bgas\b|vattenfall|\be\.?on\b/i,"fix"],["Versicherungen",/versicherung|allianz|huk|ergo|axa|devk|generali|debeka/i,"fix"],["Handy und Internet",/telekom|vodafone|\bo2\b|telefonica|1&1|congstar|internet/i,"fix"],["Abos",/netflix|spotify|disney|prime|apple\.com|youtube|dazn|fitness|mcfit|urban sports/i,"fix"],
 ["Lebensmittel",/rewe|edeka|aldi|lidl|penny|netto|kaufland|\bdm\b|rossmann|bäcker|baecker/i,"var"],["Mobilität",/aral|shell|esso|\bjet\b|tankstelle|deutsche bahn|db vertrieb|bvg|mvg|hvv|flixbus|uber|bolt/i,"var"],["Essen gehen",/restaurant|lieferando|mcdonald|burger|pizza|cafe|starbucks|wolt/i,"var"],["Shopping",/amazon|zalando|otto|h&m|ikea|mediamarkt|saturn|ebay|paypal/i,"var"],
 ["Sparen und Anlegen",/sparplan|depot|trade republic|scalable|comdirect|consorsbank|tagesgeld|sparen|etf/i,"spar"]];
function parseCSV(text){const lines=text.replace(/\r/g,"").split("\n").filter(l=>l.trim());if(lines.length<2)return {err:"Die Datei enthält keine Buchungen."};
 const head=lines.slice(0,15).join(""),d=(head.match(/;/g)||[]).length>(head.match(/,/g)||[]).length/3?";":",";
 const split=l=>{const o=[];let c="",q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===d&&!q){o.push(c.trim());c=""}else c+=ch}o.push(c.trim());return o};
 const hi=lines.findIndex(l=>/betrag|amount/i.test(l));if(hi<0)return {err:"Keine Spalte „Betrag“ gefunden. Bitte eine CSV-Datei der Kontoumsätze verwenden."};
 const H=split(lines[hi]).map(x=>x.toLowerCase()),col=re=>H.findIndex(h=>re.test(h));
 const ib=col(/betrag|amount/),idt=col(/buchungstag|buchungsdatum|datum|date|valuta/),itx=[col(/empf|auftraggeber|beg[üu]nstigt|name|payee|zahlungspflichtig/),col(/verwendungszweck|zweck|beschreibung|description|buchungstext/)].filter(i=>i>=0);
 const num=s=>{s=(s||"").replace(/[^0-9,.\-]/g,"");if(/,\d{1,2}$/.test(s))s=s.replace(/\./g,"").replace(",",".");else s=s.replace(/,/g,"");return parseFloat(s)};
 const r={n:0,ein:0,aus:0,spar:0,cat:{},sums:{},dates:[]};
 lines.slice(hi+1).forEach(l=>{const c=split(l),b=num(c[ib]);if(isNaN(b)||!b)return;const txt=itx.map(i=>c[i]||"").join(" ");r.n++;if(idt>=0&&c[idt])r.dates.push(c[idt]);
  if(b>0){if(!/umbuchung|übertrag/i.test(txt))r.ein+=b;return}
  const rule=RULES.find(([,re])=>re.test(txt)),name=rule?rule[0]:"Sonstiges",typ=rule?rule[2]:"var";
  if(typ==="spar")r.spar-=b;else{r.aus-=b;r.cat[name]=(r.cat[name]||0)-b}r.sums[name]={b:(r.sums[name]?r.sums[name].b:0)-b,t:typ}});
 if(!r.n)return {err:"Es wurden keine Beträge erkannt."};
 const toD=s=>{const m=s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);if(m)return new Date(+(m[3].length===2?"20"+m[3]:m[3]),m[2]-1,+m[1]);const t=Date.parse(s);return isNaN(t)?null:new Date(t)};
 const ds=r.dates.map(toD).filter(Boolean).sort((a,b)=>a-b),f=ds[0],t=ds[ds.length-1];
 r.months=f?Math.max(1,Math.round((t-f)/2.63e9)):1;r.from=f?f.toLocaleDateString("de-DE"):"?";r.to=t?t.toLocaleDateString("de-DE"):"?";return r}

/* ---------- Detailseiten ---------- */
function stockView(s){const a=A[s],inDepot=S.depot.some(d=>d.s===s),k=kindOf(s);
 if(!a){const q=S.quotes[s];return `<button class="back" data-back>‹ Zurück</button><div class="note" style="margin:0"><span class="num">${esc(s)}</span></div><h1>${esc(nameOf(s))}</h1>
  ${q?`<div class="price"><span class="big">${fmt(q.c)} ${cs(s)}</span>${pct(q.dp)}</div>`:""}
  <div class="panel" style="margin:14px 0"><b>Verlauf und Prognose werden geladen</b><p style="margin:4px 0 0">Der Wachmann holt die Daten beim nächsten Lauf, meist innerhalb von 5 Minuten. ${inDepot||S.watch.includes(s)?"":"Tipp: Beobachte den Wert, dann wird er dauerhaft mitgeladen."}</p></div>
  <div class="btns">${inDepot||S.watch.includes(s)?"":`<button class="btn ghost" data-watch="${esc(s)}">Beobachten</button>`}<button class="btn ghost" data-refresh>Neu laden</button></div>`}
 const st=a.st;
 setTimeout(async()=>{const n=await liveNews(s),el=$("#ln");if(el&&n)el.innerHTML=n.length?`<div class="list">${n.map(x=>`<a class="item" href="${esc(x.url)}" target="_blank" rel="noopener"><div class="l"><div class="t">${esc(x.headline)}</div><div class="s">${esc(x.source)} · ${new Date(x.datetime*1000).toLocaleDateString("de-DE")}</div></div><span class="go">↗</span></a>`).join("")}</div>`:'<div class="empty">Keine neuen Schlagzeilen.</div>'},0);
 return `<button class="back" data-back>‹ Zurück</button><div class="note" style="margin:0">${st.cat} · <span class="num">${esc(s)}</span></div><h1>${esc(st.n)}</h1>
 <div class="price"><span class="big">${fmt(a.last)} ${cs(s)}</span>${pct(a.chg)}<span class="note" style="margin:0">${a.live?`<span class="dot live" style="display:inline-block"></span> ${isEU(s)?"ca. 15 Min. verzögert":"live"}`:"Schlusskurs"}</span></div>
 ${fitsInvestor(a)?"":`<div class="alert"><span class="ic">!</span><div>Diese Aktie schwankt stark und passt eher nicht zu deinem Anleger-Typ „${S.settings.investor}“.</div></div>`}
 <div class="trend ${a.dir}"><span class="arrow">${DIR[a.dir][0]}</span><div>${DIR[a.dir][1]}<small>${a.dir==="up"?"Kurs liegt über seinem Durchschnitt der letzten Wochen.":a.dir==="down"?"Kurs liegt unter seinem Durchschnitt der letzten Wochen.":"Kein klarer Trend in den letzten Wochen."} Letzte 4 Wochen ${sgn(a.ch20)}.</small></div></div>
 ${(S.warn||{})[s]?`<div class="panel" style="margin:12px 0"><b>${AMPEL[S.warn[s].lv]} Frühwarnung: ${AMPEL_TXT[S.warn[s].lv]}</b>${S.warn[s].gr.length?`<ul style="margin:6px 0 0;padding-left:18px;font-size:14px">${S.warn[s].gr.map(g=>`<li>${esc(g)}</li>`).join("")}</ul>`:'<p class="note" style="margin:4px 0 0">Keine Warnzeichen.</p>'}<p class="note" style="margin:6px 0 0">Schaut nach vorn: Trendbruch, steigende Schwankung, Abstand zum Hoch, Termine, Nachrichtenlage und Marktstimmung. Unabhängig von deinem Kaufpreis.</p></div>`:""}
 <h2>Verlauf und Prognose</h2>${bigChart(a)}
 <h2>Risiko und Chance</h2><div class="panel">${riskMeter(a)}<div style="height:12px"></div>${potMeter(a)}</div>
 <p class="note">Bereich, in dem der Kurs nach der Schwankung der letzten 3 Monate in etwa 2 von 3 Fällen landen würde. Die Mitte folgt abgeschwächt dem Trend plus der Nachrichtenlage. Eine Schätzung, keine Garantie.</p>
 <h2>Vergangenheit (3 Monate)</h2><div class="facts"><div><b>Veränderung</b>${pct(a.ch3m)}</div><div><b>Größter Rückgang</b><span class="num down">${sgn(a.dd)}</span></div><div><b>Tiefster Kurs</b><span class="num">${fmt(a.min)} ${cs(s)}</span></div><div><b>Höchster Kurs</b><span class="num">${fmt(a.max)} ${cs(s)}</span></div></div>
 ${st.pseudo?`<h2>Einschätzung</h2><div class="panel">${k==="idx"?"<b>Index</b><p style=\"margin:4px 0 0\">Ein Index ist nicht direkt kaufbar. Investieren kannst du z. B. über einen ETF, der ihn abbildet.</p>":k==="fx"?"<b>Wechselkurs</b><p style=\"margin:4px 0 0\">Zeigt, wie viele Dollar ein Euro kostet. Wichtig für den Wert deiner US-Aktien in Euro.</p>":inDepot||S.watch.includes(s)?"<b>KI-Einschätzung folgt</b><p style=\"margin:4px 0 0\">Beim nächsten KI-Update (7:00 oder 12:40 Uhr) bekommt dieser Wert Pro, Contra und Begründung. Verlauf, Trend und Prognose oben sind schon berechnet.</p>":"<b>Ohne KI-Einschätzung</b><p style=\"margin:4px 0 0\">Trend und Prognose sind aus dem Kursverlauf berechnet. Beobachte den Wert, dann bekommt er beim nächsten KI-Update eine Einschätzung.</p>"}</div>`
 :`<h2>Einschätzung · ${st.h==="lang"?"Langfristig (3 Monate+)":"Kurzfristig (ca. 4 Wochen)"}</h2><p>${st.why}</p>
 <div class="pc"><div><b class="up">Dafür</b><ul>${st.pro.map(x=>`<li>${x}</li>`).join("")}</ul></div><div><b class="down">Dagegen</b><ul>${st.con.map(x=>`<li>${x}</li>`).join("")}</ul></div></div>`}
 <div class="btns">${["idx","fx"].includes(k)?"":`<button class="btn" data-add="${esc(s)}">${inDepot?"Weitere Stücke eintragen":"Ins Depot übernehmen"}</button>`}${inDepot||(S.markt||[]).some(m=>m.s===s)&&!st.pseudo?"":`<button class="btn ghost" data-watch="${esc(s)}">${S.watch.includes(s)?"Nicht mehr beobachten":"Beobachten"}</button>`}</div>
 ${st.news&&st.news.length?`<h2>Nachrichten (KI)</h2><div class="list">${KI.news.filter(n=>st.news.includes(n.id)).map(newsItem).join("")}</div>`:""}
 ${isEU(s)||st.pseudo&&k?"":`<h2>Live-Schlagzeilen</h2><div id="ln">${PREVIEW||!S.settings.fhKey?'<div class="empty">Erscheinen in der installierten App mit Finnhub-Schlüssel (meist englisch).</div>':'<div class="empty">Lade …</div>'}</div>`}
 <p class="note">Keine Anlageberatung.</p>`}
function newsView(id){const n=(KI.news||[]).find(x=>x.id===id);if(!n)return V.news();const i=n.back.indexOf(":");
 return `<button class="back" data-back>‹ Zurück</button><div class="meta">${imp(n.imp)}<span class="tag ${n.kind[1]}">${n.kind[0]}</span><span class="note" style="margin:0">${n.cat}</span></div><h1>${n.t}</h1>
 <p><b>${n.sum}</b></p>${n.body.map(p=>`<p>${p}</p>`).join("")}
 <div class="panel" style="margin:14px 0"><b>${n.back.slice(0,i)}</b><p style="margin:4px 0 0">${n.back.slice(i+1)}</p></div>
 ${n.stocks.length?`<h3>Betroffene Werte</h3><div class="list">${n.stocks.map(s=>stockItem((KI.stocks||[]).find(x=>x.s===s)||{s})).join("")}</div>`:""}
 <div class="btns"><a class="btn" href="${n.u}" target="_blank" rel="noopener">Originalartikel bei ${n.q} ↗</a></div><p class="note">Zusammenfassung in eigenen Worten.</p>`}
function updateView(id){const u=(KI.updates||[]).find(x=>x.id===id);if(!u)return V.aktien();const st=S.updates[id];
 return `<button class="back" data-back>‹ Zurück</button><div class="note" style="margin:0">Update-Brief · ${new Date(u.date).toLocaleDateString("de-DE")} ${u.example?'<span class="demo">Beispiel</span>':""}</div><h1>${u.title}</h1>
 <div class="panel"><h3 style="margin-top:0">Was ändert sich?</h3><p>${u.what}</p><h3>Warum?</h3><p>${u.why}</p><h3>Wie genau?</h3><p style="margin:0">${u.how}</p></div>
 <div class="btns">${st==="ok"?`<button class="btn ghost" data-upd="undo" data-id="${id}">Rückgängig machen</button>`:st==="no"?`<button class="btn" data-upd="ok" data-id="${id}">Doch übernehmen</button>`:`<button class="btn" data-upd="ok" data-id="${id}">Übernehmen</button><button class="btn ghost" data-upd="no" data-id="${id}">Ablehnen</button>`}</div>
 <p class="note">${st==="ok"?"Übernommen. Alle Prognosen rechnen jetzt mit der neuen Einstellung.":st==="no"?"Abgelehnt. Die Prognosen bleiben wie bisher.":"Erst wenn du zustimmst, ändert sich etwas. Du kannst es jederzeit rückgängig machen."}</p>`}

/* ---------- Einstellungen ---------- */
const COLORS=["#0f6b5c","#2f5fb3","#6a4bb5","#b5476a","#c2621a","#3d6b1f","#14201c"];
function settingsHTML(sec){const s=S.settings;const seg=(k,opts)=>`<div class="seg">${opts.map(([v,l])=>`<button type="button" data-set="${k}" data-val="${v}" aria-pressed="${s[k]==v}">${l}</button>`).join("")}</div>`;
 return `<div class="grab"></div><div class="in"><div style="display:flex;justify-content:space-between;align-items:center"><h1 style="margin:0">Einstellungen</h1><button class="icon-btn" data-close aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
 <h3>Persönlich</h3><label class="f">Dein Name<input id="s-name" value="${esc(s.name)}" placeholder="Wie soll die App dich nennen?"></label>
 <h3>Farbe</h3><div class="swatches">${COLORS.map(c=>`<button class="sw" style="--c:${c}" data-color="${c}" aria-pressed="${s.accent===c}" aria-label="Farbe ${c}"></button>`).join("")}</div>
 <h3>Darstellung</h3>${seg("theme",[["auto","Automatisch"],["light","Hell"],["dark","Dunkel"]])}
 <h3>Anleger-Typ</h3>${seg("investor",[["vorsichtig","Vorsichtig"],["ausgewogen","Ausgewogen"],["mutig","Mutig"]])}<p class="note">Bestimmt die Reihenfolge der Aktien und Warnungen bei stark schwankenden Werten.</p>
 <h3>Startseite zeigt</h3>${[["alerts","Hinweise"],["markt","Markt"],["news","Wichtige News"],["depot","Mein Depot"]].map(([k,l])=>`<label class="check"><input type="checkbox" data-start="${k}" ${s.start[k]?"checked":""}> ${l}</label>`).join("")}
 <h3>Standards</h3><form onsubmit="return false"><label class="f">Meldegrenze Depot (%)<input id="s-al" type="number" max="0" value="${s.alertDefault}"></label><label class="f">Bedenkzeit Kaufhilfe<select id="s-th">${[[1,"1 Tag"],[7,"1 Woche"],[30,"30 Tage"]].map(([v,l])=>`<option value="${v}" ${s.thinkDefault==v?"selected":""}>${l}</option>`).join("")}</select></label></form>
 <h3 id="daten">Daten und Aktualisierung</h3><form onsubmit="return false"><label class="f full">Finnhub-Schlüssel (für Live-Kurse)<input id="s-fh" value="${esc(s.fhKey)}" placeholder="kostenlos auf finnhub.io" autocomplete="off"></label>
 <label class="f">Kurse aktualisieren alle<select id="s-rf">${[[1,"1 Minute"],[5,"5 Minuten"],[15,"15 Minuten"],[30,"30 Minuten"],[60,"60 Minuten"]].map(([v,l])=>`<option value="${v}" ${s.refreshMin==v?"selected":""}>${l}</option>`).join("")}</select></label>
 <label class="f">KI-Datei<input id="s-ki" value="${esc(s.kiUrl)}"></label></form>
 <p class="note">KI-Stand: ${KI.generated?new Date(KI.generated).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"}):"unbekannt"}${kiErr?" · "+kiErr:""}</p>
 <h3>Telegram-Benachrichtigungen</h3>${[["warn","Frühwarnungen (bevor es kritisch wird)"],["loss","Meldegrenze erreicht (Verlust)"],["target","Kursziel erreicht"],["news","Wichtige News zu meinen Aktien"],["briefing","Briefings morgens, mittags, abends"],["kh","Kaufhilfe: Bedenkzeit vorbei"],["sparplan","Nachkauf-Tag"],["earnings","Quartalszahlen am Vortag"],["model","Besseres Sparmodell"],["night","Nachtruhe 22–7 Uhr (außer Absturz über 10 %)"]].map(([k,l])=>`<label class="check"><input type="checkbox" data-notify="${k}" ${s.notify[k]?"checked":""}> ${l}</label>`).join("")}
 <form onsubmit="return false"><label class="f">Starke Tagesbewegung ab (%)<input id="s-mv" type="number" min="0" step="0.5" value="${s.notify.move}"></label></form><p class="note">0 schaltet diesen Alarm aus. Die Einstellungen gehen beim nächsten Abgleich an deinen Bot.</p>
 <h3 id="sync">Abgleich mit GitHub</h3><form onsubmit="return false"><label class="f full">Projekt (Benutzername/Projektname)<input id="s-repo" value="${esc(s.ghRepo)}" placeholder="z. B. tim123/aktien-helfer" autocomplete="off"></label>
 <label class="f full">GitHub-Schlüssel (Token)<input id="s-tok" type="password" value="${esc(s.ghToken)}" autocomplete="off"></label><label class="f full">Sync-Passwort (gleich wie bei GitHub)<input id="s-pw" type="password" value="${esc(s.syncPass)}" autocomplete="off"></label></form>
 <p class="note">${syncOn()?(S.syncInfo?`<b class="down">⚠️ ${esc(S.syncInfo)}</b>`:`✓ Verbunden${S.syncAt?" · zuletzt "+new Date(S.syncAt).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"}):""}`):"Noch nicht eingerichtet. Ohne Abgleich kennt der Telegram-Bot dein Depot nicht."}</p>
 ${syncOn()?`<p class="note">${S.weckOk?"✓ Die App weckt den Wachmann sofort, wenn du etwas einträgst.":"Tipp: Gib dem GitHub-Schlüssel zusätzlich das Recht <b>Actions: Read and write</b>. Dann weckt die App den Wachmann sofort, wenn du etwas einträgst, und neue Werte sind in 1–2 Minuten da."}</p><div class="btns"><button class="btn ghost" data-sync>Jetzt abgleichen</button></div>`:""}
 <h3>Sicherung</h3><p class="note" style="margin-top:0">Deine Daten liegen auf diesem Gerät. Mit einer Sicherungsdatei bringst du sie auf ein anderes Gerät.</p>
 <div class="btns"><button class="btn ghost" data-export>Sicherung speichern</button><label class="btn ghost" for="imp-file">Sicherung laden</label><input id="imp-file" type="file" accept=".json,application/json" hidden></div>
 <div id="reset-zone"><button class="x" data-reset>Alle Daten auf diesem Gerät löschen</button></div>
 <p class="note">Ki Aktien Helfer · Prototyp · Keine Anlageberatung.</p></div>`}
function cartHTML(){const now=Date.now(),l=S.kh.list.slice().sort((a,b)=>a.due-b.due),h=(S.kh.hist||[]).slice().reverse();
 return `<div class="grab"></div><div class="in"><div style="display:flex;justify-content:space-between;align-items:center"><h1 style="margin:0">Warenkorb</h1><button class="icon-btn" data-close aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
 <p class="note" style="margin-top:4px">Dinge in Bedenkzeit aus der Kaufhilfe. ${S.kh.saved?`Bisher nicht ausgegeben: <b class="up">${fmt(S.kh.saved,0)} €</b>`:""}</p>
 ${l.length?`<div class="list">${l.map(x=>`<div class="row" style="align-items:flex-start"><div class="l"><b>${esc(x.n)}</b> · <span class="num">${fmt(x.p,0)} €</span>${khInfo(x)}<div class="sub">${x.due<=now?'<b class="down">Bedenkzeit vorbei</b>':`Erinnerung am ${new Date(x.due).toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"})}`}</div></div>
  <div class="r" style="display:flex;flex-direction:column;gap:6px"><button class="btn" style="padding:6px 10px;font-size:13px" data-kb="${x.id}">Kaufen</button><button class="btn ghost" style="padding:6px 10px;font-size:13px" data-kn="${x.id}">Lassen</button></div></div>`).join("")}</div>`:'<div class="empty">Der Warenkorb ist leer.</div>'}
 <div class="btns"><button class="btn ghost" data-fsub="kaufhilfe">Neuen Kauf prüfen</button></div>
 ${h.length?`<h3>Entschieden</h3><div class="list">${h.slice(0,10).map(x=>`<div class="row"><div class="l">${esc(x.n)}<div class="sub">${new Date(x.t).toLocaleDateString("de-DE")}</div></div><div class="r"><span class="num">${fmt(x.p,0)} €</span> · <span class="${x.r==="gelassen"?"up":""}">${x.r}</span></div></div>`).join("")}</div>`:""}</div>`}
function openCart(){const sh=$("#sheet");sh.innerHTML=cartHTML();sh.classList.add("open");$("#sheet-bg").classList.add("open")}
function cartBadge(){const b=$("#cart-n");if(!b)return;const n=S.kh.list.length,due=S.kh.list.some(x=>x.due<=Date.now());b.textContent=n||"";b.hidden=!n;b.classList.toggle("due",due)}
function openSettings(anchor){const sh=$("#sheet");sh.innerHTML=settingsHTML();sh.classList.add("open");$("#sheet-bg").classList.add("open");bindSettings();if(anchor){const a=document.getElementById(anchor);if(a)setTimeout(()=>a.scrollIntoView({behavior:"smooth"}),300)}}
function closeSettings(){$("#sheet").classList.remove("open");$("#sheet-bg").classList.remove("open");render()}
function bindSettings(){const s=S.settings,on=(id,k,f=v=>v)=>{const el=document.getElementById(id);if(el)el.addEventListener("change",()=>{s[k]=f(el.value);save();applyLook();if(k==="refreshMin")startTimer();if(k==="kiUrl")loadKI().then(()=>{A=analyzeAll();toast("KI-Datei geladen")});if(k==="fhKey"&&s.fhKey)refreshLive(true);if(["ghRepo","ghToken","syncPass"].includes(k)&&syncOn())syncPull().then(()=>{syncPush();openSettings("sync")})})};
 on("s-name","name",v=>v.trim());on("s-repo","ghRepo",v=>v.trim().replace(/^https?:\/\/github\.com\//,"").replace(/\/$/,""));on("s-tok","ghToken",v=>v.trim());on("s-pw","syncPass",v=>v);
 const mv=$("#s-mv");if(mv)mv.addEventListener("change",()=>{s.notify.move=Math.max(0,+mv.value||0);save()});on("s-al","alertDefault",v=>Math.min(0,+v||-10));on("s-th","thinkDefault",v=>+v);on("s-fh","fhKey",v=>v.trim());on("s-rf","refreshMin",v=>+v);on("s-ki","kiUrl",v=>v.trim()||"ki.json");
 const imf=$("#imp-file");if(imf)imf.addEventListener("change",()=>{const f=imf.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.settings||!d.fin)throw 0;S=Object.assign(structuredClone(DEF),d);save();applyLook();toast("Sicherung geladen");openSettings()}catch(e){toast("Das ist keine gültige Sicherungsdatei.")}};r.readAsText(f)})}
function applyLook(){const r=document.documentElement,s=S.settings;r.style.setProperty("--accent",s.accent);if(s.theme==="auto")r.removeAttribute("data-theme");else r.setAttribute("data-theme",s.theme);
 const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=getComputedStyle(r).getPropertyValue("--bg").trim()||"#f3f5f4"}

/* ---------- Navigation ---------- */
const TABS=["start","news","markt","aktien","depot","finanzen"];let route="start",hist=[];
function go(r,push=true){if(push&&r!==route)hist.push(route);route=r;try{if(location.hash.slice(1)!==r)history.replaceState(null,"","#"+r)}catch(e){}render();scrollTo({top:0})}
function render(soft){const v=$("#view"),detail=/^(aktie|news|update)-/.test(route),y=scrollY;
 v.className="";if(!soft){void v.offsetWidth;v.className=detail?"detail":""}
 v.innerHTML=route.startsWith("aktie-")?stockView(decodeURIComponent(route.slice(6))):route.startsWith("news-")?newsView(route.slice(5)):route.startsWith("update-")?updateView(route.slice(7)):(V[route]||V.start)();
 const tab=route.startsWith("aktie-")||route.startsWith("update-")?"aktien":route.startsWith("news-")?"news":TABS.includes(route)?route:"start";
 document.documentElement.style.setProperty("--tc",`var(--t-${tab})`);
 document.querySelectorAll("nav.tabs button").forEach(b=>b.dataset.tab===tab?b.setAttribute("aria-current","page"):b.removeAttribute("aria-current"));
 status();bindForms();cartBadge();if(soft)scrollTo({top:y})}
function status(){const el=$("#status");if(!el)return;const s=S.settings;let t;
 if(PREVIEW)t='<span class="dot"></span> Vorschau · Kurse vom '+(KI.dataAsOf?new Date(KI.dataAsOf).toLocaleDateString("de-DE"):"?");
 else if(!s.fhKey&&!S.euT)t='<span class="dot"></span> Ohne Live-Kurse · <a href="#" data-settings="daten">einrichten</a>';
 else{const m=S.lastLive?Math.round((Date.now()-S.lastLive)/6e4):null;t=`<span class="dot ${liveErr?"":"live"}"></span> ${liveErr?"Live-Kurse gestört":m===null?"Live":m<1?"Live · gerade aktualisiert":`Live · vor ${m} Min.`}`}
 el.innerHTML=t}
function bindForms(){
 const f=$("#f");if(f){const inp=$("#fs"),sg=$("#sg");const show=()=>{const v=inp.value.trim().toLowerCase(),m=findCat(v),ex=m.find(c=>c.n.toLowerCase()===v||c.s.toLowerCase()===v);
  const fc=$("#fk-cur");if(fc)fc.textContent=ex?cs(ex.s):"Kurswährung";
  if(ex){pick=ex;sg.innerHTML=`<div class="found up">✓ Erkannt: ${ex.n} (${ex.s})${priceOf(ex.s)?"":" · Kurs folgt mit Live-Daten"}</div>`;return}pick=null;
  sg.innerHTML=m.length?`<div class="sugg">${m.map(c=>`<button type="button" data-pick="${c.s}">${c.n} <span class="num" style="color:var(--muted)">${c.s}</span></button>`).join("")}</div>`:v?'<div class="found flat">Nicht erkannt. Du kannst sie trotzdem eintragen.</div>':""};
  inp.addEventListener("input",show);if(inp.value)show();
  f.addEventListener("submit",e=>{e.preventDefault();const raw=inp.value.trim();if(!raw)return;const p=pick||findCat(raw)[0],s=p?p.s:raw.toUpperCase(),n=p?p.n:raw;
   S.depot=S.depot.filter(d=>!d.demo);S.depot.push({s,n,q:+$("#fq").value,k:+$("#fk").value,a:+$("#fa").value||S.settings.alertDefault,z:+$("#fz").value||0,tag:+$("#ft").value||0});pick=null;save();syncPlan(true);toast(A[s]?`${n} eingetragen`:`${n} eingetragen. Verlauf und Prognose kommen in wenigen Minuten.`);render();if(S.settings.fhKey&&!S.quotes[s])refreshLive()})}
 const fw=$("#fw");if(fw){const wi=$("#ws"),wg=$("#wsg");wi.addEventListener("input",()=>{const m=findCat(wi.value);wg.innerHTML=m.length?`<div class="sugg">${m.map(c=>`<button type="button" data-wpick="${c.s}">${c.n} <span class="num" style="color:var(--muted)">${c.s}</span></button>`).join("")}</div>`:""});
  fw.addEventListener("submit",e=>{e.preventDefault();const c=findCat(wi.value)[0],w=c?c.s:wi.value.trim().toUpperCase();if(w&&!S.watch.includes(w)){S.watch.push(w);save();syncPlan(true);toast(`${c?c.n:w} wird beobachtet`)}render(true)})}
 const fg=$("#fg");if(fg)fg.addEventListener("submit",e=>{e.preventDefault();Object.assign(S.fin.goal,{n:$("#g-n").value.trim()||"Sparziel",z:+$("#g-z").value||0,g:+$("#g-g").value||0});save();toast("Sparziel gespeichert");render(true)});
 const ff=$("#ff");if(ff)ff.addEventListener("submit",e=>{e.preventDefault();if(S.fin.demo){S.fin.items=[];delete S.fin.demo}S.fin.items.push({n:$("#fin-n").value.trim(),b:+$("#fin-b").value,t:$("#fin-t").value});save();toast("Hinzugefügt");render(true)});
 const k2=$("#fk2");if(k2)k2.addEventListener("submit",e=>{e.preventDefault();kq={n:$("#k-n").value.trim(),p:+$("#k-p").value,d:$("#k-d").value.trim(),u:$("#k-u").value.trim(),a:[]};render(true)});
 const cv=$("#csv");if(cv)cv.addEventListener("change",()=>{const fl=cv.files[0];if(!fl)return;const rd=new FileReader();rd.onload=()=>{if(/\uFFFD/.test(rd.result)){const r2=new FileReader();r2.onload=()=>{imp0=parseCSV(r2.result);render(true)};r2.readAsText(fl,"ISO-8859-1");return}imp0=parseCSV(rd.result);render(true)};rd.readAsText(fl,"UTF-8")})}
document.addEventListener("click",e=>{const T=sel=>e.target.closest(sel);let el;
 if(el=T("[data-tab]")){hist=[];go(el.dataset.tab,false);return}
 if(el=T("[data-fsub]")){e.preventDefault();$("#sheet").classList.remove("open");$("#sheet-bg").classList.remove("open");finSub=el.dataset.fsub;hist=[];go("finanzen",false);return}
 if(el=T("[data-settings]")){e.preventDefault();openSettings(el.dataset.settings);return}
 if(T("#gear")){openSettings();return}
 if(T("#cart")){openCart();return}
 if(el=T("[data-notify]")){S.settings.notify[el.dataset.notify]=el.checked;save();return}
 if(T("[data-sync]")){syncPull().then(()=>syncPush()).then(()=>{toast(S.syncInfo||"Abgeglichen");openSettings("sync")});return}
 if(el=T("[data-watch]")){const w=el.dataset.watch;S.watch=S.watch.includes(w)?S.watch.filter(x=>x!==w):[...S.watch,w];save();if(S.watch.includes(w))syncPlan(true);toast(S.watch.includes(w)?"Wird beobachtet":"Nicht mehr beobachtet");render(true);return}
 if(el=T("[data-unwatch]")){S.watch=S.watch.filter(x=>x!==el.dataset.unwatch);save();render(true);return}
 if(el=T("[data-wpick]")){const c=(KI.catalog||[]).find(x=>x.s===el.dataset.wpick);if(c&&!S.watch.includes(c.s)){S.watch.push(c.s);save();syncPlan(true);toast(`${c.n} wird beobachtet`)}render(true);return}
 if(T("#refresh")||T("[data-refresh]")){refreshLive(true);return}
 if(T("[data-close]")||T("#sheet-bg")){closeSettings();return}
 if(el=T("[data-color]")){S.settings.accent=el.dataset.color;save();applyLook();document.querySelectorAll("[data-color]").forEach(b=>b.setAttribute("aria-pressed",b===el));return}
 if(el=T("[data-set]")){S.settings[el.dataset.set]=el.dataset.val;save();applyLook();el.parentElement.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",b===el));if(el.dataset.set==="investor")A=analyzeAll();return}
 if(el=T("[data-start]")){S.settings.start[el.dataset.start]=el.checked;save();return}
 if(T("[data-export]")){const b=new Blob([JSON.stringify(Object.assign({},S,{kiCache:null}),null,1)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`aktien-helfer-sicherung-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();toast("Sicherung wird gespeichert");return}
 if(T("[data-reset]")){$("#reset-zone").innerHTML='<div class="alert"><div style="flex:1">Wirklich alles löschen? Depot, Finanzen, Kaufhilfe und Einstellungen gehen verloren.<div class="btns" style="margin:8px 0 0"><button class="btn danger" data-reset-yes>Ja, löschen</button><button class="btn ghost" data-close>Abbrechen</button></div></div></div>';return}
 if(T("[data-reset-yes]")){try{localStorage.removeItem("kah")}catch(_){}load();applyLook();closeSettings();toast("Alle Daten gelöscht");return}
 if(el=T("[data-go]")){e.preventDefault();go(el.dataset.go);return}
 if(el=T('a[href^="#"]')){const r=el.getAttribute("href").slice(1);if(r){e.preventDefault();go(r)}return}
 if(T("[data-back]")){go(hist.pop()||"start",false);return}
 if(el=T("[data-f]")){filter=el.dataset.f;render(true);return}
 if(el=T("[data-rg]")){region=el.dataset.rg;render(true);return}
 if(el=T("[data-nf]")){newsFilter=el.dataset.nf;render(true);return}
 if(el=T("[data-fs]")){finSub=el.dataset.fs;render(true);return}
 if(el=T("[data-model]")){S.fin.model=el.dataset.model;S.fin.dismissRec="";save();toast(`Sparmodell: ${MODELS[S.fin.model].n}`);render(true);return}
 if(el=T("[data-upd]")){const id=el.dataset.id,v=el.dataset.upd;if(v==="undo")delete S.updates[id];else S.updates[id]=v;if(v==="undo")S.updates[id]="no";save();A=analyzeAll();toast(v==="ok"?"Update übernommen":v==="undo"?"Rückgängig gemacht":"Abgelehnt");render(true);return}
 if(el=T("[data-pick]")){pick=(KI.catalog||[]).find(c=>c.s===el.dataset.pick);$("#fs").value=pick.n;$("#fs").dispatchEvent(new Event("input"));const k=$("#fk");if(priceOf(pick.s)&&!k.value)k.value=priceOf(pick.s);$("#fq").focus();return}
 if(el=T("[data-add]")){pick=(KI.catalog||[]).find(c=>c.s===el.dataset.add)||{s:el.dataset.add,n:el.dataset.add};go("depot");$("#fq").focus();return}
 if(el=T("[data-del]")){const d=S.depot.splice(+el.dataset.del,1)[0];save();toast(`${d.n} entfernt`);render(true);return}
 if(el=T("[data-fdel]")){delete S.fin.demo;S.fin.items.splice(+el.dataset.fdel,1);save();render(true);return}
 if(el=T("[data-qa]")){kq.a.push(+el.dataset.qa);render(true);return}
 if(T("[data-qback]")){kq.a.pop();render(true);return}
 if(el=T("[data-kd]")){const v=el.dataset.kd;S.kh.hist=(S.kh.hist||[]).concat([{n:kq.n,p:kq.p,d:kq.d,u:kq.u,r:v==="buy"?"gekauft":v==="skip"?"gelassen":"",t:Date.now()}].filter(h=>h.r)).slice(-30);if(v==="buy"){S.kh.bought+=kq.p;toast("Viel Freude damit")}else if(v==="skip"){S.kh.saved+=kq.p;toast(`${fmt(kq.p,0)} € gespart`)}else{S.kh.list.push({id:Date.now(),n:kq.n,p:kq.p,d:kq.d||"",u:kq.u||"",due:Date.now()+(+v)*864e5});toast("Ich erinnere dich")}kq=null;save();render(true);return}
 if(el=T("[data-kb]")){const i=S.kh.list.findIndex(x=>x.id==el.dataset.kb);S.kh.hist=(S.kh.hist||[]).concat([Object.assign({},S.kh.list[i],{r:"gekauft",t:Date.now()})]).slice(-30);S.kh.bought+=S.kh.list[i].p;S.kh.list.splice(i,1);save();render(true);if($("#sheet").classList.contains("open")&&$("#sheet").querySelector("[data-kb],.empty"))openCart();return}
 if(el=T("[data-kn]")){const i=S.kh.list.findIndex(x=>x.id==el.dataset.kn);S.kh.hist=(S.kh.hist||[]).concat([Object.assign({},S.kh.list[i],{r:"gelassen",t:Date.now()})]).slice(-30);S.kh.saved+=S.kh.list[i].p;toast(`${fmt(S.kh.list[i].p,0)} € gespart`);S.kh.list.splice(i,1);save();render(true);if($("#sheet").classList.contains("open")&&$("#sheet").querySelector("[data-kb],.empty"))openCart();return}
 if(T("[data-imp-apply]")&&imp0&&!imp0.err){const m=imp0.months||1,items=[];if(imp0.ein)items.push({n:"Einnahmen (Kontoauszug)",b:Math.round(imp0.ein/m),t:"ein"});
  Object.entries(imp0.sums).forEach(([n,o])=>items.push({n,b:Math.round(o.b/m),t:o.t}));S.fin.items=items;delete S.fin.demo;save();finSub="uebersicht";toast("Werte übernommen");render(true);return}
});
addEventListener("popstate",()=>{const k=location.hash.slice(1);if(k&&k!==route){route=k;render()}});
let toastT;function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2400)}
function spin(on){const b=$("#refresh");if(b)b.classList.toggle("spin",on)}
let timer;function startTimer(){clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState==="visible")refreshLive()},Math.max(1,S.settings.refreshMin)*6e4)}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){if(Date.now()-S.lastLive>S.settings.refreshMin*6e4)refreshLive();syncPull().then(()=>render(true))}status()});
setInterval(status,30000);

/* ---------- Start ---------- */
(async()=>{applyLook();await loadKI();await syncPull();A=analyzeAll();
 const h0=location.hash.slice(1);if(h0&&(TABS.includes(h0)||/^(aktie|news|update)-/.test(h0)))route=h0;render();
 if(!PREVIEW&&"serviceWorker" in navigator){try{navigator.serviceWorker.register("sw.js")}catch(e){}}
 if(Date.now()-S.lastLive>6e4)refreshLive();startTimer()})();
