// Der „Wachmann“: läuft automatisch auf GitHub (alle 5 Min. zu Börsenzeiten, sonst alle 15 Min.).
// Holt Kurse, prüft Alarme, beantwortet Telegram-Befehle, erstellt 3x täglich die Vorlage für Claude.
import fs from "node:fs";
import {execSync} from "node:child_process";
import {verschluesseln,entschluesseln} from "./krypto.mjs";
import * as RB from "./rueckblick.mjs";
import "../modell.js";
const Modell=globalThis.Modell;

const E=process.env,API=E.ANTHROPIC_API_KEY||"",FH=E.FINNHUB_KEY||"",AV=E.AV_KEY||"",TG=E.TELEGRAM_TOKEN||"",CHAT=String(E.TELEGRAM_CHAT||""),PASS=E.SYNC_PASSWORD||"",RURL=E.KI_ROUTINE_URL||"",RTOK=E.KI_ROUTINE_TOKEN||"";
// Adresse der App für Links in Nachrichten (GitHub Pages), überschreibbar mit dem Secret APP_URL
const APP=(E.APP_URL||(E.GITHUB_REPOSITORY?`https://${E.GITHUB_REPOSITORY.split("/")[0].toLowerCase()}.github.io/${E.GITHUB_REPOSITORY.split("/")[1]}/`:"")).replace(/\/?$/,"/");
const L=(route,text="In der App öffnen")=>APP?`\n<a href="${APP}#${route}">${text} ›</a>`:"";
const LA=(s,text)=>L("aktie-"+encodeURIComponent(s),text);
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
const FUSS="\n\n<i>Befehle:</i> /hilfe /kurs /depot /top /markt /warnung /rueckblick /news /briefing /prognose /termine /kaufhilfe /merken /gespart /ziel /sparmodell /alarme /ruhe /laut /status";
async function tg(method,body){if(!TG)return null;
  try{const r=await fetch(`https://api.telegram.org/bot${TG}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});return r.json()}catch(e){B.err.telegram=e.message;return null}}
const nacht=()=>{if(E.FORCE_DAY)return false;if(U.notify&&U.notify.night===false)return false;const z=zeit();return z.h>=22||z.h<7};
const leise=()=>B.mute>Date.now()||nacht();
async function send(text,o={}){if(!CHAT)return;if(!o.direkt&&!o.dringend&&leise()){B.queue.push(text);return}
  const body={chat_id:CHAT,text:text+FUSS,parse_mode:"HTML",disable_web_page_preview:true};if(o.knoepfe)body.reply_markup={inline_keyboard:o.knoepfe};await tg("sendMessage",body)}
async function warteschlange(){if(!B.queue.length||leise())return;const q=B.queue.splice(0,15);await send(`🔔 <b>Während der Ruhezeit:</b>\n\n${q.join("\n\n———\n\n")}`,{direkt:true})}

/* ---------- Prognose (gleiches Modell wie die App) ---------- */
const basisJahr=Modell.basisJahr;
function params(){const p=Object.assign({},Modell.DEFAULTS,KI.model||{});(KI.updates||[]).forEach(u=>{if((U.updates||{})[u.id]==="ok")Object.assign(p,u.change||{})});return p}
const histVon=x=>{const k=(KI.stocks||[]).find(y=>y.s===x);return (B.hist&&B.hist[x]&&B.hist[x].c)||(k&&k.closes)||null};
function analyse(st){if(!st||!st.closes||st.closes.length<25)return null;const Pm=params(),old=st.closes.slice().reverse(),live=priceOf(st.s);if(live)old.push(live);
  const r=[];for(let i=1;i<old.length;i++)r.push(Math.log(old[i]/old[i-1]));const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
  const mu=mean(r),sd=Math.sqrt(mean(r.map(x=>(x-mu)**2))),last=old[old.length-1],sma=n=>mean(old.slice(-n));
  const ch20=(last/old[Math.max(0,old.length-21)]-1)*100,ch3m=(last/old[0]-1)*100,score=(sma(10)/sma(30)-1)*100+ch20/4,dir=score>1?"up":score<-1?"down":"flat";
  const H=st.h==="kurz"?20:63,Z=Modell.zerlege({s:st.s,old,H,P:Pm,bias:st.bias,hist:histVon,monat:+zeit().date.slice(5,7)-1}),drift=Z.drift,band=sd*Math.sqrt(H)*Pm.bandFactor;
  return {last,dir,ch20,ch3m,H,teile:Z.teile,muster:Z.muster,zus:Z.zusammenhaenge,roh:Z.roh,vol:sd*Math.sqrt(252)*100,mid:last*Math.exp(drift),lo:last*Math.exp(drift-band),hi:last*Math.exp(drift+band)}}
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
/rueckblick – Kaufrückblick: wie gut waren deine Entscheidungen?
/ruhe 2h – Nachrichten pausieren (z. B. 30m, 2h, morgen)
/laut – Pause beenden
/status – läuft alles?

Ich antworte beim nächsten Lauf, also meist innerhalb von 5 bis 15 Minuten.`;
const kiWahl=()=>{const k=U.ki||{};return {voll:(k.voll||[]).map(w=>LEGACY[w]||w),kurz:(k.kurz||[]).map(w=>LEGACY[w]||w),wunsch:(k.wunsch||[]).map(w=>LEGACY[w]||w),da:!!U.ki}};
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
  case "/kurs":{const s=finde(arg);if(!s)return send("Welche Aktie? Beispiel: /kurs AAPL oder /kurs Siemens",{direkt:true});{const pv=Modell.privat(arg);if(pv&&!(KI.catalog||[]).some(x=>x.n.toLowerCase().includes(String(arg).toLowerCase().trim())))return send(`ℹ️ <b>Keine Aktie:</b> ${esc(pv.text)}${pv.alt?`\nBörsennotiert aus der gleichen Branche: ${esc(pv.alt)}`:""}`,{direkt:true})}await frisch(s);const p=priceOf(s),an=analyse(st(s));
    return send(p?`<b>${esc(catOf(s).n||s)}</b> (${s})\n${fmt(p)} ${CS(s)} · heute ${sgn(moveOf(s))}${isEU(s)?" (ca. 15 Min. verzögert)":""}${an?`\nTrend ${PFEIL[an.dir]} · 4 Wochen ${sgn(an.ch20)}`:""}${LA(s)}`:`Keinen Kurs für ${esc(s)} gefunden. Tipp: deutsche Aktien mit .DE, z. B. /kurs SIE.DE`,{direkt:true})}
  case "/depot":{const d=depot();if(!d.length)return send("Dein Depot ist leer oder noch nicht übertragen. Trag Aktien in der App ein, sie kommen automatisch hier an.",{direkt:true});
    if(!B.q["EURUSD=X"])await yq("EURUSD=X");for(const x of d)if(isUS(x.s)?(boerseOffen()||!B.q[x.s]):!B.q[x.s]||Date.now()-B.q[x.s].t>9e5)await frisch(x.s);let tot=0,cost=0;const z=d.map(x=>{const p=priceOf(x.s);if(!p)return `• ${esc(x.n)}: kein Kurs`;if(!x.test){tot+=toEUR(p*x.q,x.s);cost+=toEUR(x.k*x.q,x.s)}return `• <b>${esc(x.n)}</b>${x.test?" (Test)":""}: ${fmt(p*x.q)} ${CS(x.s)} (${sgn((p/x.k-1)*100)})`});
    return send(`💼 <b>Dein Depot</b>\n${z.join("\n")}${cost?`\n\n<b>Gesamt: ${fmt(tot)} € (${sgn((tot/cost-1)*100)})</b>${(()=>{const t=(U.trades||[]).filter(t=>!t.test);if(!t.length)return"";const r=t.reduce((x,t)=>x+toEUR((t.p-t.k)*t.q,t.s),0);return `\nRealisiert durch Verkäufe: ${r>=0?"+":""}${fmt(r)} €`})()}${d.some(x=>curOf(x.s)==="USD")?`\n<i>Dollar umgerechnet: 1 € = ${fmt(fx(),4)} $</i>`:""}`:""}${L("depot","Depot öffnen")}`,{direkt:true})}
  case "/top":{const d=depot().filter(x=>priceOf(x.s));if(!d.length)return send("Noch keine Kurse für dein Depot.",{direkt:true});d.sort((x,y)=>moveOf(y.s)-moveOf(x.s));
    return send(`📈 <b>Heute</b>\nBester: ${esc(d[0].n)} ${sgn(moveOf(d[0].s))}\nSchwächster: ${esc(d[d.length-1].n)} ${sgn(moveOf(d[d.length-1].s))}`,{direkt:true})}
  case "/markt":{for(const [s] of [...INDEX_ETF,...SECTOR_ETF])if(boerseOffen()||!B.q[s])await quote(s);for(const [s] of [...EU_INDEX,...EU_SECTOR])if(!B.q[s]||Date.now()-B.q[s].t>9e5)await yq(s);
    const l=(arr)=>arr.map(([s,n])=>B.q[s]?`• ${n}: ${sgn(B.q[s].dp)}`:"").filter(Boolean).join("\n");
    return send(`📊 <b>Europa</b> (Xetra ${xetraOffen()?"offen":"geschlossen"})\n${l(EU_INDEX)}\n<b>Branchen</b>\n${l(EU_SECTOR)}\n\n📊 <b>USA</b> (${boerseOffen()?"offen":"geschlossen"})\n${l(INDEX_ETF)}\n<b>Branchen</b>\n${l(SECTOR_ETF)}`,{direkt:true})}
  case "/news":{const n=(KI.news||[]).slice().sort((x,y)=>y.imp-x.imp).slice(0,5);return send(n.length?`📰 <b>Wichtig gerade</b>\n\n${n.map(x=>`${"●".repeat(x.imp)} <b>${esc(x.t)}</b>\n${esc(x.sum)}\n<a href="${x.u}">Quelle: ${esc(x.q)}</a>${L("news-"+x.id,"In der App")}`).join("\n\n")}`:"Noch keine Nachrichten.",{direkt:true})}
  case "/briefing":return send(KI.telegram?esc(KI.telegram).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>")+L("start","App öffnen"):"Noch kein Briefing vorhanden.",{direkt:true});
  case "/prognose":{const s=finde(arg),an=analyse(st(s));if(!an)return send(`Für ${esc(s||"?")} habe ich noch keine Prognose. Verfügbar: ${(KI.stocks||[]).map(x=>x.s).join(", ")}`,{direkt:true});
    return send(`🔮 <b>${esc(st(s).n)}</b>\nTrend ${PFEIL[an.dir]}\nIn ${an.H===20?"4 Wochen":"3 Monaten"} erwartet: ${fmt(an.mid,0)} ${CS(s)} (Bereich ${fmt(an.lo,0)}–${fmt(an.hi,0)} ${CS(s)})\nRisiko: Schwankung ${fmt(an.vol,0)} %/Jahr\n<i>Schätzung, keine Garantie.</i>${LA(s,"Zusammensetzung in der App")}`,{direkt:true})}
  case "/termine":{const c=(KI.calendar||[]);return send(c.length?`📅 <b>Termine</b>\n${c.map(x=>`<b>${esc(x.day)}</b>: ${x.items.map(i=>esc(i.replace(/<[^>]+>/g,""))).join(", ")}`).join("\n")}`:"Keine Termine bekannt.",{direkt:true})}
  case "/kaufhilfe":{const l=khListe();if(!l.length)return send("Keine offenen Kaufentscheidungen. Neue mit /merken Name Preis Tage",{direkt:true});
    for(const x of l)await send(`${khText(x)}\n${x.due<=Date.now()?"Bedenkzeit vorbei. Willst du es noch?":`Bedenkzeit bis ${new Date(x.due).toLocaleDateString("de-DE")}`}${L("warenkorb","Zum Warenkorb")}`,{direkt:true,knoepfe:khKnopf(x)});return}
  case "/merken":{const url=(arg.match(/https?:\/\/\S+/)||[""])[0],rest=arg.replace(url,"").replace(/\s+/g," ").trim(),m=rest.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)(?:\s+(\d+))?(?:\s+(.+))?$/);
    if(!m)return send("So geht’s: /merken Jacke 120 7\nOptional danach ein Link und eine Beschreibung:\n/merken Jacke 120 7 https://… Größe M, blau",{direkt:true});
    const it={id:Date.now(),n:m[1],p:+m[2].replace(",","."),d:m[4]||"",u:url,due:Date.now()+(+(m[3]||7))*864e5};B.khNew.push(it);inbox("kh-new",it);return send(`📝 Gemerkt: <b>${esc(it.n)}</b> für ${fmt(it.p,0)} €. Ich erinnere dich am ${new Date(it.due).toLocaleDateString("de-DE")}.`,{direkt:true})}
  case "/gespart":{const k=U.kh||{saved:0,bought:0};return send(`💚 Durch die Kaufhilfe nicht ausgegeben: <b>${fmt(k.saved||0,0)} €</b>\nBewusst gekauft: ${fmt(k.bought||0,0)} €`,{direkt:true})}
  case "/ziel":{const g=U.fin&&U.fin.goal;return send(g?`🎯 <b>${esc(g.n)}</b>: ${fmt(g.g,0)} von ${fmt(g.z,0)} € (${fmt(g.g/(g.z||1)*100,0)} %)`:"Noch kein Sparziel übertragen.",{direkt:true})}
  case "/sparmodell":return send(U.model?`💶 Dein Sparmodell: <b>${esc(U.modelName||U.model)}</b>${U.rec&&U.rec!==U.model?`\nEmpfohlen wäre gerade: <b>${esc(U.recName||U.rec)}</b>. Ansehen in der App unter Finanzen → Sparmodell.`:"\nPasst weiterhin zu deinen Zahlen."}`:"Du hast noch kein Sparmodell gewählt (App → Finanzen → Sparmodell).",{direkt:true});
  case "/alarme":{const n=U.notify||{},d=depot();return send(`⚙️ <b>Deine Alarme</b>\n${d.map(x=>`• ${esc(x.n)}: Meldung ab ${x.a} %${x.z?`, Kursziel ${fmt(x.z)} ${CS(x.s)}`:""}${x.gs?`, Gewinnschutz ${x.gs} % vom Höchststand`:""}${x.tag?`, Nachkauf am ${x.tag}.`:""}`).join("\n")||"Keine Aktien im Depot."}\n\nStarke Bewegung ab ±${n.move||5} % · Nachtruhe ${n.night===false?"aus":"22–7 Uhr"}\nÄndern kannst du das in der App.`,{direkt:true})}
  case "/ruhe":{const m=(a[0]||"2h").match(/^(\d+)(m|h)$/);const bis=a[0]==="morgen"?Date.parse(addDays(zeit().date,1)+"T06:00:00Z"):Date.now()+(m?(+m[1])*(m[2]==="h"?36e5:6e4):72e5);
    B.mute=bis;return send(`🔕 Pause bis ${new Date(bis).toLocaleString("de-DE",{timeZone:"Europe/Berlin",weekday:"short",hour:"2-digit",minute:"2-digit"})} Uhr. Wichtiges sammle ich und schicke es danach. /laut beendet die Pause.`,{direkt:true})}
  case "/laut":B.mute=0;await send("🔔 Pause beendet.",{direkt:true});return warteschlange();
  case "/warnung":case "/warnungen":{const ziele=[...new Set([...depot().map(x=>x.s),...(U.watch||[]).map(w=>LEGACY[w]||w)])];const l=ziele.map(s=>[s,fruehwarnung(s)]).filter(([,w])=>w);
    if(!l.length)return send("Noch keine Daten für Frühwarnungen. Trag Aktien ins Depot ein oder beobachte welche.",{direkt:true});
    return send(`🚦 <b>Frühwarnungen</b>\n${l.sort((a,b)=>b[1].p-a[1].p).map(([s,w])=>`${["","🟩","🟨","🟥"][w.lv]} <b>${esc((depot().find(x=>x.s===s)||{}).n||catOf(s).n||s)}</b>${w.gr.length?"\n   "+w.gr.map(esc).join("\n   "):" – unauffällig"}`).join("\n")}${L("depot","Depot öffnen")}`,{direkt:true})}
  case "/rueckblick":case "/rückblick":{await rueckblick();if(!B.rb||!Object.keys(B.rb.pos).length)return send("Noch kein Kaufrückblick möglich. Trag Käufe mit Kaufdatum in der App ein.",{direkt:true});
    return send(`🧭 <b>Kaufrückblick</b>\n\n${RB.text(B.rb,rbName,false)}`,{direkt:true})}
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
    if(n.loss&&ch<=x.a){if(!B.sent[kL]||ch<=B.sent[kL]-5){B.sent[kL]=ch;await send(`🔴 <b>${esc(x.n)}</b> liegt ${sgn(ch)} unter deinem Kaufpreis.\nKurs ${fmt(p)} ${CS(x.s)} · deine Meldegrenze: ${x.a} %${LA(x.s)}`,{dringend:mv<=-10})}}else if(B.sent[kL]&&ch>x.a+2)delete B.sent[kL];
    if(n.gewinn!==false&&x.gs>0){B.peak=B.peak||{};const kp=`${x.s}:${x.k}`,rbH=(B.rb&&B.rb.pos[x.s]&&B.rb.pos[x.s].hoch)||0,hoch=Math.max(B.peak[kp]||0,rbH,p);B.peak[kp]=hoch;
      const kG=`gs:${kp}`,grenze=hoch*(1-x.gs/100);
      if(hoch>x.k&&p<=grenze&&p>x.k*0.98){if(!B.sent[kG]||hoch>B.sent[kG]*1.01){B.sent[kG]=hoch;const gv=(hoch/x.k-1)*100;
        await send(`🟠 <b>Gewinnschutz: ${esc(x.n)}</b>\nDer Kurs ist ${fmt((1-p/hoch)*100,1)} % unter seinen Höchststand seit Kauf (${fmt(hoch)} ${CS(x.s)}) gefallen.\nDein Plus: jetzt ${sgn(ch)}, vorher ${sgn(gv)}.\nKurs ${fmt(p)} ${CS(x.s)} · deine Grenze: ${x.gs} % vom Höchststand`)}}}
    if(n.target&&x.z&&p>=x.z){if(!B.sent[kZ]){B.sent[kZ]=1;await send(`🟢 <b>${esc(x.n)}</b> hat dein Kursziel erreicht!\nKurs ${fmt(p)} ${CS(x.s)} · Ziel ${fmt(x.z)} ${CS(x.s)} · ${sgn(ch)} seit Kauf${LA(x.s)}`)}}else if(B.sent[kZ]&&p<x.z*.98)delete B.sent[kZ];
    if(n.move&&Math.abs(mv)>=n.move&&!B.sent[kM]){B.sent[kM]=1;await send(`⚡ <b>${esc(x.n)}</b> bewegt sich heute stark: ${sgn(mv)}\nKurs ${fmt(p)} ${CS(x.s)}${LA(x.s)}`,{dringend:mv<=-10})}
    if(n.sparplan&&x.tag&&z.day===+x.tag&&z.h>=9&&!B.sent[`spar:${x.s}:${z.ym}`]){B.sent[`spar:${x.s}:${z.ym}`]=1;await send(`💶 Heute ist dein Nachkauf-Tag für <b>${esc(x.n)}</b>.\nAktuell ${fmt(p)} ${CS(x.s)} (${sgn(ch)} seit Kauf).${LA(x.s)}`)}}
  if(n.kh)for(const x of khListe())if(x.due<=Date.now()&&!B.sent[`kh:${x.id}`]){if(leise())break;B.sent[`kh:${x.id}`]=Date.now();await send(`⏰ Bedenkzeit vorbei!\n${khText(x)}\nWillst du es immer noch?${L("warenkorb","Zum Warenkorb")}`,{knoepfe:khKnopf(x)})}
  if(n.kh)for(const x of khListe())if(B.sent[`kh:${x.id}`]>1&&Date.now()-B.sent[`kh:${x.id}`]>48*36e5&&!B.sent[`kh2:${x.id}`]&&!leise()){B.sent[`kh2:${x.id}`]=1;await send(`🛒 Noch offen in deinem Warenkorb:\n${khText(x)}\nKaufen oder lassen?${L("warenkorb","Zum Warenkorb")}`,{knoepfe:khKnopf(x)})}
  {const z2=zeit(),l=khListe();if(n.kh&&z2.wd==="Sun"&&z2.h>=18&&l.length&&B.sent.cartWeek!==z2.date&&!leise()){B.sent.cartWeek=z2.date;await send(`🧺 <b>Dein Warenkorb</b> (${l.length})\n${l.map(x=>`• ${esc(x.n)} · ${fmt(x.p,0)} € · ${x.due<=Date.now()?"Bedenkzeit vorbei":"bis "+new Date(x.due).toLocaleDateString("de-DE")}`).join("\n")}\n\nAlles anzeigen mit /kaufhilfe${L("warenkorb","Zum Warenkorb")}`)}}
  if(n.earnings){const morgen=addDays(z.date,1);for(const e of B.earn.list)if(e.date===morgen&&d.some(x=>x.s===e.symbol)&&!B.sent[`earn:${e.symbol}:${e.date}`]){B.sent[`earn:${e.symbol}:${e.date}`]=1;await send(`📅 Morgen legt <b>${esc(catOf(e.symbol).n||e.symbol)}</b> Quartalszahlen vor. Danach kann der Kurs stark schwanken.${LA(e.symbol)}`)}}
  if(n.model&&U.model&&U.rec&&U.rec!==U.model&&B.sent.model!==U.rec){B.sent.model=U.rec;await send(`💡 Ein anderes Sparmodell könnte jetzt besser passen: <b>${esc(U.recName||U.rec)}</b>.\nAnsehen in der App unter Finanzen → Sparmodell.${L("finanzen-modell","Sparmodell öffnen")}`)}
  if(KI.generated&&KI.generated!==B.lastKi){B.lastKi=KI.generated;if(n.briefing&&KI.telegram)await send(esc(KI.telegram).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>")+L("start","App öffnen"));
    if(n.news)for(const x of (KI.news||[]))if(x.imp>=2&&x.stocks.some(s=>d.some(y=>y.s===s))&&!B.sent[`news:${x.id}`]){B.sent[`news:${x.id}`]=1;await send(`📰 <b>Betrifft dein Depot:</b> ${esc(x.t)}\n${esc(x.sum)}\n<a href="${x.u}">Quelle: ${esc(x.q)}</a>${L("news-"+x.id,"In der App")}`)}
    for(const u of (KI.updates||[]))if(!u.example&&!B.sent[`upd:${u.id}`]){B.sent[`upd:${u.id}`]=1;await send(`📬 <b>Neuer Update-Brief:</b> ${esc(u.title)}\nIn der App unter Aktien → Lern-Updates kannst du ihn übernehmen oder ablehnen.${L("update-"+u.id,"Update-Brief öffnen")}`)}}
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
async function euKurse(zwang){const z=zeit(),heute=z.date;B.hist=B.hist||{};
  const W=kiWahl(),meine=[...new Set([...depot().map(x=>x.s),...(U.watch||[]).map(w=>LEGACY[w]||w),...(KI.stocks||[]).map(x=>x.s),...(W.da?[]:DEFAULT_EU),...W.kurz,...W.wunsch])].filter(Boolean);
  const kern=[...new Set([...MARKT.map(m=>m[0]),...EU_INDEX.map(m=>m[0]),...meine])],alle=[...new Set([...kern,...EXTRA])];
  const neu=alle.filter(s=>!B.hist[s]||B.hist[s].d!==heute),extraFaellig=Date.now()-(B.extraT||0)>=36e5;
  const offen=xetraOffen()||boerseOffen(),faellig=offen||Date.now()-(B.euT||0)>=36e5;
  const krypto=alle.filter(isKrypto);if(!faellig&&!neu.length){for(const s of krypto)await yq(s);await yq("^VIX")}
  if(!faellig&&!neu.length&&!krypto.length&&!zwang)return;
  // Verlauf (3 Monate) einmal am Tag, neue Werte sofort
  for(const s of neu.slice(0,40)){const c=await yq(s,true);if(c&&c.length)B.hist[s]={d:heute,c}}
  if(faellig){for(const s of kern)if(!neu.includes(s))await yq(s);if(extraFaellig){for(const s of EXTRA)if(!kern.includes(s)&&!neu.includes(s))await yq(s);B.extraT=Date.now()}for(const [s] of EU_SECTOR)await yq(s);B.euT=Date.now()}
  if(!B.q["EURUSD=X"])await yq("EURUSD=X");
  for(const s of Object.keys(B.hist))if(!alle.includes(s))delete B.hist[s];
  const pick=l=>l.filter(([s])=>B.q[s]).map(([s,n])=>({s,n,c:B.q[s].c,dp:+(+B.q[s].dp).toFixed(2)}));
  const mit=alle.filter(s=>B.q[s]);
  writeJSON(P(".state/kurse.json"),{t:Date.now(),fx:{EURUSD:fx()},idx:pick(EU_INDEX),sec:pick(EU_SECTOR),
    markt:MARKT.filter(([s])=>B.q[s]).map(([s,n,k])=>({s,n,k})),ki:B.kiExtra||{},rb:B.rb||null,fa:B.kiFragen||{},kiApi:!!API||!!(RURL&&RTOK),kiWeg:API?"api":RURL&&RTOK?"abo":"",
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
  const ki=(KI.stocks||[]).find(x=>x.s===s)||(KI.kurz||[]).find(x=>x.s===s);if(ki&&+ki.warn>0){p+=+ki.warn;gr.push("KI-Nachrichtenlage: "+(ki.warnGrund||"negative Meldungen"))}
  const vix=B.q["^VIX"]&&B.q["^VIX"].c;if(vix>=30){p+=1;gr.push(`Gesamtmarkt sehr nervös (VIX ${fmt(vix,0)})`)}else if(vix>=25&&p>0){gr.push(`Gesamtmarkt nervös (VIX ${fmt(vix,0)})`)}
  return {lv:p>=4?3:p>=2?2:1,p,gr}}
async function fruehwarnungen(){const n=Object.assign({warn:true},U.notify||{});if(!n.warn)return;const z=zeit(),ziele=[...new Set([...depot().map(x=>x.s),...(U.watch||[]).map(w=>LEGACY[w]||w)])];
  for(const s of ziele){const w=fruehwarnung(s);if(!w)continue;const k=`fw:${s}`,alt=B.sent[k]||{lv:1,d:""};
    if(w.lv>=2&&(w.lv>alt.lv||alt.d!==z.date&&w.lv>=3&&alt.lv<3)){B.sent[k]={lv:w.lv,d:z.date};const name=(depot().find(x=>x.s===s)||{}).n||catOf(s).n||s;
      await send(`${w.lv>=3?"🟥":"🟨"} <b>Frühwarnung: ${esc(name)}</b> (${w.lv>=3?"hoch":"erhöht"})\n${w.gr.map(g=>"• "+esc(g)).join("\n")}\n\nKurs ${fmt(priceOf(s)||0)} ${CS(s)}. <i>Kein Verkaufssignal, sondern ein Hinweis, genauer hinzuschauen.</i>${LA(s)}`)}
    else if(w.lv<alt.lv&&alt.d!==z.date)B.sent[k]={lv:w.lv,d:alt.d}}
  const vix=B.q["^VIX"]&&B.q["^VIX"].c,vk=vix>=30?2:vix>=25?1:0;if(vk>(B.sent.vix&&B.sent.vix.d===z.date?B.sent.vix.lv:0)){B.sent.vix={lv:vk,d:z.date};
    await send(`🌡️ <b>Der Markt wird nervös</b>\nDas Angst-Barometer VIX steht bei ${fmt(vix,1)} (normal: unter 20).\nIn solchen Phasen schwanken Aktien stärker. Prüfe, ob dein Depot zu deiner Risikobereitschaft passt.${L("depot","Depot öffnen")}`)}}

/* ---------- Einschätzung auf Anfrage (sofort, nur mit eigenem API-Schlüssel) ---------- */
async function anfrageDaten(s){if(!B.hist||!B.hist[s]){const c=await yq(s,true);if(c&&c.length)(B.hist=B.hist||{})[s]={d:zeit().date,c}}
  const an=B.hist&&B.hist[s]?analyse({s,h:"lang",closes:B.hist[s].c}):null;let news=[];
  if(isUS(s)){try{const t=zeit().date;news=(await fh(`company-news?symbol=${s}&from=${addDays(t,-4)}&to=${t}`)).slice(0,6).map(n=>({t:n.headline,u:n.url,q:n.source,z:(n.summary||"").slice(0,200)}))}catch(e){}}
  else news=(await yNews(s)).slice(0,5).map(n=>({t:n.headline,u:n.url,q:n.source,z:n.summary}));
  const name=(MARKT.find(m=>m[0]===s)||[])[1]||catOf(s).n||s;
  return {name,news,fakten:an?Object.assign({waehrung:curOf(s),kurs:+an.last.toFixed(2),trend:an.dir,vierWochenProzent:+an.ch20.toFixed(1),dreiMonateProzent:+an.ch3m.toFixed(1),schwankungProJahr:+an.vol.toFixed(0),heuteProzent:+moveOf(s).toFixed(2)},prognoseFakten(s,an)):{}}}
/* Ohne eigenen API-Schlüssel: kleine Vorlage ins Repo, dann die Claude-Aufgabe „KI-Anfrage“ direkt anstoßen (läuft über das Claude-Abo). */
const zukunftAus=x=>{const o={};for(const k of ["ausblick","richtung","zuversicht","horizont","halten","muster"])if(typeof x[k]==="string"&&x[k])o[k]=x[k];if(Array.isArray(x.signale))o.signale=x.signale.map(String).slice(0,4);return o};
async function antwortHolen(){if(!B.anfrage)return false;let a=null;
  // Die Claude-Aufgabe darf evtl. nur auf einen eigenen Zweig (claude/…) schreiben, daher dort auch suchen.
  const sh=c=>execSync(`git -C ${ROOT} ${c}`,{stdio:["ignore","pipe","ignore"]}).toString();let zweig="";
  try{sh(`fetch -q --depth 1 origin main "+refs/heads/claude/*:refs/remotes/origin/claude/*"`)}catch(e){try{sh("fetch -q origin main")}catch(e2){return false}}
  let fe="";try{fe=sh("for-each-ref --format='%(refname:short)' refs/remotes/origin/claude")}catch(e){}const refs=["origin/main",...fe.split("\n").filter(Boolean)];
  for(const r of refs){try{const o=JSON.parse(sh(`show ${r}:data/ki-antwort.json`));if(o&&o.id===B.anfrage.id){a=o;if(r!=="origin/main")zweig=r.replace("origin/","");break}}catch(e){}}
  if(!a)return false;
  if(zweig&&!DRY)try{sh(`push -q origin --delete ${zweig}`)}catch(e){log("Zweig",e.message)}B.kiExtra=B.kiExtra||{};const neu=[];
  B.kiFragen=B.kiFragen||{};const fr=[];
  for(const x of (a.items||[]))if(x&&x.qid&&x.antwort){const f=B.anfrage.fragen&&B.anfrage.fragen[x.qid]||{};B.kiFragen[x.qid]={s:x.s||f.s,q:f.q||x.frage||"",art:f.art||"",antwort:String(x.antwort),
    tendenz:["eher halten","eher nicht halten","unentschieden"].includes(x.tendenz)?x.tendenz:undefined,zuversicht:typeof x.zuversicht==="string"?x.zuversicht:undefined,gruende:Array.isArray(x.gruende)?x.gruende.map(String).slice(0,5):undefined,t:Date.now()};fr.push(x.qid)}
  for(const x of (a.items||[]))if(x&&x.s&&x.text&&!x.qid){B.kiExtra[x.s]=Object.assign(zukunftAus(x),{text:String(x.text),h:x.h||"lang",warn:+x.warn||0,quellen:Array.isArray(x.quellen)?x.quellen.filter(q=>q&&q.u).slice(0,6):[],t:Date.now()});neu.push(x.s)}
  B.anfrage=null;B.kursePush=true;delete B.err.ki;log("KI-Anfrage beantwortet",neu.join(","));
  for(const id of fr){const f=B.kiFragen[id],name=(MARKT.find(m=>m[0]===f.s)||[])[1]||catOf(f.s).n||f.s;await send(`💬 <b>${esc(name)}: ${esc(f.q)}</b>${f.tendenz?`\nTendenz: <b>${esc(f.tendenz)}</b>`:""}\n${esc(f.antwort)}\n\nIn der App mit Begründung.${LA(f.s,"Antwort in der App")}`,{direkt:true})}
  for(const s of neu){const name=(MARKT.find(m=>m[0]===s)||[])[1]||catOf(s).n||s;await send(`🧠 <b>Einschätzung da: ${esc(name)}</b>\n${esc(B.kiExtra[s].text)}\n\nIn der App mit Quellen.${LA(s,"Einschätzung öffnen")}`,{direkt:true})}
  return true}
async function anfrageRoutine(){B.kiExtra=B.kiExtra||{};B.wunschDone=B.wunschDone||{};
  for(const s of Object.keys(B.kiExtra))if(Date.now()-B.kiExtra[s].t>3*864e5)delete B.kiExtra[s];
  B.fragenDone=B.fragenDone||{};B.kiFragen=B.kiFragen||{};for(const id of Object.keys(B.kiFragen))if(Date.now()-B.kiFragen[id].t>14*864e5)delete B.kiFragen[id];
  if(B.anfrage&&Date.now()-B.anfrage.t>25*6e4){(B.anfrage.syms||[]).forEach(s=>delete B.wunschDone[s]);Object.keys(B.anfrage.fragen||{}).forEach(id=>delete B.fragenDone[id]);B.err.ki="Claude-Aufgabe hat nicht geantwortet, neuer Versuch";B.anfrage=null}
  if(await antwortHolen())await euKurse(true);if(B.anfrage)return;
  const neuAngefragt=s=>((U.wunschT||{})[s]||0)>(B.wunschDone[s]||0);
  const offen=kiWahl().wunsch.filter(s=>!B.wunschDone[s]||neuAngefragt(s)||Date.now()-B.wunschDone[s]>864e5).slice(0,5);
  const fragen=Object.entries(U.fragen||{}).filter(([q,f])=>f&&f.s&&f.q&&!B.fragenDone[q]&&!B.kiFragen[q]&&Date.now()-f.t<2*864e5).slice(0,5);
  if(!offen.length&&!fragen.length)return;
  const id="a"+Date.now().toString(36),items=[];
  for(const s of offen){const d=await anfrageDaten(s);items.push({s,n:d.name,_fakten:d.fakten,_meldungen:d.news,
    text:F("2 kurze Sätze zur aktuellen Lage (bei Indizes/VIX/Wechselkurs: was die Bewegung bedeutet). Sachlich"),
    h:F('"kurz", "lang", "spekulativ" oder "nicht kaufbar"'),warn:F("Zahl 0–3: 0 ruhig, 3 deutliche Warnzeichen"),...ZUKUNFT(),quellen:F("Liste {t,u} der genutzten Meldungen aus _meldungen oder leere Liste")})}
  for(const [qid,f] of fragen){const d=await anfrageDaten(f.s),st=(KI.stocks||[]).find(x=>x.s===f.s),ex=B.kiExtra[f.s]||(KI.kurz||[]).find(x=>x.s===f.s)||{};
    const it={qid,s:f.s,n:d.name,frage:f.q,_fakten:d.fakten,_meldungen:d.news,_bisherigeEinschaetzung:st?{why:st.why,ausblick:st.ausblick,richtung:st.richtung,halten:st.halten,pro:st.pro,con:st.con}:{text:ex.text,ausblick:ex.ausblick,richtung:ex.richtung,halten:ex.halten},
      antwort:F(f.art==="halten"?"3–5 Sätze: Begründung der Tendenz. Bezieht Ausblick, Risiko (Schwankung), Prognose-Korridor, Meldungen und, falls vorhanden, _fakten.depot (Kaufkurs, Gewinn/Verlust) und _fakten.anlegerTyp ein. Ehrlich mit Unsicherheit; sag, für welchen Zeitraum die Tendenz gilt":"3–5 Sätze: direkte, verständliche Antwort auf frage, nur aus _fakten, _meldungen und _bisherigeEinschaetzung. Wenn die Daten es nicht hergeben, das offen sagen")};
    if(f.art==="halten")Object.assign(it,{tendenz:F('"eher halten", "eher nicht halten" oder "unentschieden": deine begründete Tendenz, ob es sich lohnt, investiert zu bleiben (bzw. bei nicht gehaltenen Werten: ob ein Einstieg zum Zeitraum passt)'),zuversicht:F('"niedrig", "mittel" oder "hoch"'),gruende:F("Liste mit 2–4 kurzen Gründen, gern dafür und dagegen")});
    items.push(it)}
  writeJSON(P("data/ki-anfrage.json"),{id,erstellt:new Date().toISOString(),_anleitung:"Nur die §FILL…§-Platzhalter in items ersetzen, Quellen sind nur _fakten und _meldungen. Danach Felder mit _ löschen und alle übrigen Felder als data/ki-antwort.json speichern.",items});
  if(DRY){log("DRY KI-Anfrage",offen.join(","));return}
  try{execSync(`git -C ${ROOT} add data/ki-anfrage.json && git -C ${ROOT} -c user.name="Wachmann" -c user.email="wachmann@users.noreply.github.com" commit -q -m "KI-Anfrage ${id}" -- data/ki-anfrage.json && git -C ${ROOT} pull -q --rebase -X theirs --autostash && git -C ${ROOT} push -q`,{stdio:"inherit"})}
  catch(e){B.err.ki="KI-Anfrage nicht hochgeladen: "+e.message.slice(0,80);return}
  try{const r=await fetch(RURL,{method:"POST",headers:{Authorization:`Bearer ${RTOK}`,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({text:`KI-Anfrage ${id}: ${[...offen,...fragen.map(([,f])=>f.s+" (Frage)")].join(", ")}\n\nWichtig, ergänzt zur Anleitung: In data/ki-antwort.json pro Eintrag ALLE ausgefüllten Felder übernehmen (z. B. qid, s, text, antwort, tendenz, gruende, ausblick, richtung, zuversicht, horizont, halten, signale, h, warn, quellen), nicht nur s, text, h, warn, quellen. Einträge mit qid sind Rückfragen des Nutzers: frage direkt beantworten; bei tendenz ist eine begründete Tendenz ausdrücklich gewünscht. Der Blick nach vorn ist der wichtigste Teil: ehrlich mit Unsicherheit, als Abwägung, keine Anweisung zum Kaufen oder Verkaufen.`})});
    if(!r.ok)throw new Error("Claude-Aufgabe "+r.status+" "+(await r.text()).slice(0,80));
    B.anfrage={id,t:Date.now(),syms:offen,fragen:Object.fromEntries(fragen.map(([q,f])=>[q,{s:f.s,q:f.q,art:f.art}]))};offen.forEach(s=>B.wunschDone[s]=Date.now());fragen.forEach(([q])=>B.fragenDone[q]=Date.now());delete B.err.ki;log("KI-Anfrage gestartet",id,offen.join(","))}
  catch(e){B.err.ki=e.message.slice(0,120);log("KI-Anfrage",e.message)}}
async function aufAnfrage(){if(!API){if(RURL&&RTOK)await anfrageRoutine();return}B.kiExtra=B.kiExtra||{};B.wunschDone=B.wunschDone||{};
  for(const s of Object.keys(B.kiExtra))if(Date.now()-B.kiExtra[s].t>3*864e5)delete B.kiExtra[s];
  const offen=kiWahl().wunsch.filter(s=>!B.wunschDone[s]||Date.now()-B.wunschDone[s]>864e5).slice(0,3);
  for(const s of offen){B.wunschDone[s]=Date.now();if(!B.hist||!B.hist[s]){const c=await yq(s,true);if(c&&c.length)(B.hist=B.hist||{})[s]={d:zeit().date,c}}
    const an=B.hist&&B.hist[s]?analyse({s,h:"lang",closes:B.hist[s].c}):null;let news=[];
    if(isUS(s)){try{const t=zeit().date;news=(await fh(`company-news?symbol=${s}&from=${addDays(t,-4)}&to=${t}`)).slice(0,6).map(n=>({t:n.headline,u:n.url,q:n.source,z:(n.summary||"").slice(0,200)}))}catch(e){}}
    else news=(await yNews(s)).slice(0,5).map(n=>({t:n.headline,u:n.url,q:n.source,z:n.summary}));
    const name=(MARKT.find(m=>m[0]===s)||[])[1]||catOf(s).n||s;
    const prompt=`Du schreibst für eine private Finanz-App eine kurze Einschätzung auf Deutsch. Wert: ${name} (${s}).\nKursfakten: ${JSON.stringify(an?{waehrung:curOf(s),kurs:+an.last.toFixed(2),trend:an.dir,vierWochenProzent:+an.ch20.toFixed(1),dreiMonateProzent:+an.ch3m.toFixed(1),schwankungProJahr:+an.vol.toFixed(0),heuteProzent:+moveOf(s).toFixed(2)}:{})}\nMeldungen: ${JSON.stringify(news)}\nNutze NUR diese Fakten und Meldungen. Keine Kauf- oder Verkaufsempfehlung. Antworte nur mit JSON: {"text":"2 kurze Sätze zur aktuellen Lage","ausblick":"2–3 Sätze, wie es wahrscheinlich weitergeht und warum","richtung":"steigend"|"seitwärts"|"fallend","zuversicht":"niedrig"|"mittel"|"hoch","horizont":"z. B. 4–8 Wochen","halten":"1–2 Sätze Abwägung, für welchen Zeitraum der Wert eher passt","signale":["2–3 Punkte, woran man eine Wende erkennt"],"h":"kurz"|"lang"|"spekulativ"|"nicht kaufbar","warn":0-3,"quellen":[{"t":"Titel","u":"Link"} der genutzten Meldungen]}`;
    try{const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":API,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model:E.KI_MODELL||"claude-haiku-5-5",max_tokens:500,messages:[{role:"user",content:prompt}]})});
      const j=await r.json();if(!r.ok)throw new Error((j.error&&j.error.message)||("API "+r.status));const txt=(j.content||[]).map(c=>c.text||"").join("");const o=JSON.parse(txt.slice(txt.indexOf("{"),txt.lastIndexOf("}")+1));
      B.kiExtra[s]={...zukunftAus(o),text:String(o.text||""),h:o.h||"lang",warn:+o.warn||0,quellen:Array.isArray(o.quellen)?o.quellen.filter(q=>q&&q.u).slice(0,6):[],t:Date.now()};B.kursePush=true;delete B.err.ki;
      await send(`🧠 <b>Einschätzung da: ${esc(name)}</b>\n${esc(B.kiExtra[s].text)}\n\nIn der App mit Quellen.${LA(s,"Einschätzung öffnen")}`,{direkt:true})}catch(e){B.err.ki=e.message.slice(0,120);log("KI",e.message)}}
  if(offen.length)await euKurse(true)}

/* ---------- Kaufrückblick ---------- */
async function rueckblick(){B.serien=B.serien||{};const heute=zeit().date,syms=[...new Set([...depot().map(x=>x.s),...(U.trades||[]).map(t=>LEGACY[t.s]||t.s),"EUNL.DE"])];
  for(const s of syms)if(!B.serien[s]||B.serien[s].d!==heute){const x=await RB.serie(s);if(x)B.serien[s]=x}
  for(const s of Object.keys(B.serien))if(!syms.includes(s))delete B.serien[s];
  try{B.rb=RB.bewerte({depot:depot(),trades:(U.trades||[]).map(t=>Object.assign({},t,{s:LEGACY[t.s]||t.s})),serien:B.serien,hist:B.hist||{},preis:priceOf,warn:fruehwarnung,daempfung:params().trendDamping||.5})}catch(e){log("Rückblick",e.message)}}
const rbName=s=>(depot().find(x=>x.s===s)||{}).n||catOf(s).n||s;

/* ---------- Abend-Rückblick um 21 Uhr (ohne KI) ---------- */
async function abendRueckblick(){const z=zeit(),n=U.notify||{};if((!E.FORCE_ABEND&&(z.h<21||z.h>=22))||B.sent.abend===z.date||n.briefing===false||!CHAT)return;B.sent.abend=z.date;
  const d=depot();for(const x of d)await frisch(x.s);for(const [s] of INDEX_ETF)await quote(s);for(const [s] of EU_INDEX.slice(0,2))await yq(s);await yq("EURUSD=X");
  const zeilen=[],mit=d.filter(x=>priceOf(x.s)&&!x.test);let tot=0,cost=0,heute=0;
  for(const x of mit){const p=priceOf(x.s),mv=moveOf(x.s);tot+=toEUR(p*x.q,x.s);cost+=toEUR(x.k*x.q,x.s);heute+=toEUR(p*x.q*(1-1/(1+mv/100)),x.s);zeilen.push(`${mv>=0?"🟢":"🔴"} ${esc(x.n)}: heute ${sgn(mv)} · seit Kauf ${sgn((p/x.k-1)*100)}`)}
  const morgen=addDays(z.date,1),termine=B.earn.list.filter(e=>e.date===morgen).map(e=>`Quartalszahlen ${esc(catOf(e.symbol).n||e.symbol)}`);
  for(const x of d)if(x.tag&&+morgen.slice(8)===+x.tag)termine.push(`Nachkauf-Tag ${esc(x.n)}`);
  const kh=khListe(),faellig=kh.filter(x=>x.due<=Date.now()+864e5);
  const markt=[...EU_INDEX.slice(0,2),...INDEX_ETF].filter(([s])=>B.q[s]).map(([s,n])=>`${n} ${sgn(B.q[s].dp)}`).join(" · ");
  await rueckblick();const rbT=B.rb&&Object.keys(B.rb.pos).length?`🧭 <b>Deine Entscheidungen</b>\n${RB.text(B.rb,rbName,z.wd!=="Sun")}\n\n`:"";
  await send(`🌙 <b>Dein Abend-Rückblick</b>${markt?`\n${markt}`:""}\n\n${mit.length?`<b>Depot heute: ${heute>=0?"+":""}${fmt(heute)} €</b> (gesamt ${fmt(tot)} €, ${sgn((tot/cost-1)*100)} seit Kauf)\n${zeilen.join("\n")}`:"Noch keine Aktien im Depot übertragen."}${mit.length>1?`\n\nBester: ${esc(mit.slice().sort((a,b)=>moveOf(b.s)-moveOf(a.s))[0].n)} · Schwächster: ${esc(mit.slice().sort((a,b)=>moveOf(a.s)-moveOf(b.s))[0].n)}`:""}\n\n<b>Morgen:</b> ${termine.length?termine.join(", "):"keine besonderen Termine bei deinen Aktien"}${kh.length?`\n\n🧺 Warenkorb: ${kh.length} Ding${kh.length>1?"e":""}${faellig.length?`, davon ${faellig.length} bald fällig (${faellig.map(x=>esc(x.n)).join(", ")})`:""}`:""}\n\n${rbT}Die US-Börse schließt um 22 Uhr. Gute Nacht! 😴${L("depot","Depot öffnen")}`)}

/* ---------- Vorlage für Claude (3x täglich) ---------- */
const F=s=>`§FILL: ${s}§`;
// Blick nach vorn: für jede Einschätzung (ausführlich, kurz, auf Anfrage)
const ZUKUNFT=()=>({ausblick:F("2–3 Sätze: wie es in den nächsten Wochen bis Monaten am wahrscheinlichsten weitergeht und warum (Treiber, anstehende Termine, was _fakten.prognose sagt). Ehrlich mit der Unsicherheit"),
  richtung:F('"steigend", "seitwärts" oder "fallend": die wahrscheinlichste Richtung im Zeitraum horizont'),
  zuversicht:F('"niedrig", "mittel" oder "hoch": wie sicher diese Richtung ist (bei starken Schwankungen oder widersprüchlichen Meldungen eher niedrig)'),
  horizont:F('Zeitraum, für den der Ausblick gilt, z. B. "4–8 Wochen" oder "6–12 Monate"'),
  halten:F("1–2 Sätze Abwägung: Was spricht dafür, investiert zu bleiben, und für welchen Zeitraum passt dieser Wert eher (kurz, mittel, lang), was dagegen. Wenn _fakten.depot vorhanden ist, darauf eingehen. Keine Anweisung zum Kaufen oder Verkaufen, sondern Gründe zum Abwägen"),
  signale:F("Liste mit 2–3 kurzen Punkten: woran man merkt, dass sich das Bild ändert (z. B. Kurs unter einer Marke aus _fakten.prognose, ein Termin, eine Meldungslage)"),
  muster:F("1–2 Sätze: was die erkannten Muster (_fakten.muster) und Zusammenhänge (_fakten.zusammenhaenge, z. B. Öl, Dollar, Gesamtmarkt) für diesen Wert bedeuten könnten. Ausdrücklich als unsicher kennzeichnen. Leerer Text, wenn es keine gibt")});
const prognoseFakten=(s,an)=>{if(!an)return {};const d=depot().find(x=>x.s===s),o={prognose:{tage:an.H,von:+an.lo.toFixed(2),mitte:+an.mid.toFixed(2),bis:+an.hi.toFixed(2),zusammensetzung:an.teile.map(t=>({teil:t.name,prozent:+t.pct.toFixed(1),vorsicht:t.vorsicht||undefined})),hinweis:"mitte ist rein rechnerisch; Teile mit vorsicht (Muster, Marktumfeld) sind unsicher"},muster:an.muster.map(m=>m.name+": "+m.info),zusammenhaenge:an.zus.map(b=>`${b.n}: Gleichlauf ${b.korr}, Beta ${b.beta}`),anlegerTyp:U.investor||""};
  if(d&&priceOf(s))o.depot={kaufkurs:d.k,seitKaufProzent:+((priceOf(s)/d.k-1)*100).toFixed(1),seit:d.d?new Date(d.d).toISOString().slice(0,10):""};return o};
function prognoseCheck(){const pf=P("data/prognosen.json"),log0=readJSON(pf,[]),heute=zeit().date;
  for(const e of log0)if(!e.ok&&e.bis<=heute){const p=priceOf(e.s)||((KI.stocks||[]).find(x=>x.s===e.s)||{closes:[]}).closes[0];if(p){e.ist=p;e.ok=p>=e.lo&&p<=e.hi?1:-1}}
  for(const st of (KI.stocks||[])){const a=analyse(st);if(a&&!log0.some(e=>e.s===st.s&&e.d===heute))log0.push({d:heute,s:st.s,lo:+a.lo.toFixed(2),hi:+a.hi.toFixed(2),start:+a.last.toFixed(4),roh:a.roh,bis:addDays(heute,Math.round(a.H*1.4))})}
  const fertig=log0.filter(e=>e.ok).slice(-120);writeJSON(pf,log0.filter(e=>!e.ok||fertig.includes(e)).slice(-600));changed.add("data/prognosen.json");
  const sig=k=>{const l=fertig.filter(e=>e.roh&&e.start&&e.ist&&Math.abs(e.roh[k]||0)>0);return {anzahl:l.length,richtungRichtigProzent:l.length?Math.round(l.filter(e=>Math.sign(e.roh[k])===Math.sign(e.ist-e.start)).length/l.length*100):null}};
  return {nurInfoTeile:{gegenbewegung:sig("rueck"),muster:sig("muster"),marktumfeld:sig("markt"),regel:"Erst ab 20 Fällen und über 55 % richtiger Richtung einen Vorschlag machen"},ausgewertet:fertig.length,treffer:fertig.filter(e=>e.ok===1).length,quote:fertig.length?Math.round(fertig.filter(e=>e.ok===1).length/fertig.length*100):null,soll:68}}
async function vorlage(slot){delete B.err.alphavantage;const z=zeit(),prev=KI,d=depot(),W=kiWahl(),watch=W.da?[...new Set([...d.map(x=>x.s),...W.voll])].slice(0,20):[...new Set([...(prev.stocks||[]).map(s=>s.s),...d.map(x=>x.s),...(U.watch||[]).map(w=>LEGACY[w]||w),...DEFAULT_EU])].slice(0,18);
  for(const s of watch)if(isUS(s))await quote(s);for(const [s] of [...INDEX_ETF,...SECTOR_ETF])await quote(s);for(const [s] of [...EU_INDEX,...EU_SECTOR])await yq(s);
  const stocks=[];for(const s of watch){const alt=(prev.stocks||[]).find(x=>x.s===s);let closes=alt&&alt.closes;
    if(slot==="morgen"||!closes){let c=await yq(s,true);if(!c||c.length<25){c=await avDaily(avSym(s));await sleep(E.DRY==="1"?0:1500)}if(c&&c.length>=25)closes=c}
    if(!closes)continue;const neu=slot==="morgen"||!alt,base={s,n:catOf(s).n||(alt&&alt.n)||s,closes,cur:curOf(s)};
    const an=analyse(Object.assign({},alt||{},base));
    stocks.push(neu?Object.assign(base,{cat:alt&&alt.cat||F("Branche in 1–3 Wörtern"),h:F('"kurz" oder "lang"'),bias:F("Zahl −3 bis +3: Wirkung der heutigen Nachrichten auf den Kurs in %"),
      why:F("2–3 Sätze zur aktuellen Lage, sachlich"),...ZUKUNFT(),pro:F("Liste mit 1–3 kurzen Punkten dafür"),con:F("Liste mit 1–3 kurzen Punkten dagegen"),news:F("Liste der news-ids, die diese Aktie betreffen"),warn:F("Zahl 0–3: Gefahr aus der Nachrichtenlage (0 = nichts Besonderes, 1 = leicht negativ, 2 = deutlich negativ, 3 = ernst, z. B. Gewinnwarnung, Klage, angekündigte Kürzungen)"),warnGrund:F("1 kurzer Satz zum Warn-Grund oder leerer Text"),quellen:F("Liste {t,u} der Meldungen aus _rohnews, auf die sich why/pro/con/warn stützen (Titel und Link übernehmen). Leere Liste, wenn nur Kursdaten genutzt wurden"),
      _fakten:an?Object.assign({waehrung:curOf(s),region:isEU(s)?"Europa":"USA",trend:an.dir,vierWochen:+an.ch20.toFixed(1),dreiMonate:+an.ch3m.toFixed(1),schwankung:+an.vol.toFixed(0),heute:+moveOf(s).toFixed(2)},prognoseFakten(s,an)):{}}):Object.assign({},alt,{closes}))}
  B.hist=B.hist||{};for(const x of (W.da?[...W.kurz,...W.wunsch]:MARKT.map(m=>m[0])))if(!B.hist[x]){const c=await yq(x,true);if(c&&c.length)B.hist[x]={d:z.date,c}}
  const bis=z.date,von=addDays(bis,slot==="morgen"?-1:0),roh=[],seen=new Set();
  const add=(n,sym)=>{const k=(n.headline||"").toLowerCase().slice(0,60);if(!n.headline||seen.has(k))return;seen.add(k);roh.push({id:`n${n.id||roh.length}`,t:n.headline,q:n.source,u:n.url,sym:sym?[sym]:(n.related||"").split(",").filter(Boolean).slice(0,3),z:(n.summary||"").slice(0,220)})};
  for(const s of watch.filter(isEU))(await yNews(s)).forEach(n=>add(n,s));
  if(slot==="morgen")for(const s of ["^GDAXI","^GSPC","^STOXX50E","GC=F","BZ=F","BTC-EUR","EURUSD=X"])(await yNews(s)).slice(0,2).forEach(n=>add(n,s));
  for(const s of watch.filter(isUS)){try{(await fh(`company-news?symbol=${s}&from=${von}&to=${bis}`)).slice(0,2).forEach(n=>add(n,s))}catch(e){}}
  try{(await fh("news?category=general")).slice(0,8).forEach(n=>add(n))}catch(e){}
  if(B.earn.date!==z.date){try{const r=await fh(`calendar/earnings?from=${z.date}&to=${addDays(z.date,14)}`);B.earn={date:z.date,list:(r.earningsCalendar||[]).filter(e=>watch.includes(e.symbol))}}catch(e){}}
  const cal={};B.earn.list.forEach(e=>{const k=new Date(e.date+"T12:00:00Z").toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"});(cal[k]=cal[k]||[]).push(`Quartalszahlen: ${catOf(e.symbol).n||e.symbol}`)});
  const sonntag=z.wd==="Sun"&&slot==="mittag",lern=slot==="morgen"||sonntag?prognoseCheck():null;
  const v={version:2,generated:F("aktuelle Uhrzeit als ISO-Zeitstempel mit +01:00 bzw. +02:00"),dataAsOf:z.date,_slot:slot,
    _anleitung:"Ersetze jeden §FILL…§-Platzhalter durch passenden Inhalt im richtigen JSON-Typ (Text, Zahl oder Liste). Alles andere unverändert lassen. Felder mit _ am Anfang danach löschen. Deutsch, kurz, sachlich, in eigenen Worten. Blick nach vorn ehrlich mit Unsicherheit, als Abwägung, keine Anweisungen zum Kaufen oder Verkaufen.",
    indices:[...EU_INDEX.filter(([s])=>B.q[s]).map(([s,n])=>({n,v:B.q[s].c,c:+(+B.q[s].dp).toFixed(2),s:"Europa"})),...INDEX_ETF.filter(([s])=>B.q[s]).map(([s,n])=>({n,v:B.q[s].c,c:+B.q[s].dp.toFixed(2),s:`USA, über ${s}`}))],
    sectors:[...EU_SECTOR.filter(([s])=>B.q[s]).map(([s,n])=>({n,c:+(+B.q[s].dp).toFixed(2),p:"Europa"})),...SECTOR_ETF.filter(([s])=>B.q[s]).map(([s,n])=>({n,c:+B.q[s].dp.toFixed(2),p:"USA"}))],
    calendar:Object.entries(cal).map(([day,items])=>({day,items})),stocks,
    news:slot==="morgen"?F("Liste der 4–8 wichtigsten Meldungen aus _rohnews im Format {id,imp(1-3),kind:[Text,\"down\"|\"up\"|\"warn\"|\"\"],cat,t,sum(1 Satz),body:[1-3 Absätze],back(\"Rückblick: …\" oder \"Wirkt jetzt: …\" oder \"Wirkt bald: …\"),stocks:[Kürzel],u,q}")
      :Object.assign([],prev.news||[]),
    _news_hinweis:slot==="morgen"?undefined:"Behalte die news-Liste. Ergänze nur wirklich neue wichtige Meldungen aus _rohnews im selben Format, höchstens 10 insgesamt (älteste raus).",
    _rohnews:roh.slice(0,42),
    telegram:F(slot==="morgen"?"Morgen-Briefing für Telegram, höchstens 8 kurze Zeilen: Lage, wichtigste 2–3 Meldungen, was heute ansteht, auffällige Bewegungen bei den beobachteten Aktien. **fett** erlaubt."
      :slot==="mittag"?"Kurzes Mittags-Update, höchstens 4 Zeilen: nur was sich seit dem Morgen geändert hat."
      :"Abend-Rückblick, höchstens 6 Zeilen: wie lief der Tag, wie die Depot-Aktien, was morgen ansteht."+(sonntag?" Danach 3 Zeilen Wochenfazit.":"")),
    kurz:(()=>{const name=x=>(MARKT.find(m=>m[0]===x)||[])[1]||catOf(x).n||x,art=x=>(MARKT.find(m=>m[0]===x)||[,,"etf"])[2];
      const alt=(prev.kurz||[]).filter(k=>!stocks.some(st=>st.s===k.s));
      let ziel=W.da?[...new Set([...W.kurz,...W.wunsch])]:MARKT.map(m=>m[0]);ziel=ziel.filter(x=>!stocks.some(st=>st.s===x)&&B.hist&&B.hist[x]);
      const neu=slot==="morgen"?ziel:ziel.filter(x=>!alt.some(k=>k.s===x)||(W.wunsch.includes(x)&&!(B.kiExtra||{})[x]));
      const behalten=alt.filter(k=>ziel.includes(k.s)&&!neu.includes(k.s));
      return [...behalten,...neu.map(x=>{const k=art(x),an=analyse({s:x,h:"lang",closes:B.hist[x].c});
        return {s:x,n:name(x),_fakten:an?{art:k.split(":")[0],gruppe:k.includes(":")?k.split(":")[1]:"",waehrung:curOf(x),trend:an.dir,vierWochen:+an.ch20.toFixed(1),dreiMonate:+an.ch3m.toFixed(1),schwankung:+an.vol.toFixed(0),heute:+moveOf(x).toFixed(2),...prognoseFakten(x,an)}:{},
          text:F("2 kurze Sätze zur aktuellen Lage (bei Indizes/VIX/Wechselkurs: was die Bewegung bedeutet). Sachlich"),
          h:F('"kurz", "lang", "spekulativ" oder "nicht kaufbar"'),warn:F("Zahl 0–3 wie bei stocks"),...ZUKUNFT(),quellen:F("Liste {t,u} genutzter Meldungen aus _rohnews oder leere Liste")}})]})(),
    model:prev.model||{trendDamping:.5,bandFactor:1,newsWeight:1},updates:(prev.updates||[]).filter(u=>!u.example).slice(-10),catalog:prev.catalog||[],
    _lernen:sonntag?Object.assign({},lern,{aktuelleParameter:params(),aufgabe:"Wenn die Trefferquote deutlich (mehr als 10 Punkte) vom Soll abweicht und mindestens 20 Prognosen ausgewertet sind: füge in updates EINEN Vorschlag hinzu {id:\"u-DATUM\",date,title,what,why,how,change:{bandFactor oder trendDamping oder newsWeight oder baseWeight (Langfrist-Durchschnitt) oder reversion (Gegenbewegung, sinnvoller Startwert 0.15) oder musterWeight (Muster, Startwert 1) oder marktWeight (Marktumfeld, Startwert 0.3)}}. Kleine Schritte (±10 %); reversion, musterWeight und marktWeight stehen anfangs auf 0 (nur Info) und dürfen nur vorgeschlagen werden, wenn die ausgewerteten Prognosen zeigen, dass ihre Richtung öfter stimmte als nicht. Sonst nichts hinzufügen."}):undefined};
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
  await rueckblick();await euKurse();await aufAnfrage();await alarme();await fruehwarnungen();await abendRueckblick();await warteschlange();
  // Danach noch eine Weile auf Telegram-Befehle lauschen, damit Antworten sofort kommen
  const ende=Date.now()+(E.POLL_SEK!==undefined?+E.POLL_SEK:110)*1000,kiEnde=B.anfrage&&!API?Date.now()+330*1000:0;
  while(Date.now()<Math.max(ende,kiEnde)-26000){if(TG&&CHAT)await telegramEingang(25);else await sleep(25000);if(B.anfrage&&await antwortHolen())await euKurse(true);await warteschlange();if(!(TG&&CHAT)&&!B.anfrage)break}await sichern();log("fertig",{slot,depot:depot().length,fehler:B.err})}
if(import.meta.url===`file://${process.argv[1]}`)main().catch(e=>{console.error(e);process.exit(1)});
