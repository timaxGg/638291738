// Der „Wachmann“: läuft automatisch auf GitHub (alle 5 Min. zu Börsenzeiten, sonst alle 15 Min.).
// Holt Kurse, prüft Alarme, beantwortet Telegram-Befehle, erstellt 3x täglich die Vorlage für Claude.
import fs from "node:fs";
import {execSync} from "node:child_process";
import {verschluesseln,entschluesseln} from "./krypto.mjs";

const E=process.env,FH=E.FINNHUB_KEY||"",AV=E.AV_KEY||"",TG=E.TELEGRAM_TOKEN||"",CHAT=String(E.TELEGRAM_CHAT||""),PASS=E.SYNC_PASSWORD||"";
const DRY=E.DRY==="1",ROOT=E.ROOT||".",P=f=>`${ROOT}/${f}`;
const SF=P(".state/bot.json");
const INDEX_ETF=[["SPY","S&P 500"],["QQQ","Nasdaq 100"],["DIA","Dow Jones"]];
const SECTOR_ETF=[["XLK","Technologie"],["XLV","Gesundheit"],["XLF","Finanzen"],["XLE","Energie"],["XLY","Konsum"],["XLI","Industrie"]];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fmt=(v,d=2)=>(+v).toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
const sgn=v=>(v>0?"+":"")+fmt(v,1)+" %";
const esc=s=>String(s??"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const readJSON=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){return d}};
const writeJSON=(f,o)=>{fs.mkdirSync(f.replace(/\/[^/]*$/,""),{recursive:true});fs.writeFileSync(f,JSON.stringify(o,null,1))};
const log=(...a)=>console.log(new Date().toISOString(),...a);

/* ---------- Zeit ---------- */
function zeit(d=new Date(),tz="Europe/Berlin"){const p=new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",weekday:"short",hourCycle:"h23"}).formatToParts(d);
  const g=k=>p.find(x=>x.type===k)?.value;return {date:`${g("year")}-${g("month")}-${g("day")}`,h:+g("hour"),m:+g("minute"),wd:g("weekday"),day:+g("day"),ym:`${g("year")}-${g("month")}`}}
const boerseOffen=()=>{const z=zeit(new Date(),"America/New_York"),m=z.h*60+z.m;return !["Sat","Sun"].includes(z.wd)&&m>=570&&m<960};
const addDays=(date,n)=>new Date(Date.parse(date+"T12:00:00Z")+n*864e5).toISOString().slice(0,10);

/* ---------- Zustand (zwischen Läufen im GitHub-Cache) ---------- */
const B=Object.assign({offset:0,sent:{},lastKi:"",mute:0,slots:{},earn:{date:"",list:[]},q:{},eod:{},queue:[],khDone:[],khNew:[],inbox:[],lastRun:0,err:{}},readJSON(SF,{}));
let U={},KI={},changed=new Set();

/* ---------- Datenquellen ---------- */
async function fh(path){if(!FH)throw new Error("kein Finnhub-Schlüssel");const r=await fetch(`https://finnhub.io/api/v1/${path}${path.includes("?")?"&":"?"}token=${FH}`);
  if(!r.ok)throw new Error("Finnhub "+r.status);return r.json()}
async function quote(s){try{const q=await fh(`quote?symbol=${encodeURIComponent(s)}`);if(q&&q.c){B.q[s]={c:q.c,dp:q.dp??0,t:Date.now()};delete B.err.finnhub}}catch(e){B.err.finnhub=e.message}return B.q[s]}
async function avDaily(sym){if(!AV)return null;try{const r=await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&outputsize=compact&symbol=${encodeURIComponent(sym)}&apikey=${AV}`);const j=await r.json();
  const ts=j["Time Series (Daily)"];if(!ts){B.err.alphavantage=(j.Note||j.Information||j["Error Message"]||"keine Daten").slice(0,120);return null}delete B.err.alphavantage;
  return Object.keys(ts).sort().reverse().slice(0,65).map(k=>+ts[k]["4. close"])}catch(e){B.err.alphavantage=e.message;return null}}
const EU_SUF=/\.(DE|F|AS|PA|MI|L|SW|VI|MC|BR|CO|ST|HE|OL|LS|IR)$/;
const LEGACY={BTC:"BTC-EUR",ETH:"ETH-EUR",GOLD:"4GLD.DE",SIE:"SIE.DE",ALV:"ALV.DE",DTE:"DTE.DE",MBG:"MBG.DE",BMW:"BMW.DE",VOW3:"VOW3.DE",BAS:"BAS.DE",BAYN:"BAYN.DE",ADS:"ADS.DE",IFX:"IFX.DE",RHM:"RHM.DE",MUV2:"MUV2.DE",DBK:"DBK.DE",DHL:"DHL.DE",AIR:"AIR.DE"};
const isEU=s=>EU_SUF.test(s||"");
const isUS=s=>/^[A-Z][A-Z.]{0,5}$/.test(s)&&!isEU(s)&&!LEGACY[s];
const isKrypto=s=>/-(EUR|USD)$/.test(s||"");
const EU_INDEX=[["^GDAXI","DAX"],["^MDAXI","MDAX"],["^STOXX50E","Euro Stoxx 50"],["^FTSE","FTSE 100"],["^FCHI","CAC 40"]];
const EU_SECTOR=[["EXV3.DE","Technologie"],["EXV4.DE","Gesundheit"],["EXV1.DE","Banken"],["EXH1.DE","Energie"],["EXV5.DE","Autos"],["EXH4.DE","Industrie"]];
const DEFAULT_EU=["SAP.DE","SIE.DE","ALV.DE"];
const curOf=s=>(B.q[s]&&B.q[s].cur)||(isEU(s)?"EUR":"USD");
const CS=s=>({EUR:"€",USD:"$",GBp:"p",GBP:"£",CHF:"CHF"}[curOf(s)]||curOf(s));
const fx=()=>(B.q["EURUSD=X"]&&B.q["EURUSD=X"].c)||1.1;
const toEUR=(v,s)=>curOf(s)==="USD"?v/fx():v;
const xetraOffen=()=>{const z=zeit(),m=z.h*60+z.m;return !["Sat","Sun"].includes(z.wd)&&m>=540&&m<1050};
// Yahoo Finance (inoffiziell, ohne Schlüssel): Kurse aus Europa, ca. 15 Min. verzögert
async function yq(s,hist){try{const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${hist?"3mo":"5d"}&interval=1d`,{headers:{"user-agent":"Mozilla/5.0 (compatible; AktienHelfer/1.0)"}});
  if(!r.ok)throw new Error("Yahoo "+r.status);const j=await r.json(),res=j&&j.chart&&j.chart.result&&j.chart.result[0];if(!res)throw new Error("Yahoo: keine Daten für "+s);
  const m=res.meta,cl=((res.indicators.quote[0]||{}).close||[]).filter(v=>v!=null),pc=cl.length>1?cl[cl.length-2]:m.chartPreviousClose;
  const dp=m.regularMarketChangePercent??(pc?(m.regularMarketPrice/pc-1)*100:0);
  B.q[s]={c:m.regularMarketPrice,dp,t:Date.now(),cur:m.currency,mt:(m.regularMarketTime||0)*1000};delete B.err.yahoo;return hist?cl.reverse().slice(0,65):B.q[s]}catch(e){B.err.yahoo=e.message;return null}}
async function frisch(s){return isUS(s)?quote(s):yq(s)}
async function yNews(s){try{const r=await fetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(s)}&region=DE&lang=de-DE`,{headers:{"user-agent":"Mozilla/5.0"}});if(!r.ok)return [];const x=await r.text();
  return [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,3).map(m=>{const g=t=>((m[1].match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\/${t}>`))||[])[1]||"").trim();return {headline:g("title"),url:g("link"),summary:g("description"),source:"Yahoo Finanzen",id:"y"+Math.abs([...g("link")].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7))}}).filter(n=>n.headline)}catch(e){return []}}
const catOf=s=>(KI.catalog||[]).find(c=>c.s===s)||{};
const avSym=s=>catOf(s).av||s.replace(/\.DE$/,".DEX");
const priceOf=s=>(B.q[s]&&B.q[s].c)||(B.eod[s]&&B.eod[s].c)||null;
const moveOf=s=>B.q[s]&&Date.now()-B.q[s].t<36e5?B.q[s].dp:(B.eod[s]?B.eod[s].dp:0);

/* ---------- Telegram ---------- */
const FUSS="\n\n<i>Befehle:</i> /hilfe /kurs /depot /top /markt /warnung /news /briefing /prognose /termine /kaufhilfe /merken /gespart /ziel /sparmodell /alarme /ruhe /laut /status";
async function tg(method,body){if(!TG)return null;
  try{const r=await fetch(`https://api.telegram.org/bot${TG}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});return r.json()}catch(e){B.err.telegram=e.message;return null}}
const nacht=()=>{if(E.FORCE_DAY)return false;if(U.notify&&U.notify.night===false)return false;const z=zeit();return z.h>=22||z.h<7};
const leise=()=>B.mute>Date.now()||nacht();
async function send(text,o={}){if(!CHAT)return;if(!o.direkt&&!o.dringend&&leise()){B.queue.push(text);return}
  const body={chat_id:CHAT,text:text+FUSS,parse_mode:"HTML",disable_web_page_preview:true};if(o.knoepfe)body.reply_markup={inline_keyboard:o.knoepfe};await tg("sendMessage",body)}
async function warteschlange(){if(!B.queue.length||leise())return;const q=B.queue.splice(0,15);await send(`🔔 <b>Während der Ruhezeit:</b>\n\n${q.join("\n\n———\n\n")}`,{direkt:true})}

/* ---------- Prognose (gleiches Modell wie die App) ---------- */
function params(){const p=Object.assign({trendDamping:.5,bandFactor:1,newsWeight:1},KI.model||{});(KI.updates||[]).forEach(u=>{if((U.updates||{})[u.id]==="ok")Object.assign(p,u.change||{})});return p}
function analyse(st){if(!st||!st.closes||st.closes.length<25)return null;const Pm=params(),old=st.closes.slice().reverse(),live=priceOf(st.s);if(live)old.push(live);
  const r=[];for(let i=1;i<old.length;i++)r.push(Math.log(old[i]/old[i-1]));const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
  const mu=mean(r),sd=Math.sqrt(mean(r.map(x=>(x-mu)**2))),last=old[old.length-1],sma=n=>mean(old.slice(-n));
  const ch20=(last/old[Math.max(0,old.length-21)]-1)*100,ch3m=(last/old[0]-1)*100,score=(sma(10)/sma(30)-1)*100+ch20/4,dir=score>1?"up":score<-1?"down":"flat";
  const H=st.h==="kurz"?20:63,drift=Pm.trendDamping*mu*H+(+st.bias||0)*Pm.newsWeight/100,band=sd*Math.sqrt(H)*Pm.bandFactor;
  return {last,dir,ch20,ch3m,H,vol:sd*Math.sqrt(252)*100,mid:last*Math.exp(drift),lo:last*Math.exp(drift-band),hi:last*Math.exp(drift+band)}}
const PFEIL={up:"↗ aufwärts",down:"↘ abwärts",flat:"→ seitwärts"};

/* ---------- Befehle ---------- */
const HILFE=`<b>Was ich kann</b>
/kurs AAPL – aktueller Kurs und Trend (auch /kurs Siemens oder /kurs SIE.DE)
/depot – dein Depot mit Gewinn/Verlust
/top – Gewinner und Verlierer heute in deinem Depot
/markt – Europa und USA: Indizes und Branchen
/news – wichtigste Nachrichten
/briefing – letztes Briefing nochmal
/prognose NVDA – Trend und erwarteter Bereich
/termine – anstehende Termine
/kaufhilfe – dein Warenkorb mit Knöpfen
/merken Jacke 120 7 – Kauf für 7 Tage auf Bedenkzeit setzen (optional mit Link und Beschreibung dahinter)
/gespart – was dir die Kaufhilfe gespart hat
/ziel – Fortschritt deines Sparziels
/sparmodell – dein Modell und die Empfehlung
/alarme – deine Alarm-Regeln
/warnung – Frühwarn-Ampel für deine Werte
/ruhe 2h – Nachrichten pausieren (z. B. 30m, 2h, morgen)
/laut – Pause beenden
/status – läuft alles?

Ich antworte beim nächsten Lauf, also meist innerhalb von 5 bis 15 Minuten.`;
const depot=()=>(U.depot||[]).filter(d=>!d.demo).map(d=>LEGACY[d.s]?Object.assign({},d,{s:LEGACY[d.s]}):d);
const finde=q=>{q=(q||"").trim();const u=q.toUpperCase();if(!q)return "";if(LEGACY[u])return LEGACY[u];const c=(KI.catalog||[]);const t=c.find(x=>x.s.toUpperCase()===u)||c.find(x=>x.s.toUpperCase()===u+".DE")||c.find(x=>x.n.toLowerCase().includes(q.toLowerCase())||(x.a||"").includes(q.toLowerCase()));return t?t.s:u};
const khListe=()=>{const all=[...((U.kh&&U.kh.list)||[]),...B.khNew.filter(n=>!((U.kh&&U.kh.list)||[]).some(x=>x.id===n.id))];return all.filter(x=>!B.khDone.includes(String(x.id)))};
const khText=x=>`🛒 <b>${esc(x.n)}</b> · ${fmt(x.p,0)} €${x.d?`\n${esc(x.d)}`:""}${x.u?`\n<a href="${esc(x.u)}">Zum Produkt</a>`:""}`;
const khKnopf=x=>[[{text:"✅ Kaufen",callback_data:`kb:${x.id}`},{text:"❌ Will ich nicht mehr",callback_data:`kn:${x.id}`}]];
function inbox(type,item){B.inbox.push({id:`e${Date.now()}${Math.random().toString(36).slice(2,6)}`,type,item,t:Date.now()});changed.add("inbox")}
async function befehl(text){const [c0,...a]=text.trim().split(/\s+/),c=c0.toLowerCase().replace(/@.*/,""),arg=a.join(" ");
  const st=s=>(KI.stocks||[]).find(x=>x.s===s);
  switch(c){
  case "/start":case "/hilfe":case "/help":return send(HILFE,{direkt:true});
  case "/kurs":{const s=finde(arg);if(!s)return send("Welche Aktie? Beispiel: /kurs AAPL oder /kurs Siemens",{direkt:true});await frisch(s);const p=priceOf(s),an=analyse(st(s));
    return send(p?`<b>${esc(catOf(s).n||s)}</b> (${s})\n${fmt(p)} ${CS(s)} · heute ${sgn(moveOf(s))}${isEU(s)?" (ca. 15 Min. verzögert)":""}${an?`\nTrend ${PFEIL[an.dir]} · 4 Wochen ${sgn(an.ch20)}`:""}`:`Keinen Kurs für ${esc(s)} gefunden. Tipp: deutsche Aktien mit .DE, z. B. /kurs SIE.DE`,{direkt:true})}
  case "/depot":{const d=depot();if(!d.length)return send("Dein Depot ist leer oder noch nicht übertragen. Trag Aktien in der App ein, sie kommen automatisch hier an.",{direkt:true});
    if(!B.q["EURUSD=X"])await yq("EURUSD=X");for(const x of d)if(isUS(x.s)?(boerseOffen()||!B.q[x.s]):!B.q[x.s]||Date.now()-B.q[x.s].t>9e5)await frisch(x.s);let tot=0,cost=0;const z=d.map(x=>{const p=priceOf(x.s);if(!p)return `• ${esc(x.n)}: kein Kurs`;if(!x.test){tot+=toEUR(p*x.q,x.s);cost+=toEUR(x.k*x.q,x.s)}return `• <b>${esc(x.n)}</b>${x.test?" (Test)":""}: ${fmt(p*x.q)} ${CS(x.s)} (${sgn((p/x.k-1)*100)})`});
    return send(`💼 <b>Dein Depot</b>\n${z.join("\n")}${cost?`\n\n<b>Gesamt: ${fmt(tot)} € (${sgn((tot/cost-1)*100)})</b>${(()=>{const t=(U.trades||[]).filter(t=>!t.test);if(!t.length)return"";const r=t.reduce((x,t)=>x+toEUR((t.p-t.k)*t.q,t.s),0);return `\nRealisiert durch Verkäufe: ${r>=0?"+":""}${fmt(r)} €`})()}${d.some(x=>curOf(x.s)==="USD")?`\n<i>Dollar umgerechnet: 1 € = ${fmt(fx(),4)} $</i>`:""}`:""}`,{direkt:true})}
  case "/top":{const d=depot().filter(x=>priceOf(x.s));if(!d.length)return send("Noch keine Kurse für dein Depot.",{direkt:true});d.sort((x,y)=>moveOf(y.s)-moveOf(x.s));
    return send(`📈 <b>Heute</b>\nBester: ${esc(d[0].n)} ${sgn(moveOf(d[0].s))}\nSchwächster: ${esc(d[d.length-1].n)} ${sgn(moveOf(d[d.length-1].s))}`,{direkt:true})}
  case "/markt":{for(const [s] of [...INDEX_ETF,...SECTOR_ETF])if(boerseOffen()||!B.q[s])await quote(s);for(const [s] of [...EU_INDEX,...EU_SECTOR])if(!B.q[s]||Date.now()-B.q[s].t>9e5)await yq(s);
    const l=(arr)=>arr.map(([s,n])=>B.q[s]?`• ${n}: ${sgn(B.q[s].dp)}`:"").filter(Boolean).join("\n");
    return send(`📊 <b>Europa</b> (Xetra ${xetraOffen()?"offen":"geschlossen"})\n${l(EU_INDEX)}\n<b>Branchen</b>\n${l(EU_SECTOR)}\n\n📊 <b>USA</b> (${boerseOffen()?"offen":"geschlossen"})\n${l(INDEX_ETF)}\n<b>Branchen</b>\n${l(SECTOR_ETF)}`,{direkt:true})}
  case "/news":{const n=(KI.news||[]).slice().sort((x,y)=>y.imp-x.imp).slice(0,5);return send(n.length?`📰 <b>Wichtig gerade</b>\n\n${n.map(x=>`${"●".repeat(x.imp)} <b>${esc(x.t)}</b>\n${esc(x.sum)}\n<a href="${x.u}">Quelle: ${esc(x.q)}</a>`).join("\n\n")}`:"Noch keine Nachrichten.",{direkt:true})}
  case "/briefing":return send(KI.telegram?esc(KI.telegram).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>"):"Noch kein Briefing vorhanden.",{direkt:true});
  case "/prognose":{const s=finde(arg),an=analyse(st(s));if(!an)return send(`Für ${esc(s||"?")} habe ich noch keine Prognose. Verfügbar: ${(KI.stocks||[]).map(x=>x.s).join(", ")}`,{direkt:true});
    return send(`🔮 <b>${esc(st(s).n)}</b>\nTrend ${PFEIL[an.dir]}\nIn ${an.H===20?"4 Wochen":"3 Monaten"} erwartet: ${fmt(an.mid,0)} ${CS(s)} (Bereich ${fmt(an.lo,0)}–${fmt(an.hi,0)} ${CS(s)})\nRisiko: Schwankung ${fmt(an.vol,0)} %/Jahr\n<i>Schätzung, keine Garantie.</i>`,{direkt:true})}
  case "/termine":{const c=(KI.calendar||[]);return send(c.length?`📅 <b>Termine</b>\n${c.map(x=>`<b>${esc(x.day)}</b>: ${x.items.map(i=>esc(i.replace(/<[^>]+>/g,""))).join(", ")}`).join("\n")}`:"Keine Termine bekannt.",{direkt:true})}
  case "/kaufhilfe":{const l=khListe();if(!l.length)return send("Keine offenen Kaufentscheidungen. Neue mit /merken Name Preis Tage",{direkt:true});
    for(const x of l)await send(`${khText(x)}\n${x.due<=Date.now()?"Bedenkzeit vorbei. Willst du es noch?":`Bedenkzeit bis ${new Date(x.due).toLocaleDateString("de-DE")}`}`,{direkt:true,knoepfe:khKnopf(x)});return}
  case "/merken":{const url=(arg.match(/https?:\/\/\S+/)||[""])[0],rest=arg.replace(url,"").replace(/\s+/g," ").trim(),m=rest.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)(?:\s+(\d+))?(?:\s+(.+))?$/);
    if(!m)return send("So geht’s: /merken Jacke 120 7\nOptional danach ein Link und eine Beschreibung:\n/merken Jacke 120 7 https://… Größe M, blau",{direkt:true});
    const it={id:Date.now(),n:m[1],p:+m[2].replace(",","."),d:m[4]||"",u:url,due:Date.now()+(+(m[3]||7))*864e5};B.khNew.push(it);inbox("kh-new",it);return send(`📝 Gemerkt: <b>${esc(it.n)}</b> für ${fmt(it.p,0)} €. Ich erinnere dich am ${new Date(it.due).toLocaleDateString("de-DE")}.`,{direkt:true})}
  case "/gespart":{const k=U.kh||{saved:0,bought:0};return send(`💚 Durch die Kaufhilfe nicht ausgegeben: <b>${fmt(k.saved||0,0)} €</b>\nBewusst gekauft: ${fmt(k.bought||0,0)} €`,{direkt:true})}
  case "/ziel":{const g=U.fin&&U.fin.goal;return send(g?`🎯 <b>${esc(g.n)}</b>: ${fmt(g.g,0)} von ${fmt(g.z,0)} € (${fmt(g.g/(g.z||1)*100,0)} %)`:"Noch kein Sparziel übertragen.",{direkt:true})}
  case "/sparmodell":return send(U.model?`💶 Dein Sparmodell: <b>${esc(U.modelName||U.model)}</b>${U.rec&&U.rec!==U.model?`\nEmpfohlen wäre gerade: <b>${esc(U.recName||U.rec)}</b>. Ansehen in der App unter Finanzen → Sparmodell.`:"\nPasst weiterhin zu deinen Zahlen."}`:"Du hast noch kein Sparmodell gewählt (App → Finanzen → Sparmodell).",{direkt:true});
  case "/alarme":{const n=U.notify||{},d=depot();return send(`⚙️ <b>Deine Alarme</b>\n${d.map(x=>`• ${esc(x.n)}: Meldung ab ${x.a} %${x.z?`, Kursziel ${fmt(x.z)} ${CS(x.s)}`:""}${x.tag?`, Nachkauf am ${x.tag}.`:""}`).join("\n")||"Keine Aktien im Depot."}\n\nStarke Bewegung ab ±${n.move||5} % · Nachtruhe ${n.night===false?"aus":"22–7 Uhr"}\nÄndern kannst du das in der App.`,{direkt:true})}
  case "/ruhe":{const m=(a[0]||"2h").match(/^(\d+)(m|h)$/);const bis=a[0]==="morgen"?Date.parse(addDays(zeit().date,1)+"T06:00:00Z"):Date.now()+(m?(+m[1])*(m[2]==="h"?36e5:6e4):72e5);
    B.mute=bis;return send(`🔕 Pause bis ${new Date(bis).toLocaleString("de-DE",{timeZone:"Europe/Berlin",weekday:"short",hour:"2-digit",minute:"2-digit"})} Uhr. Wichtiges sammle ich und schicke es danach. /laut beendet die Pause.`,{direkt:true})}
  case "/laut":B.mute=0;await send("🔔 Pause beendet.",{direkt:true});return warteschlange();
  case "/warnung":case "/warnungen":{const ziele=[...new Set([...depot().map(x=>x.s),...(U.watch||[]).map(w=>LEGACY[w]||w)])];const l=ziele.map(s=>[s,fruehwarnung(s)]).filter(([,w])=>w);
    if(!l.length)return send("Noch keine Daten für Frühwarnungen. Trag Aktien ins Depot ein oder beobachte welche.",{direkt:true});
    return send(`🚦 <b>Frühwarnungen</b>\n${l.sort((a,b)=>b[1].p-a[1].p).map(([s,w])=>`${["","🟩","🟨","🟥"][w.lv]} <b>${esc((depot().find(x=>x.s===s)||{}).n||catOf(s).n||s)}</b>${w.gr.length?"\n   "+w.gr.map(esc).join("\n   "):" – unauffällig"}`).join("\n")}`,{direkt:true})}
  case "/status":{const e=Object.entries(B.err);return send(`🩺 <b>Status</b>\nLetzter Lauf: ${B.lastRun?new Date(B.lastRun).toLocaleString("de-DE",{timeZone:"Europe/Berlin"}):"–"}\nKI-Stand: ${KI.generated?new Date(KI.generated).toLocaleString("de-DE",{timeZone:"Europe/Berlin"}):"–"}\nDepot übertragen: ${U.updatedAt?new Date(U.updatedAt).toLocaleString("de-DE",{timeZone:"Europe/Berlin"}):"nein"}\nXetra: ${xetraOffen()?"offen":"geschlossen"} · US-Börse: ${boerseOffen()?"offen":"geschlossen"}\nEU-Kurse: ${B.euT?new Date(B.euT).toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin",hour:"2-digit",minute:"2-digit"})+" Uhr":"–"}\n${e.length?"⚠️ Probleme:\n"+e.map(([k,v])=>`• ${k}: ${esc(v)}`).join("\n"):"✅ Alle Datenquellen erreichbar"}`,{direkt:true})}
  default:return send(`Den Befehl „${esc(c0)}“ kenne ich nicht. /hilfe zeigt alle Befehle.`,{direkt:true})}}
async function knopf(cb){const [t,id]=String(cb.data||"").split(":"),x=khListe().find(i=>String(i.id)===id);await tg("answerCallbackQuery",{callback_query_id:cb.id,text:x?"Gespeichert":"Schon erledigt"});if(!x)return;
  B.khDone.push(String(x.id));inbox(t==="kb"?"kh-buy":"kh-skip",x);
  await tg("editMessageText",{chat_id:CHAT,message_id:cb.message.message_id,parse_mode:"HTML",text:t==="kb"?`✅ <b>${esc(x.n)}</b>: gekauft. Viel Freude damit!`:`💚 <b>${esc(x.n)}</b>: nicht gekauft. ${fmt(x.p,0)} € gespart!`})}
async function telegramEingang(warte=0){if(!TG)return;const r=await tg("getUpdates",{offset:B.offset,timeout:warte,allowed_updates:["message","callback_query"]});if(!r||!r.ok){B.err.telegram=(r&&r.description)||"Telegram nicht erreichbar";log("Telegram-Fehler:",B.err.telegram);return}
  delete B.err.telegram;if(warte&&!(r.result||[]).length)return;log("Telegram:",(r.result||[]).length,"neue Nachricht(en)",CHAT?"":"(Chat-ID noch nicht eingetragen)");
  for(const u of r.result||[]){B.offset=u.update_id+1;const msg=u.message,cb=u.callback_query,chat=String((msg&&msg.chat.id)||(cb&&cb.message.chat.id)||"");
    if(!CHAT){if(msg)await tg("sendMessage",{chat_id:chat,parse_mode:"HTML",text:`👋 Hallo! Deine Chat-ID ist:\n\n<code>${chat}</code>\n\nTrag sie bei GitHub als Secret <b>TELEGRAM_CHAT</b> ein (Schritt 6 der Anleitung). Danach kann ich dir schreiben.`});continue}
    if(chat!==CHAT)continue;try{if(msg&&msg.text)await befehl(msg.text);if(cb)await knopf(cb)}catch(e){log("Befehl",e)}}}

/* ---------- Alarme und Erinnerungen ---------- */
async function alarme(){const n=Object.assign({loss:true,target:true,move:5,news:true,kh:true,sparplan:true,earnings:true,model:true,briefing:true},U.notify||{}),z=zeit(),d=depot();
  for(const x of d)if(isUS(x.s)&&(boerseOffen()||!B.q[x.s]||Date.now()-B.q[x.s].t>6*36e5))await quote(x.s);else if(isEU(x.s)&&!B.q[x.s])await yq(x.s);
  for(const x of d){const p=priceOf(x.s);if(!p)continue;const ch=(p/x.k-1)*100,mv=moveOf(x.s),kL=`loss:${x.s}`,kZ=`ziel:${x.s}`,kM=`move:${x.s}:${z.date}`;
    if(n.loss&&ch<=x.a){if(!B.sent[kL]||ch<=B.sent[kL]-5){B.sent[kL]=ch;await send(`🔴 <b>${esc(x.n)}</b> liegt ${sgn(ch)} unter deinem Kaufpreis.\nKurs ${fmt(p)} ${CS(x.s)} · deine Meldegrenze: ${x.a} %`,{dringend:mv<=-10})}}else if(B.sent[kL]&&ch>x.a+2)delete B.sent[kL];
    if(n.target&&x.z&&p>=x.z){if(!B.sent[kZ]){B.sent[kZ]=1;await send(`🟢 <b>${esc(x.n)}</b> hat dein Kursziel erreicht!\nKurs ${fmt(p)} ${CS(x.s)} · Ziel ${fmt(x.z)} ${CS(x.s)} · ${sgn(ch)} seit Kauf`)}}else if(B.sent[kZ]&&p<x.z*.98)delete B.sent[kZ];
    if(n.move&&Math.abs(mv)>=n.move&&!B.sent[kM]){B.sent[kM]=1;await send(`⚡ <b>${esc(x.n)}</b> bewegt sich heute stark: ${sgn(mv)}\nKurs ${fmt(p)} ${CS(x.s)}`,{dringend:mv<=-10})}
    if(n.sparplan&&x.tag&&z.day===+x.tag&&z.h>=9&&!B.sent[`spar:${x.s}:${z.ym}`]){B.sent[`spar:${x.s}:${z.ym}`]=1;await send(`💶 Heute ist dein Nachkauf-Tag für <b>${esc(x.n)}</b>.\nAktuell ${fmt(p)} ${CS(x.s)} (${sgn(ch)} seit Kauf).`)}}
  if(n.kh)for(const x of khListe())if(x.due<=Date.now()&&!B.sent[`kh:${x.id}`]){if(leise())break;B.sent[`kh:${x.id}`]=Date.now();await send(`⏰ Bedenkzeit vorbei!\n${khText(x)}\nWillst du es immer noch?`,{knoepfe:khKnopf(x)})}
  if(n.kh)for(const x of khListe())if(B.sent[`kh:${x.id}`]>1&&Date.now()-B.sent[`kh:${x.id}`]>48*36e5&&!B.sent[`kh2:${x.id}`]&&!leise()){B.sent[`kh2:${x.id}`]=1;await send(`🛒 Noch offen in deinem Warenkorb:\n${khText(x)}\nKaufen oder lassen?`,{knoepfe:khKnopf(x)})}
  {const z2=zeit(),l=khListe();if(n.kh&&z2.wd==="Sun"&&z2.h>=18&&l.length&&B.sent.cartWeek!==z2.date&&!leise()){B.sent.cartWeek=z2.date;await send(`🧺 <b>Dein Warenkorb</b> (${l.length})\n${l.map(x=>`• ${esc(x.n)} · ${fmt(x.p,0)} € · ${x.due<=Date.now()?"Bedenkzeit vorbei":"bis "+new Date(x.due).toLocaleDateString("de-DE")}`).join("\n")}\n\nAlles anzeigen mit /kaufhilfe`)}}
  if(n.earnings){const morgen=addDays(z.date,1);for(const e of B.earn.list)if(e.date===morgen&&d.some(x=>x.s===e.symbol)&&!B.sent[`earn:${e.symbol}:${e.date}`]){B.sent[`earn:${e.symbol}:${e.date}`]=1;await send(`📅 Morgen legt <b>${esc(catOf(e.symbol).n||e.symbol)}</b> Quartalszahlen vor. Danach kann der Kurs stark schwanken.`)}}
  if(n.model&&U.model&&U.rec&&U.rec!==U.model&&B.sent.model!==U.rec){B.sent.model=U.rec;await send(`💡 Ein anderes Sparmodell könnte jetzt besser passen: <b>${esc(U.recName||U.rec)}</b>.\nAnsehen in der App unter Finanzen → Sparmodell.`)}
  if(KI.generated&&KI.generated!==B.lastKi){B.lastKi=KI.generated;if(n.briefing&&KI.telegram)await send(esc(KI.telegram).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>"));
    if(n.news)for(const x of (KI.news||[]))if(x.imp>=2&&x.stocks.some(s=>d.some(y=>y.s===s))&&!B.sent[`news:${x.id}`]){B.sent[`news:${x.id}`]=1;await send(`📰 <b>Betrifft dein Depot:</b> ${esc(x.t)}\n${esc(x.sum)}\n<a href="${x.u}">Quelle: ${esc(x.q)}</a>`)}
    for(const u of (KI.updates||[]))if(!u.example&&!B.sent[`upd:${u.id}`]){B.sent[`upd:${u.id}`]=1;await send(`📬 <b>Neuer Update-Brief:</b> ${esc(u.title)}\nIn der App unter Aktien → Lern-Updates kannst du ihn übernehmen oder ablehnen.`)}}
  for(const k of Object.keys(B.sent))if(/^(move|earn):/.test(k)&&!k.includes(z.date)&&!k.includes(addDays(z.date,1)))delete B.sent[k]}

/* ---------- EU-Kurse für die App (Branch "kurse", ohne Seiten-Neubau) ---------- */
// Wichtige Marktwerte: eigene Seiten in der App
const MARKT=[["^GDAXI","DAX","idx"],["^MDAXI","MDAX","idx"],["^STOXX50E","Euro Stoxx 50","idx"],["^GSPC","S&P 500","idx"],["^NDX","Nasdaq 100","idx"],["^DJI","Dow Jones","idx"],["^VIX","Angst-Barometer (VIX)","idx"],
  ["EUNL.DE","MSCI World (ETF)","etf"],["VWCE.DE","FTSE All-World (ETF)","etf"],["GC=F","Gold","roh"],["BZ=F","Öl (Brent)","roh"],
  ["BTC-EUR","Bitcoin","krypto"],["ETH-EUR","Ethereum","krypto"],["SOL-EUR","Solana","krypto"],["XRP-EUR","XRP","krypto"],["BNB-EUR","BNB","krypto"],["ADA-EUR","Cardano","krypto"],["DOGE-EUR","Dogecoin","krypto"],
  ["EURUSD=X","Euro in Dollar","fx"],
  // Alternativen und Bausteine zum MSCI World
  ["EXUS.DE","MSCI World ex USA","alt:Weniger USA"],["IUSQ.DE","MSCI ACWI (Welt inkl. Schwellenländer)","alt:Weniger USA"],["XDEW.DE","S&P 500 gleichgewichtet","alt:Weniger USA"],
  ["EUNK.DE","MSCI Europe","alt:Europa"],["EXSA.DE","STOXX Europe 600","alt:Europa"],["EXW1.DE","Euro Stoxx 50","alt:Europa"],
  ["XMME.DE","MSCI Emerging Markets","alt:Schwellenländer"],["VFEM.DE","FTSE Emerging Markets","alt:Schwellenländer"],
  ["IS3Q.DE","MSCI World Qualität","alt:Defensiver"],["ISPA.DE","Global Select Dividend 100","alt:Defensiver"],["VGWD.DE","FTSE All-World hohe Dividende","alt:Defensiver"],
  ["EUNH.DE","Euro-Staatsanleihen","alt:Anleihen und Geldmarkt"],["IBCI.DE","Euro-Anleihen inflationsgeschützt","alt:Anleihen und Geldmarkt"],["XEON.DE","Geldmarkt (Tageszins in €)","alt:Anleihen und Geldmarkt"],
  ["4GLD.DE","Xetra-Gold","alt:Gold"]];
// Zusätzliche Werte für „Was steckt drin / So investierst du“ (Verlauf täglich, Kurs stündlich)
const EXTRA=["EXS1.DE","EXS3.DE","EXW1.DE","SXRT.DE","SXR8.DE","XDEW.DE","SXRV.DE","EXI3.DE","4GLD.DE","BRNT.L","XEON.DE","EUNH.DE","IUSQ.DE",
  "NVDA","AAPL","MSFT","AMZN","GOOGL","META","SAP.DE","SIE.DE","ALV.DE","DTE.DE","AIR.DE","MUV2.DE","RHM.DE","MBG.DE","ASML.AS","MC.PA","TTE.PA"];
async function euKurse(){const z=zeit(),heute=z.date;B.hist=B.hist||{};
  const meine=[...new Set([...depot().map(x=>x.s),...(U.watch||[]).map(w=>LEGACY[w]||w),...(KI.stocks||[]).map(x=>x.s),...DEFAULT_EU])].filter(Boolean);
  const kern=[...new Set([...MARKT.map(m=>m[0]),...EU_INDEX.map(m=>m[0]),...meine])],alle=[...new Set([...kern,...EXTRA])];
  const neu=alle.filter(s=>!B.hist[s]||B.hist[s].d!==heute),extraFaellig=Date.now()-(B.extraT||0)>=36e5;
  const offen=xetraOffen()||boerseOffen(),faellig=offen||Date.now()-(B.euT||0)>=36e5;
  const krypto=alle.filter(isKrypto);if(!faellig&&!neu.length){for(const s of krypto)await yq(s);await yq("^VIX")}
  if(!faellig&&!neu.length&&!krypto.length)return;
  // Verlauf (3 Monate) einmal am Tag, neue Werte sofort
  for(const s of neu.slice(0,40)){const c=await yq(s,true);if(c&&c.length)B.hist[s]={d:heute,c}}
  if(faellig){for(const s of kern)if(!neu.includes(s))await yq(s);if(extraFaellig){for(const s of EXTRA)if(!kern.includes(s)&&!neu.includes(s))await yq(s);B.extraT=Date.now()}for(const [s] of EU_SECTOR)await yq(s);B.euT=Date.now()}
  if(!B.q["EURUSD=X"])await yq("EURUSD=X");
  for(const s of Object.keys(B.hist))if(!alle.includes(s))delete B.hist[s];
  const pick=l=>l.filter(([s])=>B.q[s]).map(([s,n])=>({s,n,c:B.q[s].c,dp:+(+B.q[s].dp).toFixed(2)}));
  const mit=alle.filter(s=>B.q[s]);
  writeJSON(P(".state/kurse.json"),{t:Date.now(),fx:{EURUSD:fx()},idx:pick(EU_INDEX),sec:pick(EU_SECTOR),
    markt:MARKT.filter(([s])=>B.q[s]).map(([s,n,k])=>({s,n,k})),
    q:Object.fromEntries(mit.map(s=>[s,{c:B.q[s].c,dp:+(+B.q[s].dp).toFixed(2),cur:curOf(s),t:B.q[s].mt||B.q[s].t}])),
    h:Object.fromEntries(Object.entries(B.hist).map(([s,v])=>[s,v.c.map(x=>+(+x).toFixed(4))])),w:Object.fromEntries(meine.map(s=>[s,fruehwarnung(s)]).filter(([,w])=>w))});B.kursePush=true;if(neu.length)log("Neue Verläufe:",neu.join(","))}
function kurseHochladen(){if(!B.kursePush||DRY)return;B.kursePush=false;try{const o={cwd:ROOT};const blob=execSync("git hash-object -w .state/kurse.json",o).toString().trim();
  const tree=execSync("git mktree",Object.assign({input:`100644 blob ${blob}\tkurse.json\n`},o)).toString().trim();
  const c=execSync(`git -c user.name=Wachmann -c user.email=wachmann@users.noreply.github.com commit-tree ${tree} -m "Kurse"`,o).toString().trim();
  execSync(`git push -f -q origin ${c}:refs/heads/kurse`,o);log("Kurse hochgeladen")}catch(e){log("Kurse",e.message);B.err.kurse=e.message.slice(0,120)}}

/* ---------- Frühwarnung: schlägt an, BEVOR ein Wert stark gefallen ist ---------- */
function fruehwarnung(s){const h=(B.hist||{})[s];if(!h||h.c.length<30)return null;const live=priceOf(s);const c=h.c.slice().reverse();if(live&&Math.abs(live-c[c.length-1])/c[c.length-1]>1e-6)c.push(live);
  const n=c.length,last=c[n-1],mean=a=>a.reduce((x,y)=>x+y,0)/a.length,sma=k=>mean(c.slice(-k));
  const r=[];for(let i=1;i<n;i++)r.push(Math.log(c[i]/c[i-1]));const sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))};
  const gr=[];let p=0;
  const s20=sma(20),s50=sma(Math.min(50,n));if(last<s20&&s20<s50){p+=1;gr.push("Abwärtstrend beginnt: Kurs unter dem 20- und 50-Tage-Schnitt")}
  if(c[n-2]>=s50&&last<s50){p+=1;gr.push("Kurs ist gerade unter den 50-Tage-Schnitt gerutscht")}
  const v10=sd(r.slice(-10)),vAll=sd(r);if(vAll>0&&v10>1.7*vAll){p+=1;gr.push("Schwankungen haben deutlich zugenommen")}
  const hoch=Math.max(...c),dd=(last/hoch-1)*100;if(dd<=-15){p+=2;gr.push(`${fmt(-dd,0)} % unter dem 3-Monats-Hoch`)}else if(dd<=-8){p+=1;gr.push(`${fmt(-dd,0)} % unter dem 3-Monats-Hoch`)}
  const t3=(c[n-1]/c[n-4]-1)*100;if(c[n-1]<c[n-2]&&c[n-2]<c[n-3]&&c[n-3]<c[n-4]&&t3<=-4){p+=1;gr.push(`3 Verlusttage in Folge (${sgn(t3)})`)}
  const z=zeit(),bald=(B.earn.list||[]).find(e=>e.symbol===s&&e.date>=z.date&&e.date<=addDays(z.date,2));if(bald){p+=1;gr.push("Quartalszahlen in den nächsten 2 Tagen")}
  const ki=(KI.stocks||[]).find(x=>x.s===s);if(ki&&+ki.warn>0){p+=+ki.warn;gr.push("KI-Nachrichtenlage: "+(ki.warnGrund||"negative Meldungen"))}
  const vix=B.q["^VIX"]&&B.q["^VIX"].c;if(vix>=30){p+=1;gr.push(`Gesamtmarkt sehr nervös (VIX ${fmt(vix,0)})`)}else if(vix>=25&&p>0){gr.push(`Gesamtmarkt nervös (VIX ${fmt(vix,0)})`)}
  return {lv:p>=4?3:p>=2?2:1,p,gr}}
async function fruehwarnungen(){const n=Object.assign({warn:true},U.notify||{});if(!n.warn)return;const z=zeit(),ziele=[...new Set([...depot().map(x=>x.s),...(U.watch||[]).map(w=>LEGACY[w]||w)])];
  for(const s of ziele){const w=fruehwarnung(s);if(!w)continue;const k=`fw:${s}`,alt=B.sent[k]||{lv:1,d:""};
    if(w.lv>=2&&(w.lv>alt.lv||alt.d!==z.date&&w.lv>=3&&alt.lv<3)){B.sent[k]={lv:w.lv,d:z.date};const name=(depot().find(x=>x.s===s)||{}).n||catOf(s).n||s;
      await send(`${w.lv>=3?"🟥":"🟨"} <b>Frühwarnung: ${esc(name)}</b> (${w.lv>=3?"hoch":"erhöht"})\n${w.gr.map(g=>"• "+esc(g)).join("\n")}\n\nKurs ${fmt(priceOf(s)||0)} ${CS(s)}. <i>Kein Verkaufssignal, sondern ein Hinweis, genauer hinzuschauen.</i>`)}
    else if(w.lv<alt.lv&&alt.d!==z.date)B.sent[k]={lv:w.lv,d:alt.d}}
  const vix=B.q["^VIX"]&&B.q["^VIX"].c,vk=vix>=30?2:vix>=25?1:0;if(vk>(B.sent.vix&&B.sent.vix.d===z.date?B.sent.vix.lv:0)){B.sent.vix={lv:vk,d:z.date};
    await send(`🌡️ <b>Der Markt wird nervös</b>\nDas Angst-Barometer VIX steht bei ${fmt(vix,1)} (normal: unter 20).\nIn solchen Phasen schwanken Aktien stärker. Prüfe, ob dein Depot zu deiner Risikobereitschaft passt.`)}}

/* ---------- Abend-Rückblick um 21 Uhr (ohne KI) ---------- */
async function abendRueckblick(){const z=zeit(),n=U.notify||{};if((!E.FORCE_ABEND&&(z.h<21||z.h>=22))||B.sent.abend===z.date||n.briefing===false||!CHAT)return;B.sent.abend=z.date;
  const d=depot();for(const x of d)await frisch(x.s);for(const [s] of INDEX_ETF)await quote(s);for(const [s] of EU_INDEX.slice(0,2))await yq(s);await yq("EURUSD=X");
  const zeilen=[],mit=d.filter(x=>priceOf(x.s)&&!x.test);let tot=0,cost=0,heute=0;
  for(const x of mit){const p=priceOf(x.s),mv=moveOf(x.s);tot+=toEUR(p*x.q,x.s);cost+=toEUR(x.k*x.q,x.s);heute+=toEUR(p*x.q*(1-1/(1+mv/100)),x.s);zeilen.push(`${mv>=0?"🟢":"🔴"} ${esc(x.n)}: heute ${sgn(mv)} · seit Kauf ${sgn((p/x.k-1)*100)}`)}
  const morgen=addDays(z.date,1),termine=B.earn.list.filter(e=>e.date===morgen).map(e=>`Quartalszahlen ${esc(catOf(e.symbol).n||e.symbol)}`);
  for(const x of d)if(x.tag&&+morgen.slice(8)===+x.tag)termine.push(`Nachkauf-Tag ${esc(x.n)}`);
  const kh=khListe(),faellig=kh.filter(x=>x.due<=Date.now()+864e5);
  const markt=[...EU_INDEX.slice(0,2),...INDEX_ETF].filter(([s])=>B.q[s]).map(([s,n])=>`${n} ${sgn(B.q[s].dp)}`).join(" · ");
  await send(`🌙 <b>Dein Abend-Rückblick</b>${markt?`\n${markt}`:""}\n\n${mit.length?`<b>Depot heute: ${heute>=0?"+":""}${fmt(heute)} €</b> (gesamt ${fmt(tot)} €, ${sgn((tot/cost-1)*100)} seit Kauf)\n${zeilen.join("\n")}`:"Noch keine Aktien im Depot übertragen."}${mit.length>1?`\n\nBester: ${esc(mit.slice().sort((a,b)=>moveOf(b.s)-moveOf(a.s))[0].n)} · Schwächster: ${esc(mit.slice().sort((a,b)=>moveOf(a.s)-moveOf(b.s))[0].n)}`:""}\n\n<b>Morgen:</b> ${termine.length?termine.join(", "):"keine besonderen Termine bei deinen Aktien"}${kh.length?`\n\n🧺 Warenkorb: ${kh.length} Ding${kh.length>1?"e":""}${faellig.length?`, davon ${faellig.length} bald fällig (${faellig.map(x=>esc(x.n)).join(", ")})`:""}`:""}\n\nDie US-Börse schließt um 22 Uhr. Gute Nacht! 😴`)}

/* ---------- Vorlage für Claude (3x täglich) ---------- */
const F=s=>`§FILL: ${s}§`;
function prognoseCheck(){const pf=P("data/prognosen.json"),log0=readJSON(pf,[]),heute=zeit().date;
  for(const e of log0)if(!e.ok&&e.bis<=heute){const p=priceOf(e.s)||((KI.stocks||[]).find(x=>x.s===e.s)||{closes:[]}).closes[0];if(p){e.ist=p;e.ok=p>=e.lo&&p<=e.hi?1:-1}}
  for(const st of (KI.stocks||[])){const a=analyse(st);if(a&&!log0.some(e=>e.s===st.s&&e.d===heute))log0.push({d:heute,s:st.s,lo:+a.lo.toFixed(2),hi:+a.hi.toFixed(2),bis:addDays(heute,Math.round(a.H*1.4))})}
  const fertig=log0.filter(e=>e.ok).slice(-120);writeJSON(pf,log0.filter(e=>!e.ok||fertig.includes(e)).slice(-600));changed.add("data/prognosen.json");
  return {ausgewertet:fertig.length,treffer:fertig.filter(e=>e.ok===1).length,quote:fertig.length?Math.round(fertig.filter(e=>e.ok===1).length/fertig.length*100):null,soll:68}}
async function vorlage(slot){delete B.err.alphavantage;const z=zeit(),prev=KI,d=depot(),watch=[...new Set([...(prev.stocks||[]).map(s=>s.s),...d.map(x=>x.s),...(U.watch||[]).map(w=>LEGACY[w]||w),...DEFAULT_EU])].slice(0,18);
  for(const s of watch)if(isUS(s))await quote(s);for(const [s] of [...INDEX_ETF,...SECTOR_ETF])await quote(s);for(const [s] of [...EU_INDEX,...EU_SECTOR])await yq(s);
  const stocks=[];for(const s of watch){const alt=(prev.stocks||[]).find(x=>x.s===s);let closes=alt&&alt.closes;
    if(slot==="morgen"||!closes){let c=await yq(s,true);if(!c||c.length<25){c=await avDaily(avSym(s));await sleep(E.DRY==="1"?0:1500)}if(c&&c.length>=25)closes=c}
    if(!closes)continue;const neu=slot==="morgen"||!alt,base={s,n:catOf(s).n||(alt&&alt.n)||s,closes,cur:curOf(s)};
    const an=analyse(Object.assign({},alt||{},base));
    stocks.push(neu?Object.assign(base,{cat:alt&&alt.cat||F("Branche in 1–3 Wörtern"),h:F('"kurz" oder "lang"'),bias:F("Zahl −3 bis +3: Wirkung der heutigen Nachrichten auf den Kurs in %"),
      why:F("2–3 Sätze Einschätzung, sachlich, keine Kaufempfehlung"),pro:F("Liste mit 1–3 kurzen Punkten dafür"),con:F("Liste mit 1–3 kurzen Punkten dagegen"),news:F("Liste der news-ids, die diese Aktie betreffen"),warn:F("Zahl 0–3: Gefahr aus der Nachrichtenlage (0 = nichts Besonderes, 1 = leicht negativ, 2 = deutlich negativ, 3 = ernst, z. B. Gewinnwarnung, Klage, angekündigte Kürzungen)"),warnGrund:F("1 kurzer Satz zum Warn-Grund oder leerer Text"),
      _fakten:an?{waehrung:curOf(s),region:isEU(s)?"Europa":"USA",trend:an.dir,vierWochen:+an.ch20.toFixed(1),dreiMonate:+an.ch3m.toFixed(1),schwankung:+an.vol.toFixed(0),heute:+moveOf(s).toFixed(2)}:{}}):Object.assign({},alt,{closes}))}
  const bis=z.date,von=addDays(bis,slot==="morgen"?-1:0),roh=[],seen=new Set();
  const add=(n,sym)=>{const k=(n.headline||"").toLowerCase().slice(0,60);if(!n.headline||seen.has(k))return;seen.add(k);roh.push({id:`n${n.id||roh.length}`,t:n.headline,q:n.source,u:n.url,sym:sym?[sym]:(n.related||"").split(",").filter(Boolean).slice(0,3),z:(n.summary||"").slice(0,220)})};
  for(const s of watch.filter(isEU))(await yNews(s)).forEach(n=>add(n,s));
  for(const s of watch.filter(isUS)){try{(await fh(`company-news?symbol=${s}&from=${von}&to=${bis}`)).slice(0,2).forEach(n=>add(n,s))}catch(e){}}
  try{(await fh("news?category=general")).slice(0,8).forEach(n=>add(n))}catch(e){}
  if(B.earn.date!==z.date){try{const r=await fh(`calendar/earnings?from=${z.date}&to=${addDays(z.date,14)}`);B.earn={date:z.date,list:(r.earningsCalendar||[]).filter(e=>watch.includes(e.symbol))}}catch(e){}}
  const cal={};B.earn.list.forEach(e=>{const k=new Date(e.date+"T12:00:00Z").toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"});(cal[k]=cal[k]||[]).push(`Quartalszahlen: ${catOf(e.symbol).n||e.symbol}`)});
  const sonntag=z.wd==="Sun"&&slot==="mittag",lern=slot==="morgen"||sonntag?prognoseCheck():null;
  const v={version:2,generated:F("aktuelle Uhrzeit als ISO-Zeitstempel mit +01:00 bzw. +02:00"),dataAsOf:z.date,_slot:slot,
    _anleitung:"Ersetze jeden §FILL…§-Platzhalter durch passenden Inhalt im richtigen JSON-Typ (Text, Zahl oder Liste). Alles andere unverändert lassen. Felder mit _ am Anfang danach löschen. Deutsch, kurz, sachlich, in eigenen Worten, keine Kauf- oder Verkaufsempfehlungen.",
    indices:[...EU_INDEX.filter(([s])=>B.q[s]).map(([s,n])=>({n,v:B.q[s].c,c:+(+B.q[s].dp).toFixed(2),s:"Europa"})),...INDEX_ETF.filter(([s])=>B.q[s]).map(([s,n])=>({n,v:B.q[s].c,c:+B.q[s].dp.toFixed(2),s:`USA, über ${s}`}))],
    sectors:[...EU_SECTOR.filter(([s])=>B.q[s]).map(([s,n])=>({n,c:+(+B.q[s].dp).toFixed(2),p:"Europa"})),...SECTOR_ETF.filter(([s])=>B.q[s]).map(([s,n])=>({n,c:+B.q[s].dp.toFixed(2),p:"USA"}))],
    calendar:Object.entries(cal).map(([day,items])=>({day,items})),stocks,
    news:slot==="morgen"?F("Liste der 4–8 wichtigsten Meldungen aus _rohnews im Format {id,imp(1-3),kind:[Text,\"down\"|\"up\"|\"warn\"|\"\"],cat,t,sum(1 Satz),body:[1-3 Absätze],back(\"Rückblick: …\" oder \"Wirkt jetzt: …\" oder \"Wirkt bald: …\"),stocks:[Kürzel],u,q}")
      :Object.assign([],prev.news||[]),
    _news_hinweis:slot==="morgen"?undefined:"Behalte die news-Liste. Ergänze nur wirklich neue wichtige Meldungen aus _rohnews im selben Format, höchstens 10 insgesamt (älteste raus).",
    _rohnews:roh.slice(0,32),
    telegram:F(slot==="morgen"?"Morgen-Briefing für Telegram, höchstens 8 kurze Zeilen: Lage, wichtigste 2–3 Meldungen, was heute ansteht, auffällige Bewegungen bei den beobachteten Aktien. **fett** erlaubt."
      :slot==="mittag"?"Kurzes Mittags-Update, höchstens 4 Zeilen: nur was sich seit dem Morgen geändert hat."
      :"Abend-Rückblick, höchstens 6 Zeilen: wie lief der Tag, wie die Depot-Aktien, was morgen ansteht."+(sonntag?" Danach 3 Zeilen Wochenfazit.":"")),
    model:prev.model||{trendDamping:.5,bandFactor:1,newsWeight:1},updates:(prev.updates||[]).filter(u=>!u.example).slice(-10),catalog:prev.catalog||[],
    _lernen:sonntag?Object.assign({},lern,{aktuelleParameter:params(),aufgabe:"Wenn die Trefferquote deutlich (mehr als 10 Punkte) vom Soll abweicht und mindestens 20 Prognosen ausgewertet sind: füge in updates EINEN Vorschlag hinzu {id:\"u-DATUM\",date,title,what,why,how,change:{bandFactor oder trendDamping oder newsWeight}}. Kleine Schritte (±10 %). Sonst nichts hinzufügen."}):undefined};
  writeJSON(P("data/ki-vorlage.json"),v);changed.add("data/ki-vorlage.json");B.slots[slot]=z.date;log("Vorlage",slot,stocks.length,"Aktien",roh.length,"Meldungen")}
function slotJetzt(){const z=zeit();for(const [s,h] of [["morgen",6],["mittag",12]])if(z.h===h&&z.m<35&&B.slots[s]!==z.date)return s;return null}

/* ---------- Speichern ---------- */
async function sichern(){if(changed.has("inbox")&&PASS){const keep=B.inbox.filter(e=>Date.now()-e.t<30*864e5);B.inbox=keep;fs.mkdirSync(P("data"),{recursive:true});fs.writeFileSync(P("data/inbox.enc"),await verschluesseln({events:keep},PASS));changed.delete("inbox");changed.add("data/inbox.enc")}
  kurseHochladen();B.lastRun=Date.now();writeJSON(SF,B);if(!changed.size||DRY)return;
  try{const files=[...changed].join(" ");execSync(`git -C ${ROOT} add ${files} && git -C ${ROOT} -c user.name="Wachmann" -c user.email="wachmann@users.noreply.github.com" commit -m "Wachmann: ${[...changed].map(f=>f.replace(/.*\//,"")).join(", ")}" && git -C ${ROOT} pull --rebase -X theirs && git -C ${ROOT} push`,{stdio:"inherit"})}catch(e){log("git",e.message)}}

/* ---------- Ablauf ---------- */
export async function main(){
  KI=readJSON(P("ki.json"),{});if(B.err.alphavantage&&!B.avFix){delete B.err.alphavantage;B.avFix=1}
  if(PASS&&fs.existsSync(P("data/state.enc"))){try{U=await entschluesseln(fs.readFileSync(P("data/state.enc"),"utf8"),PASS);delete B.err.sync}catch(e){B.err.sync="Depot-Daten nicht lesbar. Stimmt das Sync-Passwort in App und GitHub überein?"}}
  if(U.inboxDone)B.inbox=B.inbox.filter(e=>!U.inboxDone.includes(e.id)||Date.now()-e.t<864e5);
  if(U.kh&&U.kh.list)B.khNew=B.khNew.filter(n=>!U.kh.list.some(x=>x.id===n.id)&&!B.khDone.includes(String(n.id)));
  if(!FH)B.err.finnhub="FINNHUB_KEY fehlt";if(!TG)B.err.telegram="TELEGRAM_TOKEN fehlt";
  await telegramEingang();
  const slot=E.FORCE_SLOT||slotJetzt();if(slot)try{await vorlage(slot)}catch(e){log("Vorlage",e);B.err.vorlage=e.message}
  await euKurse();await alarme();await fruehwarnungen();await abendRueckblick();await warteschlange();
  // Danach noch eine Weile auf Telegram-Befehle lauschen, damit Antworten sofort kommen
  const ende=Date.now()+(E.POLL_SEK!==undefined?+E.POLL_SEK:110)*1000;while(TG&&CHAT&&Date.now()<ende-26000){await telegramEingang(25);await warteschlange()}await sichern();log("fertig",{slot,depot:depot().length,fehler:B.err})}
if(import.meta.url===`file://${process.argv[1]}`)main().catch(e=>{console.error(e);process.exit(1)});
