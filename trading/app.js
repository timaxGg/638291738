"use strict";
/* Top-Aktien: zweite App neben dem Ki Aktien Helfer.
   Die Rangliste (3, 7, 30 Handelstage) rechnet der Wachmann (bot/signale.mjs), die Claude-Aufgabe recherchiert Gründe und Quellen.
   Alles kommt über kurse.json (Zweig „kurse“, Feld sig). US-Kurse laufen hier live über Finnhub nach.
   Einstellungen der Haupt-App (Speicher „kah“) werden nur gelesen, nie geändert. */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const CS={EUR:"€",USD:"$",GBp:"p",GBP:"£",CHF:"CHF",DKK:"kr"};
let MAIN={};try{MAIN=JSON.parse(localStorage.getItem("kah")||"{}")||{}}catch(e){}
const SET=MAIN.settings||{};
let P={tab:"3"};try{Object.assign(P,JSON.parse(localStorage.getItem("kah-top")||"{}"))}catch(e){}
const saveP=()=>{try{localStorage.setItem("kah-top",JSON.stringify(P))}catch(e){}};
let D=null,KQ={},LIVE={},ladeFehler="",offenS=null,usStat="aus";

/* ---------- Format ---------- */
const nf=(v,d)=>(+v).toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
const dez=v=>{v=+v;return nf(v,v>=1?2:v>=.01?4:6)};
const pz=(v,d=1)=>v==null||!isFinite(v)?"–":(v>0?"+":v<0?"−":"±")+nf(Math.abs(v),d)+" %";
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const kl=v=>v>0?"up":v<0?"down":"muted";
const datum=d=>d?new Date(String(d).length===10?d+"T12:00:00Z":d).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"}):"";
const uhr=t=>new Date(t).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
const vor=t=>{const m=Math.round((Date.now()-t)/6e4);return m<1?"gerade eben":m<60?`vor ${m} Min.`:m<1440?`vor ${Math.round(m/60)} Std.`:`vor ${Math.round(m/1440)} Tagen`};
const cs=w=>CS[w.cur]||w.cur||"";
const istEU=s=>/\.(DE|AS|PA|SW|CO|MI|L|MC|BR|VI|ST|HE|OL|LS|IR|F)$/.test(s);
const toast=t=>{const e=$("#toast");e.textContent=t;e.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("on"),3200)};

/* ---------- Daten ---------- */
function repo(){let r=SET.ghRepo;if(!r&&/github\.io$/.test(location.hostname))r=location.hostname.split(".")[0]+"/"+location.pathname.split("/")[1];return r||""}
const kurseUrl=()=>repo()?`https://raw.githubusercontent.com/${repo()}/kurse/kurse.json?t=${Math.floor(Date.now()/6e4)}`:null;
async function laden(still){const u=kurseUrl();if(!u){ladeFehler="repo";render();return}
  try{const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);const k=await r.json();KQ=k.q||{};
    if(k.sig&&k.sig.listen){const neu=!D||D.t!==k.sig.t;D=k.sig;ladeFehler="";if(neu||!still)render();else flush();usLive()}
    else{ladeFehler="leer";render()}}catch(e){ladeFehler="netz";if(!D)render();status()}}
const alleWerte=()=>{if(!D)return [];const m=new Map();for(const H of D.horizonte)for(const x of D.listen[H]||[])if(!m.has(x.s))m.set(x.s,x);return [...m.values()]};
function kurs(w){const c=[{p:w.p,t:w.mt||0,src:"liste"}],q=KQ[w.s];if(q&&q.c)c.push({p:q.c,t:q.t||0,src:"kurse"});if(LIVE[w.s])c.push(LIVE[w.s]);return c.sort((a,b)=>b.t-a.t)[0]}
const quelle=(w,k)=>k.src==="Finnhub"&&Date.now()-k.t<12e4?"live":`${istEU(w.s)?"ca. 15 Min. verzögert · ":""}${k.t?vor(k.t):""}`;
const dpVon=(w,p)=>{const prev=w.p/(1+(w.dp||0)/100);return (p/prev-1)*100};

/* ---------- US-Kurse live (Finnhub, Schlüssel aus der Haupt-App) ---------- */
let wsF=null,wsFn=0,fhRest=0;const dirty=new Set();
function setLive(s,p,src,t=Date.now()){if(!(p>0))return;const a=LIVE[s];LIVE[s]={p,t,src,alt:a&&a.p};dirty.add(s);if(!flush.r)flush.r=requestAnimationFrame(()=>{flush.r=0;flush()})}
async function usLive(){if(!SET.fhKey||!D)return;const sy=alleWerte().map(w=>w.s).filter(s=>!istEU(s));if(!sy.length)return;
  if(Date.now()-fhRest>6e4){fhRest=Date.now();for(const s of sy){try{const r=await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${encodeURIComponent(SET.fhKey)}`);
    if(r.status===401||r.status===403){usStat="Schlüssel ungültig";chips();return}if(!r.ok)continue;const q=await r.json();if(q&&q.c>0)setLive(s,q.c,"Finnhub",(q.t||0)*1000)}catch(e){}}}
  if(wsF||wsFn>5)return;try{wsF=new WebSocket("wss://ws.finnhub.io?token="+encodeURIComponent(SET.fhKey))}catch(e){return}
  wsF.onopen=()=>{wsFn=0;sy.forEach(s=>wsF.send(JSON.stringify({type:"subscribe",symbol:s})));usStat="Finnhub";chips()};
  wsF.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==="trade")for(const x of m.data||[])setLive(x.s,x.p,"Finnhub",x.t)}catch(_){}};
  wsF.onclose=()=>{wsF=null;usStat="aus";chips();if(document.hidden)return;wsFn++;setTimeout(usLive,Math.min(6e4,5e3*wsFn))}}
function usOffen(){const p=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),g=k=>p.find(x=>x.type===k).value,m=+g("hour")*60+ +g("minute");
  return !["Sat","Sun"].includes(g("weekday"))&&m>=570&&m<960}
function flush(){for(const w of alleWerte()){const k=kurs(w),l=LIVE[w.s],S=CSS.escape(w.s);
  $$(`[data-px="${S}"]`).forEach(e=>{const t=`${dez(k.p)} ${cs(w)}`;if(e.textContent!==t){e.textContent=t;if(l&&l.alt&&k.src===l.src){e.classList.remove("tick-up","tick-down");void e.offsetWidth;e.classList.add(l.p>=l.alt?"tick-up":"tick-down")}}});
  $$(`[data-dp="${S}"]`).forEach(e=>{const d=dpVon(w,k.p);e.textContent=pz(d)+" heute";e.className=kl(d)});
  $$(`[data-seit="${S}"]`).forEach(e=>{const p0=+e.dataset.p0,r=(k.p/p0-1)*100;e.textContent=pz(r);e.className=kl(r)});
  $$(`[data-q="${S}"]`).forEach(e=>e.textContent=quelle(w,k))}dirty.clear()}

/* ---------- Bausteine ---------- */
const H_TEXT={3:"3 Handelstage",7:"7 Handelstage",30:"30 Handelstage"};
function testBox(H){const t=(D.test&&D.test.h||{})[H]||{};if(!t.tage)return `<div class="card small muted">Der Rückblick-Test läuft, sobald alle Kursverläufe geladen sind.</div>`;
  const gut=t.besser>=55&&t.topAvg>t.alleAvg;
  return `<div class="card test-k"><b>Wie gut war diese Rechnung im letzten Jahr?</b>
  <p class="small">An ${t.tage} Handelstagen jeweils die Top ${D.top} gekauft und nach ${H} Tagen verkauft (nach Kosten):</p>
  <div class="kz"><div><i>Top ${D.top} im Schnitt</i><b class="${kl(t.topAvg)}">${pz(t.topAvg,2)}</b></div><div><i>alle ${D.werte} Werte im Schnitt</i><b class="${kl(t.alleAvg)}">${pz(t.alleAvg,2)}</b></div>
  <div><i>Tage, an denen die Top ${D.top} vorn lagen</i><b>${t.besser} %</b></div><div><i>Einzelwerte im Plus</i><b>${t.plus} %</b></div></div>
  <p class="small muted">${gut?"Die Rechnung lag öfter vorn als nicht, aber längst nicht immer.":"Die Rechnung lag kaum öfter vorn als der Durchschnitt. Nimm die Liste als Ideensammlung, nicht als Vorhersage."} Die KI-Auswahl selbst wird ab jetzt unter „Bilanz“ gemessen.</p></div>`}
function karte(x,H,voll){const k=kurs(x),d=dpVon(x,k.p),seit=x.p0?(k.p/x.p0-1)*100:null;
  return `<div class="card${voll?"":" tap"}" ${voll?"":`data-open="${esc(x.s)}" data-h="${H}"`}>
  <div class="sig-top"><span class="rang">${x.platz}</span><div class="nm"><b>${esc(x.n)}</b><span>${esc(x.s)}${x.zuversicht?` · Zuversicht ${esc(x.zuversicht)}`:""}${x.eigen?" · aus deinem Depot":""}</span></div>
  <div class="px"><span data-px="${esc(x.s)}">${dez(k.p)} ${cs(x)}</span><small data-dp="${esc(x.s)}" class="${kl(d)}">${pz(d)} heute</small></div></div>
  <div class="lv">
   <div><i>Seit Liste</i><b>${seit!=null?`<span data-seit="${esc(x.s)}" data-p0="${x.p0}" class="${kl(seit)}">${pz(seit)}</span>`:"–"}</b></div>
   <div><i>4 Wochen</i><b class="${kl(x.wochen4)}">${pz(x.wochen4)}</b></div><div><i>3 Monate</i><b class="${kl(x.monate3)}">${pz(x.monate3)}</b></div>
   <div><i>Trend</i><b>${x.trend==="aufwärts"?"↗ auf":x.trend==="abwärts"?"↘ ab":"–"}</b></div></div>
  ${x.warum?`<p class="warum">${esc(voll?x.warum:String(x.warum).split(/(?<=[.!?])\s/).slice(0,2).join(" "))}</p>`:`<p class="small muted">KI-Recherche steht noch aus. Platz aus der Kurs-Rechnung.</p>`}
  ${x.quellen&&x.quellen.length&&!voll?`<p class="small muted">${x.quellen.length} ${x.quellen.length===1?"Quelle":"Quellen"} · Tippen für Details</p>`:""}
  <div class="small muted" data-q="${esc(x.s)}" style="text-align:right">${esc(quelle(x,k))}</div></div>`}

/* ---------- Seiten ---------- */
function leer(){if(ladeFehler==="repo")return `<div class="card empty"><b>Repository unbekannt</b><p class="muted">Öffne die App über deine GitHub-Pages-Adresse oder trag in der Haupt-App dein GitHub-Repository ein.</p><a class="btn ghost" href="../">Zur Haupt-App</a></div>`;
  if(ladeFehler==="netz")return `<div class="card empty"><b>Keine Verbindung</b><p class="muted">Die Kursdatei ließ sich nicht laden. Ich versuche es gleich wieder.</p></div>`;
  return `<div class="card empty"><b>Noch keine Liste</b><p class="muted">Der Wachmann lädt beim ersten Mal zwei Jahre Kursverlauf für rund 70 Aktien und braucht dafür 2–3 Läufe (10–15 Minuten). Die KI-Recherche kommt dann um 7:15, 13:15 und 19:15 Uhr.</p>${SET.ghToken?`<button class="btn" data-wecken>Wachmann jetzt starten</button>`:""}</div>`}
function seiteListe(H){const l=D.listen[H]||[],ki=D.ki;
  return `${ki?`<div class="card markt"><div class="small muted">KI-Recherche ${esc(ki.slot||"")} · ${uhr(ki.erstellt||D.t)} Uhr</div>${ki.markt?`<p>${esc(ki.markt)}</p>`:""}${(ki.marktQuellen||[]).length?`<p class="small">${ki.marktQuellen.map(q=>`<a href="${esc(q.u)}" target="_blank" rel="noopener">${esc(q.q||q.t)}</a>`).join(" · ")}</p>`:""}</div>`
    :`<div class="card markt small muted">Die KI-Recherche für heute steht noch aus (7:15, 13:15, 19:15 Uhr). Bis dahin: reine Rangliste aus den Kursdaten.</div>`}
  <h2>Beste Aktien für die nächsten ${H_TEXT[H]}</h2>
  ${l.map(x=>karte(x,H)).join("")||`<div class="card muted">Keine Werte.</div>`}
  ${ki&&ki.aussortiert&&ki.aussortiert.filter(a=>String(a.h)===String(H)).length?`<details class="card"><summary><b>Aussortiert trotz guter Rechnung</b></summary><ul class="why">${ki.aussortiert.filter(a=>String(a.h)===String(H)).map(a=>`<li><b>${esc(a.s)}</b>: ${esc(a.grund)}</li>`).join("")}</ul></details>`:""}
  ${testBox(H)}`}
function seiteBilanz(){const b=D.bilanz||{},f=b.fertig||{};
  return `<h2>Wie haben sich die Listen entwickelt?</h2>
  <div class="card"><p class="small" style="margin-top:0">Jede KI-Liste wird mit den Kursen zum Zeitpunkt der Veröffentlichung gemerkt und nach 3, 7 bzw. 30 Handelstagen abgerechnet (nach Kosten), im Vergleich zum Durchschnitt aller ${D.werte} Werte.</p>
  <table><tr><th>Zeitraum</th><th>Werte</th><th>Ø Liste</th><th>Ø alle</th><th>besser</th><th>im Plus</th></tr>
  ${D.horizonte.map(H=>{const x=f[H]||{n:0};return `<tr><td>${H} Tage</td><td>${x.n}</td><td class="${kl(x.avg)}">${x.n?pz(x.avg,2):"–"}</td><td>${x.n?pz(x.bench,2):"–"}</td><td>${x.n?x.besser+" %":"–"}</td><td>${x.n?x.plus+" %":"–"}</td></tr>`}).join("")}</table>
  ${D.horizonte.every(H=>!(f[H]||{}).n)?`<p class="small muted">Noch nichts abgerechnet: die ersten Ergebnisse gibt es nach 3 Handelstagen.</p>`:""}</div>
  <h2>Letzte Listen, Stand jetzt</h2>
  ${(b.laufend||[]).map(x=>`<div class="card"><b>${datum(x.d)} ${esc(x.slot||"")}</b>${D.horizonte.map(H=>`<div class="small" style="margin-top:6px"><span class="muted">${H} Tage:</span> ${(x.h[H]||[]).map(p=>`${esc(p.n)} <span class="${kl(p.r)}">${pz(p.r)}</span>`).join(" · ")||"–"}</div>`).join("")}</div>`).join("")||`<div class="card small muted">Noch keine KI-Liste veröffentlicht.</div>`}
  <h2>So entsteht die Liste</h2>
  <div class="card small"><ol style="padding-left:18px;margin:0">
   <li>Der Wachmann holt täglich zwei Jahre Kursverlauf für rund ${D.werte} große Aktien aus den USA und Europa (dazu deine Depotwerte).</li>
   <li>Rechnung je Zeitraum: Kursanstieg im Verhältnis zur normalen Schwankung (3 und 7 Tage: letzte 4 Wochen, 7 und 30 Tage: zusätzlich 3 und 6 Monate), plus Trend, minus Überhitzung (RSI über 75).</li>
   <li>Die 8 besten je Zeitraum bekommt die KI mit Meldungen und Terminen. Sie recherchiert im Netz, wählt 5 aus, begründet sie und verlinkt die Quellen. Aussortiertes steht mit Grund dabei.</li>
   <li>Jede Liste wird danach abgerechnet (oben), damit du siehst, ob sie wirklich besser ist als der Durchschnitt.</li></ol>
   <p class="muted">Keine erfundenen Zahlen: Kurswerte kommen aus Kursdaten, alles andere aus verlinkten Quellen. „Übliche Schwankung“ ist keine Prognose, sondern die normale Bandbreite. Kurzfristig ist an der Börse viel Zufall dabei. Keine Anlageberatung.</p></div>
  <div class="card small"><b>Kurse</b><br>US-Aktien: ${SET.fhKey?"live über deinen Finnhub-Schlüssel.":"ohne Finnhub-Schlüssel alle 5–15 Minuten."} EU-Aktien: ca. 15 Minuten verzögert plus Takt des Wachmanns.<br><br><b>Telegram</b><br>/beste zeigt die Listen, /beste 7 nur einen Zeitraum, /warum NVDA die Begründung mit Quellen.
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${SET.ghToken&&repo()?`<button class="btn" data-wecken>Wachmann jetzt starten</button>`:""}<a class="btn ghost" href="../">Zur Haupt-App</a></div></div>`}
function render(){chips();status();$$(".tabs button").forEach(b=>b.classList.toggle("on",b.dataset.tab===P.tab));const v=$("#view");
  if(!D){v.innerHTML=leer();return}v.innerHTML=P.tab==="bilanz"?seiteBilanz():seiteListe(+P.tab||3);if(offenS)detail(offenS.s,offenS.H,true)}
function status(){const e=$("#status");if(!D){e.textContent=ladeFehler==="netz"?"Keine Verbindung":"Warte auf die erste Liste";return}
  e.textContent=`${D.ki?"Mit KI-Recherche":"Nur Kurs-Rechnung"} · Kurse ${uhr(D.t)} Uhr${Date.now()-D.t>45*6e4?" (älter)":""}`}
function chips(){const uo=usOffen();$("#live").innerHTML=`<span class="chip"><span class="dot ${!SET.fhKey?"mid":usStat==="Finnhub"?(uo?"on":"mid"):"off"}"></span>US ${!SET.fhKey?"5–15 Min.":usStat==="Finnhub"?(uo?"live":"Börse zu"):usStat==="aus"?"verbindet …":usStat}</span><span class="chip"><span class="dot mid"></span>EU ≈ 15 Min. verzögert</span>`}

/* ---------- Detail ---------- */
function spark(x){const c=x.spark||[];if(c.length<2)return "";const ext=x.p0?[x.p0]:[],all=[...c,...ext],lo=Math.min(...all),hi=Math.max(...all),W=600,Hh=120,y=v=>Hh-6-(v-lo)/(hi-lo||1)*(Hh-12);
  const pts=c.map((v,i)=>`${(i/(c.length-1)*W).toFixed(1)},${y(v).toFixed(1)}`).join(" "),col=c[c.length-1]>=c[0]?"var(--up)":"var(--down)";
  return `<svg class="spark" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-label="Kursverlauf">${x.p0?`<line x1="0" x2="${W}" y1="${y(x.p0)}" y2="${y(x.p0)}" stroke="var(--accent)" stroke-dasharray="5 5" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`:""}<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>
  <p class="small muted" style="margin-top:2px">Schlusskurse der letzten ${c.length} Handelstage${x.p0?' · <span style="color:var(--accent)">- - Kurs bei Veröffentlichung</span>':""}</p>`}
function detail(s,H,still){const x=(D.listen[H]||[]).find(y=>y.s===s);if(!x)return;offenS={s,H};const auch=D.horizonte.filter(h=>h!==H&&(D.listen[h]||[]).some(y=>y.s===s));
  const li=(t,a)=>a&&a.length?`<h2>${t}</h2><ul class="why">${a.map(z=>`<li>${esc(z)}</li>`).join("")}</ul>`:"";
  $("#sheet").innerHTML=`<div class="grab"></div><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div class="brand" style="flex:1;font-size:19px">${esc(x.n)}</div><button class="icon-btn" data-zu aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  ${spark(x)}${karte(x,H,true)}
  <p class="small muted">Platz ${x.platz} für ${H_TEXT[H]}${x.rechenRang?` · Kurs-Rechnung: Platz ${x.rechenRang}`:""}${auch.length?` · auch in der Liste für ${auch.map(h=>h+" Tage").join(" und ")}`:""}</p>
  ${li("Was den Kurs antreiben kann",x.treiber)}${li("Risiken",x.risiken)}${li("Termine",x.termine)}
  <h2>Kennzahlen</h2><div class="kz">
   <div><i>5 Tage</i><b class="${kl(x.tage5)}">${pz(x.tage5)}</b></div><div><i>6 Monate</i><b class="${kl(x.monate6)}">${pz(x.monate6)}</b></div>
   <div><i>RSI (14)</i><b>${x.rsi??"–"}</b></div><div><i>Schwankung pro Jahr</i><b>${x.schwankungJahr!=null?x.schwankungJahr+" %":"–"}</b></div>
   <div><i>Abstand 50-Tage-Schnitt</i><b class="${kl(x.ueber50)}">${pz(x.ueber50)}</b></div><div><i>Übliche Bandbreite in ${H} Tagen</i><b style="font-size:12.5px">${x.bereich?`${dez(x.bereich.lo)}–${dez(x.bereich.hi)}`:"–"}</b></div></div>
  <p class="small muted">Die Bandbreite ist die normale Schwankung (etwa 2 von 3 Fällen), keine Prognose.</p>
  ${x.quellen&&x.quellen.length?`<h2>Quellen</h2><div class="card" style="padding:4px 12px">${x.quellen.map(q=>`<a class="quelle" href="${esc(q.u)}" target="_blank" rel="noopener"><b>${esc(q.t||q.u)}</b><span>${esc(q.q||"")}${q.d?" · "+datum(q.d):""}</span></a>`).join("")}</div>`:""}`;
  if(!still){$("#sheet").classList.add("open");$("#sheet-bg").classList.add("open");$("#sheet").scrollTop=0;history.pushState({s},"","#s-"+encodeURIComponent(s))}}
function zu(){offenS=null;$("#sheet").classList.remove("open");$("#sheet-bg").classList.remove("open")}
window.addEventListener("popstate",()=>{if(offenS)zu()});

/* ---------- Bedienung ---------- */
async function wecken(){const r=repo();if(!SET.ghToken||!r)return toast("Dafür braucht die Haupt-App einen GitHub-Token.");
  try{const x=await fetch(`https://api.github.com/repos/${r}/actions/workflows/wachmann.yml/dispatches`,{method:"POST",headers:{Authorization:`Bearer ${SET.ghToken}`,Accept:"application/vnd.github+json"},body:JSON.stringify({ref:"main"})});
    toast(x.status===204?"Wachmann gestartet. Neue Werte in etwa 2–5 Minuten.":"Start nicht möglich (GitHub "+x.status+")");if(x.status===204)[120,240,360].forEach(s=>setTimeout(()=>laden(true),s*1000))}catch(e){toast("Keine Verbindung zu GitHub")}}
document.addEventListener("click",e=>{const t=e.target.closest("[data-tab],[data-open],[data-zu],[data-wecken],#refresh,#sheet-bg");if(!t)return;
  if(t.dataset.tab){P.tab=t.dataset.tab;saveP();render();scrollTo(0,0)}
  else if(t.dataset.open)detail(t.dataset.open,+t.dataset.h);
  else if(t.hasAttribute("data-zu")||t.id==="sheet-bg")history.back();
  else if(t.hasAttribute("data-wecken"))wecken();
  else if(t.id==="refresh"){t.classList.add("spin");fhRest=0;laden().finally(()=>setTimeout(()=>t.classList.remove("spin"),400))}});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)laden(true)});

/* ---------- Start ---------- */
(async()=>{const h=decodeURIComponent(location.hash||"");render();await laden();
  if(h.startsWith("#s-")&&D){const s=h.slice(3),H=D.horizonte.find(x=>(D.listen[x]||[]).some(y=>y.s===s));history.replaceState(null,"",location.pathname);if(H){P.tab=String(H);render();detail(s,H)}}
  setInterval(()=>{if(!document.hidden)laden(true)},6e4);setInterval(()=>{if(!document.hidden){if(SET.fhKey&&!wsF){fhRest=0;usLive()}chips();flush()}},6e4)})();
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js",{scope:"./"}).catch(()=>{});
