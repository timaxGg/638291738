// Trading-Signale (eigene Datei, wird vom Wachmann bei jedem Lauf aufgerufen).
// Kurzfristige Signale (Kaufen / Verkaufen / Abwarten) aus Tageskerzen. Jede Regel wird an den Kursen
// des letzten Jahres getestet. Datenquelle: Yahoo Finance (ohne Schlüssel). Keine Anlageberatung.
import fs from "node:fs";

const KOSTEN=0.1;   // angenommene Kosten in % je Kauf bzw. Verkauf
const HALTE=10;     // ein Test-Trade endet spätestens nach 10 Handelstagen
const MIN_N=15;     // so viele Test-Trades braucht eine Regel, bevor sie Signale zeigen darf

const UNIVERSUM=[
  ["AAPL","Apple","us"],["MSFT","Microsoft","us"],["NVDA","Nvidia","us"],["AMZN","Amazon","us"],["GOOGL","Alphabet","us"],["META","Meta","us"],
  ["TSLA","Tesla","us"],["AMD","AMD","us"],["NFLX","Netflix","us"],["JPM","JPMorgan","us"],["V","Visa","us"],["XOM","Exxon Mobil","us"],
  ["SAP.DE","SAP","eu"],["SIE.DE","Siemens","eu"],["ALV.DE","Allianz","eu"],["DTE.DE","Deutsche Telekom","eu"],["AIR.DE","Airbus","eu"],["RHM.DE","Rheinmetall","eu"],
  ["MUV2.DE","Münchener Rück","eu"],["IFX.DE","Infineon","eu"],["BMW.DE","BMW","eu"],["BAS.DE","BASF","eu"],["ASML.AS","ASML","eu"],["MC.PA","LVMH","eu"],["TTE.PA","TotalEnergies","eu"],
  ["BTC-EUR","Bitcoin","krypto"],["ETH-EUR","Ethereum","krypto"],["SOL-EUR","Solana","krypto"],["XRP-EUR","XRP","krypto"],["BNB-EUR","BNB","krypto"],["ADA-EUR","Cardano","krypto"],["DOGE-EUR","Dogecoin","krypto"],
  ["SPY","S&P 500 ETF (SPY)","etf"],["QQQ","Nasdaq 100 ETF (QQQ)","etf"],["EUNL.DE","MSCI World ETF","etf"],["VWCE.DE","FTSE All-World ETF","etf"],["EXS1.DE","DAX ETF","etf"],["XMME.DE","Schwellenländer ETF","etf"],["4GLD.DE","Xetra-Gold","etf"],
  ["^GDAXI","DAX","idx"],["^STOXX50E","Euro Stoxx 50","idx"],["^GSPC","S&P 500","idx"],["^NDX","Nasdaq 100","idx"],["^DJI","Dow Jones","idx"]];
export const KLASSEN={us:"US-Aktien",eu:"EU-Aktien",krypto:"Krypto",etf:"ETFs",idx:"Indizes"};
const KL1={us:"US-Aktie",eu:"EU-Aktie",krypto:"Krypto",etf:"ETF",idx:"Index"};
export const REGELN=[
  {id:"rsi",name:"RSI-Wende",kauf:"RSI(14) steigt von unter 30 wieder über 30 (Erholung nach Ausverkauf).",verk:"RSI(14) fällt von über 70 wieder unter 70 (Abkühlung nach Übertreibung).",ziele:"Stop 1,5 × ATR, Ziel 2 × ATR"},
  {id:"macd",name:"MACD-Kreuz mit Trend",kauf:"MACD kreuzt seine Signallinie nach oben und der Kurs liegt über dem 50-Tage-Schnitt.",verk:"MACD kreuzt seine Signallinie nach unten und der Kurs liegt unter dem 50-Tage-Schnitt.",ziele:"Stop 2 × ATR, Ziel 4 × ATR"},
  {id:"ausbruch",name:"Ausbruch mit Volumen",kauf:"Schlusskurs erstmals über dem 20-Tage-Hoch, Volumen mindestens 1,5-mal so hoch wie im Schnitt.",verk:"Schlusskurs erstmals unter dem 20-Tage-Tief, Volumen mindestens 1,5-mal so hoch wie im Schnitt.",ziele:"Stop knapp jenseits der Ausbruchsmarke (1–3 × ATR), Ziel doppelter Abstand"},
  {id:"trend",name:"Rücksetzer im Trend",kauf:"Aufwärtstrend (20-Tage-Schnitt über 50-Tage-Schnitt), Kurs taucht bis zum 20-Tage-Schnitt ab und schließt wieder darüber, RSI 40–60.",verk:"Abwärtstrend (20-Tage-Schnitt unter 50-Tage-Schnitt), Kurs steigt bis zum 20-Tage-Schnitt und schließt wieder darunter, RSI 40–60.",ziele:"Stop unter dem 5-Tage-Tief (1–3 × ATR), Ziel doppelter Abstand"}];
const RNAME=Object.fromEntries(REGELN.map(r=>[r.id,r.name]));

/* ---------- Hilfen ---------- */
const EU_SUF=/\.(DE|F|AS|PA|MI|L|SW|VI|MC|BR|CO|ST|HE|OL|LS|IR)$/;
const EU_IDX=/^\^(GDAXI|MDAXI|STOXX50E|FTSE|FCHI|AEX)$/;
const klasseVon=s=>/-(EUR|USD)$/.test(s)?"krypto":/^\^/.test(s)?"idx":EU_SUF.test(s)?"eu":"us";
const regionVon=(s,k)=>k==="krypto"?"krypto":EU_IDX.test(s)||EU_SUF.test(s)?"eu":"us";
const ZONE={us:{tz:"America/New_York",a:570,b:960},eu:{tz:"Europe/Berlin",a:540,b:1050},krypto:{tz:"UTC",a:0,b:1440}};
function teile(tz,d=new Date()){const p=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",weekday:"short",hourCycle:"h23"}).formatToParts(d);
  const g=k=>(p.find(x=>x.type===k)||{}).value;return {date:`${g("year")}-${g("month")}-${g("day")}`,min:+g("hour")*60+ +g("minute"),wd:g("weekday")}}
function sitzung(reg){const m=ZONE[reg],z=teile(m.tz),we=reg!=="krypto"&&["Sat","Sun"].includes(z.wd),offen=!we&&z.min>=m.a&&z.min<m.b;
  return {offen,date:z.date,frac:offen?Math.max(.08,(z.min-m.a)/(m.b-m.a)):1,rest:offen?m.b-z.min:0}}
const r6=v=>v==null?null:+(+v).toPrecision(7);
const f1=v=>(+v).toFixed(1).replace(".",",");
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

/* ---------- Daten (Yahoo, Tageskerzen) ---------- */
async function yahoo(s,range){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${range}&interval=1d`,{headers:{"user-agent":"Mozilla/5.0 (compatible; AktienHelfer/1.0)"}});
  if(!r.ok)throw new Error("Yahoo "+r.status);const j=await r.json(),res=j&&j.chart&&j.chart.result&&j.chart.result[0];if(!res||!res.timestamp)throw new Error("keine Daten für "+s);
  const q=(res.indicators.quote||[])[0]||{},m=res.meta||{},tz=klasseVon(s)==="krypto"?"UTC":(m.exchangeTimezoneName||"UTC"),bars=[];
  for(let i=0;i<res.timestamp.length;i++){const o=q.open&&q.open[i],h=q.high&&q.high[i],l=q.low&&q.low[i],c=q.close&&q.close[i];if([o,h,l,c].some(v=>v==null||!isFinite(v)||v<=0))continue;
    bars.push([teile(tz,new Date(res.timestamp[i]*1000)).date,r6(o),r6(h),r6(l),r6(c),Math.round((q.volume&&q.volume[i])||0)])}
  // gleicher Tag doppelt (kommt bei Yahoo vor): letzten behalten
  const out=[];for(const b of bars){if(out.length&&out[out.length-1][0]===b[0])out[out.length-1]=b;else out.push(b)}
  return {bars:out,cur:m.currency||"",p:m.regularMarketPrice,mt:(m.regularMarketTime||0)*1000}}
function zusammen(alt,neu){const m=new Map(alt.map(b=>[b[0],b]));for(const b of neu)m.set(b[0],b);return [...m.values()].sort((a,b)=>a[0]<b[0]?-1:1)}

/* ---------- Indikatoren ---------- */
function sma(a,n){const r=Array(a.length).fill(null);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];if(i>=n-1)r[i]=s/n}return r}
function ema(a,n,start=0){const r=Array(a.length).fill(null),k=2/(n+1);let e=null;for(let i=start;i<a.length;i++){if(a[i]==null)continue;
  if(i===start+n-1)e=mean(a.slice(start,start+n));else if(i>=start+n)e=a[i]*k+e*(1-k);if(e!=null&&i>=start+n-1)r[i]=e}return r}
function rsiR(c,n=14){const r=Array(c.length).fill(null);if(c.length<=n)return r;let g=0,l=0;for(let i=1;i<=n;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d}g/=n;l/=n;r[n]=l===0?100:100-100/(1+g/l);
  for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;r[i]=l===0?100:100-100/(1+g/l)}return r}
function atrR(H,L,C,n=14){const r=Array(C.length).fill(null),tr=C.map((c,i)=>i?Math.max(H[i]-L[i],Math.abs(H[i]-C[i-1]),Math.abs(L[i]-C[i-1])):H[i]-L[i]);if(C.length<=n)return r;
  let a=mean(tr.slice(1,n+1));r[n]=a;for(let i=n+1;i<C.length;i++){a=(a*(n-1)+tr[i])/n;r[i]=a}return r}
function indikatoren(bars){const C=bars.map(b=>b[4]),H=bars.map(b=>b[2]),L=bars.map(b=>b[3]),V=bars.map(b=>b[5]);
  const e12=ema(C,12),e26=ema(C,26),macd=C.map((_,i)=>e12[i]!=null&&e26[i]!=null?e12[i]-e26[i]:null),sig=ema(macd,9,25);
  const hi20=C.map((_,i)=>i>=20?Math.max(...H.slice(i-20,i)):null),lo20=C.map((_,i)=>i>=20?Math.min(...L.slice(i-20,i)):null);
  const vAvg=C.map((_,i)=>i>=20?mean(V.slice(i-20,i)):null),lo5=C.map((_,i)=>i>=5?Math.min(...L.slice(i-4,i+1)):null),hi5=C.map((_,i)=>i>=5?Math.max(...H.slice(i-4,i+1)):null);
  return {C,H,L,V,sma20:sma(C,20),sma50:sma(C,50),rsi:rsiR(C),atr:atrR(H,L,C),macd,sig,hi20,lo20,vAvg,lo5,hi5}}
const volRatio=(I,i,frac=1)=>I.vAvg[i]>0&&I.V[i]>0?I.V[i]/(I.vAvg[i]*frac):null;

/* ---------- Regeln: welche schlagen an Tag i an? ---------- */
function pruefe(I,i,frac=1){const out=[],c=I.C[i],a=I.atr[i];
  if(i<51||!a||I.sma50[i]==null||I.rsi[i-1]==null||I.macd[i-1]==null||I.sig[i-1]==null)return out;
  const trendT=I.sma20[i]>I.sma50[i]?"20-Tage-Schnitt über 50-Tage-Schnitt (Aufwärtstrend)":"20-Tage-Schnitt unter 50-Tage-Schnitt (Abwärtstrend)";
  const vr=volRatio(I,i,frac),volT=vr==null?"keine Volumendaten":`Volumen ${f1(vr)}× so hoch wie im 20-Tage-Schnitt`;
  // RSI-Wende
  if(I.rsi[i-1]<30&&I.rsi[i]>=30)out.push({r:"rsi",dir:1,sl:1.5*a,tp:2*a,g:[`RSI steigt von ${f1(I.rsi[i-1])} auf ${f1(I.rsi[i])} und verlässt den überverkauften Bereich`,trendT]});
  if(I.rsi[i-1]>70&&I.rsi[i]<=70)out.push({r:"rsi",dir:-1,sl:1.5*a,tp:2*a,g:[`RSI fällt von ${f1(I.rsi[i-1])} auf ${f1(I.rsi[i])} und verlässt den überkauften Bereich`,trendT]});
  // MACD-Kreuz mit Trend
  if(I.macd[i-1]<=I.sig[i-1]&&I.macd[i]>I.sig[i]&&c>I.sma50[i])out.push({r:"macd",dir:1,sl:2*a,tp:4*a,g:["MACD kreuzt die Signallinie nach oben",`Kurs ${f1((c/I.sma50[i]-1)*100)} % über dem 50-Tage-Schnitt`,trendT]});
  if(I.macd[i-1]>=I.sig[i-1]&&I.macd[i]<I.sig[i]&&c<I.sma50[i])out.push({r:"macd",dir:-1,sl:2*a,tp:4*a,g:["MACD kreuzt die Signallinie nach unten",`Kurs ${f1((1-c/I.sma50[i])*100)} % unter dem 50-Tage-Schnitt`,trendT]});
  // Ausbruch mit Volumen (ohne Volumendaten, z. B. manche Indizes: nur der Ausbruch zählt)
  const volOk=vr==null||vr>=1.5;
  if(I.hi20[i]!=null&&c>I.hi20[i]&&I.C[i-1]<=I.hi20[i-1]&&volOk){const sl=clamp(c-(I.hi20[i]-.5*a),a,3*a);out.push({r:"ausbruch",dir:1,sl,tp:2*sl,g:[`Schlusskurs über dem 20-Tage-Hoch (${dez(I.hi20[i])})`,volT,trendT]})}
  if(I.lo20[i]!=null&&c<I.lo20[i]&&I.C[i-1]>=I.lo20[i-1]&&volOk){const sl=clamp((I.lo20[i]+.5*a)-c,a,3*a);out.push({r:"ausbruch",dir:-1,sl,tp:2*sl,g:[`Schlusskurs unter dem 20-Tage-Tief (${dez(I.lo20[i])})`,volT,trendT]})}
  // Rücksetzer im Trend
  const rs=I.rsi[i];
  if(I.sma20[i]>I.sma50[i]&&I.L[i]<=I.sma20[i]&&c>I.sma20[i]&&rs>=40&&rs<=60){const sl=clamp(c-(I.lo5[i]-.25*a),a,3*a);out.push({r:"trend",dir:1,sl,tp:2*sl,g:["Aufwärtstrend: 20-Tage-Schnitt über 50-Tage-Schnitt","Kurs hat den 20-Tage-Schnitt angetestet und darüber geschlossen",`RSI ${f1(rs)} (neutral, nicht überhitzt)`]})}
  if(I.sma20[i]<I.sma50[i]&&I.H[i]>=I.sma20[i]&&c<I.sma20[i]&&rs>=40&&rs<=60){const sl=clamp((I.hi5[i]+.25*a)-c,a,3*a);out.push({r:"trend",dir:-1,sl,tp:2*sl,g:["Abwärtstrend: 20-Tage-Schnitt unter 50-Tage-Schnitt","Kurs ist bis zum 20-Tage-Schnitt gestiegen und darunter geschlossen",`RSI ${f1(rs)} (neutral)`]})}
  return out}
function dez(v){v=+v;const d=v>=100?2:v>=1?2:v>=.01?4:6;return v.toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d})}

/* ---------- Ausstieg simulieren (gleich für Test und Live-Bilanz) ---------- */
// Einstieg zur Eröffnung des Folgetags. Stop und Ziel am selben Tag: zählt vorsichtshalber als Stop.
function ausstieg(bars,ein,dir,sl,tp,von){const stop=ein-dir*sl,ziel=ein+dir*tp;
  for(let j=von;j<bars.length&&j<von+HALTE;j++){const [,o,h,l]=bars[j],oo=j===von?ein:o;
    if(dir>0){if(l<=stop)return {x:Math.min(oo,stop),j,art:"stop"};if(h>=ziel)return {x:Math.max(oo,ziel),j,art:"ziel"}}
    else{if(h>=stop)return {x:Math.max(oo,stop),j,art:"stop"};if(l<=ziel)return {x:Math.min(oo,ziel),j,art:"ziel"}}}
  const ende=von+HALTE-1;return ende<bars.length?{x:bars[ende][4],j:ende,art:"zeit"}:null}
const netto=(ein,x,dir)=>dir*(x/ein-1)*100-2*KOSTEN;
// Backtest: Signale der letzten 365 Tage, je Regel und Richtung höchstens ein offener Test-Trade
function backtest(bars,I,abDatum){const tr=[],belegt={};
  for(let i=51;i<bars.length-1;i++){if(bars[i][0]<abDatum)continue;
    for(const t of pruefe(I,i)){const k=t.r+t.dir;if(belegt[k]>=i)continue;const ein=bars[i+1][1],a=ausstieg(bars,ein,t.dir,t.sl,t.tp,i+1);
      if(!a){belegt[k]=bars.length;continue}
      tr.push({r:t.r,dir:t.dir,d:bars[i][0],n:netto(ein,a.x,t.dir),art:a.art});belegt[k]=a.j}}
  return tr}
function statistik(l){if(!l.length)return {n:0};const g=l.filter(t=>t.n>0),plus=g.reduce((x,t)=>x+t.n,0),minus=-l.filter(t=>t.n<=0).reduce((x,t)=>x+t.n,0);
  return {n:l.length,win:Math.round(g.length/l.length*100),avg:+mean(l.map(t=>t.n)).toFixed(2),pf:minus>0?+(plus/minus).toFixed(2):null,ziel:Math.round(l.filter(t=>t.art==="ziel").length/l.length*100)}}

/* ---------- Zustand ---------- */
let SF="";
const lade=()=>{try{return Object.assign({hist:{},sent:{},nacht:[],log:[],fehler:{}},JSON.parse(fs.readFileSync(SF,"utf8")))}catch(e){return {hist:{},sent:{},nacht:[],log:[],fehler:{}}}};
const speichere=st=>{fs.mkdirSync(SF.replace(/\/[^/]*$/,""),{recursive:true});fs.writeFileSync(SF,JSON.stringify(st))};
let ST=null;
// für kurse.json (die App liest es dort)
export const app=()=>ST&&ST.app||null;

function liste(ctx){const l=UNIVERSUM.map(([s,n,k])=>({s,n,k})),da=new Set(l.map(x=>x.s));
  const extra=[...(ctx.eigene?ctx.eigene():[])].filter(s=>s&&!da.has(s)&&!/=X$|=F$/.test(s)).slice(0,10);
  for(const s of extra){da.add(s);l.push({s,n:ctx.name?ctx.name(s):s,k:klasseVon(s),eigen:1})}
  for(const [s,h] of Object.entries(ST.hist))if(h.tmp&&!da.has(s)){if(Date.now()-h.tmp>3*864e5){delete ST.hist[s];continue}da.add(s);l.push({s,n:h.n||s,k:h.k||klasseVon(s),eigen:1})}
  return l}

/* ---------- Einen Wert bewerten ---------- */
function bewerte(w){const h=ST.hist[w.s];if(!h||!h.bars||h.bars.length<60)return null;
  const reg=regionVon(w.s,w.k),se=sitzung(reg),bars=h.bars,teil=se.offen&&bars[bars.length-1][0]===se.date;
  const fertig=teil?bars.slice(0,-1):bars,I=indikatoren(bars),If=teil?indikatoren(fertig):I;
  const ab=new Date(Date.now()-365*864e5).toISOString().slice(0,10),tests=backtest(fertig,If,ab);
  const n=bars.length-1,p=h.p&&Date.now()-(h.mt||0)<3*864e5?h.p:bars[n][4],vor=bars[n-1][4],last=I.C[n];
  // aktuelle Treffer: am letzten fertigen Tag (gilt jetzt) und vorläufig am laufenden Tag
  const hits=[...pruefe(If,fertig.length-1).map(t=>Object.assign(t,{d:fertig[fertig.length-1][0],c:fertig[fertig.length-1][4],vorl:false})),...(teil?pruefe(I,n,se.frac).map(t=>Object.assign(t,{d:bars[n][0],c:bars[n][4],vorl:true})):[])];
  const vr=volRatio(I,n,teil?se.frac:1);
  return {w,h,reg,se,teil,bars,I,tests,hits,p,dp:(p/vor-1)*100,
    ind:{rsi:I.rsi[n]!=null?+I.rsi[n].toFixed(1):null,macd:I.macd[n]!=null?r6(I.macd[n]):null,ms:I.sig[n]!=null?r6(I.sig[n]):null,sma20:r6(I.sma20[n]),sma50:r6(I.sma50[n]),atr:r6(I.atr[n]),
      volR:vr!=null?+vr.toFixed(2):null,trend:I.sma20[n]==null||I.sma50[n]==null?null:I.sma20[n]>I.sma50[n]?(last>I.sma20[n]?"aufwärts":"aufwärts, Kurs unter 20-Tage-Schnitt"):(last<I.sma20[n]?"abwärts":"abwärts, Kurs über 20-Tage-Schnitt")}}}

/* ---------- Hauptlauf ---------- */
export async function lauf(ctx){SF=ctx.P(".state/signale.json");if(!ST)ST=lade();const B=ctx.B,heute=new Date().toISOString().slice(0,10);let geholt=0,fehler=0;
  const L=liste(ctx);
  // 1) Verlauf (2 Jahre, damit die Indikatoren für das Testjahr eingeschwungen sind) einmal am Tag
  for(const w of L){const h=ST.hist[w.s];if(h&&h.d===heute&&h.bars)continue;if(geholt>=30)break;geholt++;
    try{const y=await yahoo(w.s,"2y");ST.hist[w.s]=Object.assign(h||{},{d:heute,bars:y.bars,cur:y.cur,p:y.p,mt:y.mt,lt:Date.now()});delete ST.fehler[w.s]}catch(e){fehler++;ST.fehler[w.s]=e.message.slice(0,80)}}
  // 2) laufende Tageskerze: offene Märkte bei jedem Lauf, sonst höchstens stündlich
  for(const w of L){const h=ST.hist[w.s];if(!h||!h.bars||Date.now()-(h.lt||0)<6e4)continue;const se=sitzung(regionVon(w.s,w.k));
    if(!se.offen&&Date.now()-(h.lt||0)<36e5)continue;
    try{const y=await yahoo(w.s,"5d");h.bars=zusammen(h.bars,y.bars).slice(-800);h.p=y.p;h.mt=y.mt;h.cur=y.cur||h.cur;h.lt=Date.now();delete ST.fehler[w.s]}catch(e){fehler++;ST.fehler[w.s]=e.message.slice(0,80)}}
  for(const s of Object.keys(ST.hist))if(!L.some(w=>w.s===s))delete ST.hist[s];
  if(fehler)B.err.signale=`${fehler} Kursabruf(e) fehlgeschlagen (Yahoo)`;else delete B.err.signale;

  // 3) bewerten, Regeln über alle Werte auswerten
  const E=L.map(bewerte).filter(Boolean),stat={};
  for(const r of REGELN)for(const dir of [1,-1]){const k=r.id+":"+dir,alle=E.flatMap(e=>e.tests.filter(t=>t.r===r.id&&t.dir===dir));
    stat[k]={alle:statistik(alle)};for(const kl of Object.keys(KLASSEN))stat[k][kl]=statistik(E.filter(e=>e.w.k===kl).flatMap(e=>e.tests.filter(t=>t.r===r.id&&t.dir===dir)))}
  const gilt=(r,dir,kl)=>{const s=stat[r+":"+dir],a=s[kl]||{n:0};if(a.n>=MIN_N)return a.avg>0?{ok:1,s:a,ebene:KLASSEN[kl]}:{ok:0,s:a,ebene:KLASSEN[kl]};
    return s.alle.n>=2*MIN_N&&s.alle.avg>0?{ok:1,s:s.alle,ebene:"alle Klassen",wenig:1}:{ok:0,s:s.alle.n>=2*MIN_N?s.alle:a,ebene:s.alle.n>=2*MIN_N?"alle Klassen":KLASSEN[kl]}};

  // 4) Signal je Wert
  const werte=E.map(e=>{const {w,h}=e,cur=h.cur||(w.k==="eu"?"EUR":"USD"),o={s:w.s,n:w.n,k:w.k,cur,p:r6(e.p),dp:+e.dp.toFixed(2),mt:h.mt||h.lt||0,offen:e.se.offen,eigen:w.eigen||undefined,
      sig:"abwarten",ind:e.ind,spark:e.bars.slice(-45).map(b=>+(+b[4]).toPrecision(5)),d:e.bars[e.bars.length-1][0]};
    // je Regel: Test nur für diesen Wert
    o.ts={};for(const r of REGELN)for(const dir of [1,-1]){const s=statistik(e.tests.filter(t=>t.r===r.id&&t.dir===dir));if(s.n)o.ts[r.id+":"+dir]=s}
    const ok=e.hits.map(t=>Object.assign(t,{g2:gilt(t.r,t.dir,w.k)})),gut=ok.filter(t=>t.g2.ok);
    const fest=gut.filter(t=>!t.vorl),dirs=new Set((fest.length?fest:gut).map(t=>t.dir));
    if(dirs.size>1){o.hin="Regeln widersprechen sich (Kauf- und Verkaufssignal gleichzeitig). Daher abwarten.";o.aus=ok.map(t=>({r:t.r,dir:t.dir}));return o}
    const kand=(fest.length?fest:gut).sort((a,b)=>b.g2.s.avg-a.g2.s.avg);
    if(!kand.length){const nicht=ok.filter(t=>!t.g2.ok);if(nicht.length)o.hin=nicht.map(t=>`${RNAME[t.r]} (${t.dir>0?"Kauf":"Verkauf"}) hat angeschlagen, war im Test aber nicht im Plus${t.g2.s.n?` (Ø ${t.g2.s.avg.toFixed(2).replace(".",",")} % bei ${t.g2.s.n} Trades)`:" (zu wenige Testfälle)"}.`).join(" ");
      return o}
    const t=kand[0],ein=e.p,f=ein/t.c;// Abstände (aus ATR) im Verhältnis auf den aktuellen Kurs übertragen
    Object.assign(o,{sig:t.dir>0?"kaufen":"verkaufen",r:t.r,vorl:t.vorl||undefined,seit:t.d,ein:r6(ein),stop:r6(ein-t.dir*t.sl*f),ziel:r6(ein+t.dir*t.tp*f),crv:+(t.tp/t.sl).toFixed(2),
      g:t.g,weitere:kand.slice(1).map(x=>x.r),test:Object.assign({ebene:t.g2.ebene,wenig:t.g2.wenig},t.g2.s)});
    return o});

  // 5) Live-Bilanz: jedes gemeldete Signal wird mit denselben Regeln weiterverfolgt
  const bilanz=()=>{for(const x of ST.log){if(x.st!=="offen")continue;const h=ST.hist[x.s];if(!h||!h.bars)continue;const se=sitzung(regionVon(x.s,klasseVon(x.s)));
      const fertig=se.offen&&h.bars[h.bars.length-1][0]===se.date?h.bars.slice(0,-1):h.bars,i=fertig.findIndex(b=>b[0]===x.d);if(i<0||i+1>=fertig.length)continue;
      const ein=fertig[i+1][1],a=ausstieg(fertig,ein,x.dir,x.sl,x.tp,i+1);x.ein=r6(ein);if(a){x.st=a.art;x.erg=+netto(ein,a.x,x.dir).toFixed(2);x.ende=fertig[a.j][0]}}
    ST.log=ST.log.slice(-300)};

  // 6) neue Signale melden (nur bestätigte, vorläufige kurz vor Handelsschluss). Nachts ruhig: gesammelt, morgens nur was noch gilt.
  const an=!(ctx.U&&ctx.U.notify&&ctx.U.notify.signale===false),neu=[];
  for(const o of werte){if(o.sig==="abwarten")continue;const e=E.find(x=>x.w.s===o.s),t=e.hits.find(h=>h.r===o.r&&h.vorl===!!o.vorl);
    const key=`${o.s}|${o.r}|${o.sig}|${o.seit}`;if(ST.sent[key])continue;
    if(o.vorl){if(e.se.rest>45)continue}
    ST.sent[key]=Date.now();if(t&&!ST.log.some(x=>x.s===o.s&&x.d===o.seit&&x.r===o.r))ST.log.push({s:o.s,nm:o.n,r:o.r,dir:o.sig==="kaufen"?1:-1,d:o.seit,sl:t.sl,tp:t.tp,st:"offen",t:Date.now()});
    neu.push(key)}
  bilanz();
  for(const k of Object.keys(ST.sent))if(Date.now()-ST.sent[k]>20*864e5)delete ST.sent[k];
  if(an&&ctx.send){const text=k=>{const o=werte.find(w=>`${w.s}|${w.r}|${w.sig}|${w.seit}`===k);return o?karte(o,ctx):null};
    if(ctx.leise()){ST.nacht.push(...neu)}
    else{const nacht=ST.nacht.map(text).filter(Boolean);ST.nacht=[];
      if(nacht.length)await ctx.send(`🌅 <b>Neue Signale seit gestern Abend</b> (gelten weiterhin)\n\n${nacht.join("\n\n")}\n\n<i>${HINWEIS}</i>${link(ctx,"")}`);
      const jetzt=neu.map(text).filter(Boolean);
      if(jetzt.length)await ctx.send(`📶 <b>${jetzt.length>1?"Neue Trading-Signale":"Neues Trading-Signal"}</b>\n\n${jetzt.join("\n\n")}\n\n<i>${HINWEIS}</i>${link(ctx,"")}`)}}
  else if(!an)ST.nacht=[];

  // 7) für die App (landet in kurse.json)
  const fertigeLog=ST.log.filter(x=>x.st!=="offen"&&x.erg!=null).map(x=>({n:x.erg,art:x.st}));
  ST.app={v:1,t:Date.now(),kosten:KOSTEN,halte:HALTE,minN:MIN_N,von:new Date(Date.now()-365*864e5).toISOString().slice(0,10),
    regeln:REGELN,stat,werte,fehler:Object.keys(ST.fehler).length?ST.fehler:undefined,
    live:{gesamt:statistik(fertigeLog),offen:ST.log.filter(x=>x.st==="offen").length,seit:ST.log.length?ST.log[0].d:null,liste:ST.log.slice(-40).reverse().map(x=>({s:x.s,n:x.nm||x.s,r:x.r,dir:x.dir,d:x.d,ein:x.ein,st:x.st,erg:x.erg,ende:x.ende}))}};
  const alt=ST.k||"";ST.k=JSON.stringify(ST.app.werte.map(w=>[w.s,w.sig,w.p]));speichere(ST);
  ctx.log("Signale:",werte.filter(w=>w.sig!=="abwarten").length,"aktiv von",werte.length,neu.length?`neu: ${neu.join(", ")}`:"");
  return alt!==ST.k}

/* ---------- Texte für Telegram ---------- */
export const HINWEIS="Regel-Signale aus Kursdaten, getestet am letzten Jahr. Vergangene Trefferquoten sind keine Garantie. Keine Anlageberatung.";
const CS={EUR:"€",USD:"$",GBp:"p",GBP:"£",CHF:"CHF"};
const pz=v=>(v>0?"+":"")+(+v).toFixed(1).replace(".",",")+" %";
function link(ctx,s){return ctx.APP?`\n<a href="${ctx.APP}trading/${s?"#s-"+encodeURIComponent(s):""}">In der Signale-App öffnen ›</a>`:""}
function testZeile(t){if(!t||!t.n)return "Test: noch keine Testfälle";return `Test (${t.ebene}, 1 Jahr): ${t.win} % Gewinn-Trades, Ø ${pz(t.avg)} je Trade, ${t.n} Trades${t.wenig?" · in dieser Klasse noch wenige Fälle":""}`}
function karte(o,ctx,lang){const esc=ctx.esc,c=o.k==="idx"?"Pkt.":CS[o.cur]||o.cur||"",kauf=o.sig==="kaufen";
  const z=[`${kauf?"🟢 <b>KAUFEN</b>":"🔴 <b>VERKAUFEN</b>"} ${esc(o.n)} (${esc(o.s)})${o.vorl?" · <i>vorläufig bis Handelsschluss</i>":""}`,
    `Einstieg ≈ ${dez(o.ein)} ${c} · Stop ${dez(o.stop)} (${pz((o.stop/o.ein-1)*100)}) · Ziel ${dez(o.ziel)} (${pz((o.ziel/o.ein-1)*100)}) · CRV ${f1(o.crv)}`,
    `Regel: ${RNAME[o.r]}${lang?"":" – "+esc(o.g[0])}`,testZeile(o.test)];
  if(lang)z.push("Begründung:\n"+o.g.map(g=>"• "+esc(g)).join("\n"));
  if(!kauf)z.push("<i>Verkaufen heißt: Gewinne sichern bzw. nicht neu einsteigen. Getestet wurde es als Wette auf fallende Kurse.</i>");
  return z.join("\n")}
export const HILFE_ZEILEN=`/signale – aktuelle Trading-Signale (Kaufen/Verkaufen mit Einstieg, Stop, Ziel)
/signal BTC – Signal und Begründung für einen Wert (z. B. /signal AAPL, /signal SAP.DE)`;
export const FUSS_TEIL=" /signale /signal";

export async function befehl(c,arg,ctx){SF=ctx.P(".state/signale.json");if(!ST)ST=lade();const app=ST.app;const esc=ctx.esc;
  if(c==="/signale"){if(!app||!app.werte)return ctx.send("Die Signale werden gerade zum ersten Mal berechnet. Bitte in ein paar Minuten nochmal /signale.",{direkt:true});
    const filt=(arg||"").trim().toLowerCase(),kl=filt?Object.keys(KLASSEN).find(k=>k===filt||KLASSEN[k].toLowerCase().startsWith(filt)):null;
    const akt=app.werte.filter(w=>w.sig!=="abwarten"&&(!kl||w.k===kl)).sort((a,b)=>(b.test.avg||0)-(a.test.avg||0));
    const stand=new Date(app.t).toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin",hour:"2-digit",minute:"2-digit"});
    const head=`📶 <b>Trading-Signale</b>${kl?` · ${KLASSEN[kl]}`:""} (Stand ${stand} Uhr)`;
    const rest=app.werte.filter(w=>w.sig==="abwarten"&&(!kl||w.k===kl)).length;
    if(!akt.length)return ctx.send(`${head}\n\n⏸ Gerade kein Signal: alle ${rest} Werte auf <b>Abwarten</b>. Das ist normal, die Regeln schlagen nur selten an.\n\n<i>${HINWEIS}</i>${link(ctx,"")}`,{direkt:true});
    return ctx.send(`${head}\n\n${akt.slice(0,10).map(o=>karte(o,ctx)).join("\n\n")}${akt.length>10?`\n\n… und ${akt.length-10} weitere in der App.`:""}\n\n⏸ ${rest} Werte: Abwarten\nFilter: /signale krypto, /signale us, /signale eu, /signale etf\nDetails: /signal Kürzel\n\n<i>${HINWEIS}</i>${link(ctx,"")}`,{direkt:true})}
  // /signal X
  const q=(arg||"").trim();if(!q)return ctx.send("Welcher Wert? Beispiel: /signal BTC, /signal AAPL oder /signal SAP.DE",{direkt:true});
  const u=q.toUpperCase(),werte=(app&&app.werte)||[];
  let o=werte.find(w=>w.s.toUpperCase()===u)||werte.find(w=>w.s.toUpperCase()===u+"-EUR"||w.s.toUpperCase()===u+".DE")||werte.find(w=>w.n.toLowerCase().includes(q.toLowerCase()));
  if(!o){// unbekannter Wert: jetzt holen und berechnen (bleibt 3 Tage in der Liste)
    const s=(ctx.finde&&ctx.finde(q))||u;try{const y=await yahoo(s,"2y");ST.hist[s]={d:new Date().toISOString().slice(0,10),bars:y.bars,cur:y.cur,p:y.p,mt:y.mt,lt:Date.now(),tmp:Date.now(),n:ctx.name?ctx.name(s):s,k:klasseVon(s)};
      await lauf(ctx);o=((ST.app&&ST.app.werte)||[]).find(w=>w.s===s)}catch(e){return ctx.send(`Für „${esc(q)}“ habe ich keine Kurse gefunden. Tipp: Kürzel wie bei Yahoo, z. B. AAPL, SAP.DE, BTC-EUR.`,{direkt:true})}
    if(!o)return ctx.send(`Für ${esc(s)} reichen die Kursdaten nicht (mindestens 60 Handelstage nötig).`,{direkt:true})}
  const c2=o.k==="idx"?"Pkt.":CS[o.cur]||o.cur||"",i=o.ind||{};
  const kopf=`📶 <b>${esc(o.n)}</b> (${esc(o.s)}) · ${KL1[o.k]||""}\nKurs ${dez(o.p)} ${c2} · heute ${pz(o.dp)}${o.k==="eu"||o.k==="idx"?" · Kurs ca. 15 Min. verzögert":""}`;
  const indT=`<b>Kennzahlen</b>\nRSI ${i.rsi!=null?f1(i.rsi):"–"} · MACD ${i.macd!=null&&i.ms!=null?(i.macd>i.ms?"über":"unter")+" Signallinie":"–"} · Trend ${i.trend?esc(i.trend):"–"}${i.volR!=null?` · Volumen ${f1(i.volR)}× Schnitt`:""}`;
  const tsT=Object.entries(o.ts||{}).map(([k,s])=>{const [r,d]=k.split(":");return `• ${RNAME[r]} ${+d>0?"Kauf":"Verkauf"}: ${s.win} % Gewinn-Trades, Ø ${pz(s.avg)} (${s.n})`}).join("\n");
  const sig=o.sig==="abwarten"?`⏸ <b>Abwarten</b>${o.hin?`\n${esc(o.hin)}`:"\nGerade schlägt keine Regel an."}`:karte(o,ctx,true);
  return ctx.send(`${kopf}\n\n${sig}\n\n${indT}${tsT?`\n\n<b>Regeln an diesem Wert getestet</b> (1 Jahr)\n${tsT}`:""}\n\n<i>${HINWEIS}</i>${link(ctx,o.s)}`,{direkt:true})}
