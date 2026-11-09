/* Ki Aktien Helfer – Prognose-Modell (gemeinsam für App und Wachmann).
   Zerlegt die erwartete Kursbewegung in einzeln gekennzeichnete Teile.
   Alle Teile sind rein rechnerisch aus den Kursen der letzten ca. 3 Monate. Muster und Marktbezüge
   sind ausdrücklich unsicher („mit Vorsicht“) und deshalb klein gewichtet und gedeckelt. */
(function(G){
  const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  const ist7=s=>/-EUR$|-USD$/.test(s||"");                       // Krypto handelt 7 Tage pro Woche, passt nicht zu Börsentagen
  const istTreiber=s=>TREIBER.some(t=>t[0]===s);
  // Langfrist-Durchschnitt pro Jahr (in %), grob nach Anlageart
  const basisJahr=s=>/-EUR$|-USD$|=X$|=F$|^\^VIX$|^(4GLD\.DE|EWG2\.DE|BRNT\.L)$/.test(s)?0:/^(XEON|XGLE)\.DE$/.test(s)?2:/^(EUNH|IBCI|EUNA)\.DE$/.test(s)?2.5:7;
  const istAktienartig=s=>basisJahr(s)===7&&!/^\^/.test(s);
  // Treiber, deren Bewegung auf andere Werte wirken kann
  const TREIBER=[["^GSPC","S&P 500"],["^GDAXI","DAX"],["BZ=F","Öl (Brent)"],["GC=F","Gold"],["EURUSD=X","Euro in Dollar"],["^VIX","Angst-Barometer (VIX)"]];
  // reversion, musterWeight, marktWeight starten bei 0: Gegenbewegung, Muster und Marktumfeld werden nur angezeigt, nicht eingerechnet,
  // bis die eigene Trefferquote zeigt, dass sie helfen (Lern-Update mit Freigabe).
  const DEFAULTS={trendDamping:.5,bandFactor:1,newsWeight:1,baseWeight:1,reversion:0,musterWeight:0,marktWeight:0};

  function renditen(c){const o=c.slice().reverse(),r=[];for(let i=1;i<o.length;i++)r.push(Math.log(o[i]/o[i-1]));return r}
  // Zusammenhang zweier Kursreihen (neueste zuerst). beta: wie stark a im Schnitt mitgeht, wenn b sich um 1 % bewegt.
  function bezug(a,b){if(!a||!b)return null;const n=Math.min(a.length,b.length,61);if(n<30)return null;
    const ra=renditen(a.slice(0,n)),rb=renditen(b.slice(0,n)),ma=mean(ra),mb=mean(rb);let cov=0,va=0,vb=0;
    for(let i=0;i<ra.length;i++){cov+=(ra[i]-ma)*(rb[i]-mb);va+=(ra[i]-ma)**2;vb+=(rb[i]-mb)**2}
    if(!va||!vb)return null;return {korr:cov/Math.sqrt(va*vb),beta:cov/vb,n:ra.length}}
  function rsi(old,n=14){if(old.length<n+1)return null;let g=0,l=0;for(let i=old.length-n;i<old.length;i++){const d=old[i]-old[i-1];if(d>0)g+=d;else l-=d}return l===0?100:100-100/(1+g/l)}
  const sma=(old,n,ende=0)=>mean(old.slice(old.length-n-ende,old.length-ende));

  // Zerlegung. old: Kurse ältester zuerst (inkl. Live-Kurs), H: Prognose-Tage, hist(sym): Kurse neueste zuerst
  function zerlege({s,old,H,P,bias,hist,monat,tiefe=0}){
    P=Object.assign({},DEFAULTS,P||{});
    const r=[];for(let i=1;i<old.length;i++)r.push(Math.log(old[i]/old[i-1]));
    const mu=mean(r),sd=Math.sqrt(mean(r.map(x=>(x-mu)**2)))||1e-9,last=old[old.length-1],teile=[],muster=[];
    const add=(key,name,log,info,vorsicht,nurInfo)=>teile.push({key,name,pct:(Math.exp(log)-1)*100,log,info,vorsicht:!!vorsicht,nurInfo:!!nurInfo});
    // 1. Trend der letzten 3 Monate, abgeschwächt
    add("trend","Trend 3 Monate (abgeschwächt)",P.trendDamping*mu*Math.min(H,63),`Der Trend der letzten ${r.length} Handelstage wird zu ${Math.round(P.trendDamping*100)} % fortgeschrieben, höchstens für 3 Monate.`);
    // 2. Langfrist-Durchschnitt der Anlageart
    const bj=basisJahr(s);add("basis","Langfrist-Durchschnitt",(P.baseWeight)*Math.log(1+bj/100)*H/252,bj?`Historischer Schnitt dieser Anlageart: etwa ${String(bj).replace(".",",")} % pro Jahr (${bj===7?"breite Aktienmärkte, z. B. MSCI World seit 1970 rund 7–8 %":"Anleihen/Geldmarkt im Euroraum, langjähriger Schnitt"}).`:"Bei dieser Anlageart gibt es keinen verlässlichen Langfrist-Zuwachs, daher 0.");
    // 3. Rückkehr nach starken Bewegungen (teilweise Gegenbewegung nach Übertreibungen)
    const r20=r.slice(-20).reduce((x,y)=>x+y,0),z=r20/(sd*Math.sqrt(20));
    const rohRueck=Math.abs(z)>1.5?-.15*r20:0;
    add("rueck","Gegenbewegung nach starker Bewegung",Math.abs(z)>1.5?-P.reversion*r20:0,Math.abs(z)>1.5?`In 4 Wochen ${r20>0?"stark gestiegen":"stark gefallen"} (${(Math.exp(r20)*100-100).toFixed(1).replace(".",",")} %). Nach solchen Ausschlägen gibt es oft eine teilweise Gegenbewegung.`:"Keine auffällig starke Bewegung in den letzten 4 Wochen.",true,!P.reversion);
    // 4. Bekannte Muster (mit Vorsicht)
    if(!/=X$/.test(s)){
      const R=rsi(old);if(R!=null){if(R>70)muster.push({name:"Überkauft (RSI "+Math.round(R)+")",log:-.01,info:"Sehr viele Plus-Tage hintereinander. Danach kühlt der Kurs oft etwas ab."});
        else if(R<30)muster.push({name:"Überverkauft (RSI "+Math.round(R)+")",log:.01,info:"Sehr viele Minus-Tage hintereinander. Danach erholt sich der Kurs oft etwas."})}
      if(old.length>=56){const jetzt=sma(old,20)-sma(old,50),vor=sma(old,20,5)-sma(old,50,5);
        if(jetzt>0&&vor<=0)muster.push({name:"Goldenes Kreuz",log:.01,info:"Der 20-Tage-Schnitt ist gerade über den 50-Tage-Schnitt gestiegen. Gilt als Zeichen für einen beginnenden Aufwärtstrend."});
        else if(jetzt<0&&vor>=0)muster.push({name:"Todeskreuz",log:-.01,info:"Der 20-Tage-Schnitt ist gerade unter den 50-Tage-Schnitt gefallen. Gilt als Zeichen für einen beginnenden Abwärtstrend."})}
      const lo=Math.min(...old.slice(0,-1)),hi=Math.max(...old.slice(0,-1));
      if(last<=lo*1.03)muster.push({name:"Nahe am 3-Monats-Tief",log:.005,info:"Hier haben Käufer zuletzt gestützt (Unterstützung). Hält die Marke nicht, kann es weiter fallen."});
      else if(last>=hi*.97)muster.push({name:"Nahe am 3-Monats-Hoch",log:-.005,info:"Hier haben Verkäufer zuletzt gebremst (Widerstand). Wird die Marke überschritten, kann es weiter steigen."});
      if(istAktienartig(s)&&monat!=null){if(monat>=10)muster.push({name:"Jahresend-Rallye",log:.005*H/63,info:"November und Dezember waren für Aktien in der Vergangenheit oft gute Monate."});
        else if(monat===8)muster.push({name:"Schwacher September",log:-.005*H/63,info:"Der September war für Aktien in der Vergangenheit im Schnitt der schwächste Monat."})}
    }
    const rohMuster=Math.max(-.02,Math.min(.02,muster.reduce((x,m)=>x+m.log,0)));let mLog=Math.max(-.02,Math.min(.02,rohMuster*P.musterWeight));
    add("muster","Bekannte Muster",mLog,muster.length?muster.map(m=>m.name).join(", "):"Gerade kein bekanntes Muster erkennbar.",true,!P.musterWeight);
    // 5. Marktumfeld und Zusammenhänge (mit Vorsicht)
    const zus=[];let mk=0,rohMarkt=0,mkInfo="Kein verlässlicher Zusammenhang zum Gesamtmarkt messbar.";
    if(hist&&!ist7(s)){const eigen=old.slice().reverse();
      for(const [t,n] of TREIBER){if(t===s)continue;const b=bezug(eigen,hist(t));if(b&&Math.abs(b.korr)>=.3)zus.push({s:t,n,korr:+b.korr.toFixed(2),beta:+b.beta.toFixed(2)})}
      zus.sort((a,b)=>Math.abs(b.korr)-Math.abs(a.korr));
      const mSym=/\.(DE|F|AS|PA|MI|SW|VI|MC|BR)$/.test(s)?"^GDAXI":"^GSPC";
      if(!tiefe&&s!==mSym&&!istTreiber(s)){const mh=hist(mSym),b=bezug(eigen,mh);
        if(mh&&b&&Math.abs(b.korr)>=.3){const mz=zerlege({s:mSym,old:mh.slice().reverse(),H,P,hist:null,monat,tiefe:1}),mErw=mz.teile.filter(x=>x.key==="trend"||x.key==="basis").reduce((x,y)=>x+y.log,0);
          rohMarkt=.3*b.beta*mErw;mk=P.marktWeight*b.beta*mErw;mkInfo=`Geht im Schnitt ${b.beta.toFixed(1).replace(".",",")}-fach mit dem ${mSym==="^GDAXI"?"DAX":"S&P 500"} mit (Gleichlauf ${b.korr.toFixed(2).replace(".",",")}). ${mErw>=0?"Dessen Trend ist positiv.":"Dessen Trend ist negativ."}`}}}
    add("markt","Marktumfeld",mk,mkInfo,true,!P.marktWeight);
    // 6. Nachrichten
    if(bias)add("news","Nachrichten des Tages",(+bias||0)*P.newsWeight/100,"Geschätzte Wirkung der heutigen Meldungen.");
    const drift=teile.reduce((x,t)=>x+t.log,0);
    return {drift,teile,muster,zusammenhaenge:zus.slice(0,3),mu,sd,roh:{rueck:+rohRueck.toFixed(4),muster:+rohMuster.toFixed(4),markt:+rohMarkt.toFixed(4)}}}

  // Welche Werte hängen an einem Treiber? (z. B. „Wirkt auf“ bei Öl)
  function wirktAuf(t,syms,hist){const th=hist(t);if(!th||ist7(t))return [];return syms.filter(x=>x!==t&&!ist7(x)).map(x=>{const b=bezug(hist(x),th);return b&&Math.abs(b.korr)>=.3?{s:x,korr:+b.korr.toFixed(2),beta:+b.beta.toFixed(2)}:null}).filter(Boolean).sort((a,b)=>Math.abs(b.korr)-Math.abs(a.korr)).slice(0,5)}

  // Bekannte Firmen ohne Aktie an der Börse (Name → Hinweis, ähnliche börsennotierte Werte)
  const PRIVAT=[
    [/\bbosch\b/,"Bosch","gehört größtenteils der Robert Bosch Stiftung und hat keine Aktien an der Börse. Die indische Tochter Bosch Ltd. ist nur in Indien handelbar.","Continental, Schaeffler, Siemens"],
    [/\baldi\b/,"Aldi","gehört den Familien Albrecht (Stiftungen) und ist nicht börsennotiert.","Ahold Delhaize, Carrefour"],
    [/\blidl\b|schwarz.?gruppe|kaufland/,"Lidl / Schwarz-Gruppe","gehört der Schwarz-Gruppe (Stiftung) und ist nicht börsennotiert.","Ahold Delhaize, Carrefour"],
    [/\bdm\b|dm.?drogerie/,"dm","ist ein Familienunternehmen ohne Börsennotierung.","Beiersdorf, Henkel"],
    [/rossmann/,"Rossmann","ist ein Familienunternehmen ohne Börsennotierung.","Beiersdorf, Henkel"],
    [/\bedeka\b/,"Edeka","ist eine Genossenschaft und nicht börsennotiert.","Ahold Delhaize, Carrefour"],
    [/\brewe\b/,"Rewe","ist eine Genossenschaft und nicht börsennotiert.","Ahold Delhaize, Carrefour"],
    [/\bikea\b/,"Ikea","gehört Stiftungen und ist nicht börsennotiert.","Inditex"],
    [/\bdeutsche bahn\b|\bdb\b/,"Deutsche Bahn","gehört dem Staat und hat keine Aktien an der Börse.","Deutsche Post (DHL)"],
    [/\bspacex\b/,"SpaceX","ist nicht börsennotiert (privat, Stand 2026 kein Börsengang).","Rocket Lab"],
    [/\bopenai\b/,"OpenAI","ist nicht börsennotiert.","Microsoft, Nvidia"],
    [/\banthropic\b/,"Anthropic","ist nicht börsennotiert.","Amazon, Alphabet"],
    [/\bstripe\b/,"Stripe","ist nicht börsennotiert.","Adyen, PayPal"],
    [/\bmars\b/,"Mars","ist ein Familienunternehmen ohne Börsennotierung.","Mondelez, Nestlé"],
    [/\bheraeus\b|\bstihl\b|\bvoith\b|\bwürth\b|\bwuerth\b|\bboehringer\b|\bc&a\b|\boetker\b/,"","ist ein Familien- oder Stiftungsunternehmen ohne Aktien an der Börse.",""]];
  function privat(q){q=String(q||"").toLowerCase().trim();if(q.length<2)return null;for(const [re,n,info,alt] of PRIVAT){const m=q.match(re);if(m){const name=n||m[0].replace(/^./,c=>c.toUpperCase());return {n:name,text:`${name} ${info}`,alt}}}return null}

  G.Modell={privat,zerlege,bezug,wirktAuf,basisJahr,TREIBER,DEFAULTS,istTreiber};
})(typeof globalThis!=="undefined"?globalThis:self);
