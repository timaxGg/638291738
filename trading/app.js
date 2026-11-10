"use strict";
/* Trading-Signale: zweite App neben dem Ki Aktien Helfer.
   Signale und Trefferquoten berechnet der Wachmann (bot/signale.mjs) und legt sie in kurse.json (Zweig „kurse“).
   Hier: anzeigen, Kurse live nachführen (Krypto über Binance, US über Finnhub, EU aus kurse.json).
   Einstellungen der Haupt-App (Speicher „kah“) werden nur gelesen, nie geändert. */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const KL={alle:"Alle",us:"US-Aktien",eu:"EU-Aktien",krypto:"Krypto",etf:"ETFs",idx:"Indizes"};
const KL1={us:"US-Aktie",eu:"EU-Aktie",krypto:"Krypto",etf:"ETF",idx:"Index"};
const CS={EUR:"€",USD:"$",GBp:"p",GBP:"£",CHF:"CHF"};
const RICHT={"1":"Kauf","-1":"Verkauf"};
let MAIN={};try{MAIN=JSON.parse(localStorage.getItem("kah")||"{}")||{}}catch(e){}
const SET=MAIN.settings||{};
let P={tab:"signale",f:"alle"};try{Object.assign(P,JSON.parse(localStorage.getItem("kah-trading")||"{}"))}catch(e){}
const saveP=()=>{try{localStorage.setItem("kah-trading",JSON.stringify(P))}catch(e){}};
let D=null,KQ={},LIVE={},stand=0,ladeFehler="",offenS=null;
const STAT={krypto:"aus",us:"aus"};

/* ---------- Format ---------- */
const nf=(v,d)=>(+v).toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
const dez=v=>{v=+v;return nf(v,v>=1?2:v>=.01?4:6)};
const pz=(v,d=1)=>v==null||!isFinite(v)?"–":(v>0?"+":v<0?"−":"±")+nf(Math.abs(v),d)+" %";
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const tag=d=>d?new Date(d+"T12:00:00Z").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"}):"";
const uhr=t=>new Date(t).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
const vor=t=>{const m=Math.round((Date.now()-t)/6e4);return m<1?"gerade eben":m<60?`vor ${m} Min.`:m<1440?`vor ${Math.round(m/60)} Std.`:`vor ${Math.round(m/1440)} Tagen`};
const cs=w=>w.k==="idx"?"Pkt.":CS[w.cur]||w.cur||"";
const toast=t=>{const e=$("#toast");e.textContent=t;e.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("on"),3200)};

/* ---------- Kurse ---------- */
function repo(){let r=SET.ghRepo;if(!r&&/github\.io$/.test(location.hostname))r=location.hostname.split(".")[0]+"/"+location.pathname.split("/")[1];return r||""}
const kurseUrl=()=>repo()?`https://raw.githubusercontent.com/${repo()}/kurse/kurse.json?t=${Math.floor(Date.now()/6e4)}`:null;
// bester bekannter Kurs: live (Websocket/Finnhub), kurse.json oder Stand der Signal-Berechnung, jeweils der neueste
function kurs(w){const c=[{p:w.p,t:w.mt||0,src:"sig"}];const q=KQ[w.s];if(q&&q.c)c.push({p:q.c,t:q.t||0,src:"kurse"});const l=LIVE[w.s];if(l)c.push(l);
  return c.sort((a,b)=>b.t-a.t)[0]}
function quelle(w,k){if(k.src==="Binance"||k.src==="Coinbase")return "live";if(k.src==="Finnhub")return Date.now()-k.t<12e4?"live":vor(k.t);
  return (w.k==="eu"||(w.k==="idx"&&/^\^(GDAXI|STOXX50E|MDAXI)/.test(w.s))||(w.k==="etf"&&/\./.test(w.s))?"ca. 15 Min. verzögert · ":"")+(k.t?vor(k.t):"")}
const dpVon=(w,p)=>{const prev=w.p/(1+(w.dp||0)/100);return (p/prev-1)*100};

async function laden(still){const u=kurseUrl();if(!u){ladeFehler="repo";render();return}
  try{const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);const k=await r.json();KQ=k.q||{};
    if(k.sig&&k.sig.werte){const neu=!D||D.t!==k.sig.t;D=k.sig;stand=k.sig.t;ladeFehler="";if(neu||!still)render();else flush(true);verbinden()}
    else{ladeFehler="leer";render()}}
  catch(e){ladeFehler="netz";if(!D)render();status()}}

/* ---------- Live: Krypto über Binance (Ersatz: Coinbase), US über Finnhub ---------- */
let wsB=null,wsBn=0,wsC=null,wsF=null,wsFn=0,fhRest=0;
function setLive(s,p,src,t=Date.now()){if(!(p>0))return;const alt=LIVE[s];LIVE[s]={p,t,src,alt:alt&&alt.p};dirty.add(s);if(!flush.r)flush.r=requestAnimationFrame(()=>{flush.r=0;flush()})}
function verbinden(){if(!D)return;kryptoLive();usLive()}
function kryptoLive(){const sy=D.werte.filter(w=>w.k==="krypto"&&/-EUR$/.test(w.s)).map(w=>w.s);if(!sy.length||wsB||wsC)return;
  if(wsBn>3)return coinbase(sy);
  try{wsB=new WebSocket("wss://stream.binance.com:9443/stream?streams="+sy.map(s=>s.replace("-","").toLowerCase()+"@miniTicker").join("/"))}catch(e){wsBn=9;return coinbase(sy)}
  wsB.onopen=()=>{wsBn=0;STAT.krypto="Binance";chips()};
  wsB.onmessage=e=>{try{const m=JSON.parse(e.data).data;if(m&&m.s)setLive(m.s.replace(/EUR$/,"-EUR"),+m.c,"Binance",m.E||Date.now())}catch(_){}};
  wsB.onclose=()=>{wsB=null;STAT.krypto="aus";chips();if(document.hidden)return;wsBn++;setTimeout(kryptoLive,Math.min(3e4,2e3*wsBn))}}
function coinbase(sy){if(wsC)return;try{wsC=new WebSocket("wss://ws-feed.exchange.coinbase.com")}catch(e){return}
  wsC.onopen=()=>{wsC.send(JSON.stringify({type:"subscribe",product_ids:sy,channels:["ticker"]}));STAT.krypto="Coinbase";chips()};
  wsC.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==="ticker")setLive(m.product_id,+m.price,"Coinbase",Date.parse(m.time)||Date.now())}catch(_){}};
  wsC.onclose=()=>{wsC=null;STAT.krypto="aus";chips();if(!document.hidden)setTimeout(()=>coinbase(sy),15e3)}}
const usSyms=()=>D.werte.filter(w=>(w.k==="us"||w.k==="etf")&&/^[A-Z][A-Z.]{0,5}$/.test(w.s)&&!/\.(DE|AS|PA|L|MI|SW|F)$/.test(w.s)).map(w=>w.s);
async function usLive(){if(!SET.fhKey)return;const sy=usSyms();if(!sy.length)return;
  if(Date.now()-fhRest>6e4){fhRest=Date.now();for(const s of sy.slice(0,30)){try{const r=await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${encodeURIComponent(SET.fhKey)}`);
    if(r.status===401||r.status===403){STAT.us="Schlüssel ungültig";chips();return}if(!r.ok)continue;const q=await r.json();if(q&&q.c>0)setLive(s,q.c,"Finnhub",(q.t||0)*1000)}catch(e){}}}
  if(wsF||wsFn>5)return;try{wsF=new WebSocket("wss://ws.finnhub.io?token="+encodeURIComponent(SET.fhKey))}catch(e){return}
  wsF.onopen=()=>{wsFn=0;sy.forEach(s=>wsF.send(JSON.stringify({type:"subscribe",symbol:s})));STAT.us="Finnhub";chips()};
  wsF.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==="trade")for(const x of m.data||[])setLive(x.s,x.p,"Finnhub",x.t)}catch(_){}};
  wsF.onclose=()=>{wsF=null;STAT.us="aus";chips();if(document.hidden)return;wsFn++;setTimeout(usLive,Math.min(6e4,5e3*wsFn))}}
function usOffen(){const p=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),g=k=>p.find(x=>x.type===k).value,m=+g("hour")*60+ +g("minute");
  return !["Sat","Sun"].includes(g("weekday"))&&m>=570&&m<960}

/* ---------- nur die Kurs-Stellen aktualisieren (ohne alles neu zu zeichnen) ---------- */
const dirty=new Set();
function flush(alle){const ws=D?D.werte:[];for(const w of ws){if(!alle&&!dirty.has(w.s))continue;const k=kurs(w),l=LIVE[w.s];
  $$(`[data-px="${CSS.escape(w.s)}"]`).forEach(e=>{const t=`${dez(k.p)} ${cs(w)}`;if(e.textContent!==t){e.textContent=t;if(l&&l.alt&&k.src===l.src){e.classList.remove("tick-up","tick-down");void e.offsetWidth;e.classList.add(l.p>=l.alt?"tick-up":"tick-down")}}});
  $$(`[data-dp="${CSS.escape(w.s)}"]`).forEach(e=>{const d=dpVon(w,k.p);e.textContent=pz(d);e.className=d>0?"up":d<0?"down":"muted"});
  $$(`[data-q="${CSS.escape(w.s)}"]`).forEach(e=>e.textContent=quelle(w,k));
  if(w.sig!=="abwarten"){const L=lage(w,k.p);$$(`[data-st="${CSS.escape(w.s)}"]`).forEach(e=>{e.textContent=L.t;e.className="status-b "+L.c});
    $$(`[data-bar="${CSS.escape(w.s)}"]`).forEach(e=>e.style.left=barPos(w,k.p)+"%")}}
  dirty.clear()}
function lage(w,p){const k=w.sig==="kaufen"?1:-1;
  if(k*(p-w.stop)<=0)return {t:"⛔ Stop erreicht: Signal ist vorbei",c:"down"};
  if(k*(p-w.ziel)>=0)return {t:"🎯 Ziel erreicht",c:"up"};
  const r=k*(p/w.ein-1)*100;return {t:`${pz(r)} seit Signal · noch ${nf(Math.abs(w.ziel/p-1)*100,1)} % bis zum Ziel`,c:r>0?"up":r<0?"down":"muted"}}
const barPos=(w,p)=>Math.max(0,Math.min(100,(p-w.stop)/(w.ziel-w.stop)*100));

/* ---------- Bausteine ---------- */
function filterLeiste(){const da=new Set((D?D.werte:[]).map(w=>w.k));
  return `<div class="filters">${Object.entries(KL).filter(([k])=>k==="alle"||da.has(k)).map(([k,n])=>`<button data-f="${k}" class="${P.f===k?"on":""}">${n}</button>`).join("")}</div>`}
const gefiltert=()=>D.werte.filter(w=>P.f==="alle"||w.k===P.f);
function kopfZeile(w){const k=kurs(w),d=dpVon(w,k.p);
  return `<div class="sig-top"><div class="nm"><b>${esc(w.n)}</b><span>${esc(w.s)} · ${KL1[w.k]||""}${w.eigen?" · aus deinem Depot/Beobachten":""}</span></div>
  <div class="px"><span data-px="${esc(w.s)}">${dez(k.p)} ${cs(w)}</span><small data-dp="${esc(w.s)}" class="${d>0?"up":d<0?"down":"muted"}">${pz(d)}</small></div></div>
  <div class="small muted" data-q="${esc(w.s)}" style="text-align:right">${esc(quelle(w,k))}</div>`}
function testText(t){if(!t||!t.n)return "Für diese Regel gibt es noch keine Testfälle.";
  return `Getestet am letzten Jahr (${esc(t.ebene)}): <b>${t.win} %</b> Gewinn-Trades · Ø <b>${pz(t.avg,2)}</b> je Trade nach Kosten · <b>${t.n}</b> Trades${t.pf!=null?` · Profit-Faktor ${nf(t.pf,2)}`:""}${t.wenig?"<br><span class='muted small'>In dieser Anlageklasse gab es noch wenige Fälle, daher zählt der Test über alle Klassen.</span>":""}`}
function signalKarte(w,tap){const k=kurs(w),kauf=w.sig==="kaufen",L=lage(w,k.p),einPos=(w.ein-w.stop)/(w.ziel-w.stop)*100,reg=(D.regeln||[]).find(r=>r.id===w.r)||{};
  return `<div class="card${tap?" tap":""}" ${tap?`data-open="${esc(w.s)}"`:""}>
  ${kopfZeile(w)}
  <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="pill ${w.sig}">${kauf?"KAUFEN":"VERKAUFEN"}</span>${w.vorl?`<span class="pill vorl">vorläufig bis Handelsschluss</span>`:""}<span class="muted small">${esc(reg.name||w.r)} · Signal vom ${tag(w.seit)}</span></div>
  <div class="lv"><div><i>Einstieg ≈</i><b>${dez(w.ein)}</b></div><div><i>Stop-Loss</i><b>${dez(w.stop)}</b><small>${pz((w.stop/w.ein-1)*100)}</small></div><div><i>Kursziel</i><b>${dez(w.ziel)}</b><small>${pz((w.ziel/w.ein-1)*100)}</small></div><div><i>Chance/Risiko</i><b>${nf(w.crv,1)} : 1</b></div></div>
  <div class="bar"><span class="ein" style="left:${einPos}%"></span><span class="now" data-bar="${esc(w.s)}" style="left:${barPos(w,k.p)}%"></span></div><div class="barlab"><span>Stop</span><span class="el" style="left:${einPos}%">Einstieg</span><span>Ziel</span></div>
  <div class="status-b ${L.c}" data-st="${esc(w.s)}">${esc(L.t)}</div>
  <ul class="why">${(w.g||[]).map(g=>`<li>${esc(g)}</li>`).join("")}</ul>
  <div class="test">${testText(w.test)}</div>
  ${!kauf?`<p class="small muted">Verkaufen heißt: Gewinne sichern bzw. nicht neu einsteigen. Getestet wurde es als Wette auf fallende Kurse.</p>`:""}</div>`}

/* ---------- Seiten ---------- */
function leerSeite(){if(ladeFehler==="repo")return `<div class="card empty"><b>Repository unbekannt</b><p class="muted">Öffne die App über deine GitHub-Pages-Adresse oder trag in der Haupt-App unter Einstellungen dein GitHub-Repository ein.</p><a class="btn ghost" href="../">Zur Haupt-App</a></div>`;
  if(ladeFehler==="netz")return `<div class="card empty"><b>Keine Verbindung</b><p class="muted">Die Kursdatei ließ sich nicht laden. Ich versuche es gleich wieder.</p></div>`;
  return `<div class="card empty"><b>Noch keine Signale</b><p class="muted">Der Wachmann berechnet sie bei seinem nächsten Lauf (alle 5–15 Minuten). Beim ersten Mal holt er zwei Jahre Kursverlauf und braucht dafür zwei Läufe.</p>${SET.ghToken?`<button class="btn" data-wecken>Wachmann jetzt starten</button>`:""}</div>`}
function seiteSignale(){const l=gefiltert(),akt=l.filter(w=>w.sig!=="abwarten").sort((a,b)=>(a.vorl?1:0)-(b.vorl?1:0)||(b.test.avg||0)-(a.test.avg||0));
  return `${filterLeiste()}${akt.length?akt.map(w=>signalKarte(w,true)).join(""):`<div class="card empty"><b>⏸ Gerade kein Signal</b><p class="muted">Alle ${l.length} Werte stehen auf Abwarten. Das ist normal: Die Regeln schlagen nur an wenigen Tagen an, und Regeln, die im Test nicht im Plus waren, zeigen gar keine Signale.</p></div>`}
  ${akt.length?`<p class="muted small" style="text-align:center">${l.length-akt.length} weitere Werte: Abwarten · alle unter „Alle Werte“</p>`:""}`}
function seiteAlle(){const l=gefiltert().slice().sort((a,b)=>(a.sig==="abwarten")-(b.sig==="abwarten")||a.n.localeCompare(b.n,"de"));
  return `${filterLeiste()}<div class="card" style="padding:4px 12px">${l.map(w=>{const k=kurs(w),d=dpVon(w,k.p);
    return `<div class="row" data-open="${esc(w.s)}"><div class="nm"><b style="font-size:15px">${esc(w.n)}</b><span>${esc(w.s)}${w.ind&&w.ind.rsi!=null?` · RSI ${nf(w.ind.rsi,0)}`:""}${w.ind&&w.ind.trend?` · ${esc(w.ind.trend.split(",")[0])}`:""}</span></div>
    <div class="px"><span data-px="${esc(w.s)}">${dez(k.p)} ${cs(w)}</span><small data-dp="${esc(w.s)}" class="${d>0?"up":d<0?"down":"muted"}">${pz(d)}</small></div>
    <span class="pill ${w.sig}">${w.sig==="kaufen"?"KAUFEN":w.sig==="verkaufen"?"VERKAUFEN":"Abwarten"}</span></div>`}).join("")}</div>`}
function seiteBilanz(){const f=P.f,mn=D.minN||15;
  const zeile=(r,dir)=>{const s=(D.stat[r.id+":"+dir]||{})[f==="alle"?"alle":f]||{n:0};const aktiv=s.n>=mn&&s.avg>0;
    return `<tr><td>${RICHT[dir]}${aktiv?" ✅":""}</td><td>${s.n}</td><td>${s.n?s.win+" %":"–"}</td><td class="${s.avg>0?"up":s.avg<0?"down":""}">${s.n?pz(s.avg,2):"–"}</td><td>${s.pf!=null?nf(s.pf,2):"–"}</td><td>${s.n?s.ziel+" %":"–"}</td></tr>`};
  const lv=D.live||{},g=lv.gesamt||{n:0};
  return `${filterLeiste()}
  <div class="card"><p style="margin-top:0"><b>So wird getestet:</b> Jede Regel läuft über die Tageskurse vom ${new Date(D.von+"T12:00:00Z").toLocaleDateString("de-DE")} bis heute, an allen ${D.werte.length} Werten. Einstieg zum Eröffnungskurs am Tag nach dem Signal, Ausstieg bei Stop, Ziel oder nach ${D.halte} Handelstagen. Wird Stop und Ziel am selben Tag berührt, zählt der Stop. Kosten: ${nf(D.kosten,1)} % je Kauf und Verkauf.</p>
  <p class="small muted">Eine Regel zeigt nur Signale, wenn sie im Test mindestens ${mn} Trades hatte und im Schnitt nach Kosten im Plus lag (✅). Verkaufen wird als Wette auf fallende Kurse getestet.</p></div>
  ${(D.regeln||[]).map(r=>`<div class="card"><b>${esc(r.name)}</b><p class="small muted">Kauf: ${esc(r.kauf)}<br>Verkauf: ${esc(r.verk)}<br>${esc(r.ziele)}</p>
    <table><tr><th></th><th>Trades</th><th>Gewinn</th><th>Ø je Trade</th><th>Profit-F.</th><th>Ziel erreicht</th></tr>${zeile(r,1)}${zeile(r,-1)}</table></div>`).join("")}
  <h2>Live-Bilanz seit Start</h2>
  <div class="card">${g.n?`<p style="margin-top:0">Abgeschlossen: <b>${g.n}</b> Signale · <b>${g.win} %</b> im Gewinn · Ø <b class="${g.avg>0?"up":"down"}">${pz(g.avg,2)}</b> je Signal nach Kosten</p>`:`<p style="margin-top:0" class="muted">Noch keine abgeschlossenen Signale. Jedes gemeldete Signal wird hier mit denselben Regeln weiterverfolgt, damit du siehst, ob die Trefferquote auch nach dem Test hält.</p>`}
  ${lv.offen?`<p class="small muted">${lv.offen} Signal${lv.offen>1?"e laufen":" läuft"} noch.</p>`:""}
  ${(lv.liste||[]).length?`<table><tr><th>Wert</th><th>Signal</th><th>Datum</th><th>Ergebnis</th></tr>${lv.liste.slice(0,25).map(x=>`<tr><td>${esc(x.n)}</td><td>${RICHT[x.dir]}</td><td>${tag(x.d)}</td><td class="${x.erg>0?"up":x.erg<0?"down":""}">${x.st==="offen"?"läuft":`${pz(x.erg,1)} <span class="muted">(${x.st==="ziel"?"Ziel":x.st==="stop"?"Stop":"Zeit"})</span>`}</td></tr>`).join("")}</table>`:""}</div>`}
function seiteInfo(){const r=repo();
  return `<div class="card"><b>Woher die Kurse kommen</b><ul class="why">
  <li>Krypto: live über Binance (Ersatz: Coinbase), direkt in der App.</li>
  <li>US-Aktien und US-ETFs: ${SET.fhKey?"fast in Echtzeit über deinen Finnhub-Schlüssel aus der Haupt-App.":"ohne Finnhub-Schlüssel nur alle 5–15 Minuten. Trag den Schlüssel in der Haupt-App ein, dann laufen sie hier fast in Echtzeit."}</li>
  <li>EU-Aktien, EU-ETFs und Indizes: ca. 15 Minuten verzögert (Yahoo), dazu der Takt des Wachmanns (5–15 Minuten).</li>
  <li>Signale und Trefferquoten berechnet der Wachmann aus Tageskursen. Stand: ${stand?`${new Date(stand).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})} Uhr`:"–"}.</li></ul></div>
  <div class="card"><b>Was die Signale sind – und was nicht</b><p class="small">Feste Regeln aus RSI, MACD, Ausbruch, Trend und Volumen. Kein Wissen über Nachrichten, Bilanzen oder die Zukunft. Kurzfristig ist an der Börse viel Zufall dabei: Auch eine Regel mit guter Testquote verliert oft. Stop-Loss und Kursziel sind Rechenwerte aus der normalen Schwankung (ATR), keine Prognose. Keine Anlageberatung, du entscheidest selbst.</p>
  <p class="small">„Vorläufig“ heißt: Die Tageskerze läuft noch. Erst zum Handelsschluss steht fest, ob das Signal bleibt.</p></div>
  <div class="card"><b>Telegram</b><p class="small">/signale zeigt alle aktuellen Signale (Filter: /signale krypto, us, eu, etf), /signal BTC die Begründung für einen Wert. Neue Signale schickt der Bot automatisch, nachts ab 22 Uhr nicht: Was über Nacht dazukam und noch gilt, kommt morgens gesammelt.</p></div>
  <div class="card"><b>Verbindung</b><p class="small">Repository: ${r?esc(r):"unbekannt"} · Finnhub-Schlüssel: ${SET.fhKey?"gefunden":"fehlt"} · GitHub-Token: ${SET.ghToken?"gefunden":"fehlt"}<br>Die Einstellungen kommen aus der Haupt-App und werden hier nur gelesen.</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap">${SET.ghToken&&r?`<button class="btn" data-wecken>Wachmann jetzt starten</button>`:""}<a class="btn ghost" href="../">Zur Haupt-App</a></div></div>`}
function render(){chips();status();$$(".tabs button").forEach(b=>b.classList.toggle("on",b.dataset.tab===P.tab));
  const v=$("#view");if(!D){v.innerHTML=P.tab==="info"?seiteInfo():leerSeite();return}
  v.innerHTML=P.tab==="alle"?seiteAlle():P.tab==="bilanz"?seiteBilanz():P.tab==="info"?seiteInfo():seiteSignale();
  if(offenS)detail(offenS,true)}
function status(){const e=$("#status");if(!D){e.textContent=ladeFehler==="netz"?"Keine Verbindung":"Warte auf erste Signale";return}
  const n=D.werte.filter(w=>w.sig!=="abwarten").length,alt=Date.now()-stand>45*6e4;
  e.textContent=`${n} Signal${n===1?"":"e"} · berechnet ${uhr(stand)} Uhr${alt?" (älter, Wachmann läuft verzögert?)":""}`}
function chips(){const k=STAT.krypto,u=STAT.us,uo=usOffen();
  $("#live").innerHTML=`<span class="chip"><span class="dot ${k!=="aus"?"on":"off"}"></span>Krypto ${k!=="aus"?"live":"verbindet …"}</span>
  <span class="chip"><span class="dot ${!SET.fhKey?"mid":u==="Finnhub"?(uo?"on":"mid"):"off"}"></span>US ${!SET.fhKey?"5–15 Min.":u==="Finnhub"?(uo?"live":"Börse zu"):u==="aus"?"verbindet …":u}</span>
  <span class="chip"><span class="dot mid"></span>EU ≈ 15 Min. verzögert</span>`}

/* ---------- Detail (Blatt von unten, Android-Zurück schließt es) ---------- */
function spark(w){const c=w.spark||[];if(c.length<2)return "";const ext=w.sig!=="abwarten"?[w.stop,w.ziel,w.ein]:[],all=[...c,...ext],lo=Math.min(...all),hi=Math.max(...all),W=600,H=120,y=v=>H-6-(v-lo)/(hi-lo||1)*(H-12);
  const pts=c.map((v,i)=>`${(i/(c.length-1)*W).toFixed(1)},${y(v).toFixed(1)}`).join(" "),col=c[c.length-1]>=c[0]?"var(--up)":"var(--down)";
  const lin=(v,f)=>`<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${f}" stroke-dasharray="5 5" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Kursverlauf ${c.length} Tage">${ext.length?lin(w.stop,"var(--down)")+lin(w.ziel,"var(--up)")+lin(w.ein,"var(--muted)"):""}<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>
  <p class="small muted" style="margin-top:2px">Schlusskurse der letzten ${c.length} Handelstage${ext.length?' · <span class="down">- - Stop</span> · <span class="up">- - Ziel</span> · - - Einstieg':""}</p>`}
function detail(s,still){const w=D&&D.werte.find(x=>x.s===s);if(!w)return;offenS=s;const i=w.ind||{};
  const ts=Object.entries(w.ts||{}).map(([k,t])=>{const [r,d]=k.split(":"),R=(D.regeln||[]).find(x=>x.id===r)||{};return `<tr><td>${esc(R.name||r)} · ${RICHT[d]}</td><td>${t.n}</td><td>${t.win} %</td><td class="${t.avg>0?"up":"down"}">${pz(t.avg,2)}</td></tr>`}).join("");
  $("#sheet").innerHTML=`<div class="grab"></div><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div class="brand" style="flex:1;font-size:19px">${esc(w.n)}</div><button class="icon-btn" data-zu aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  ${spark(w)}
  ${w.sig!=="abwarten"?signalKarte(w,false):`<div class="card">${kopfZeile(w)}<div style="margin-top:8px"><span class="pill abwarten">ABWARTEN</span></div><p class="small">${esc(w.hin||"Gerade schlägt keine Regel an.")}</p></div>`}
  <h2>Kennzahlen</h2><div class="kz">
  <div><i>RSI (14)</i><b>${i.rsi!=null?nf(i.rsi,1):"–"}</b></div><div><i>MACD</i><b>${i.macd!=null&&i.ms!=null?(i.macd>i.ms?"über":"unter")+" Signallinie":"–"}</b></div>
  <div><i>Trend</i><b style="font-size:12.5px">${esc(i.trend||"–")}</b></div><div><i>Volumen</i><b>${i.volR!=null?nf(i.volR,1)+"× Schnitt":"keine Daten"}</b></div>
  <div><i>20-Tage-Schnitt</i><b>${i.sma20!=null?dez(i.sma20):"–"}</b></div><div><i>50-Tage-Schnitt</i><b>${i.sma50!=null?dez(i.sma50):"–"}</b></div>
  <div><i>ATR (Tagesschwankung)</i><b>${i.atr!=null?dez(i.atr):"–"}</b></div><div><i>Letzte Tageskerze</i><b>${tag(w.d)}</b></div></div>
  <h2>Regeln an diesem Wert getestet</h2><div class="card">${ts?`<table><tr><th>Regel</th><th>Trades</th><th>Gewinn</th><th>Ø</th></tr>${ts}</table><p class="small muted">Nur dieser Wert, letztes Jahr. Wenige Trades sagen wenig aus, daher entscheidet über Signale der Test über die ganze Anlageklasse.</p>`:`<p class="muted small">In den letzten 12 Monaten hat hier keine Regel angeschlagen.</p>`}</div>`;
  if(!still){$("#sheet").classList.add("open");$("#sheet-bg").classList.add("open");$("#sheet").scrollTop=0;history.pushState({s},"","#s-"+encodeURIComponent(s))}}
function zu(){offenS=null;$("#sheet").classList.remove("open");$("#sheet-bg").classList.remove("open")}
window.addEventListener("popstate",()=>{if(offenS)zu()});

/* ---------- Bedienung ---------- */
async function wecken(){const r=repo();if(!SET.ghToken||!r)return toast("Dafür braucht die Haupt-App einen GitHub-Token.");
  try{const x=await fetch(`https://api.github.com/repos/${r}/actions/workflows/wachmann.yml/dispatches`,{method:"POST",headers:{Authorization:`Bearer ${SET.ghToken}`,Accept:"application/vnd.github+json"},body:JSON.stringify({ref:"main"})});
    toast(x.status===204?"Wachmann gestartet. Neue Werte in etwa 2–5 Minuten.":"Start nicht möglich (GitHub "+x.status+")");if(x.status===204)[120,240,360].forEach(s=>setTimeout(()=>laden(true),s*1000))}catch(e){toast("Keine Verbindung zu GitHub")}}
document.addEventListener("click",e=>{const t=e.target.closest("[data-tab],[data-f],[data-open],[data-zu],[data-wecken],#refresh,#sheet-bg");if(!t)return;
  if(t.dataset.tab){P.tab=t.dataset.tab;saveP();history.replaceState(null,"",P.tab==="signale"?location.pathname:"#t-"+P.tab);render();scrollTo(0,0)}
  else if(t.dataset.f){P.f=t.dataset.f;saveP();render()}
  else if(t.dataset.open)detail(t.dataset.open);
  else if(t.hasAttribute("data-zu")||t.id==="sheet-bg")history.back();
  else if(t.hasAttribute("data-wecken"))wecken();
  else if(t.id==="refresh"){t.classList.add("spin");laden().finally(()=>setTimeout(()=>t.classList.remove("spin"),400));fhRest=0;usLive()}});
document.addEventListener("visibilitychange",()=>{if(!document.hidden){laden(true);verbinden()}});

/* ---------- Start ---------- */
(async()=>{const h=decodeURIComponent(location.hash||"");if(h.startsWith("#t-"))P.tab=h.slice(3);render();await laden();
  if(h.startsWith("#s-")&&D){history.replaceState(null,"",location.pathname);detail(h.slice(3))}
  setInterval(()=>{if(!document.hidden)laden(true)},6e4);setInterval(()=>{if(!document.hidden){fhRest=0;if(SET.fhKey&&!wsF)usLive();chips();flush(true)}},6e4)})();
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js",{scope:"./"}).catch(()=>{});
