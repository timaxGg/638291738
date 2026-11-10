// Top-Aktien (zweite App, Ordner trading/). Wird vom Wachmann bei jedem Lauf aufgerufen.
// 1. Rechnung: aus Tageskursen (Yahoo) eine Rangliste je Zeitraum (3, 7, 30 Handelstage), am letzten Jahr getestet.
// 2. Vorlage: 3x täglich die besten Kandidaten mit Fakten und Meldungen nach data/beste-vorlage.json.
//    Die Claude-Aufgabe „Top-Aktien Recherche“ recherchiert dazu im Netz und schreibt data/beste.json.
// 3. Ergebnis + Entwicklung früherer Listen landen in kurse.json (Feld sig), die App liest es dort.
// Keine erfundenen Zahlen: alle Zahlen kommen aus Kursdaten oder aus verlinkten Quellen. Keine Anlageberatung.
import fs from "node:fs";

const KOSTEN=0.1;          // % je Kauf bzw. Verkauf (im Test abgezogen)
const TOP=5;               // so viele Werte zeigt die App je Zeitraum
const KAND=8;              // so viele Kandidaten bekommt die KI je Zeitraum
const HORIZONTE=[3,7,30];  // Handelstage
const SLOTS=[["morgens",6*60+40],["mittags",12*60+40],["abends",18*60+40]]; // Vorlage ab dieser Uhrzeit (Berlin)

const UNIVERSUM=[
  ["AAPL","Apple"],["MSFT","Microsoft"],["NVDA","Nvidia"],["AMZN","Amazon"],["GOOGL","Alphabet"],["META","Meta"],["TSLA","Tesla"],["AVGO","Broadcom"],
  ["AMD","AMD"],["NFLX","Netflix"],["JPM","JPMorgan"],["V","Visa"],["MA","Mastercard"],["XOM","Exxon Mobil"],["CVX","Chevron"],["LLY","Eli Lilly"],
  ["UNH","UnitedHealth"],["ABBV","AbbVie"],["PFE","Pfizer"],["COST","Costco"],["WMT","Walmart"],["HD","Home Depot"],["MCD","McDonald's"],["KO","Coca-Cola"],
  ["PEP","PepsiCo"],["NKE","Nike"],["DIS","Disney"],["ORCL","Oracle"],["CRM","Salesforce"],["ADBE","Adobe"],["INTC","Intel"],["QCOM","Qualcomm"],
  ["MU","Micron"],["PLTR","Palantir"],["UBER","Uber"],["BAC","Bank of America"],["GS","Goldman Sachs"],["CAT","Caterpillar"],["BA","Boeing"],["SHOP","Shopify"],
  ["SAP.DE","SAP"],["SIE.DE","Siemens"],["ALV.DE","Allianz"],["DTE.DE","Deutsche Telekom"],["AIR.DE","Airbus"],["RHM.DE","Rheinmetall"],["MUV2.DE","Münchener Rück"],
  ["IFX.DE","Infineon"],["BMW.DE","BMW"],["MBG.DE","Mercedes-Benz"],["VOW3.DE","Volkswagen"],["BAS.DE","BASF"],["BAYN.DE","Bayer"],["DBK.DE","Deutsche Bank"],
  ["ADS.DE","Adidas"],["DHL.DE","DHL Group"],["ENR.DE","Siemens Energy"],["MTX.DE","MTU Aero Engines"],["DB1.DE","Deutsche Börse"],["HNR1.DE","Hannover Rück"],
  ["ASML.AS","ASML"],["MC.PA","LVMH"],["TTE.PA","TotalEnergies"],["OR.PA","L'Oréal"],["SAN.PA","Sanofi"],["AI.PA","Air Liquide"],["NOVO-B.CO","Novo Nordisk"],
  ["NESN.SW","Nestlé"],["ROG.SW","Roche"],["NOVN.SW","Novartis"]];

/* ---------- Hilfen ---------- */
const EU_SUF=/\.(DE|F|AS|PA|MI|L|SW|VI|MC|BR|CO|ST|HE|OL|LS|IR)$/;
const regionVon=s=>EU_SUF.test(s)?"eu":"us";
const istAktie=s=>!!s&&!/^\^|=X$|=F$|-(EUR|USD)$/.test(s);
const ZONE={us:{tz:"America/New_York",a:570,b:960},eu:{tz:"Europe/Berlin",a:540,b:1050}};
function teile(tz,d=new Date()){const p=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",weekday:"short",hourCycle:"h23"}).formatToParts(d);
  const g=k=>(p.find(x=>x.type===k)||{}).value;return {date:`${g("year")}-${g("month")}-${g("day")}`,min:+g("hour")*60+ +g("minute"),wd:g("weekday")}}
const offen=reg=>{const m=ZONE[reg],z=teile(m.tz);return !["Sat","Sun"].includes(z.wd)&&z.min>=m.a&&z.min<m.b};
const r6=v=>v==null||!isFinite(v)?null:+(+v).toPrecision(7);
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const f1=v=>(+v).toFixed(1).replace(".",",");
const pz=v=>v==null||!isFinite(v)?"–":(v>0?"+":"")+f1(v)+" %";
function dez(v){v=+v;const d=v>=1?2:v>=.01?4:6;return v.toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d})}
const CS={EUR:"€",USD:"$",GBp:"p",GBP:"£",CHF:"CHF",DKK:"kr"};

/* ---------- Daten ---------- */
async function yahoo(s,range){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${range}&interval=1d`,{headers:{"user-agent":"Mozilla/5.0 (compatible; AktienHelfer/1.0)"}});
  if(!r.ok)throw new Error("Yahoo "+r.status);const j=await r.json(),res=j&&j.chart&&j.chart.result&&j.chart.result[0];if(!res||!res.timestamp)throw new Error("keine Daten für "+s);
  const q=(res.indicators.quote||[])[0]||{},m=res.meta||{},tz=m.exchangeTimezoneName||"UTC",out=[];
  for(let i=0;i<res.timestamp.length;i++){const o=q.open&&q.open[i],h=q.high&&q.high[i],l=q.low&&q.low[i],c=q.close&&q.close[i];if([o,h,l,c].some(v=>v==null||!isFinite(v)||v<=0))continue;
    const b=[teile(tz,new Date(res.timestamp[i]*1000)).date,r6(o),r6(h),r6(l),r6(c),Math.round((q.volume&&q.volume[i])||0)];if(out.length&&out[out.length-1][0]===b[0])out[out.length-1]=b;else out.push(b)}
  return {bars:out,cur:m.currency||"",p:m.regularMarketPrice,mt:(m.regularMarketTime||0)*1000}}
const zusammen=(alt,neu)=>{const m=new Map(alt.map(b=>[b[0],b]));for(const b of neu)m.set(b[0],b);return [...m.values()].sort((a,b)=>a[0]<b[0]?-1:1)};
async function meldungen(s){const FH=process.env.FINNHUB_KEY||"",heute=new Date().toISOString().slice(0,10),von=new Date(Date.now()-6*864e5).toISOString().slice(0,10);
  try{if(regionVon(s)==="us"&&FH){const r=await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(s)}&from=${von}&to=${heute}&token=${FH}`);if(r.ok)return (await r.json()).slice(0,5).map(n=>({t:n.headline,u:n.url,q:n.source,d:new Date(n.datetime*1000).toISOString().slice(0,10),z:(n.summary||"").slice(0,240)}))}
    const r=await fetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(s)}&region=DE&lang=de-DE`,{headers:{"user-agent":"Mozilla/5.0"}});if(!r.ok)return [];const x=await r.text();
    return [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,4).map(m=>{const g=t=>((m[1].match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\/${t}>`))||[])[1]||"").trim();
      const d=Date.parse(g("pubDate"));return {t:g("title"),u:g("link"),q:"Yahoo Finanzen",d:d?new Date(d).toISOString().slice(0,10):"",z:g("description").slice(0,240)}}).filter(n=>n.t&&n.u)}catch(e){return []}}
async function quartalszahlen(){const FH=process.env.FINNHUB_KEY||"";if(!FH)return [];const a=new Date().toISOString().slice(0,10),b=new Date(Date.now()+40*864e5).toISOString().slice(0,10);
  try{const r=await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${a}&to=${b}&token=${FH}`);if(!r.ok)return [];return ((await r.json()).earningsCalendar||[]).map(e=>({s:e.symbol,d:e.date}))}catch(e){return []}}

/* ---------- Kennzahlen und Punktzahl je Zeitraum ---------- */
function rsiR(c,n=14){const r=Array(c.length).fill(null);if(c.length<=n)return r;let g=0,l=0;for(let i=1;i<=n;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d}g/=n;l/=n;r[n]=l===0?100:100-100/(1+g/l);
  for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;r[i]=l===0?100:100-100/(1+g/l)}return r}
function sma(a,n){const r=Array(a.length).fill(null);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];if(i>=n-1)r[i]=s/n}return r}
// Punktzahl = Kursanstieg geteilt durch die normale Schwankung (risikobereinigtes Momentum) + Trend − Überhitzung
function rechne(C){const n=C.length,lr=C.map((c,i)=>i?Math.log(c/C[i-1]):0),rsi=rsiR(C),s20=sma(C,20),s50=sma(C,50);
  const sd=Array(n).fill(null);for(let i=60;i<n;i++){const a=lr.slice(i-59,i+1),m=mean(a);sd[i]=Math.sqrt(mean(a.map(x=>(x-m)**2)))||null}
  const z=(i,k)=>i>=k&&sd[i]?Math.log(C[i]/C[i-k])/(sd[i]*Math.sqrt(k)):null;
  const P={3:[],7:[],30:[]};
  for(let i=0;i<n;i++){const z20=z(i,20),z60=z(i,60),z120=z(i,120),tr=s20[i]!=null&&s50[i]!=null&&s20[i]>s50[i]?1:0,heiss=rsi[i]>75?1:0;
    P[3][i]=z20==null?null:z20+.5*tr-heiss-(rsi[i]<25?.5:0);
    P[7][i]=z20==null||z60==null?null:.5*z20+.5*z60+.5*tr-.5*heiss;
    P[30][i]=z60==null||z120==null?null:z60+.5*z120+.5*tr}
  return {P,rsi,s20,s50,sd}}

/* ---------- Test: wie gut war die Rangliste im letzten Jahr? ---------- */
// An jedem Handelstag die Top 5 nach Punktzahl kaufen (Schlusskurs), nach H Handelstagen verkaufen, Kosten abziehen,
// und mit dem Durchschnitt aller Werte im selben Zeitraum vergleichen.
function test(W){const ab=new Date(Date.now()-365*864e5).toISOString().slice(0,10),zaehl={};
  for(const w of W)for(const b of w.bars)if(b[0]>=ab)zaehl[b[0]]=(zaehl[b[0]]||0)+1;
  const tage=Object.keys(zaehl).filter(d=>zaehl[d]>=W.length*.5).sort(),out={};
  for(const H of HORIZONTE){const top=[],alle=[];let besser=0,n=0;
    for(const d of tage){const l=[];for(const w of W){const i=w.idx.get(d);if(i==null||i+H>=w.C.length)continue;const p=w.R.P[H][i];if(p==null)continue;l.push({p,f:(w.C[i+H]/w.C[i]-1)*100-2*KOSTEN})}
      if(l.length<10)continue;l.sort((a,b)=>b.p-a.p);const t=l.slice(0,TOP),mt=mean(t.map(x=>x.f)),ma=mean(l.map(x=>x.f));top.push(...t.map(x=>x.f));alle.push(ma);n++;if(mt>ma)besser++}
    out[H]=n?{tage:n,topAvg:+mean(top).toFixed(2),alleAvg:+mean(alle).toFixed(2),besser:Math.round(besser/n*100),plus:Math.round(top.filter(x=>x>0).length/top.length*100)}:{tage:0}}
  return out}

/* ---------- Zustand ---------- */
let SF="",ST=null;
const lade=()=>{try{return Object.assign({hist:{},listen:[],fehler:{}},JSON.parse(fs.readFileSync(SF,"utf8")))}catch(e){return {hist:{},listen:[],fehler:{}}}};
const speichere=()=>{fs.mkdirSync(SF.replace(/\/[^/]*$/,""),{recursive:true});fs.writeFileSync(SF,JSON.stringify(ST))};
export const app=()=>ST&&ST.app||null;
const readJSON=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){return d}};

function liste(ctx){const l=UNIVERSUM.map(([s,n])=>({s,n})),da=new Set(l.map(x=>x.s));
  for(const s of (ctx.eigene?ctx.eigene():[]))if(istAktie(s)&&!da.has(s)&&l.length<UNIVERSUM.length+10){da.add(s);l.push({s,n:ctx.name?ctx.name(s):s,eigen:1})}
  for(const [s,h] of Object.entries(ST.hist))if(h.tmp&&!da.has(s)){if(Date.now()-h.tmp>3*864e5){delete ST.hist[s];continue}da.add(s);l.push({s,n:h.n||s,eigen:1})}
  return l}

/* ---------- Hauptlauf ---------- */
export async function lauf(ctx){SF=ctx.P(".state/beste.json");if(!ST)ST=lade();const B=ctx.B,heute=new Date().toISOString().slice(0,10);let fehler=0,geholt=0;
  const L=liste(ctx);
  // Verlauf (2 Jahre) einmal am Tag, höchstens 30 pro Lauf; offene Börsen: aktuelle Tageskerze alle 15 Min.
  for(const w of L){const h=ST.hist[w.s];if(h&&h.d===heute&&h.bars)continue;if(geholt>=30)break;geholt++;
    try{const y=await yahoo(w.s,"2y");ST.hist[w.s]=Object.assign(h||{},{d:heute,bars:y.bars,cur:y.cur,p:y.p,mt:y.mt,lt:Date.now()});delete ST.fehler[w.s]}catch(e){fehler++;ST.fehler[w.s]=String(e.message).slice(0,80)}}
  for(const w of L){const h=ST.hist[w.s];if(!h||!h.bars)continue;const alt=Date.now()-(h.lt||0);if(alt<14*6e4||(!offen(regionVon(w.s))&&alt<3*36e5))continue;
    try{const y=await yahoo(w.s,"5d");h.bars=zusammen(h.bars,y.bars).slice(-800);h.p=y.p;h.mt=y.mt;h.cur=y.cur||h.cur;h.lt=Date.now();delete ST.fehler[w.s]}catch(e){fehler++;ST.fehler[w.s]=String(e.message).slice(0,80)}}
  for(const s of Object.keys(ST.hist))if(!L.some(w=>w.s===s))delete ST.hist[s];
  if(fehler)B.err.beste=`${fehler} Kursabruf(e) fehlgeschlagen (Yahoo)`;else delete B.err.beste;

  // Rechnen
  const W=[];for(const w of L){const h=ST.hist[w.s];if(!h||!h.bars||h.bars.length<130)continue;const C=h.bars.map(b=>b[4]);
    W.push(Object.assign({},w,{h,bars:h.bars,C,idx:new Map(h.bars.map((b,i)=>[b[0],i])),R:rechne(C)}))}
  if(W.length<15){speichere();return false}
  // erst wenn (fast) alle Verläufe von heute da sind, wird getestet und die Vorlage geschrieben
  const vollst=L.filter(w=>ST.hist[w.s]&&ST.hist[w.s].d===heute).length>=L.length*.9;
  // Test einmal am Tag (ändert sich im Tagesverlauf nicht)
  if(!ST.test||(ST.test.d!==heute&&vollst))ST.test={d:heute,von:new Date(Date.now()-365*864e5).toISOString().slice(0,10),werte:W.length,h:test(W)};
  const jetzt=W.filter(w=>Date.now()-Date.parse(w.bars[w.bars.length-1][0])<6*864e5);// ohne veraltete Werte
  const fakten=(w,H)=>{const i=w.C.length-1,C=w.C,p=w.h.p&&Date.now()-(w.h.mt||0)<3*864e5?w.h.p:C[i],sd=w.R.sd[i],ch=k=>i>=k?+((p/C[i-k]-1)*100).toFixed(1):null;
    return {s:w.s,n:w.n,cur:w.h.cur||"",p:r6(p),dp:+((p/C[i-1]-1)*100).toFixed(2),mt:w.h.mt||w.h.lt||0,eigen:w.eigen||undefined,
      tage5:ch(5),wochen4:ch(20),monate3:ch(60),monate6:ch(120),rsi:w.R.rsi[i]!=null?+w.R.rsi[i].toFixed(0):null,schwankungJahr:sd?+(sd*Math.sqrt(252)*100).toFixed(0):null,
      trend:w.R.s20[i]!=null&&w.R.s50[i]!=null?(w.R.s20[i]>w.R.s50[i]?"aufwärts":"abwärts"):null,ueber50:w.R.s50[i]?+((p/w.R.s50[i]-1)*100).toFixed(1):null,
      punkte:H?+w.R.P[H][i].toFixed(2):undefined,bereich:H&&sd?{lo:r6(p*Math.exp(-sd*Math.sqrt(H))),hi:r6(p*Math.exp(sd*Math.sqrt(H)))}:undefined,
      spark:C.slice(-60).map(x=>+(+x).toPrecision(5))}};
  const rang={};for(const H of HORIZONTE)rang[H]=jetzt.filter(w=>w.R.P[H][w.C.length-1]!=null).sort((a,b)=>b.R.P[H][b.C.length-1]-a.R.P[H][a.C.length-1]);

  // KI-Ergebnis lesen (data/beste.json, kommt von der Claude-Aufgabe)
  const ki=readJSON(ctx.P("data/beste.json"),null),kiOk=ki&&ki.id&&ki.listen;
  if(kiOk&&!ST.listen.some(x=>x.id===ki.id)){// neue Liste: Startkurse merken, damit die Entwicklung messbar ist
    const e={id:ki.id,d:heute,t:Date.now(),slot:ki.slot||"",h:{}};for(const H of HORIZONTE)e.h[H]=(ki.listen[H]||[]).slice(0,TOP).map(x=>{const w=W.find(y=>y.s===x.s);return {s:x.s,p0:w?r6(w.h.p||w.C[w.C.length-1]):null}}).filter(x=>x.p0);
    ST.listen.push(e);ST.listen=ST.listen.filter(x=>Date.now()-x.t<75*864e5);
    if(ctx.send&&!ctx.leise()&&!(ctx.U&&ctx.U.notify&&ctx.U.notify.beste===false)){const name=s=>(W.find(w=>w.s===s)||{n:s}).n;
      await ctx.send(`🏆 <b>Neue Top-Aktien (${esc(ctx,ki.slot||"aktuell")})</b>\n\n${HORIZONTE.map(H=>`<b>${H} Tage:</b> ${(ki.listen[H]||[]).slice(0,3).map((x,i)=>`${i+1}. ${esc(ctx,name(x.s))}`).join(" · ")}`).join("\n")}${ki.markt?`\n\n${esc(ctx,ki.markt)}`:""}\n\nGründe und Quellen: /beste oder /warum Kürzel\n<i>${HINWEIS}</i>${link(ctx)}`)}}

  // Entwicklung früherer Listen (je Tag die erste Liste, damit nichts doppelt zählt)
  const fertig={},laufend=[];const erste=[];for(const x of ST.listen)if(!erste.some(y=>y.d===x.d))erste.push(x);
  for(const H of HORIZONTE){const erg=[];for(const x of erste)for(const p of x.h[H]||[]){const w=W.find(y=>y.s===p.s);if(!w)continue;
      const i0=w.bars.findIndex(b=>b[0]>=x.d);if(i0<0)continue;const fertigBar=i0+H<w.C.length-(offen(regionVon(w.s))?1:0);
      if(fertigBar){const r=(w.C[i0+H]/p.p0-1)*100-2*KOSTEN,bench=mean(W.filter(v=>v.idx.has(w.bars[i0][0])&&v.idx.get(w.bars[i0][0])+H<v.C.length).map(v=>{const j=v.idx.get(w.bars[i0][0]);return (v.C[j+H]/v.C[j]-1)*100}));erg.push({r,bench})}}
    fertig[H]=erg.length?{n:erg.length,avg:+mean(erg.map(e=>e.r)).toFixed(2),plus:Math.round(erg.filter(e=>e.r>0).length/erg.length*100),bench:+mean(erg.map(e=>e.bench)).toFixed(2),besser:Math.round(erg.filter(e=>e.r>e.bench).length/erg.length*100)}:{n:0}}
  for(const x of ST.listen.slice(-12).reverse())laufend.push({id:x.id,d:x.d,slot:x.slot,h:Object.fromEntries(HORIZONTE.map(H=>[H,(x.h[H]||[]).map(p=>{const w=W.find(y=>y.s===p.s),pj=w?(w.h.p||w.C[w.C.length-1]):null;return {s:p.s,n:w?w.n:p.s,p0:p.p0,r:pj?+((pj/p.p0-1)*100).toFixed(1):null}})]))});

  // Liste für die App: KI-Auswahl (wenn von heute) sonst die reine Rechnung
  const kiHeute=kiOk&&ST.listen.some(x=>x.id===ki.id&&Date.now()-x.t<20*36e5),aktuell=ST.listen.find(x=>kiOk&&x.id===ki.id);
  const listen={};for(const H of HORIZONTE){const l=kiHeute?(ki.listen[H]||[]).slice(0,TOP):rang[H].slice(0,TOP).map(w=>({s:w.s}));
    listen[H]=l.map((x,i)=>{const w=W.find(y=>y.s===x.s);if(!w)return null;const r=rang[H].findIndex(y=>y.s===x.s),p0=aktuell&&(aktuell.h[H]||[]).find(p=>p.s===x.s);
      return Object.assign(fakten(w,H),{platz:i+1,rechenRang:r>=0?r+1:null,p0:kiHeute&&p0?p0.p0:undefined,warum:x.warum,treiber:x.treiber,risiken:x.risiken,termine:x.termine,zuversicht:x.zuversicht,quellen:Array.isArray(x.quellen)?x.quellen.filter(q=>q&&/^https?:\/\//.test(q.u||"")).slice(0,8):undefined})}).filter(Boolean)}
  ST.app={v:2,t:Date.now(),top:TOP,kosten:KOSTEN,horizonte:HORIZONTE,test:ST.test,werte:W.length,
    ki:kiHeute?{id:ki.id,erstellt:ki.erstellt,slot:ki.slot,markt:ki.markt||"",marktQuellen:Array.isArray(ki.marktQuellen)?ki.marktQuellen.slice(0,4):[],aussortiert:Array.isArray(ki.aussortiert)?ki.aussortiert.slice(0,12):[]}:null,
    listen,bilanz:{fertig,laufend},fehler:Object.keys(ST.fehler).length?ST.fehler:undefined};

  // Vorlage für die Claude-Aufgabe (3x täglich)
  const z=teile("Europe/Berlin"),slot=[...SLOTS].reverse().find(([,m])=>z.min>=m);
  if(slot&&vollst&&ST.vorlage!==z.date+slot[0]){ST.vorlage=z.date+slot[0];await vorlage(ctx,W,rang,fakten,slot[0],z.date,kiOk&&ki.datum===z.date?ki:null)}

  const alt=ST.k||"";ST.k=JSON.stringify([ST.app.ki&&ST.app.ki.id,...HORIZONTE.map(H=>listen[H].map(x=>x.s+x.p))]);speichere();
  ctx.log("Top-Aktien:",HORIZONTE.map(H=>`${H}T ${listen[H].map(x=>x.s).join(",")}`).join(" | "),kiHeute?"(mit KI)":"(nur Rechnung)");
  return alt!==ST.k}

async function vorlage(ctx,W,rang,fakten,slot,datum,bisher){const quart=await quartalszahlen(),kand={},alle=new Set();
  for(const H of HORIZONTE)kand[H]=rang[H].slice(0,KAND).map((w,i)=>{alle.add(w.s);const f=fakten(w,H);delete f.spark;delete f.mt;delete f.eigen;return Object.assign(f,{rechenRang:i+1})});
  const mel={};for(const s of alle){mel[s]={meldungen:await meldungen(s),quartalszahlen:(quart.find(q=>q.s===s)||{}).d||null}}
  const alt={};if(bisher)for(const H of HORIZONTE)for(const x of bisher.listen[H]||[])if(alle.has(x.s)&&!alt[x.s])alt[x.s]={warum:x.warum,treiber:x.treiber,risiken:x.risiken,termine:x.termine,quellen:x.quellen};
  const v={id:`b-${datum}-${slot}`,datum,slot,erstellt:new Date().toISOString(),
    _anleitung:"Siehe trading/KI-AUFGABE.md. Kurz: Für jeden Zeitraum (3, 7, 30 Handelstage) aus den kandidaten genau 5 Werte auswählen und begründen, mit echter Websuche und Quellen-Links. Nur Werte aus der jeweiligen Kandidatenliste. Keine Zahlen erfinden. Ergebnis als data/beste.json.",
    methode:{text:"Rangliste nach risikobereinigtem Kursanstieg (Anstieg geteilt durch normale Schwankung) plus Trend, abzüglich Überhitzung (RSI über 75). rechenRang 1 = beste Punktzahl.",test:ST.test},
    kandidaten:kand,werteInfo:mel,_bisherHeute:Object.keys(alt).length?alt:undefined,
    format:{id:"wie oben",datum:"wie oben",slot:"wie oben",erstellt:"ISO-Zeitstempel jetzt",markt:"2–3 Sätze zur Marktlage heute",marktQuellen:[{t:"Titel",u:"https://…",q:"Quelle",d:"JJJJ-MM-TT"}],
      listen:{"3":[{s:"Kürzel aus kandidaten[3]",warum:"3–5 Sätze",treiber:["…"],risiken:["…"],termine:["…"],zuversicht:"niedrig|mittel|hoch",quellen:[{t:"Titel",u:"https://…",q:"Quelle",d:"JJJJ-MM-TT"}]}],"7":["…"],"30":["…"]},
      aussortiert:[{s:"Kürzel",h:3,grund:"1 Satz, warum trotz guter Rechnung nicht gewählt"}]}};
  fs.mkdirSync(ctx.P("data"),{recursive:true});fs.writeFileSync(ctx.P("data/beste-vorlage.json"),JSON.stringify(v,null,1));if(ctx.merk)ctx.merk("data/beste-vorlage.json");
  ctx.log("Top-Aktien: Vorlage",v.id,[...alle].length,"Werte")}

/* ---------- Telegram ---------- */
export const HINWEIS="Rangliste aus Kursdaten, von der KI mit Quellen geprüft. Vergangene Ergebnisse sind keine Garantie. Keine Anlageberatung.";
const esc=(ctx,s)=>ctx.esc?ctx.esc(s):String(s??"");
function link(ctx,s){return ctx.APP?`\n<a href="${ctx.APP}trading/${s?"#s-"+encodeURIComponent(s):""}">In der Top-Aktien-App öffnen ›</a>`:""}
export const HILFE_ZEILEN=`/beste – die besten Aktien für 3, 7 und 30 Tage mit Grund (/beste 7 nur ein Zeitraum)
/warum SAP – warum ein Wert in der Liste ist, mit Quellen und Entwicklung`;
export const FUSS_TEIL=" /beste /warum";
const cs=x=>CS[x.cur]||x.cur||"";
export async function befehl(c,arg,ctx){SF=ctx.P(".state/beste.json");if(!ST)ST=lade();const A=ST.app;
  if(!A||!A.listen)return ctx.send("Die Liste wird gerade zum ersten Mal berechnet (dauert 2–3 Läufe). Bitte gleich nochmal versuchen.",{direkt:true});
  const kiT=A.ki?`Recherche ${esc(ctx,A.ki.slot||"")} ${new Date(A.ki.erstellt||A.t).toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin",hour:"2-digit",minute:"2-digit"})} Uhr`:"KI-Recherche steht noch aus, nur Rechnung";
  if(c==="/beste"||c==="/signale"){const nur=HORIZONTE.find(H=>String(H)===String(arg||"").replace(/\D/g,""));
    const teil=H=>{const t=(A.test.h||{})[H]||{};return `📅 <b>${H} Handelstage</b>${t.tage?` <i>(Test: Top ${A.top} lagen an ${t.besser} % der Tage vorn, Ø ${pz(t.topAvg)} statt ${pz(t.alleAvg)})</i>`:""}\n${A.listen[H].map(x=>`${x.platz}. <b>${esc(ctx,x.n)}</b> ${dez(x.p)} ${cs(x)}${x.p0?` · seit Liste ${pz((x.p/x.p0-1)*100)}`:""}${x.warum?`\n   ${esc(ctx,String(x.warum).split(/(?<=\.)\s/)[0])}`:`\n   4 Wochen ${pz(x.wochen4)}, 3 Monate ${pz(x.monate3)}`}`).join("\n")}`};
    return ctx.send(`🏆 <b>Top-Aktien</b> · ${kiT}\n\n${(nur?[nur]:HORIZONTE).map(teil).join("\n\n")}${A.ki&&A.ki.markt?`\n\n🌍 ${esc(ctx,A.ki.markt)}`:""}\n\nDetails mit Quellen: /warum Kürzel\n<i>${HINWEIS}</i>${link(ctx)}`,{direkt:true})}
  // /warum X
  const q=(arg||"").trim();if(!q)return ctx.send("Welcher Wert? Beispiel: /warum NVDA oder /warum SAP",{direkt:true});
  const u=q.toUpperCase(),alle=HORIZONTE.flatMap(H=>A.listen[H].map(x=>Object.assign({H},x)));
  const treffer=alle.filter(x=>x.s.toUpperCase()===u||x.s.toUpperCase()===u+".DE"||x.n.toLowerCase().includes(q.toLowerCase()));
  if(!treffer.length)return ctx.send(`${esc(ctx,q)} ist gerade in keiner Liste. Aktuell drin: ${[...new Set(alle.map(x=>x.n))].map(n=>esc(ctx,n)).join(", ")}`,{direkt:true});
  const x=treffer.find(t=>t.warum)||treffer[0],in_=treffer.map(t=>`${t.H} Tage: Platz ${t.platz}`).join(" · ");
  const z=[`🔎 <b>${esc(ctx,x.n)}</b> (${esc(ctx,x.s)}) · ${dez(x.p)} ${cs(x)} · heute ${pz(x.dp)}`,`In der Liste: ${in_}`,
    `Kurs: 5 Tage ${pz(x.tage5)} · 4 Wochen ${pz(x.wochen4)} · 3 Monate ${pz(x.monate3)} · RSI ${x.rsi??"–"} · Trend ${x.trend||"–"}`,
    x.bereich?`Übliche Schwankung in ${x.H} Tagen: ${dez(x.bereich.lo)}–${dez(x.bereich.hi)} ${cs(x)} (keine Prognose, nur die normale Bandbreite)`:""];
  if(x.p0)z.push(`Seit der Liste: ${pz((x.p/x.p0-1)*100)}`);
  if(x.warum)z.push(`\n<b>Warum</b>\n${esc(ctx,x.warum)}`);else z.push("\n<i>Die KI-Recherche für diese Liste steht noch aus.</i>");
  if(x.treiber&&x.treiber.length)z.push(`<b>Treiber</b>\n${x.treiber.map(t=>"• "+esc(ctx,t)).join("\n")}`);
  if(x.risiken&&x.risiken.length)z.push(`<b>Risiken</b>\n${x.risiken.map(t=>"• "+esc(ctx,t)).join("\n")}`);
  if(x.termine&&x.termine.length)z.push(`<b>Termine</b>\n${x.termine.map(t=>"• "+esc(ctx,t)).join("\n")}`);
  if(x.zuversicht)z.push(`Zuversicht der KI: <b>${esc(ctx,x.zuversicht)}</b>`);
  if(x.quellen&&x.quellen.length)z.push(`<b>Quellen</b>\n${x.quellen.map(q=>`• <a href="${esc(ctx,q.u)}">${esc(ctx,q.t||q.q||"Quelle")}</a>${q.q?` (${esc(ctx,q.q)}${q.d?", "+esc(ctx,q.d):""})`:""}`).join("\n")}`);
  return ctx.send(`${z.filter(Boolean).join("\n")}\n\n<i>${HINWEIS}</i>${link(ctx,x.s)}`,{direkt:true})}
