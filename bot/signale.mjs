// Top-Aktien (eigene App im Repository timaxGg/Top-Picks, Anleitung für die KI in trading/KI-AUFGABE.md). Wird vom Wachmann bei jedem Lauf aufgerufen.
// 1. Rechnung: aus Tageskursen (Yahoo) eine Rangliste je Zeitraum (3, 7, 30 Handelstage), am letzten Jahr getestet.
// 2. Vorlage: 3x täglich die besten Kandidaten mit Fakten und Meldungen nach data/beste-vorlage.json.
//    Die Claude-Aufgabe „Top-Aktien Recherche“ recherchiert dazu im Netz und schreibt data/beste.json.
// 3. Ergebnis + Entwicklung früherer Listen landen in kurse.json (Feld sig), die App liest es dort.
// Keine erfundenen Zahlen: alle Zahlen kommen aus Kursdaten oder aus verlinkten Quellen. Keine Anlageberatung.
import fs from "node:fs";
import {verschluesseln,entschluesseln} from "./krypto.mjs";

let KOSTEN=0.15;           // % je Kauf bzw. Verkauf, wird bei jedem Lauf aus deinen Einstellungen (Gebühr, Einsatz, Spread) berechnet
let FREI_REST=0,STEUER=.26375,ZIEL_TAG=1,NOETIG={}; // Steuer auf Gewinne, dein Ziel pro Handelstag in %, nötiger Anstieg je Zeitraum
export const KOSTEN_STD={gebuehr:1,einsatz:1000,spread:.1,steuer:26.375};
// Wie viel muss ein Wert in H Handelstagen steigen, damit nach Kosten und Steuern dein Ziel übrig bleibt?
const zielH=H=>(Math.pow(1+ZIEL_TAG/100,H)-1)*100,noetig=H=>2*KOSTEN+zielH(H)/(1-STEUER);
function setzeKosten(md){const k=Object.assign({},KOSTEN_STD,(md&&md.kosten)||{}),z=(md&&md.ziel)||{wert:1,je:"tag"},t={tag:1,woche:5,monat:21}[z.je]||1;
  KOSTEN=(k.einsatz>0?k.gebuehr/k.einsatz*100:0)+(k.spread||0)/2;STEUER=Math.min(.6,Math.max(0,(k.steuer||0)/100));
  // Freistellungsauftrag: solange der Rest-Freibetrag den erwarteten Gewinn eines Trades abdeckt, fällt keine Steuer an
  const jahr=String(new Date().getFullYear()),verbraucht=((md&&md.verkauft)||[]).filter(v=>String(new Date(v.t).getFullYear())===jahr).reduce((a,v)=>a+Math.max(0,v.vorSt||0),0),rest=Math.max(0,(+k.frei||0)-verbraucht);ZIEL_TAG=(Math.pow(1+(+z.wert||0)/100,1/t)-1)*100;if(rest>0&&rest>=k.einsatz*zielH(7)/100)STEUER=0;FREI_REST=rest;
  for(const H of HORIZONTE)NOETIG[H]=+noetig(H).toFixed(2);return {kosten:k,ziel:z}}
const TOP=5;               // so viele Werte zeigt die App je Zeitraum
const KAND=10;             // so viele Kandidaten bekommt die KI je Zeitraum
const WEITERE=20;          // so viele weitere Werte aus der Rechnung zeigt die App je Zeitraum
const HORIZONTE=[3,7,30];  // Handelstage
const SLOTS=[["morgens",6*60+40],["mittags",12*60+40],["abends",18*60+40]]; // Vorlage ab dieser Uhrzeit (Berlin)

const UNIVERSUM=[ // [Kürzel (Yahoo), Name, a=Aktie e=ETF]
["AAPL","Apple","a"],["MSFT","Microsoft","a"],["NVDA","Nvidia","a"],["AMZN","Amazon","a"],["GOOGL","Alphabet","a"],["META","Meta","a"],
["TSLA","Tesla","a"],["AVGO","Broadcom","a"],["AMD","AMD","a"],["NFLX","Netflix","a"],["JPM","JPMorgan","a"],["V","Visa","a"],
["MA","Mastercard","a"],["XOM","Exxon Mobil","a"],["CVX","Chevron","a"],["COP","ConocoPhillips","a"],["SLB","Schlumberger","a"],["OXY","Occidental","a"],
["LLY","Eli Lilly","a"],["UNH","UnitedHealth","a"],["ABBV","AbbVie","a"],["PFE","Pfizer","a"],["JNJ","Johnson & Johnson","a"],["MRK","Merck & Co","a"],
["TMO","Thermo Fisher","a"],["ABT","Abbott","a"],["DHR","Danaher","a"],["AMGN","Amgen","a"],["GILD","Gilead","a"],["ISRG","Intuitive Surgical","a"],
["VRTX","Vertex","a"],["REGN","Regeneron","a"],["BMY","Bristol-Myers","a"],["CVS","CVS Health","a"],["MDT","Medtronic","a"],["SYK","Stryker","a"],
["BSX","Boston Scientific","a"],["COST","Costco","a"],["WMT","Walmart","a"],["HD","Home Depot","a"],["LOW","Lowe's","a"],["TGT","Target","a"],
["MCD","McDonald's","a"],["SBUX","Starbucks","a"],["CMG","Chipotle","a"],["KO","Coca-Cola","a"],["PEP","PepsiCo","a"],["PG","Procter & Gamble","a"],
["NKE","Nike","a"],["DIS","Disney","a"],["BKNG","Booking","a"],["ABNB","Airbnb","a"],["MAR","Marriott","a"],["ORCL","Oracle","a"],
["CRM","Salesforce","a"],["ADBE","Adobe","a"],["INTC","Intel","a"],["QCOM","Qualcomm","a"],["MU","Micron","a"],["TXN","Texas Instruments","a"],
["AMAT","Applied Materials","a"],["LRCX","Lam Research","a"],["KLAC","KLA","a"],["ADI","Analog Devices","a"],["MRVL","Marvell","a"],["ARM","Arm Holdings","a"],
["SMCI","Super Micro","a"],["ANET","Arista","a"],["PANW","Palo Alto","a"],["CRWD","CrowdStrike","a"],["SNOW","Snowflake","a"],["NOW","ServiceNow","a"],
["INTU","Intuit","a"],["IBM","IBM","a"],["CSCO","Cisco","a"],["DELL","Dell","a"],["PLTR","Palantir","a"],["UBER","Uber","a"],
["SHOP","Shopify","a"],["SPOT","Spotify","a"],["DDOG","Datadog","a"],["NET","Cloudflare","a"],["RBLX","Roblox","a"],["BAC","Bank of America","a"],
["WFC","Wells Fargo","a"],["C","Citigroup","a"],["GS","Goldman Sachs","a"],["MS","Morgan Stanley","a"],["SCHW","Charles Schwab","a"],["AXP","American Express","a"],
["BLK","BlackRock","a"],["PYPL","PayPal","a"],["COIN","Coinbase","a"],["HOOD","Robinhood","a"],["SOFI","SoFi","a"],["BRK-B","Berkshire Hathaway","a"],
["CAT","Caterpillar","a"],["BA","Boeing","a"],["GE","GE Aerospace","a"],["HON","Honeywell","a"],["LMT","Lockheed Martin","a"],["RTX","RTX","a"],
["NOC","Northrop Grumman","a"],["GD","General Dynamics","a"],["DE","Deere","a"],["UPS","UPS","a"],["UNP","Union Pacific","a"],["T","AT&T","a"],
["VZ","Verizon","a"],["TMUS","T-Mobile US","a"],["CMCSA","Comcast","a"],["NEE","NextEra Energy","a"],["DUK","Duke Energy","a"],["SO","Southern Co","a"],
["LIN","Linde","a"],["FCX","Freeport-McMoRan","a"],["NEM","Newmont","a"],["MSTR","Strategy","a"],["RIVN","Rivian","a"],["F","Ford","a"],
["GM","General Motors","a"],["SAP.DE","SAP","a"],["SIE.DE","Siemens","a"],["ALV.DE","Allianz","a"],["DTE.DE","Deutsche Telekom","a"],["AIR.DE","Airbus","a"],
["RHM.DE","Rheinmetall","a"],["MUV2.DE","Münchener Rück","a"],["IFX.DE","Infineon","a"],["BMW.DE","BMW","a"],["MBG.DE","Mercedes-Benz","a"],["VOW3.DE","Volkswagen","a"],
["BAS.DE","BASF","a"],["BAYN.DE","Bayer","a"],["DBK.DE","Deutsche Bank","a"],["CBK.DE","Commerzbank","a"],["ADS.DE","Adidas","a"],["PUM.DE","Puma","a"],
["DHL.DE","DHL Group","a"],["ENR.DE","Siemens Energy","a"],["MTX.DE","MTU Aero Engines","a"],["DB1.DE","Deutsche Börse","a"],["HNR1.DE","Hannover Rück","a"],["CON.DE","Continental","a"],
["HEI.DE","Heidelberg Materials","a"],["BEI.DE","Beiersdorf","a"],["FRE.DE","Fresenius","a"],["MRK.DE","Merck KGaA","a"],["SY1.DE","Symrise","a"],["ZAL.DE","Zalando","a"],
["SHL.DE","Siemens Healthineers","a"],["P911.DE","Porsche AG","a"],["EOAN.DE","E.ON","a"],["RWE.DE","RWE","a"],["VNA.DE","Vonovia","a"],["HEN3.DE","Henkel","a"],
["QIA.DE","Qiagen","a"],["HAG.DE","Hensoldt","a"],["R3NK.DE","Renk","a"],["ASML.AS","ASML","a"],["ADYEN.AS","Adyen","a"],["INGA.AS","ING","a"],
["PRX.AS","Prosus","a"],["MC.PA","LVMH","a"],["TTE.PA","TotalEnergies","a"],["OR.PA","L'Oréal","a"],["SAN.PA","Sanofi","a"],["AI.PA","Air Liquide","a"],
["SU.PA","Schneider Electric","a"],["BNP.PA","BNP Paribas","a"],["RMS.PA","Hermès","a"],["SAF.PA","Safran","a"],["DG.PA","Vinci","a"],["NOVO-B.CO","Novo Nordisk","a"],
["NESN.SW","Nestlé","a"],["ROG.SW","Roche","a"],["NOVN.SW","Novartis","a"],["UBSG.SW","UBS","a"],["ZURN.SW","Zurich Insurance","a"],["AZN.L","AstraZeneca","a"],
["SHEL.L","Shell","a"],["HSBA.L","HSBC","a"],["RR.L","Rolls-Royce","a"],["ENI.MI","Eni","a"],["UCG.MI","UniCredit","a"],["RACE.MI","Ferrari","a"],
["IBE.MC","Iberdrola","a"],["SAN.MC","Banco Santander","a"],["ITX.MC","Inditex","a"],["NOKIA.HE","Nokia","a"],["ERIC-B.ST","Ericsson","a"],["VOLV-B.ST","Volvo","a"],
["EQNR.OL","Equinor","a"],["SPY","S&P 500 ETF","e"],["QQQ","Nasdaq 100 ETF","e"],["IWM","Russell 2000 ETF","e"],["DIA","Dow Jones ETF","e"],["EEM","Schwellenländer ETF (USD)","e"],
["EFA","Industrieländer ex USA ETF","e"],["GLD","Gold ETF","e"],["SLV","Silber ETF","e"],["TLT","US-Staatsanleihen 20J ETF","e"],["XLK","US-Technologie ETF","e"],["XLF","US-Finanzen ETF","e"],
["XLE","US-Energie ETF","e"],["XLV","US-Gesundheit ETF","e"],["XLI","US-Industrie ETF","e"],["XLY","US-Konsum ETF","e"],["XLP","US-Basiskonsum ETF","e"],["XLU","US-Versorger ETF","e"],
["SMH","Halbleiter ETF","e"],["ITA","US-Rüstung ETF","e"],["XBI","Biotech ETF","e"],["URA","Uran ETF","e"],["KWEB","China Internet ETF","e"],["EWJ","Japan ETF","e"],
["EWG","Deutschland ETF (USD)","e"],["IBIT","Bitcoin ETF (iShares)","e"],["EUNL.DE","MSCI World ETF","e"],["VWCE.DE","FTSE All-World ETF","e"],["EXS1.DE","DAX ETF","e"],["SXR8.DE","S&P 500 ETF (EUR)","e"],
["SXRV.DE","Nasdaq 100 ETF (EUR)","e"],["EXW1.DE","Euro Stoxx 50 ETF","e"],["XMME.DE","Schwellenländer ETF","e"],["IUSQ.DE","MSCI ACWI ETF","e"],["EUNK.DE","MSCI Europe ETF","e"],["4GLD.DE","Xetra-Gold","e"],
["QDVE.DE","S&P 500 IT ETF","e"],["EXSA.DE","STOXX 600 ETF","e"],["IS3N.DE","Schwellenländer IMI ETF","e"],["XDEW.DE","S&P 500 gleichgewichtet ETF","e"],["EXV3.DE","Europa Technologie ETF","e"],["IQQH.DE","Saubere Energie ETF","e"],
["DFEN.DE","Europa Rüstung ETF","e"]];


// Erweiterung: alle S&P-500-Werte (Liste wird täglich von GitHub geladen) plus deutsche Nebenwerte, Europa und bekannte Wachstumswerte.
const SP500_URL="https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv";
const ZUSATZ=`BNR.DE:Brenntag DTG.DE:Daimler_Truck FME.DE:Fresenius_Medical_Care G1A.DE:GEA PAH3.DE:Porsche_SE SRT3.DE:Sartorius 1COV.DE:Covestro AIXA.DE:Aixtron BOSS.DE:Hugo_Boss
DUE.DE:Dürr EVK.DE:Evonik EVT.DE:Evotec FRA.DE:Fraport FNTN.DE:Freenet G24.DE:Scout24 GXI.DE:Gerresheimer HOT.DE:Hochtief JEN.DE:Jenoptik KGX.DE:Kion KRN.DE:Krones LEG.DE:LEG_Immobilien
LHA.DE:Lufthansa NEM.DE:Nemetschek NDA.DE:Aurubis RAA.DE:Rational RRTL.DE:RTL_Group SDF.DE:K+S SHA0.DE:Schaeffler SIX2.DE:Sixt SMHN.DE:Süss_Microtec SZG.DE:Salzgitter TEG.DE:TAG_Immobilien
TKA.DE:Thyssenkrupp TLX.DE:Talanx TMV.DE:Teamviewer UTDI.DE:United_Internet WAF.DE:Siltronic WCH.DE:Wacker_Chemie 8TRA.DE:Traton HFG.DE:HelloFresh AFX.DE:Carl_Zeiss_Meditec BC8.DE:Bechtle
EVD.DE:CTS_Eventim DHER.DE:Delivery_Hero TUI1.DE:TUI IOS.DE:Ionos AG1.DE:Auto1 KBX.DE:Knorr-Bremse 1U1.DE:1&1 NA9.DE:Nagarro VBK.DE:Verbio HYQ.DE:Hypoport TKMS.DE:TKMS FPE3.DE:Fuchs
STLAM.MI:Stellantis ISP.MI:Intesa_Sanpaolo ENEL.MI:Enel LDO.MI:Leonardo AD.AS:Ahold_Delhaize PHIA.AS:Philips ASM.AS:ASM_International BESI.AS:BE_Semiconductor KER.PA:Kering CAP.PA:Capgemini
HO.PA:Thales AM.PA:Dassault_Aviation DSY.PA:Dassault_Systèmes EL.PA:EssilorLuxottica CS.PA:AXA ULVR.L:Unilever BP.L:BP GSK.L:GSK BA.L:BAE_Systems LSEG.L:London_Stock_Exchange
ABBN.SW:ABB SIKA.SW:Sika LOGN.SW:Logitech SAAB-B.ST:Saab KOG.OL:Kongsberg ABI.BR:AB_InBev NESTE.HE:Neste VWS.CO:Vestas ORSTED.CO:Ørsted DSV.CO:DSV ATCO-A.ST:Atlas_Copco
MELI:MercadoLibre PDD:PDD BABA:Alibaba JD:JD.com BIDU:Baidu NIO:NIO LI:Li_Auto XPEV:XPeng SE:Sea NU:Nu_Holdings TSM:TSMC NVO:Novo_Nordisk_ADR RKLB:Rocket_Lab ASTS:AST_SpaceMobile
IONQ:IonQ RGTI:Rigetti QBTS:D-Wave SOUN:SoundHound BBAI:BigBear.ai AI:C3.ai PATH:UiPath U:Unity SNAP:Snap PINS:Pinterest RDDT:Reddit DUOL:Duolingo CELH:Celsius ELF:e.l.f._Beauty CAVA:Cava
HIMS:Hims_&_Hers OKLO:Oklo SMR:NuScale NBIS:Nebius CRWV:CoreWeave CRCL:Circle MARA:MARA RIOT:Riot_Platforms CLSK:CleanSpark IREN:IREN CIFR:Cipher_Mining AFRM:Affirm UPST:Upstart LMND:Lemonade
ROKU:Roku ZM:Zoom DOCU:DocuSign TWLO:Twilio OKTA:Okta ZS:Zscaler MDB:MongoDB TEAM:Atlassian LCID:Lucid PLUG:Plug_Power RUN:Sunrun ACHR:Archer_Aviation JOBY:Joby_Aviation LUNR:Intuitive_Machines
RCAT:Red_Cat ONDS:Ondas TEM:Tempus_AI RXRX:Recursion BTDR:Bitdeer TOST:Toast GME:GameStop CHWY:Chewy DKNG:DraftKings W:Wayfair ETSY:Etsy LYFT:Lyft SHOP:Shopify CVNA:Carvana APP:AppLovin`
  .split(/\s+/).filter(Boolean).map(x=>{const i=x.indexOf(":");return [x.slice(0,i),x.slice(i+1).replace(/_/g," "),"a"]});
async function grossesUniversum(ctx){const heute=new Date().toISOString().slice(0,10);if(ST.uni&&ST.uni.d===heute)return;
  try{const r=await fetch(SP500_URL);if(!r.ok)throw new Error("HTTP "+r.status);const t=await r.text(),zeilen=t.trim().split(/\r?\n/).slice(1),l=[];
    for(const z of zeilen){const m=z.match(/^([^,]+),("([^"]*)"|[^,]*)/);if(!m)continue;const s=m[1].trim().replace(".","-"),n=(m[3]??m[2]).trim();if(/^[A-Z0-9-]{1,6}$/.test(s))l.push([s,n,"a"])}
    if(l.length>400)ST.uni={d:heute,liste:l};else throw new Error("Liste zu kurz")}catch(e){ctx.log("S&P-500-Liste:",e.message);ST.uni=Object.assign(ST.uni||{liste:[]},{d:heute})}}

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
const pz2=v=>v==null||!isFinite(v)?"–":(v>0?"+":"")+(+v).toFixed(2).replace(".",",")+" %";
function dez(v){v=+v;const d=v>=1?2:v>=.01?4:6;return v.toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d})}
const CS={EUR:"€",USD:"$",GBp:"p",GBP:"£",CHF:"CHF",DKK:"kr"};

/* ---------- Daten ---------- */
async function yahoo(s,range){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${range}&interval=1d`,{headers:{"user-agent":"Mozilla/5.0 (compatible; AktienHelfer/1.0)"}});
  if(!r.ok){const e=new Error("Yahoo "+r.status);e.status=r.status;throw e}const j=await r.json(),res=j&&j.chart&&j.chart.result&&j.chart.result[0];if(!res||!res.timestamp)throw new Error("keine Daten für "+s);
  const q=(res.indicators.quote||[])[0]||{},m=res.meta||{},tz=m.exchangeTimezoneName||"UTC",out=[];
  for(let i=0;i<res.timestamp.length;i++){const o=q.open&&q.open[i],h=q.high&&q.high[i],l=q.low&&q.low[i],c=q.close&&q.close[i];if([o,h,l,c].some(v=>v==null||!isFinite(v)||v<=0))continue;
    const b=[teile(tz,new Date(res.timestamp[i]*1000)).date,r6(o),r6(h),r6(l),r6(c),Math.round((q.volume&&q.volume[i])||0)];if(out.length&&out[out.length-1][0]===b[0])out[out.length-1]=b;else out.push(b)}
  return {bars:out,cur:m.currency||"",p:m.regularMarketPrice,mt:(m.regularMarketTime||0)*1000}}
// Aktueller Preis inkl. vor- und nachbörslichem Handel (5-Minuten-Kerzen von heute). sess: pre, regular oder post.
async function preis(s){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=5m&includePrePost=true`,{headers:{"user-agent":"Mozilla/5.0 (compatible; AktienHelfer/1.0)"}});
  if(!r.ok){const e=new Error("Yahoo "+r.status);e.status=r.status;throw e}const j=await r.json(),res=j&&j.chart&&j.chart.result&&j.chart.result[0];if(!res)throw new Error("keine Daten für "+s);
  const m=res.meta||{},ts=res.timestamp||[],c=((res.indicators.quote||[])[0]||{}).close||[],tp=m.currentTradingPeriod||{};let p=null,t=0,last=null;
  for(let i=ts.length-1;i>=0;i--)if(c[i]>0){p=c[i];t=ts[i];break}
  for(let i=ts.length-1;i>=0;i--)if(c[i]>0&&tp.regular&&ts[i]>=tp.regular.start&&ts[i]<tp.regular.end){last=c[i];break}
  const reg=m.regularMarketTime||0;if(!p||reg>t){p=m.regularMarketPrice;t=reg}
  const sess=tp.pre&&t>=tp.pre.start&&t<tp.pre.end?"pre":tp.post&&t>=tp.post.start&&t<tp.post.end?"post":"regular";
  const heute=[];for(let i=0;i<ts.length;i+=3)if(c[i]>0)heute.push([ts[i],r6(c[i])]);if(t&&(!heute.length||heute[heute.length-1][0]<t))heute.push([t,r6(p)]);
  return {heute,p:r6(p),mt:t*1000,sess,regP:last!=null?r6(last):r6(m.regularMarketPrice),regT:(m.regularMarketTime||0)*1000,cur:m.currency||""}}
// Handelsfenster (vorbörslich bis nachbörslich), in denen sich Kurse ändern
const FENSTER={us:{tz:"America/New_York",a:240,b:1200},eu:{tz:"Europe/Berlin",a:480,b:1320}};
const imFenster=reg=>{const m=FENSTER[reg],z=teile(m.tz);return !["Sat","Sun"].includes(z.wd)&&z.min>=m.a&&z.min<m.b};
async function parallel(liste,n,f){let i=0,stop=false;await Promise.all(Array.from({length:n},async()=>{while(!stop&&i<liste.length){const x=liste[i++];try{await f(x)}catch(e){if(e.status===429)stop=true}}}));return stop}
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
// Punktzahl = Gewicht × Kursanstieg (geteilt durch die normale Schwankung) + Trend-Bonus − Abzug bei Überhitzung bzw. Ausverkauf.
// Die Gewichte sind einstellbar (data/beste-modell.json) und werden nur nach Zustimmung geändert (siehe „Updates“ unten).
// minBew: Werte, deren übliche Bewegung im Zeitraum kleiner ist als minBew × Kosten, fallen raus (zu träge, Kosten fressen den Gewinn).
// bew: Bonus für Werte, deren übliche Bewegung reicht, um dein Ziel nach Kosten und Steuern zu schaffen (wichtig für kurze Zeiträume).
// w5: Gewicht des Kursanstiegs der letzten 5 Tage. dd: Abzug, wenn der Kurs gerade deutlich unter seinem 10-Tage-Hoch liegt (Trend gebrochen).
// Beide starten bei 0 und werden nur nach Test und deiner Zustimmung eingeschaltet.
export const STANDARD={3:{w5:0,dd:0,w20:1,w60:0,w120:0,trend:.5,heiss:1,rsiGrenze:75,kalt:.5,minBew:3,bew:.5},7:{w5:0,dd:0,w20:.5,w60:.5,w120:0,trend:.5,heiss:.5,rsiGrenze:75,kalt:0,minBew:3,bew:.25},30:{w5:0,dd:0,w20:0,w60:1,w120:.5,trend:.5,heiss:0,rsiGrenze:75,kalt:0,minBew:0,bew:0}};
export const PARAM={w5:{n:"Gewicht Kursanstieg letzte 5 Tage",min:0,max:2,schritt:.25},dd:{n:"Abzug, wenn der Kurs gerade unter sein 10-Tage-Hoch gefallen ist",min:0,max:2,schritt:.25},w20:{n:"Gewicht Kursanstieg 4 Wochen",min:0,max:2,schritt:.25},w60:{n:"Gewicht Kursanstieg 3 Monate",min:0,max:2,schritt:.25},w120:{n:"Gewicht Kursanstieg 6 Monate",min:0,max:2,schritt:.25},
  minBew:{n:"Mindest-Bewegung (Vielfaches der Kosten)",min:0,max:10,schritt:1},bew:{n:"Bonus, wenn die übliche Bewegung fürs Ziel reicht",min:0,max:2,schritt:.25},
  trend:{n:"Bonus für Aufwärtstrend (20- über 50-Tage-Schnitt)",min:0,max:2,schritt:.25},heiss:{n:"Abzug bei Überhitzung",min:0,max:3,schritt:.25},rsiGrenze:{n:"RSI-Grenze für Überhitzung",min:65,max:90,schritt:5},kalt:{n:"Abzug bei Ausverkauf (RSI unter 25)",min:0,max:2,schritt:.25}};
function rechne(C){const n=C.length,lr=C.map((c,i)=>i?Math.log(c/C[i-1]):0),rsi=rsiR(C),s20=sma(C,20),s50=sma(C,50);
  const sd=Array(n).fill(null);for(let i=60;i<n;i++){const a=lr.slice(i-59,i+1),m=mean(a);sd[i]=Math.sqrt(mean(a.map(x=>(x-m)**2)))||null}
  const z=k=>C.map((c,i)=>i>=k&&sd[i]?Math.log(c/C[i-k])/(sd[i]*Math.sqrt(k)):null);
  const dd=C.map((c,i)=>i>=10&&sd[i]?Math.log(c/Math.max(...C.slice(i-9,i+1)))/sd[i]:null); // Abstand zum 10-Tage-Hoch in Tagesschwankungen (≤ 0)
  return {s200:sma(C,200),z5:z(5),dd,z20:z(20),z60:z(60),z120:z(120),tr:C.map((_,i)=>s20[i]!=null&&s50[i]!=null&&s20[i]>s50[i]?1:0),rsi,s20,s50,sd}}
const typBew=(R,i,H)=>R.sd[i]?R.sd[i]*Math.sqrt(H)*100:null; // übliche Bewegung in H Tagen (1 Standardabweichung, %)
const punkte=(R,i,p,H)=>{if(R.z120[i]==null||R.z20[i]==null||R.z60[i]==null)return null;const tb=typBew(R,i,H);
  if(p.minBew&&tb!=null&&tb<p.minBew*2*KOSTEN)return null;
  return (p.w5||0)*(R.z5[i]||0)-(p.dd||0)*Math.max(0,-(R.dd[i]??0)-1)+p.w20*R.z20[i]+p.w60*R.z60[i]+p.w120*R.z120[i]+p.trend*R.tr[i]-(R.rsi[i]>p.rsiGrenze?p.heiss:0)-(R.rsi[i]<25?p.kalt:0)+(p.bew&&tb!=null&&NOETIG[H]>0?p.bew*Math.min(1.5,tb/NOETIG[H]):0)};
const setzePunkte=(W,M)=>{for(const w of W){w.P={};for(const H of HORIZONTE)w.P[H]=w.C.map((_,i)=>punkte(w.R,i,M[H],H))}};

/* ---------- Test: wie gut war die Rangliste im letzten Jahr? ---------- */
// An jedem Handelstag die Top 5 nach Punktzahl kaufen (Schlusskurs), nach H Handelstagen verkaufen, Kosten abziehen,
// und mit dem Durchschnitt aller Werte im selben Zeitraum vergleichen.
function testTage(W){const ab=new Date(Date.now()-365*864e5).toISOString().slice(0,10),zaehl={};
  for(const w of W)for(const b of w.bars)if(b[0]>=ab)zaehl[b[0]]=(zaehl[b[0]]||0)+1;
  return Object.keys(zaehl).filter(d=>zaehl[d]>=W.length*.5).sort()}
function testH(W,H,par,tage){const top=[],alle=[];let besser=0,n=0;
  for(const d of tage){const l=[];for(const w of W){const i=w.idx.get(d);if(i==null||i+H>=w.C.length)continue;const p=par?punkte(w.R,i,par,H):w.P[H][i];if(p==null)continue;l.push({p,f:(w.C[i+H]/w.C[i]-1)*100-2*KOSTEN})}
    if(l.length<10)continue;l.sort((a,b)=>b.p-a.p);const t=l.slice(0,TOP),mt=mean(t.map(x=>x.f)),ma=mean(l.map(x=>x.f));top.push(...t.map(x=>x.f));alle.push(ma);n++;if(mt>ma)besser++}
  const ziel=[.5,1,2,3,5,10].map(z=>[z,Math.round(top.filter(x=>x>=z*H).length/(top.length||1)*100)]); // Anteil der Käufe mit mindestens z % pro Tag (einfach gerechnet)
  const zh=zielH(H),netto=x=>x>0?x*(1-STEUER):x,avgS=mean(top)>0?mean(top)*(1-STEUER):mean(top);
  return n?{tage:n,zielQuote:Object.fromEntries(ziel),nachSteuer:+avgS.toFixed(2),ueberKosten:Math.round(top.filter(x=>x>0).length/top.length*100),ueberZiel:Math.round(top.filter(x=>netto(x)>=zh).length/top.length*100),topAvg:+mean(top).toFixed(2),alleAvg:+mean(alle).toFixed(2),vorsprung:+(mean(top)-mean(alle)).toFixed(2),besser:Math.round(besser/n*100),plus:Math.round(top.filter(x=>x>0).length/top.length*100)}:{tage:0}}
function test(W){const tage=testTage(W),out={};for(const H of HORIZONTE)out[H]=testH(W,H,null,tage);return out}
// Prüfung eines Vorschlags: ganzes Jahr und getrennt nach erster und zweiter Jahreshälfte (gegen Zufallstreffer)
function pruefe(W,H,alt,neu){const tage=testTage(W),m=Math.floor(tage.length/2),teil=t=>({alt:testH(W,H,alt,t),neu:testH(W,H,neu,t)});
  const r={jahr:teil(tage),h1:teil(tage.slice(0,m)),h2:teil(tage.slice(m))};
  const besser=x=>x.neu.tage&&x.alt.tage&&x.neu.vorsprung>x.alt.vorsprung;
  r.urteil=besser(r.h1)&&besser(r.h2)&&r.jahr.neu.besser>=r.jahr.alt.besser?"besteht":besser(r.jahr)?"unsicher":"fällt durch";
  r.text=r.urteil==="besteht"?"Besser im ganzen Jahr und in beiden Jahreshälften einzeln. Das spricht dafür, dass es kein Zufallstreffer ist."
    :r.urteil==="unsicher"?"Im ganzen Jahr besser, aber nicht in beiden Hälften. Kann ein Zufallstreffer sein."
    :"Im Test nicht besser als die jetzige Rechnung.";
  return r}
// Varianten-Test: jede Einstellung einzeln einen Schritt rauf und runter, als Grundlage für die KI
function varianten(W,M){const tage=testTage(W),m=Math.floor(tage.length/2),out=[];
  for(const H of HORIZONTE){const b1=testH(W,H,M[H],tage.slice(0,m)),b2=testH(W,H,M[H],tage.slice(m));
    for(const [k,d] of Object.entries(PARAM))for(const sg of [1,-1]){const v=+(M[H][k]+sg*d.schritt).toFixed(2);if(v<d.min||v>d.max)continue;const par=Object.assign({},M[H],{[k]:v});
      const t1=testH(W,H,par,tage.slice(0,m)),t2=testH(W,H,par,tage.slice(m));if(!t1.tage||!t2.tage)continue;
      out.push({horizont:H,param:k,von:M[H][k],nach:v,vorsprungH1:{alt:b1.vorsprung,neu:t1.vorsprung},vorsprungH2:{alt:b2.vorsprung,neu:t2.vorsprung},beideBesser:t1.vorsprung>b1.vorsprung&&t2.vorsprung>b2.vorsprung})}}
  return out.sort((a,b)=>(b.beideBesser-a.beideBesser)||((b.vorsprungH1.neu-b.vorsprungH1.alt)+(b.vorsprungH2.neu-b.vorsprungH2.alt))-((a.vorsprungH1.neu-a.vorsprungH1.alt)+(a.vorsprungH2.neu-a.vorsprungH2.alt))).slice(0,15)}

/* ---------- Muster-Speicher: bekannte Kursmuster, an allen Werten der letzten 2 Jahre nachgeprüft ---------- */
// Nur Information mit Vorsicht: Muster fließen NICHT in die Rangliste ein.
const maxV=(C,a,b)=>{let m=-Infinity;for(let k=a;k<b;k++)if(C[k]>m)m=C[k];return m},minV=(C,a,b)=>{let m=Infinity;for(let k=a;k<b;k++)if(C[k]<m)m=C[k];return m};
const argmin=(C,a,b)=>{let j=a;for(let k=a;k<b;k++)if(C[k]<C[j])j=k;return j},argmax=(C,a,b)=>{let j=a;for(let k=a;k<b;k++)if(C[k]>C[j])j=k;return j};
export const MUSTER=[
  {id:"golden",n:"Golden Cross",t:"Der 50-Tage-Schnitt steigt über den 200-Tage-Schnitt.",f:(C,R,i)=>R.s200[i-1]!=null&&R.s50[i-1]<=R.s200[i-1]&&R.s50[i]>R.s200[i]},
  {id:"death",n:"Death Cross",t:"Der 50-Tage-Schnitt fällt unter den 200-Tage-Schnitt.",f:(C,R,i)=>R.s200[i-1]!=null&&R.s50[i-1]>=R.s200[i-1]&&R.s50[i]<R.s200[i]},
  {id:"hoch52",n:"Neues 52-Wochen-Hoch",t:"Schlusskurs höher als an jedem Tag des letzten Jahres.",f:(C,R,i)=>i>=251&&C[i]>maxV(C,i-250,i)&&C[i-1]<=maxV(C,i-251,i-1)},
  {id:"tief52",n:"Neues 52-Wochen-Tief",t:"Schlusskurs tiefer als an jedem Tag des letzten Jahres.",f:(C,R,i)=>i>=251&&C[i]<minV(C,i-250,i)&&C[i-1]>=minV(C,i-251,i-1)},
  {id:"doppelboden",n:"Doppelboden",t:"Zwei ähnliche Tiefs (höchstens 3 % auseinander), dann steigt der Kurs über das Hoch dazwischen.",f:(C,R,i)=>{if(i<45)return false;const a=argmin(C,i-40,i-20),b=argmin(C,i-15,i-1);if(Math.abs(C[b]/C[a]-1)>.03)return false;const hals=maxV(C,a+1,b);return hals>C[a]*1.05&&C[i]>hals&&C[i-1]<=hals}},
  {id:"doppeltop",n:"Doppeltop",t:"Zwei ähnliche Hochs (höchstens 3 % auseinander), dann fällt der Kurs unter das Tief dazwischen.",f:(C,R,i)=>{if(i<45)return false;const a=argmax(C,i-40,i-20),b=argmax(C,i-15,i-1);if(Math.abs(C[b]/C[a]-1)>.03)return false;const hals=minV(C,a+1,b);return hals<C[a]*.95&&C[i]<hals&&C[i-1]>=hals}},
  {id:"rsiErholung",n:"Erholung nach Ausverkauf",t:"Der RSI steigt von unter 30 wieder über 30.",f:(C,R,i)=>R.rsi[i-1]<30&&R.rsi[i]>=30},
  {id:"rsiAbkuehlung",n:"Abkühlung nach Übertreibung",t:"Der RSI fällt von über 70 wieder unter 70.",f:(C,R,i)=>R.rsi[i-1]>70&&R.rsi[i]<=70},
  {id:"enge",n:"Ausbruch aus ruhiger Seitwärtsphase",t:"Nach 4 ungewöhnlich ruhigen Wochen schließt der Kurs über dem Hoch dieser Phase.",f:(C,R,i)=>{if(i<81||!R.sd[i-1])return false;const hi=maxV(C,i-20,i),lo=minV(C,i-20,i);return Math.log(hi/lo)<1.5*R.sd[i-1]*Math.sqrt(20)&&C[i]>hi&&C[i-1]<=hi}},
  {id:"abverkauf",n:"Starker Abverkauf",t:"4 Verlusttage in Folge, zusammen mehr als 6 % minus.",f:(C,R,i)=>i>5&&C[i]<C[i-1]&&C[i-1]<C[i-2]&&C[i-2]<C[i-3]&&C[i-3]<C[i-4]&&C[i]/C[i-4]<.94&&!(C[i-1]/C[i-5]<.94&&C[i-4]<C[i-5])},
  {id:"test200",n:"Rücksetzer an den 200-Tage-Schnitt",t:"Im langfristigen Aufwärtstrend fällt der Kurs an den 200-Tage-Schnitt und schließt wieder deutlich darüber.",f:(C,R,i)=>R.s200[i-1]!=null&&R.s50[i]>R.s200[i]&&C[i-1]<=R.s200[i-1]*1.01&&C[i]>R.s200[i]*1.015}];
function musterEreignisse(w){if(w.ev)return w.ev;const ev=[],letzt={};for(let i=60;i<w.C.length;i++)for(const m of MUSTER){if(letzt[m.id]!=null&&i-letzt[m.id]<10)continue;try{if(m.f(w.C,w.R,i)){ev.push({m:m.id,i});letzt[m.id]=i}}catch(e){}}return w.ev=ev}
function musterSpeicher(W){const markt={};for(const H of HORIZONTE){const sum={},n={};for(const w of W)for(let i=0;i+H<w.C.length;i++){const d=w.bars[i][0];sum[d]=(sum[d]||0)+(w.C[i+H]/w.C[i]-1)*100;n[d]=(n[d]||0)+1}markt[H]=Object.fromEntries(Object.keys(sum).map(d=>[d,sum[d]/n[d]]))}
  const out={};for(const m of MUSTER){const o={n:0,h:{}};for(const H of HORIZONTE){const f=[],v=[];for(const w of W)for(const e of musterEreignisse(w))if(e.m===m.id&&e.i+H<w.C.length){const r=(w.C[e.i+H]/w.C[e.i]-1)*100;f.push(r);v.push(r-(markt[H][w.bars[e.i][0]]||0))}
      const mv=f.length?mean(v):0,sv=f.length>1?Math.sqrt(mean(v.map(x=>(x-mv)**2))):0,t=sv?mv/(sv/Math.sqrt(f.length)):0;
      o.n=Math.max(o.n,f.length);o.h[H]=f.length?{n:f.length,avg:+mean(f).toFixed(2),plus:Math.round(f.filter(x=>x>0).length/f.length*100),vorsprung:+mv.toFixed(2),t:+t.toFixed(1)}:{n:0}}
    // Urteil nur, wenn der Unterschied zum Markt deutlich größer ist als der Zufall (t-Wert über 2)
    const sig=HORIZONTE.filter(H=>o.h[H].n>=30&&Math.abs(o.h[H].t)>=2);
    o.urteil=HORIZONTE.every(H=>(o.h[H].n||0)<30)?"zu wenige Fälle":!sig.length?"kein klarer Vorteil":sig.every(H=>o.h[H].t>0)?"leicht positiv":sig.every(H=>o.h[H].t<0)?"eher negativ":"widersprüchlich";
    out[m.id]=o}return out}
function musterAktiv(w,H,speicher){const n=w.C.length;return musterEreignisse(w).filter(e=>e.i>=n-5).map(e=>{const m=MUSTER.find(x=>x.id===e.m),st=speicher&&speicher[e.m];
  return {id:e.m,n:m.n,vor:n-1-e.i,stat:st&&st.h[H]&&st.h[H].n?st.h[H]:null,urteil:st?st.urteil:null}})}

/* ---------- Abrechnung von Listen (Bilanz und Prüfung nach Updates) ---------- */
function abrechnen(W,eintraege,H){const erg=[];
  for(const x of eintraege)for(const p of x.picks||[]){const w=W.find(y=>y.s===p.s);if(!w||!p.p0)continue;const i0=w.bars.findIndex(b=>b[0]>=x.d);if(i0<0||!(i0+H<w.C.length-(offen(regionVon(w.s))?1:0)))continue;
    const d0=w.bars[i0][0],r=(w.C[i0+H]/p.p0-1)*100-2*KOSTEN,b=W.filter(v=>v.idx.has(d0)&&v.idx.get(d0)+H<v.C.length).map(v=>{const j=v.idx.get(d0);return (v.C[j+H]/v.C[j]-1)*100});erg.push({r,bench:b.length?mean(b):0})}
  return erg.length?{n:erg.length,avg:+mean(erg.map(e=>e.r)).toFixed(2),plus:Math.round(erg.filter(e=>e.r>0).length/erg.length*100),bench:+mean(erg.map(e=>e.bench)).toFixed(2),besser:Math.round(erg.filter(e=>e.r>e.bench).length/erg.length*100),
    werte:erg.slice(-300).map(e=>+e.r.toFixed(2))}:{n:0}} // werte: Einzelergebnisse, damit die App prüfen kann, wie oft ein Ziel erreicht wurde

/* ---------- Updates der Rechnung: KI schlägt vor, Wachmann testet, du stimmst zu ---------- */
const MODELL="data/beste-modell.json";
function modell(ctx){const f=readJSON(ctx.P(MODELL),null)||{},M={};for(const H of HORIZONTE)M[H]=Object.assign({},STANDARD[H],(f.params||{})[H]||{});return {M,version:f.version||0,verlauf:f.verlauf||[]}}
function pruefeVorschlag(v,M){if(!v||typeof v!=="object")return "kein Vorschlag";const H=+v.horizont;if(!HORIZONTE.includes(H))return "Zeitraum muss 3, 7 oder 30 sein";
  const ae=v.aenderung&&typeof v.aenderung==="object"?Object.entries(v.aenderung):[];if(!ae.length||ae.length>2)return "1 oder 2 Einstellungen ändern";
  for(const [k,x] of ae){const d=PARAM[k];if(!d)return "unbekannte Einstellung "+k;if(typeof x!=="number"||x<d.min||x>d.max)return `${k} muss zwischen ${d.min} und ${d.max} liegen`;if(x===M[H][k])return `${k} ist schon ${x}`}return ""}
async function entscheide(ctx,antwort,quelle){const V=ST.vorschlag;if(!V)return "Kein Vorschlag vorhanden.";const mo=modell(ctx),heute=new Date().toISOString().slice(0,10);
  const schreib=(params,eintrag)=>{const f={version:mo.version+1,geaendert:new Date().toISOString(),params,verlauf:[...mo.verlauf,eintrag].slice(-30)};fs.mkdirSync(ctx.P("data"),{recursive:true});fs.writeFileSync(ctx.P(MODELL),JSON.stringify(f,null,1));if(ctx.merk)ctx.merk(MODELL);return f.version};
  if(antwort==="ja"&&V.status==="offen"){const params=JSON.parse(JSON.stringify(mo.M));Object.assign(params[V.horizont],V.neu);
    const v=schreib(params,{version:mo.version+1,datum:heute,art:"Update",id:V.id,titel:V.titel,horizont:V.horizont,aenderung:V.liste,warum:V.warum,test:{urteil:V.test.urteil,jahr:V.test.jahr},zugestimmt:quelle});
    V.status="angenommen";V.entschieden=Date.now();ST.schatten={seit:heute,version:v,id:V.id,titel:V.titel,alt:mo.M,eintraege:[]};ST.verlauf=(ST.verlauf||[]).concat({id:V.id,titel:V.titel,status:"angenommen",urteil:V.test.urteil}).slice(-20);
    return `✅ Übernommen: <b>${ctx.esc(V.titel)}</b>. Ab jetzt rechnet die Liste so. Die alte Rechnung läuft 30 Tage zur Kontrolle mit, das Ergebnis siehst du unter Bilanz → Updates.`}
  if(antwort==="nein"&&V.status==="offen"){V.status="abgelehnt";V.entschieden=Date.now();ST.verlauf=(ST.verlauf||[]).concat({id:V.id,titel:V.titel,status:"abgelehnt",urteil:V.test.urteil}).slice(-20);return `❌ Abgelehnt: ${ctx.esc(V.titel)}. Es bleibt alles wie es ist.`}
  if(antwort==="zurueck"&&ST.schatten){const S=ST.schatten;schreib(S.alt,{version:mo.version+1,datum:heute,art:"Rückgängig",titel:"Rückgängig: "+S.titel,zugestimmt:quelle});ST.verlauf=(ST.verlauf||[]).concat({id:S.id,titel:S.titel,status:"rückgängig"}).slice(-20);ST.schatten=null;
    return `↩️ Rückgängig gemacht: ${ctx.esc(S.titel)}. Die Liste rechnet wieder wie vorher.`}
  return "Dazu gibt es gerade nichts zu entscheiden."}
const vorschlagText=(ctx,V)=>`🧪 <b>Update-Vorschlag${V.quelle?" ("+ctx.esc(V.quelle)+")":" der KI"}</b> (${V.horizont} Tage)\n<b>${ctx.esc(V.titel)}</b>\n\n<b>Was sich ändert</b>\n${V.liste.map(x=>`• ${ctx.esc(x.name)}: ${x.von} → ${x.nach}`).join("\n")}\n\n<b>Warum</b>\n${ctx.esc(V.warum)}\n\n<b>Test am letzten Jahr</b> (Vorsprung der Top 5 vor dem Durchschnitt je Kauf)\nGanzes Jahr: jetzt ${pz2(V.test.jahr.alt.vorsprung)} → neu ${pz2(V.test.jahr.neu.vorsprung)}\n1. Hälfte: ${pz2(V.test.h1.alt.vorsprung)} → ${pz2(V.test.h1.neu.vorsprung)} · 2. Hälfte: ${pz2(V.test.h2.alt.vorsprung)} → ${pz2(V.test.h2.neu.vorsprung)}\nUrteil: <b>${V.test.urteil}</b>. ${ctx.esc(V.test.text)}\n\nÜbernehmen? Erst nach deinem Ja ändert sich etwas.`;
export async function knopf(cb,ctx){SF=ctx.P(".state/beste.json");if(!ST)ST=lade();const [art,a,id]=String(cb.data||"").split(":"),V=ST.vorschlag;
  if(art==="tp"){if(!MD)MD=await meinDepot(ctx);return okKnopf(cb,ctx,id)}
  const ok=a==="zurueck"?!!ST.schatten:V&&V.id===id;const t=ok?await entscheide(ctx,a,"Telegram"):"Dieser Vorschlag ist nicht mehr offen.";
  if(ctx.tg){await ctx.tg("answerCallbackQuery",{callback_query_id:cb.id,text:ok?"Gespeichert":"Nicht mehr offen"});await ctx.tg("editMessageText",{chat_id:cb.message.chat.id,message_id:cb.message.message_id,parse_mode:"HTML",text:t})}speichere()}

/* ---------- Benachrichtigungen der Top-Aktien-App ---------- */
// Einstellungen kommen aus der App (Meine → Benachrichtigungen). Standard: alles an. „nachts“ an = auch zwischen 22 und 7 Uhr.
export const MELDUNGEN={schutz:"Gewinn- und Verlustschutz",bewegung:"Starke Kursbewegung im Top-Depot (alle 2 %)",stand:"Depot-Stand jede Stunde (9–22 Uhr, Börsentage)",
  liste:"Neue KI-Listen (3× täglich)",wechsel:"Neu in den Top 5 (3 und 7 Tage)",einstieg:"Einstieg günstig (Top-Listen und gemerkte)",update:"Update-Vorschläge der KI"};
const an=art=>!(MD&&MD.notify&&MD.notify[art]===false);
// Farbe für eine Aktie (Telegram kann keine Textfarbe, daher farbige Punkte):
// 🟢 steigt · 🟡 bleibt gleich · 🟠 aus dem Plus etwas gesunken · 🔴 fällt im Minus oder hat vom Höchststand mehr als „grenze“ Prozentpunkte verloren
const EPS=.1;
function farbe(ch,vorher,hoch,grenze){const g=(MD&&MD.notify&&+MD.notify.grenze>0)?+MD.notify.grenze:(grenze||.5),d=vorher==null?0:ch-vorher;
  if(hoch!=null&&hoch>0&&hoch-ch>=g)return "🔴";if(d>EPS)return "🟢";if(d>=-EPS)return "🟡";return ch>0?"🟠":"🔴"}
const hochVon=(id,ch)=>{ST.hoch=ST.hoch||{};ST.hoch[id]=Math.max(ST.hoch[id]??ch,ch);return ST.hoch[id]};
async function melde(ctx,art,text,o={}){if(!ctx.send||!an(art))return false;const nachts=MD&&MD.notify&&MD.notify.nachts===true;
  if(!nachts&&!o.dringend&&!o.direkt&&ctx.leise()&&art!=="schutz"&&art!=="update")return false; // ruhige Meldungen nachts weglassen statt nachholen
  await ctx.send(text,Object.assign({},o,nachts||art==="schutz"?{dringend:true}:{}));return true} // Schutz-Warnungen immer sofort

/* ---------- Eigenes Depot der Top-Aktien-App ---------- */
// Die App speichert Merkliste und übernommene Aktien verschlüsselt (Sync-Passwort der Haupt-App) in data/top.enc.
async function meinDepot(ctx){const PASS=process.env.SYNC_PASSWORD||"",f=ctx.P("data/top.enc");if(!PASS||!fs.existsSync(f))return null;
  try{const d=await entschluesseln(fs.readFileSync(f,"utf8"),PASS);delete ctx.B.err.topdepot;return {depot:Array.isArray(d.depot)?d.depot:[],merk:Array.isArray(d.merk)?d.merk:[],kosten:d.kosten,ziel:d.ziel,notify:d.notify||{},verkauft:Array.isArray(d.verkauft)?d.verkauft:[]}}
  catch(e){ctx.B.err.topdepot="Top-Aktien-Depot nicht lesbar. Stimmt das Sync-Passwort?";return null}}
const linie=(ref,abst,erste)=>{const t=ref-abst;return erste&&t<0?-.5:Math.max(0,t)};
async function schutz(ctx,W,out){ST.sch=ST.sch||{};const da=new Set();
  for(const x of MD.depot){if(!x||!x.id||!x.s||!(x.k>0))continue;da.add(x.id);const h=ST.hist[x.s];if(!h||!h.bars)continue;
    const p=h.p&&Date.now()-(h.mt||0)<4*864e5?h.p:h.bars[h.bars.length-1][1];if(!(p>0))continue;
    const ch=(p/x.k-1)*100;hochVon(x.id,ch);const st=ST.sch[x.id]=ST.sch[x.id]||{ref:ch,al:null,vl:null,okT:0,seit:Date.now()},n=x.n||x.s,c=CS[h.cur]||h.cur||"";
    if(x.okT&&x.okT>st.okT){st.okT=x.okT;st.ref=ch;st.al=ch<0?ch:null}
    const kurs=`Kurs ${dez(p)} ${c} · Kauf ${dez(x.k)} ${c}${x.q?` · ${x.q} Stück`:""}`,lk=link(ctx,x.s).replace("In der Top-Aktien-App öffnen ›","Zur Aktie in der Top-Aktien-App ›");
    // Verlustschutz: Meldung, wenn das Minus die Grenze erreicht, danach bei jedem weiteren 2 Prozentpunkten
    const a=-Math.abs(x.a==null?10:x.a);
    if(x.a!==0&&ch<=a){if(st.vl==null||ch<=st.vl-2){st.vl=ch;
      await melde(ctx,"schutz",`🔴 <b>Verlustschutz: ${ctx.esc(n)}</b>\nDu liegst <b>${pz(ch)}</b> unter deinem Kaufkurs. Deine Grenze: ${pz(a)}.\n${kurs}\n\nJetzt prüfen: verkaufen, um das Minus zu begrenzen, oder bewusst halten. Ich melde mich wieder, wenn es 2 weitere Prozentpunkte fällt.${lk}`,{dringend:ch<=a-5})}}
    else if(st.vl!=null&&ch>a+1)st.vl=null;
    // Gewinnschutz: Schutzlinie = höchstes Plus seit Kauf (oder seit „OK“) minus Abstand, nie unter 0; erste Stunde ab −0,5 %
    if(x.nl!==0){const abst=x.nl>0?x.nl:.5,erste=!!x.t&&Date.now()-x.t<36e5,nach=x.nm==="kurs";st.ref=Math.max(st.ref,ch);
      // nm "kurs": Nachlauf X % unter dem Höchstkurs seit Kauf, ohne Untergrenze (im Rückblick-Test besser als die enge Linie, die nie unter 0 geht)
      const lv=nach?((1+Math.max(st.ref,0)/100)*(1-abst/100)-1)*100:linie(st.ref,abst,erste),unter=nach||lv>0?ch<=lv:ch<lv,doppelt=lv<=0&&x.a!==0&&ch<=a; // im Minus unter der Verlustgrenze reicht die Verlust-Meldung
      if(unter&&!doppelt){if(st.al==null||ch<=st.al-1){st.al=ch;const neu=linie(ch,abst,false);
          await melde(ctx,"schutz",`🔴🛡️ <b>Gewinnschutz: ${ctx.esc(n)}</b>\n${nach?`Der Kurs liegt jetzt ${abst} % oder mehr unter dem Höchstkurs seit Kauf (${pz(st.ref)} seit Kauf). Stand jetzt: <b>${pz(ch)}</b> seit Kauf.`:lv>0?`Dein Plus ist auf <b>${pz(ch)}</b> gefallen. Höchster Stand war ${pz(st.ref)}, deine Schutzlinie liegt bei ${pz(lv)}.`:`Du bist ins Minus gerutscht: <b>${pz(ch)}</b> seit Kauf.`}\n${kurs}\n\nVerkaufen oder mit <b>OK</b> bestätigen, dass die Aktie gesund ist. ${nach?`Dann zählt der jetzige Kurs als neuer Höchstkurs.`:ch>=0?`Dann gilt ${pz(ch)} als neuer Höchstwert und die Schutzlinie liegt bei ${pz(neu)}.`:"Dann melde ich mich erst wieder, wenn es einen weiteren Prozentpunkt fällt."}${lk}`,{knoepfe:[[{text:"✅ OK, Aktie ist gesund",callback_data:`tp:ok:${x.id}`.slice(0,64)}]]})}}
      else if(st.al!=null&&ch>lv+.2)st.al=null;
      out[x.id]={ch:+ch.toFixed(2),p:r6(p),ref:+st.ref.toFixed(2),lv:+lv.toFixed(2),abst,nm:nach?"kurs":undefined,warn:unter,vl:st.vl!=null,t:Date.now()}}
    else out[x.id]={ch:+ch.toFixed(2),p:r6(p),vl:st.vl!=null,t:Date.now()}}
  for(const id of Object.keys(ST.sch))if(!da.has(id))delete ST.sch[id]}
// Starke Bewegung im Top-Depot: Meldung bei jedem weiteren 2-%-Schritt am selben Tag
async function bewegung(ctx){ST.bew=ST.bew||{};const heute=new Date().toISOString().slice(0,10);if(!MD)return;
  for(const x of MD.depot){const h=ST.hist[x.s];if(!h||!h.bars||h.bars.length<2||!(h.p>0))continue;const b=h.bars,letzt=b[b.length-1],vorTag=letzt[0]===teile(regionVon(x.s)==="eu"?"Europe/Berlin":"America/New_York").date?b[b.length-2][1]:letzt[1];
    const dp=(h.p/vorTag-1)*100,stufe=Math.trunc(dp/2),st=ST.bew[x.id];if(!st||st.d!==heute)ST.bew[x.id]={d:heute,s:0};
    if(stufe!==0&&Math.abs(stufe)>Math.abs(ST.bew[x.id].s)){ST.bew[x.id].s=stufe;const ch=(h.p/x.k-1)*100,c=CS[h.cur]||h.cur||"",hoch=hochVon(x.id,ch),fa=dp>0?(hoch>0&&hoch-ch>=((MD.notify&&+MD.notify.grenze)||.5)?"🔴":"🟢"):(ch>0&&!(hoch-ch>=((MD.notify&&+MD.notify.grenze)||.5))?"🟠":"🔴");
      await melde(ctx,"bewegung",`${fa} <b>${ctx.esc(x.n||x.s)} ${pz(dp)} heute</b>\nKurs ${dez(h.p)} ${c} · seit Kauf ${pz(ch)}${dp<0?"\nGewinn- und Verlustschutz laufen weiter.":"\nTipp: Gewinnschutz prüfen, damit das Plus gesichert bleibt."}${link(ctx,x.s)}`)}}}
// Schneller Zwischen-Durchgang (während der Wachmann auf Telegram wartet): nur Kurse des Top-Depots, Schutz und Bewegung
export async function schnell(ctx){SF=ctx.P(".state/beste.json");if(!ST)ST=lade();if(Date.now()-(ST.schnellT||0)<50e3)return;ST.schnellT=Date.now();if(!MD)MD=await meinDepot(ctx);if(!MD||!MD.depot.length)return;
  for(const s of [...new Set(MD.depot.map(d=>d.s))]){const h=ST.hist[s];if(!h||!h.bars||!offen(regionVon(s)))continue;try{const y=await yahoo(s,"5d");h.bars=zusammen(h.bars,y.bars.map(b=>[b[0],b[4]])).slice(-560);h.p=y.p;h.mt=y.mt;h.lt=Date.now()}catch(e){}}
  const out={};await schutz(ctx,null,out);await bewegung(ctx);speichere()}
async function halteEnde(ctx){if(!MD)return;ST.halteMeld=ST.halteMeld||{};const z=teile("Europe/Berlin");
  for(const x of MD.depot){if(!x.bis||ST.halteMeld[x.id]===x.bis||z.date<x.bis)continue;const zt=ST.intra&&ST.intra[x.s]&&ST.intra[x.s].r,uhr=zt&&zt.teuer?zt.teuer.t:(regionVon(x.s)==="eu"?"10:00":"16:00"),[hh,mm]=uhr.split(":").map(Number);
    if(z.date===x.bis&&z.min<hh*60+mm)continue;const h=ST.hist[x.s];if(!h||!(h.p>0))continue;ST.halteMeld[x.id]=x.bis;const ch=(h.p/x.k-1)*100;
    await melde(ctx,"schutz",`⏰ <b>Haltedauer endet: ${ctx.esc(x.n||x.s)}</b>\nGeplant war Halten bis ${x.bis.split("-").reverse().join(".")}. Jetzt ${pz(ch)} seit Kauf (Kurs ${dez(h.p)} ${CS[h.cur]||h.cur||""}).\nVerkaufen prüfen. Länger halten nur mit neuem Grund.${link(ctx,x.s)}`)}}
async function okKnopf(cb,ctx,id){const st=ST.sch&&ST.sch[id],x=MD&&MD.depot.find(d=>d.id===id);
  if(!st||!x){if(ctx.tg)await ctx.tg("answerCallbackQuery",{callback_query_id:cb.id,text:"Position nicht mehr gefunden"});return}
  const h=ST.hist[x.s],p=h&&h.p||x.k,ch=(p/x.k-1)*100;st.ref=ch;st.al=ch<0?ch:null;st.okT=Date.now();const lv=linie(ch,x.nl>0?x.nl:.5,false);
  if(ctx.tg){await ctx.tg("answerCallbackQuery",{callback_query_id:cb.id,text:"Gewinnschutz neu gesetzt"});
    await ctx.tg("editMessageText",{chat_id:cb.message.chat.id,message_id:cb.message.message_id,parse_mode:"HTML",text:`🛡️ Gewinnschutz: ${ctx.esc(x.n||x.s)}\n✅ Bestätigt: ${pz(ch)} ist jetzt der Ausgangswert, die Schutzlinie liegt bei <b>${pz(lv)}</b>.${ch<0?" Ich melde mich wieder, wenn es einen weiteren Prozentpunkt fällt.":""}`})}speichere()}

/* ---------- Einstieg: Ist jetzt ein guter Moment zum Kaufen, oder lieber auf einen Rücksetzer warten? ---------- */
// Zustand aus dem Kurs: Abstand zum 20-Tage-Schnitt (in Tagesschwankungen), Abstand zum 10-Tage-Hoch, RSI und Trend.
// Für jeden Zustand wird an allen Werten des letzten Jahres geprüft, was ein Kauf danach gebracht hat, und ob sich Warten gelohnt hat.
const ZUST={guenstig:{n:"Jetzt günstig",t:"Aufwärtstrend und der Kurs hat gerade etwas nachgegeben. Du kaufst nicht oben auf dem Berg."},
  wende:{n:"Wende nach oben",t:"Nach einem Rücksetzer im Aufwärtstrend steigt der Kurs wieder."},
  neutral:{n:"Neutral",t:"Weder besonders günstig noch überdehnt."},
  ueberdehnt:{n:"Gerade oben – Rücksetzer abwarten",t:"Der Kurs ist zuletzt schnell gestiegen und liegt weit über seinem Durchschnitt. Wer jetzt kauft, kauft oft oben."},
  messer:{n:"Fällt noch – Wende abwarten",t:"Der Kurs fällt im Abwärtstrend. Erst kaufen, wenn er wieder Boden findet."}};
function zustand(w,i){const R=w.R,C=w.C,sd=R.sd[i];if(i<60||!sd||R.s20[i]==null||R.s50[i]==null)return null;
  const ab=Math.log(C[i]/R.s20[i])/sd,hi10=maxV(C,i-9,i+1),vomHoch=Math.log(C[i]/hi10)/sd,r3=Math.log(C[i]/C[i-3])/sd,r1=Math.log(C[i]/C[i-1])/sd,auf=R.s20[i]>R.s50[i];
  let z="neutral",ziel=null;
  if(!auf&&C[i]<R.s20[i]&&r3<-1){z="messer";ziel=maxV(C,i-4,i+1)}                       // erst über dem 5-Tage-Hoch wieder interessant
  else if(ab>2.5||R.rsi[i]>72){z="ueberdehnt";ziel=R.s20[i]*Math.exp(.5*sd)}              // Einstiegszone: nahe am 20-Tage-Schnitt
  else if(auf&&ab>-1.5&&ab<1&&vomHoch<-1&&r1>.3)z="wende";
  else if(auf&&ab>-1.5&&ab<1&&vomHoch<-1)z="guenstig";
  return {z,ab:+ab.toFixed(2),ziel,vomHoch:+((C[i]/hi10-1)*100).toFixed(1)}}
function einstiegStat(W){const ab=new Date(Date.now()-365*864e5).toISOString().slice(0,10),out={};
  for(const k of Object.keys(ZUST))out[k]={3:[],7:[],treffer:0,tage:[],n:0,warten:[],sofort:[]};
  for(const w of W)for(let i=60;i<w.C.length-1;i++){if(w.bars[i][0]<ab)continue;const z=zustand(w,i);if(!z)continue;const o=out[z.z];
    for(const H of [3,7])if(i+H<w.C.length)o[H].push((w.C[i+H]/w.C[i]-1)*100-2*KOSTEN);
    if(z.ziel&&i+17<w.C.length){o.n++;// kommt der Kurs in 10 Tagen an die Einstiegsmarke? Und war Warten besser als sofort kaufen?
      let j=-1;for(let k=1;k<=10;k++){const c=w.C[i+k];if(z.z==="messer"?c>z.ziel:c<=z.ziel){j=i+k;break}}
      // fairer Vergleich über ALLE Fälle, beide verkaufen am selben Tag (i+17): sofort kaufen vs. warten (Kauf an der Marke, sonst nach 10 Tagen)
      const kauf=j>0?j:i+10;if(j>0){o.treffer++;o.tage.push(j-i)}o.warten.push((w.C[i+17]/w.C[kauf]-1)*100);o.sofort.push((w.C[i+17]/w.C[i]-1)*100)}}
  const med=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]};
  for(const [k,o] of Object.entries(out)){const r={};for(const H of [3,7])r[H]=o[H].length?{n:o[H].length,avg:+mean(o[H]).toFixed(2),plus:Math.round(o[H].filter(x=>x>0).length/o[H].length*100)}:{n:0};
    if(o.n)Object.assign(r,{faelle:o.n,erreicht:Math.round(o.treffer/o.n*100),medTage:med(o.tage),wartenAvg:o.warten.length?+mean(o.warten).toFixed(2):null,sofortAvg:o.sofort.length?+mean(o.sofort).toFixed(2):null});
    out[k]=r}
  return out}
/* ---------- Ausstieg: Wann verkaufen? Fester Tag gegen mitlaufenden Gewinnschutz, im Rückblick (1 Jahr, Schlusskurse, nach Kosten) ---------- */
const AUS_REGELN=[["fest3","nach 3 Tagen verkaufen"],["fest7","nach 7 Tagen verkaufen"],["s1","Gewinnschutz 1 Pkt."],["s2","Gewinnschutz 2 Pkt."],["s3","Gewinnschutz 3 Pkt."],["s5","Gewinnschutz 5 Pkt."],["n2","2 % unter Höchstkurs"],["n3","3 % unter Höchstkurs"],["n5","5 % unter Höchstkurs"],["z2","bei +2 % mitnehmen, sonst nach 7 Tagen"],["z4","bei +4 % mitnehmen, sonst nach 7 Tagen"]];
function ausstiegStat(W){const ab=new Date(Date.now()-365*864e5).toISOString().slice(0,10),MAX=15,out={};
  const sim=(C,i,r)=>{const k=C[i];if(r[0]==="f"){const H=+r.slice(4);return i+H<C.length?[(C[i+H]/k-1)*100,H]:null}
    if(r[0]==="z"){if(i+7>=C.length)return null;const g=+r.slice(1);for(let j=i+1;j<=i+7;j++){const ch=(C[j]/k-1)*100;if(ch>=g)return [ch,j-i]}return [(C[i+7]/k-1)*100,7]}
    if(i+MAX>=C.length)return null;const d=+r.slice(1);let ref=0,hoch=k;
    for(let j=i+1;j<=i+MAX;j++){const ch=(C[j]/k-1)*100;
      if(r[0]==="s"){ref=Math.max(ref,ch);const lv=Math.max(0,ref-d);if(lv>0?ch<=lv:ch<0)return [ch,j-i]} // genau wie der Gewinnschutz in der App (Schutzlinie nie unter 0)
      else{hoch=Math.max(hoch,C[j]);if(C[j]<=hoch*(1-d/100))return [ch,j-i]}}
    return [(C[i+MAX]/k-1)*100,MAX]};
  for(const k of Object.keys(ZUST))out[k]={perfekt:[],...Object.fromEntries(AUS_REGELN.map(([r])=>[r,{e:[],t:[]}]))};
  for(const w of W)for(let i=60;i<w.C.length-1;i++){if(w.bars[i][0]<ab)continue;const z=zustand(w,i);if(!z)continue;const o=out[z.z];
    for(const [r] of AUS_REGELN){const x=sim(w.C,i,r);if(x){o[r].e.push(x[0]-2*KOSTEN);o[r].t.push(x[1])}}
    if(i+7<w.C.length)o.perfekt.push((Math.max(...w.C.slice(i+1,i+8))/w.C[i]-1)*100-2*KOSTEN)} // Verkauf genau am Höchststand – geht nur im Nachhinein
  const med=a=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]};
  for(const [k,o] of Object.entries(out)){const r={regeln:{}};
    for(const [id,name] of AUS_REGELN){const a=o[id].e;if(a.length<30)continue;r.regeln[id]={name,n:a.length,avg:+mean(a).toFixed(2),plus:Math.round(a.filter(x=>x>0).length/a.length*100),tage:med(o[id].t)}}
    if(o.perfekt.length)r.perfekt=+mean(o.perfekt).toFixed(2);
    const b=Object.entries(r.regeln).sort((x,y)=>y[1].avg-x[1].avg)[0];if(b)r.best=b[0];out[k]=r}
  return out}
/* ---------- Uhrzeit: zu welcher Tageszeit war der Kurs in den letzten ~60 Tagen meist am günstigsten? ---------- */
const uhrB=sek=>{const z=teile("Europe/Berlin",new Date(sek*1000));return String(Math.floor(z.min/60)).padStart(2,"0")+":"+String(z.min%60).padStart(2,"0")};
async function tageszeit(s){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=60d&interval=5m`,{headers:{"user-agent":"Mozilla/5.0 (compatible; AktienHelfer/1.0)"}});
  if(!r.ok){const e=new Error("Yahoo "+r.status);e.status=r.status;throw e}const j=await r.json(),res=j&&j.chart&&j.chart.result&&j.chart.result[0];if(!res||!res.timestamp)return null;
  const q=(res.indicators.quote||[])[0]||{},tz=(res.meta||{}).exchangeTimezoneName||"UTC",tage=new Map();
  for(let i=0;i<res.timestamp.length;i++){const ts=res.timestamp[i],o=q.open[i],l=q.low[i],c=q.close[i];if(!(o>0&&l>0&&c>0))continue;const d=teile(tz,new Date(ts*1000)).date;if(!tage.has(d))tage.set(d,[]);tage.get(d).push({t:uhrB(ts),o,l,c})}
  const B={};let n=0;for(const bars of tage.values()){if(bars.length<30)continue;n++;const o=bars[0].o;let jm=0;bars.forEach((b,k)=>{if(b.l<bars[jm].l)jm=k});
    bars.forEach((b,k)=>{const x=B[b.t]=B[b.t]||{t:b.t,sum:0,n:0,tief:0};x.sum+=(b.c/o-1)*100;x.n++;if(k===jm)x.tief++})}
  if(n<15)return null;const b=Object.values(B).filter(x=>x.n>=n*.6).sort((a,b)=>a.t<b.t?-1:1).map(x=>({t:x.t,avg:+(x.sum/x.n).toFixed(2),tief:Math.round(x.tief/n*100)}));
  // 5-Minuten-Daten, ausgewertet in gleitenden 15-Minuten-Fenstern: genauer als 30 Minuten, aber nicht so zufällig wie einzelne 5 Minuten
  const M=15,k=M/5,plus=(t,m)=>{const [h,mi]=t.split(":").map(Number),z=h*60+mi+m;return String(Math.floor(z/60)%24).padStart(2,"0")+":"+String(z%60).padStart(2,"0")},F=[];
  for(let i=0;i+k<=b.length;i++){const g=b.slice(i,i+k);if(plus(g[0].t,M-5)!==g[k-1].t)continue;F.push({t:g[0].t,bis:plus(g[0].t,M),avg:+mean(g.map(x=>x.avg)).toFixed(2),tief:g.reduce((a,x)=>a+x.tief,0)})}
  if(!F.length)return null;const best=[...F].sort((a,c)=>c.tief-a.tief)[0],billig=[...F].sort((a,c)=>a.avg-c.avg)[0],teuer=[...F].sort((a,c)=>c.avg-a.avg)[0];return {tage:n,m:M,b,best,billig,teuer}}
const WTG=["So.","Mo.","Di.","Mi.","Do.","Fr.","Sa."];
function fenster(s,jetzt=Date.now()){const zt=ST.intra&&ST.intra[s]&&ST.intra[s].r&&ST.intra[s].r.best,t=zt?zt.t:(regionVon(s)==="eu"?"09:30":"16:00"),[hh,mm]=t.split(":").map(Number);
  const z=teile("Europe/Berlin",new Date(jetzt)),off=Date.UTC(...z.date.split("-").map((v,i)=>i===1?+v-1:+v),Math.floor(z.min/60),z.min%60)-Math.floor(jetzt/6e4)*6e4; // Abstand Berlin–UTC
  for(let k=0;k<8;k++){const d=new Date(Date.parse(z.date+"T00:00:00Z")+k*864e5),wd=d.getUTCDay();if(wd===0||wd===6)continue;const start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),hh,mm)-off;
    const len=(ST.intra&&ST.intra[s]&&ST.intra[s].r&&ST.intra[s].r.m)||30;if(jetzt<start+len*6e4)return {start,t,jetzt:jetzt>=start,tag:k===0?"heute":k===1?"morgen":WTG[wd]+" "+d.getUTCDate()+"."+(d.getUTCMonth()+1)+".",bis:zt&&zt.bis?zt.bis:(()=>{const x=hh*60+mm+len;return String(Math.floor(x/60)).padStart(2,"0")+":"+String(x%60).padStart(2,"0")})()}}
  return null}
function halteTage(z){const st=ST.einstieg&&ST.einstieg.s&&ST.einstieg.s[z];if(!st||!st[3]||!st[7]||!st[3].n||!st[7].n)return 3;return st[7].avg>st[3].avg?7:3}
function plusHandelstage(ts,n){const d=new Date(ts);let k=0;while(k<n){d.setUTCDate(d.getUTCDate()+1);const wd=d.getUTCDay();if(wd&&wd!==6)k++}return d}
const tagKurz=d=>`${WTG[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth()+1}.`;
function einstieg(w,p){const i=w.C.length-1,z=zustand(w,i);if(!z)return null;const st=ST.einstieg&&ST.einstieg.s&&ST.einstieg.s[z.z];
  return {z:z.z,n:ZUST[z.z].n,t:ZUST[z.z].t,ab20:+((p/w.R.s20[i]-1)*100).toFixed(1),vomHoch:z.vomHoch,rsi:w.R.rsi[i]!=null?+w.R.rsi[i].toFixed(0):null,
    ziel:z.ziel?r6(z.ziel):null,zielAbst:z.ziel?+((z.ziel/p-1)*100).toFixed(1):null,s20:r6(w.R.s20[i]),stat:st||null,
    zeit:ST.intra&&ST.intra[w.s]&&ST.intra[w.s].r||null,fenster:(f=>f&&{t:f.t,bis:f.bis,tag:f.tag,jetzt:f.jetzt,start:f.start})(fenster(w.s)),heute:(w.h.heute||[]).filter(x=>Date.now()/1000-x[0]<20*3600).map(x=>[uhrB(x[0]),x[1]])}}

/* ---------- Zustand ---------- */
let SF="",ST=null,MD=null; // MD = eigenes Depot und Merkliste der Top-Aktien-App (verschlüsselt in data/top.enc)
const lade=()=>{try{return Object.assign({hist:{},listen:[],fehler:{}},JSON.parse(fs.readFileSync(SF,"utf8")))}catch(e){return {hist:{},listen:[],fehler:{}}}};
const speichere=()=>{fs.mkdirSync(SF.replace(/\/[^/]*$/,""),{recursive:true});fs.writeFileSync(SF,JSON.stringify(ST))};
export const app=()=>ST&&ST.app||null;
const readJSON=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){return d}};

function liste(ctx){const l=UNIVERSUM.map(([s,n,typ])=>({s,n,typ,basis:1})),da=new Set(l.map(x=>x.s));
  for(const [s,n,typ] of [...((ST.uni&&ST.uni.liste)||[]),...ZUSATZ])if(!da.has(s)&&!(ST.tot&&ST.tot[s]>=3)){da.add(s);l.push({s,n,typ})} // tot: 3× nicht gefunden → ausgelassen
  for(const s of (ctx.eigene?ctx.eigene():[]))if(istAktie(s)&&!da.has(s)&&l.length<UNIVERSUM.length+10){da.add(s);l.push({s,n:ctx.name?ctx.name(s):s,typ:"a",eigen:1})}
  for(const x of [...((MD&&MD.depot)||[]),...((MD&&MD.merk)||[])])if(x&&x.s&&istAktie(x.s)&&!da.has(x.s)){da.add(x.s);l.push({s:x.s,n:x.n||x.s,typ:"a",eigen:1})}
  for(const [s,h] of Object.entries(ST.hist))if(h.tmp&&!da.has(s)){if(Date.now()-h.tmp>3*864e5){delete ST.hist[s];continue}da.add(s);l.push({s,n:h.n||s,typ:"a",eigen:1})}
  return l}

/* ---------- Hauptlauf ---------- */
export async function lauf(ctx){SF=ctx.P(".state/beste.json");if(!ST)ST=lade();await grossesUniversum(ctx);MD=await meinDepot(ctx);const KZ=setzeKosten(MD),kKey=JSON.stringify([KOSTEN,STEUER,ZIEL_TAG]);const B=ctx.B,heute=new Date().toISOString().slice(0,10);let fehler=0,geholt=0;
  const L=liste(ctx);
  // Gespeichert werden nur Datum und Schlusskurs, damit der Speicher bei über 200 Werten klein bleibt
  const knapp=bars=>bars.map(b=>[b[0],b.length>2?b[4]:b[1]]);ST.versucht=ST.versucht||{};
  for(const h of Object.values(ST.hist))if(h.bars&&h.bars[0]&&h.bars[0].length>2)h.bars=knapp(h.bars);
  // Verlauf (2 Jahre) einmal am Tag, höchstens 50 pro Lauf (der erste Tag braucht 5 Läufe)
  ST.tot=ST.tot||{};const verlauf=L.filter(w=>!(ST.versucht[w.s]===heute||(ST.hist[w.s]&&ST.hist[w.s].d===heute&&ST.hist[w.s].bars))).sort((a,b)=>(b.basis||b.eigen?1:0)-(a.basis||a.eigen?1:0)).slice(0,90);geholt=verlauf.length;
  await parallel(verlauf,6,async w=>{ST.versucht[w.s]=heute;const h=ST.hist[w.s];try{const y=await yahoo(w.s,"2y");ST.hist[w.s]=Object.assign(h||{},{d:heute,bars:knapp(y.bars),cur:y.cur,p:y.p,mt:y.mt,lt:Date.now()});delete ST.fehler[w.s];delete ST.tot[w.s]}
    catch(e){if(e.status===429)throw e;fehler++;ST.fehler[w.s]=String(e.message).slice(0,80);if(/404|keine Daten/.test(e.message))ST.tot[w.s]=(ST.tot[w.s]||0)+1}});
  for(const s of Object.keys(ST.versucht))if(!L.some(w=>w.s===s))delete ST.versucht[s];
  // Laufende Tageskerze: aussichtsreiche Werte alle 15 Min., die übrigen reihum etwa stündlich (Börse offen) bzw. alle 3 Std.
  const wichtig=new Set([...(ST.wichtig||[]),...((MD&&MD.depot)||[]).map(x=>x.s)]),kand=L.map(w=>({w,h:ST.hist[w.s]})).filter(x=>x.h&&x.h.bars).map(x=>Object.assign(x,{alt:Date.now()-(x.h.lt||0),of:offen(regionVon(x.w.s))}));
  // Kurse höchstens 10 Minuten alt: alle Werte im Handelsfenster bei jedem Lauf (parallel), wichtige zuerst.
  const aktiv=new Set([...wichtig,...(ST.aktiv||L.filter(w=>w.basis).map(w=>w.s)),...((MD&&MD.merk)||[]).map(x=>x.s)]);
  const imF=kand.filter(x=>aktiv.has(x.w.s)&&imFenster(regionVon(x.w.s))&&Date.now()-(x.h.pt||0)>4*6e4).sort((a,b)=>(wichtig.has(b.w.s)-wichtig.has(a.w.s))||((a.h.pt||0)-(b.h.pt||0)));
  const gebremst=await parallel(imF,6,async({w,h})=>{try{const y=await preis(w.s);h.p=y.p;h.mt=y.mt;h.sess=y.sess;h.heute=y.heute;h.pt=Date.now();h.cur=y.cur||h.cur;
      if(y.regP&&y.regT){const d=teile(regionVon(w.s)==="eu"?"Europe/Berlin":"America/New_York",new Date(y.regT)).date;h.bars=zusammen(h.bars,[[d,y.regP]]).slice(-560)}delete ST.fehler[w.s]}
    catch(e){if(e.status!==429){fehler++;ST.fehler[w.s]=String(e.message).slice(0,80)}throw e}});
  if(gebremst)ctx.B.err.beste="Yahoo bremst gerade (zu viele Abrufe), Rest folgt im nächsten Lauf";
  // Tageskerze nach Handelsschluss sauber abschließen (außerhalb des Fensters, alle 3 Std.)
  const jetztHolen=kand.filter(x=>!x.of&&!imFenster(regionVon(x.w.s))&&x.alt>3*36e5).sort((a,b)=>b.alt-a.alt).slice(0,20);
  for(const {w,h} of jetztHolen){try{const y=await yahoo(w.s,"5d");h.bars=zusammen(h.bars,knapp(y.bars)).slice(-560);h.p=y.p;h.mt=y.mt;h.cur=y.cur||h.cur;h.lt=Date.now();delete ST.fehler[w.s]}catch(e){fehler++;ST.fehler[w.s]=String(e.message).slice(0,80)}}
  for(const s of Object.keys(ST.hist))if(!L.some(w=>w.s===s))delete ST.hist[s];
  if(fehler)B.err.beste=`${fehler} Kursabruf(e) fehlgeschlagen (Yahoo)`;else if(!B.err.beste||!/bremst/.test(B.err.beste))delete B.err.beste;

  // Rechnen
  const W=[];for(const w of L){const h=ST.hist[w.s];if(!h||!h.bars||h.bars.length<130)continue;const C=h.bars.map(b=>b[1]);
    W.push(Object.assign({},w,{h,bars:h.bars,C,idx:new Map(h.bars.map((b,i)=>[b[0],i])),R:rechne(C)}))}
  if(W.length<15){speichere();return false}
  const MO=modell(ctx),M=MO.M;setzePunkte(W,M);const WB=W.filter(w=>w.basis); // Tests auf den Kernwerten
  // erst wenn (fast) alle Verläufe von heute da sind, wird getestet und die Vorlage geschrieben
  const vollst=L.filter(w=>ST.versucht[w.s]===heute||(ST.hist[w.s]&&ST.hist[w.s].d===heute)).length>=L.length*.95;
  // Test einmal am Tag (ändert sich im Tagesverlauf nicht)
  if(!ST.test||((ST.test.d!==heute||ST.test.version!==MO.version||ST.test.k!==kKey||ST.test.werte<WB.length*.95)&&vollst))ST.test={d:heute,version:MO.version,k:kKey,von:new Date(Date.now()-365*864e5).toISOString().slice(0,10),werte:WB.length,h:test(WB)};
  if(!ST.muster||((ST.muster.d!==heute||(ST.muster.n||0)<WB.length*.95)&&vollst))ST.muster={d:heute,n:WB.length,m:musterSpeicher(WB)};
  if(!ST.einstieg||((!ST.einstieg.aus||ST.einstieg.d!==heute||ST.einstieg.k!==kKey||(ST.einstieg.n||0)<WB.length*.95)&&vollst))ST.einstieg={d:heute,k:kKey,n:WB.length,s:einstiegStat(WB),aus:ausstiegStat(WB)};
  const jetzt=W.filter(w=>Date.now()-Date.parse(w.bars[w.bars.length-1][0])<6*864e5);// ohne veraltete Werte
  const fakten=(w,H)=>{const i=w.C.length-1,C=w.C,p=w.h.p&&Date.now()-(w.h.mt||0)<3*864e5?w.h.p:C[i],sd=w.R.sd[i],ch=k=>i>=k?+((p/C[i-k]-1)*100).toFixed(1):null;
    const heuteBar=w.bars[i][0]===teile(regionVon(w.s)==="eu"?"Europe/Berlin":"America/New_York",new Date(w.h.mt||Date.now())).date,vt=heuteBar?C[i-1]:C[i];
    return {s:w.s,n:w.n,typ:w.typ||"a",cur:w.h.cur||"",p:r6(p),sdTag:sd?+sd.toFixed(5):null,dp:+((p/vt-1)*100).toFixed(2),mt:w.h.mt||w.h.lt||0,sess:w.h.sess||undefined,eigen:w.eigen||undefined,
      tage5:ch(5),wochen4:ch(20),monate3:ch(60),monate6:ch(120),rsi:w.R.rsi[i]!=null?+w.R.rsi[i].toFixed(0):null,schwankungJahr:sd?+(sd*Math.sqrt(252)*100).toFixed(0):null,
      trend:w.R.s20[i]!=null&&w.R.s50[i]!=null?(w.R.s20[i]>w.R.s50[i]?"aufwärts":"abwärts"):null,ueber50:w.R.s50[i]?+((p/w.R.s50[i]-1)*100).toFixed(1):null,
      punkte:H&&w.P[H][i]!=null?+w.P[H][i].toFixed(2):undefined,typBew:H&&sd?+(sd*Math.sqrt(H)*100).toFixed(1):undefined,noetig:H?NOETIG[H]:undefined,bereich:H&&sd?{lo:r6(p*Math.exp(-sd*Math.sqrt(H))),hi:r6(p*Math.exp(sd*Math.sqrt(H)))}:undefined,
      spark:C.slice(-60).map(x=>+(+x).toPrecision(5)),sparkD:w.bars.slice(-60).map(b=>b[0].slice(5)),muster:H?musterAktiv(w,H,ST.muster&&ST.muster.m):undefined,einstieg:einstieg(w,p),vomHoch10:w.R.dd[i]!=null?+((Math.exp(w.R.dd[i]*sd)-1)*100).toFixed(1):null}};
  const rangVorab={};for(const H of HORIZONTE)rangVorab[H]=jetzt.filter(w=>w.P[H][w.C.length-1]!=null).sort((a,b)=>b.P[H][b.C.length-1]-a.P[H][a.C.length-1]);
  {ST.intra=ST.intra||{};const kand=[...new Set([...(ST.eTopS||[]).slice(0,15),...((MD&&MD.depot)||[]).map(x=>x.s),...((MD&&MD.merk)||[]).map(x=>x.s),...HORIZONTE.flatMap(H=>rangVorab[H].slice(0,15).map(w=>w.s)),
      ...(readJSON(ctx.P("data/beste.json"),{listen:{}}).listen?Object.values(readJSON(ctx.P("data/beste.json"),{listen:{}}).listen).flat().map(x=>x&&x.s).filter(Boolean):[])])].filter(s=>!(ST.intra[s]&&ST.intra[s].d===heute&&(!ST.intra[s].r||ST.intra[s].r.m))).slice(0,20);
    await parallel(kand,4,async s=>{try{ST.intra[s]={d:heute,r:await tageszeit(s)}}catch(e){if(e.status===429)throw e;ST.intra[s]={d:heute,r:null}}});
    for(const s of Object.keys(ST.intra))if(!L.some(w=>w.s===s))delete ST.intra[s]}
  const rang={};for(const H of HORIZONTE)rang[H]=jetzt.filter(w=>w.P[H][w.C.length-1]!=null).sort((a,b)=>b.P[H][b.C.length-1]-a.P[H][a.C.length-1]);
  ST.wichtig=[...new Set(HORIZONTE.flatMap(H=>rang[H].slice(0,25).map(w=>w.s)))];
  ST.aktiv=[...new Set([...HORIZONTE.flatMap(H=>rang[H].slice(0,150).map(w=>w.s)),...L.filter(w=>w.basis).map(w=>w.s)])];
  // Beste Einstiege aus allen Werten: Zustand „jetzt günstig“ oder „Wende“, sortiert nach Stärke für 3 und 7 Tage
  const eTop=jetzt.map(w=>{const i=w.C.length-1,z=zustand(w,i),p3=w.P[3][i],p7=w.P[7][i];return z&&(z.z==="guenstig"||z.z==="wende")&&p3!=null&&p7!=null?{w,sc:p3+p7}:null}).filter(Boolean).sort((a,b)=>b.sc-a.sc).slice(0,25);

  // KI-Ergebnis lesen (data/beste.json, kommt von der Claude-Aufgabe)
  const ki=readJSON(ctx.P("data/beste.json"),null),kiOk=ki&&ki.id&&ki.listen;
  if(kiOk&&!ST.listen.some(x=>x.id===ki.id)){// neue Liste: Startkurse merken, damit die Entwicklung messbar ist
    const e={id:ki.id,d:heute,t:Date.now(),slot:ki.slot||"",h:{}};for(const H of HORIZONTE)e.h[H]=(ki.listen[H]||[]).slice(0,TOP).map(x=>{const w=W.find(y=>y.s===x.s);return {s:x.s,p0:w?r6(w.h.p||w.C[w.C.length-1]):null}}).filter(x=>x.p0);
    ST.listen.push(e);ST.listen=ST.listen.filter(x=>Date.now()-x.t<75*864e5);
    {const name=s=>(W.find(w=>w.s===s)||{n:s}).n;
      await melde(ctx,"liste",`🏆 <b>Neue Top-Aktien (${esc(ctx,ki.slot||"aktuell")})</b>\n\n${HORIZONTE.map(H=>`<b>${H} Tage:</b> ${(ki.listen[H]||[]).slice(0,3).map((x,i)=>`${i+1}. ${esc(ctx,name(x.s))}`).join(" · ")}`).join("\n")}${ki.markt?`\n\n${esc(ctx,ki.markt)}`:""}\n\nGründe und Quellen: /beste oder /warum Kürzel\n<i>${HINWEIS}</i>${link(ctx)}`)}}

  // Entwicklung früherer Listen (je Tag die erste Liste, damit nichts doppelt zählt)
  const fertig={},laufend=[];const erste=[];for(const x of ST.listen)if(!erste.some(y=>y.d===x.d))erste.push(x);
  for(const H of HORIZONTE)fertig[H]=abrechnen(W,erste.map(x=>({d:x.d,picks:x.h[H]})),H);
  for(const x of ST.listen.slice(-12).reverse())laufend.push({id:x.id,d:x.d,slot:x.slot,h:Object.fromEntries(HORIZONTE.map(H=>[H,(x.h[H]||[]).map(p=>{const w=W.find(y=>y.s===p.s),pj=w?(w.h.p||w.C[w.C.length-1]):null;return {s:p.s,n:w?w.n:p.s,p0:p.p0,r:pj?+((pj/p.p0-1)*100).toFixed(1):null}})]))});

  // Liste für die App: KI-Auswahl (wenn von heute) sonst die reine Rechnung
  const kiHeute=kiOk&&ST.listen.some(x=>x.id===ki.id&&Date.now()-x.t<20*36e5),aktuell=ST.listen.find(x=>kiOk&&x.id===ki.id);
  const listen={};for(const H of HORIZONTE){const l=kiHeute?(ki.listen[H]||[]).slice(0,TOP):rang[H].slice(0,TOP).map(w=>({s:w.s}));
    listen[H]=l.map((x,i)=>{const w=W.find(y=>y.s===x.s);if(!w)return null;const r=rang[H].findIndex(y=>y.s===x.s),p0=aktuell&&(aktuell.h[H]||[]).find(p=>p.s===x.s);
      return Object.assign(fakten(w,H),{platz:i+1,rechenRang:r>=0?r+1:null,p0:kiHeute&&p0?p0.p0:undefined,warum:x.warum,treiber:x.treiber,risiken:x.risiken,termine:x.termine,zuversicht:x.zuversicht,einschaetzung:x.einschaetzung,ausblick:x.ausblick,szenarien:x.szenarien&&typeof x.szenarien==="object"?{gut:x.szenarien.gut,schlecht:x.szenarien.schlecht}:undefined,quellen:Array.isArray(x.quellen)?x.quellen.filter(q=>q&&/^https?:\/\//.test(q.u||"")).slice(0,8):undefined})}).filter(Boolean)}

  // Updates: Entscheidung aus der App (data/beste-entscheidung.json), neuer KI-Vorschlag, Prüfung nach einem Update
  const ent=readJSON(ctx.P("data/beste-entscheidung.json"),null);
  if(ent&&ent.id&&ent.t&&ent.t!==ST.entT){ST.entT=ent.t;if(ent.antwort==="zurueck"?!!ST.schatten:ST.vorschlag&&ST.vorschlag.id===ent.id){const t=await entscheide(ctx,ent.antwort,"App");if(ctx.send)await ctx.send(t,{direkt:true})}}
  if(ST.vorschlag&&ST.vorschlag.status==="offen"&&Date.now()-ST.vorschlag.t>14*864e5){ST.vorschlag.status="verfallen";ST.verlauf=(ST.verlauf||[]).concat({id:ST.vorschlag.id,titel:ST.vorschlag.titel,status:"verfallen"}).slice(-20)}
  if(kiOk&&ki.vorschlag&&!(ST.vorschlag&&ST.vorschlag.id===ki.id+"-u")&&!(ST.vorschlag&&ST.vorschlag.status==="offen")&&vollst){const v=ki.vorschlag,fehl=pruefeVorschlag(v,M);
    if(fehl)ctx.log("Update-Vorschlag ungültig:",fehl);
    else{const H=+v.horizont,neu=Object.fromEntries(Object.entries(v.aenderung).map(([k,x])=>[k,+x])),test=pruefe(WB,H,M[H],Object.assign({},M[H],neu));
      ST.vorschlag={id:ki.id+"-u",t:Date.now(),status:"offen",gemeldet:false,horizont:H,titel:String(v.titel||"Änderung der Rechnung").slice(0,120),warum:String(v.warum||"").slice(0,900),erwartung:String(v.erwartung||"").slice(0,400),
        neu,liste:Object.entries(neu).map(([k,x])=>({param:k,name:PARAM[k].n,von:M[H][k],nach:x})),test}}}
  if(vollst&&ST.autoT!==heute&&!(ST.vorschlag&&ST.vorschlag.status==="offen")){ST.autoT=heute;let best=null;
    for(const H of HORIZONTE)for(const w5 of [0,.5,1])for(const dd of [0,.5,1]){if(w5===M[H].w5&&dd===M[H].dd)continue;const neu={};if(w5!==M[H].w5)neu.w5=w5;if(dd!==M[H].dd)neu.dd=dd;
      const t=pruefe(WB,H,M[H],Object.assign({},M[H],neu));if(t.urteil!=="besteht")continue;const gew=t.jahr.neu.vorsprung-t.jahr.alt.vorsprung;if(!best||gew>best.gew)best={H,neu,t,gew}}
    if(best&&best.gew>=.05){const bsp=W.filter(w=>{const i=w.C.length-1;return (w.R.dd[i]??0)<-2&&w.P[best.H][i]!=null&&rang[best.H].indexOf(w)>=0&&rang[best.H].indexOf(w)<15}).slice(0,3).map(w=>w.n);
      ST.vorschlag={id:`auto-${heute}`,t:Date.now(),status:"offen",gemeldet:false,horizont:best.H,quelle:"Automatischer Test",
        titel:[best.neu.w5?"Kurzfristigen Schwung (5 Tage) beachten":"",best.neu.dd?"Werte abwerten, die gerade vom Hoch fallen":""].filter(Boolean).join(" und ")||"Feinjustierung",
        warum:`Der Wachmann hat neue Bausteine an allen ${W.length} Werten des letzten Jahres getestet. ${best.neu.dd?"Werte, die nach einem Anstieg gerade deutlich unter ihr 10-Tage-Hoch gefallen sind, landen damit weiter hinten. ":""}${best.neu.w5?"Der Anstieg der letzten 5 Tage zählt mit, nicht nur der der letzten 4 Wochen. ":""}${bsp.length?`Betroffen wären gerade z. B. ${bsp.join(", ")}. `:""}Der Test lag im ganzen Jahr und in beiden Jahreshälften vorn. Das spricht gegen einen Zufallstreffer, garantiert aber nichts.`,
        erwartung:`Vorsprung der Top ${TOP} vor dem Durchschnitt je Kauf: ${pz2(best.t.jahr.alt.vorsprung)} → ${pz2(best.t.jahr.neu.vorsprung)}.`,
        neu:best.neu,liste:Object.entries(best.neu).map(([k,x])=>({param:k,name:PARAM[k].n,von:M[best.H][k],nach:x})),test:best.t};
      ctx.log("Auto-Vorschlag",ST.vorschlag.titel,best.H,best.gew.toFixed(2))}
    else ctx.log("Auto-Test: keine Verbesserung, die beide Jahreshälften besteht")}
  if(ST.vorschlag&&ST.vorschlag.status==="offen"&&!ST.vorschlag.gemeldet&&ctx.send&&!ctx.leise()){ST.vorschlag.gemeldet=true;
    await melde(ctx,"update",vorschlagText(ctx,ST.vorschlag)+link(ctx,""),{knoepfe:[[{text:"✅ Übernehmen",callback_data:`bu:ja:${ST.vorschlag.id}`},{text:"❌ Ablehnen",callback_data:`bu:nein:${ST.vorschlag.id}`}]]})}
  // Nach einem Update: alte Rechnung läuft 30 Tage mit, beide Listen werden abgerechnet
  let pruefung=null;if(ST.schatten){const S=ST.schatten;
    if(vollst&&!S.eintraege.some(e=>e.d===heute)&&Date.now()-Date.parse(S.seit)<31*864e5){const e={d:heute,h:{}};for(const H of HORIZONTE){const altR=jetzt.map(w=>({w,p:punkte(w.R,w.C.length-1,S.alt[H],H)})).filter(x=>x.p!=null).sort((a,b)=>b.p-a.p).slice(0,TOP);
        const p0=w=>r6(w.h.p||w.C[w.C.length-1]);e.h[H]={neu:rang[H].slice(0,TOP).map(w=>({s:w.s,p0:p0(w)})),alt:altR.map(x=>({s:x.w.s,p0:p0(x.w)}))}}S.eintraege.push(e)}
    pruefung={seit:S.seit,titel:S.titel,version:S.version,tage:S.eintraege.length,h:Object.fromEntries(HORIZONTE.map(H=>[H,{neu:abrechnen(W,S.eintraege.map(e=>({d:e.d,picks:e.h[H].neu})),H),alt:abrechnen(W,S.eintraege.map(e=>({d:e.d,picks:e.h[H].alt})),H)}]))};
    if(Date.now()-Date.parse(S.seit)>75*864e5)ST.schatten=null}

  // Eigenes Depot der Top-Aktien-App: Gewinnschutz (nachlaufend, wie in der Haupt-App) und Verlustschutz, mit Link zur Aktie
  // Gemerkte Werte: Meldung, wenn der Einstieg günstig wird (nicht nachts)
  if(ctx.send){ST.eAlt=ST.eAlt||{};ST.eTag=ST.eTag||{};const beob=[...((MD&&MD.merk)||[]),...[3,7].flatMap(H=>rang[H].slice(0,TOP).map(w=>({s:w.s,n:w.n,top:H})))];const gesehen=new Set();for(const m of beob){if(gesehen.has(m.s))continue;gesehen.add(m.s);const w=W.find(y=>y.s===m.s);if(!w)continue;const e=fakten(w,3).einstieg;if(!e)continue;
    const vor=ST.eAlt[m.s];ST.eAlt[m.s]=e.z;if(vor&&vor!==e.z&&(e.z==="guenstig"||e.z==="wende")&&ST.eTag[m.s]!==heute&&!((MD&&MD.depot)||[]).some(d=>d.s===m.s)&&(ST.eTag[m.s]=heute))
      {const fe=e.fenster;ST.geplant=ST.geplant||{};if(fe&&!fe.jetzt)ST.geplant[m.s]={start:fe.start,n:m.n||m.s,top:m.top,t:fe.t};
      await melde(ctx,"einstieg",`${fe&&!fe.jetzt?`📅 <b>Vorankündigung: ${ctx.esc(m.n||m.s)}</b>${m.top?` (Top ${TOP}, ${m.top} Tage)`:" (gemerkt)"}\nWird günstig. <b>Einstieg erst ${fe.tag} ${fe.t}–${fe.bis} Uhr</b>, dann kommt eine zweite Nachricht, ob es noch gilt.\n⏳ Halten danach ca. ${halteTage(e.z)} Handelstage, bis etwa ${tagKurz(plusHandelstage(fe.start,halteTage(e.z)))}.`:`🟢 <b>Jetzt einsteigen: ${ctx.esc(m.n||m.s)}</b>${m.top?` (Top ${TOP}, ${m.top} Tage)`:" (gemerkt)"}\n${e.n}. ${e.t}`}\nKurs ${pz(e.ab20)} zum 20-Tage-Schnitt, ${pz(e.vomHoch)} unter dem 10-Tage-Hoch, RSI ${e.rsi}.${e.stat&&e.stat[3]&&e.stat[3].n?`\nIm Rückblick brachte ein Kauf in diesem Zustand in 3 Tagen Ø ${pz(e.stat[3].avg)} (${e.stat[3].plus} % im Plus).`:""}\n<i>Keine Anlageberatung.</i>${link(ctx,m.s)}`)}}
    for(const s of Object.keys(ST.eAlt))if(!gesehen.has(s))delete ST.eAlt[s];for(const k of ["standVor","hoch"])if(ST[k]&&MD)for(const id of Object.keys(ST[k]))if(!MD.depot.some(d=>d.id===id))delete ST[k][id];for(const s of Object.keys(ST.eTag))if(ST.eTag[s]!==heute)delete ST.eTag[s]}
  // Angekündigte Einstiege: zur angekündigten Uhrzeit bestätigen (gilt noch) oder absagen
  if(ST.geplant)for(const [sy,g] of Object.entries(ST.geplant)){if(Date.now()<g.start)continue;delete ST.geplant[sy];if(Date.now()>g.start+90*6e4)continue;
    const w=W.find(y=>y.s===sy);if(!w)continue;const f=fakten(w,3),e=f.einstieg,gilt=e&&(e.z==="guenstig"||e.z==="wende");
    const ht=e?halteTage(e.z):3,zt2=ST.intra&&ST.intra[sy]&&ST.intra[sy].r;
    await melde(ctx,"einstieg",gilt?`🟢 <b>Jetzt einsteigen: ${ctx.esc(g.n)}</b> (wie angekündigt)\nKurs ${dez(f.p)} ${CS[f.cur]||f.cur} · ${e.n} · ${pz(e.vomHoch)} vom 10-Tage-Hoch · heute ${pz(f.dp)}\nGünstigste halbe Stunde: ${g.t} Uhr.\n⏳ Halten: bis etwa ${tagKurz(plusHandelstage(Date.now(),ht))} (${ht} Handelstage)${zt2&&zt2.teuer?`, dann am ehesten gegen ${zt2.teuer.t}${zt2.teuer.bis?"–"+zt2.teuer.bis:""} Uhr verkaufen`:""}. Früher raus, wenn dein Ziel (${pz(NOETIG[ht]||NOETIG[3],1)}) erreicht ist oder der Schutz auslöst.\n<i>Keine Anlageberatung.</i>${link(ctx,sy)}`
      :`❌ <b>Abgesagt: ${ctx.esc(g.n)}</b>\nDer angekündigte Einstieg gilt nicht mehr: ${e?e.n:"keine Daten"}. Kurs ${dez(f.p)} ${CS[f.cur]||f.cur}, heute ${pz(f.dp)}.${link(ctx,sy)}`,{direkt:true})}
  // Neu in den Top 5 (Rechnung, 3 und 7 Tage): höchstens einmal pro Stunde je Zeitraum
  ST.topAlt=ST.topAlt||{};ST.topT=ST.topT||{};if(vollst)for(const H of [3,7]){const jetztTop=rang[H].slice(0,TOP).map(w=>w.s),alt=ST.topAlt[H]||[],neu=jetztTop.filter(s=>!alt.includes(s));
    if(alt.length&&neu.length&&Date.now()-(ST.topT[H]||0)>36e5){ST.topT[H]=Date.now();ST.topAlt[H]=jetztTop;
      await melde(ctx,"wechsel",`🔄 <b>Neu in den Top ${TOP} (${H} Tage)</b>\n${neu.map(s=>{const w=W.find(y=>y.s===s),f=fakten(w,H);return `${jetztTop.indexOf(s)+1}. <b>${ctx.esc(w.n)}</b> ${dez(f.p)} ${CS[f.cur]||f.cur} · 4 Wo. ${pz(f.wochen4)}${f.einstieg?` · Einstieg: ${f.einstieg.n}`:""}`}).join("\n")}\n<i>Aus der Kurs-Rechnung, die KI-Recherche folgt zur nächsten Runde. Keine Anlageberatung.</i>${link(ctx,neu[0])}`)}
    else if(!alt.length)ST.topAlt[H]=jetztTop;else if(!neu.length)ST.topAlt[H]=jetztTop}
  // Depot-Stand jede Stunde während der Börsenzeiten
  {const z=teile("Europe/Berlin");if(MD&&MD.depot&&MD.depot.length&&!["Sat","Sun"].includes(z.wd)&&z.min>=9*60&&z.min<22*60&&ST.standH!==z.date+Math.floor(z.min/60)){ST.standH=z.date+Math.floor(z.min/60);
    ST.standVor=ST.standVor||{};const zl=MD.depot.map(d=>{const w=W.find(y=>y.s===d.s);if(!w)return null;const f=fakten(w,3),ch=(f.p/d.k-1)*100,sc=ST.sch&&ST.sch[d.id],vor=ST.standVor[d.id],hoch=hochVon(d.id,ch);ST.standVor[d.id]=ch;return {d,f,ch,sc,vor,fa:farbe(ch,vor,hoch)}}).filter(Boolean).sort((a,b)=>"🔴🟠🟡🟢".indexOf(a.fa)-"🔴🟠🟡🟢".indexOf(b.fa)||a.ch-b.ch);
    if(zl.length)await melde(ctx,"stand",`📊 <b>Top-Depot ${String(Math.floor(z.min/60)).padStart(2,"0")}:00 Uhr</b> ${zl.map(x=>x.fa).join("")}\n${zl.map(x=>`${x.fa} <b>${ctx.esc(x.d.n)}</b> ${pz(x.ch)} seit Kauf${x.vor!=null?` (${(x.ch-x.vor>=0?"+":"")+f1(x.ch-x.vor)} Pkt. seit letzter Stunde)`:""} · heute ${pz(x.f.dp)}${x.sc&&x.d.nl!==0?` · Schutzlinie ${pz(linie(x.sc.ref,x.d.nl>0?x.d.nl:.5,false))}`:""}`).join("\n")}\n\n<b>Top 3 für 3 Tage:</b> ${rang[3].slice(0,3).map(w=>ctx.esc(w.n)).join(" · ")}${link(ctx,"")}`)}}

  const meine={},schutzApp={};
  if(MD){for(const x of [...(MD.depot||[]),...(MD.merk||[])]){const w=W.find(y=>y.s===x.s);if(w&&!meine[x.s])meine[x.s]=fakten(w,7)}
    await schutz(ctx,W,schutzApp);await bewegung(ctx);await halteEnde(ctx);ST.app_schutz=schutzApp}
  ST.eTopS=eTop.map(x=>x.w.s);
  // Telegram: beste Einstiege aus allen Werten, höchstens stündlich und nur wenn sich die Top 5 geändert haben
  {const z=teile("Europe/Berlin"),t5=eTop.slice(0,5).map(x=>x.w.s),key=t5.join(",");
    if(vollst&&t5.length&&key!==ST.eTopMeld&&Date.now()-(ST.eTopT||0)>36e5&&!["Sat","Sun"].includes(z.wd)&&z.min>=9*60&&z.min<22*60){ST.eTopMeld=key;ST.eTopT=Date.now();
      ST.geplant=ST.geplant||{};for(const x of eTop.slice(0,5)){const f=fenster(x.w.s);if(f&&!f.jetzt&&!ST.geplant[x.w.s])ST.geplant[x.w.s]={start:f.start,n:x.w.n,t:f.t}}
      const fe0=fenster(eTop[0].w.s),vorschau=eTop.slice(0,5).every(x=>{const f=fenster(x.w.s);return f&&!f.jetzt&&f.tag!=="heute"});
      await melde(ctx,"einstieg",`${vorschau?`📅 <b>Vorschau: beste Einstiege für ${fe0?fe0.tag:"den nächsten Handelstag"}</b>`:`⏱️ <b>Beste Einstiege</b>`} (aus ${W.length} Werten)\n${eTop.slice(0,5).map((x,i)=>{const f=fakten(x.w,3),e=f.einstieg,zt=ST.intra&&ST.intra[f.s]&&ST.intra[f.s].r;return `${i+1}. 🟢 <b>${ctx.esc(f.n)}</b> ${dez(f.p)} ${CS[f.cur]||f.cur} · ${e.n} · ${pz(e.vomHoch)} vom 10-Tage-Hoch · 4 Wo. ${pz(f.wochen4)}${zt&&zt.best?` · ${(fe=>fe?(fe.jetzt?"<b>jetzt</b>":`Einstieg ${fe.tag} ${fe.t}–${fe.bis} Uhr`):"")(fenster(f.s))}`:""}`}).join("\n")}${vorschau?"\nZur Uhrzeit kommt je Wert eine Nachricht, ob es dann noch gilt.":""}\n<i>Regel-Einschätzung aus Kursdaten, keine Anlageberatung.</i>${link(ctx,"")}`)}}
  ST.app={v:2,t:Date.now(),top:TOP,kosten:KOSTEN,kostenRT:+(2*KOSTEN).toFixed(2),steuer:+(STEUER*100).toFixed(2),freiRest:Math.round(FREI_REST),zielTag:+ZIEL_TAG.toFixed(3),noetig:NOETIG,kostenEin:KZ.kosten,horizonte:HORIZONTE,test:ST.test,werte:W.length,
    ki:kiHeute?{id:ki.id,erstellt:ki.erstellt,slot:ki.slot,markt:ki.markt||"",marktQuellen:Array.isArray(ki.marktQuellen)?ki.marktQuellen.slice(0,4):[],aussortiert:Array.isArray(ki.aussortiert)?ki.aussortiert.slice(0,12):[]}:null,
    aktien:W.filter(w=>w.typ!=="e").length,etfs:W.filter(w=>w.typ==="e").length,
    weitere:Object.fromEntries(HORIZONTE.map(H=>[H,rang[H].filter(w=>!listen[H].some(x=>x.s===w.s)).slice(0,WEITERE).map(w=>{const f=fakten(w,H);return {s:f.s,n:f.n,typ:f.typ,cur:f.cur,p:f.p,dp:f.dp,mt:f.mt,sess:f.sess,sparkD:f.sparkD.slice(-30),einstieg:f.einstieg&&Object.assign({},f.einstieg,{heute:undefined,zeit:f.einstieg.zeit?{tage:f.einstieg.zeit.tage,best:f.einstieg.zeit.best,billig:f.einstieg.zeit.billig}:null}),spark:f.spark.slice(-30),noetig:f.noetig,typBew:f.typBew,wochen4:f.wochen4,monate3:f.monate3,trend:f.trend,rsi:f.rsi,rang:rang[H].indexOf(w)+1}})])),
    modell:{version:MO.version,params:M,standard:STANDARD,param:PARAM,verlauf:MO.verlauf.slice(-10).reverse()},vorschlag:ST.vorschlag&&(ST.vorschlag.status==='offen'||Date.now()-(ST.vorschlag.entschieden||0)<3*864e5)?ST.vorschlag:null,pruefung,
    muster:{info:MUSTER.map(m=>({id:m.id,n:m.n,t:m.t})),speicher:ST.muster?ST.muster.m:null},
    einstiegInfo:{zust:ZUST,stat:ST.einstieg?ST.einstieg.s:null,aus:ST.einstieg&&ST.einstieg.aus||null,halte:Object.fromEntries(Object.keys(ZUST).map(z=>[z,halteTage(z)]))},
    einstiegTop:eTop.map((x,i)=>{const f=fakten(x.w,3);return {s:f.s,n:f.n,typ:f.typ,cur:f.cur,p:f.p,dp:f.dp,mt:f.mt,sess:f.sess,rang:i+1,wochen4:f.wochen4,tage5:f.tage5,trend:f.trend,rsi:f.rsi,typBew:f.typBew,noetig:f.noetig,sdTag:f.sdTag,spark:f.spark.slice(-30),sparkD:f.sparkD.slice(-30),einstieg:f.einstieg&&Object.assign({},f.einstieg,{heute:undefined})}}),
    meldungen:MELDUNGEN,
    meine,schutz:Object.keys(schutzApp).length&&process.env.SYNC_PASSWORD?await verschluesseln(schutzApp,process.env.SYNC_PASSWORD):null,
    listen,bilanz:{fertig,laufend},fehler:Object.keys(ST.fehler).length?ST.fehler:undefined};

  // Vorlage für die Claude-Aufgabe (3x täglich)
  const z=teile("Europe/Berlin"),slot=[...SLOTS].reverse().find(([,m])=>z.min>=m);
  if(slot&&vollst&&ST.vorlage!==z.date+slot[0]){ST.vorlage=z.date+slot[0];const lernen=slot[0]==="abends"&&!(ST.vorschlag&&ST.vorschlag.status==="offen")&&Date.now()-((ST.vorschlag&&ST.vorschlag.t)||0)>6*864e5&&Date.now()-(ST.lernT||0)>6*864e5;if(lernen)ST.lernT=Date.now();
    await vorlage(ctx,W,rang,fakten,slot[0],z.date,kiOk&&ki.datum===z.date?ki:null,lernen?{aktuelleEinstellungen:M,einstellungen:PARAM,testJetzt:ST.test,bilanzListen:fertig,variantenTest:varianten(WB,M),bisherigeUpdates:(ST.verlauf||[]).slice(-10),musterSpeicher:ST.muster&&ST.muster.m}:null)}

  const alt=ST.k||"";ST.k=JSON.stringify([ST.app.ki&&ST.app.ki.id,...HORIZONTE.map(H=>listen[H].map(x=>x.s+x.p))]);speichere();
  ctx.log("Top-Aktien:",HORIZONTE.map(H=>`${H}T ${listen[H].map(x=>x.s).join(",")}`).join(" | "),kiHeute?"(mit KI)":"(nur Rechnung)");
  return alt!==ST.k}

async function vorlage(ctx,W,rang,fakten,slot,datum,bisher,lernen){const quart=await quartalszahlen(),kand={},alle=new Set();
  for(const H of HORIZONTE)kand[H]=rang[H].slice(0,KAND).map((w,i)=>{alle.add(w.s);const f=fakten(w,H);delete f.spark;delete f.mt;delete f.eigen;if(f.muster)f.muster=f.muster.map(m=>({name:m.n,vorTagen:m.vor,rueckblick:m.stat,urteil:m.urteil,hinweis:"nur mit Vorsicht verwenden"}));return Object.assign(f,{rechenRang:i+1})});
  const mel={};for(const s of alle){mel[s]={meldungen:await meldungen(s),quartalszahlen:(quart.find(q=>q.s===s)||{}).d||null}}
  const alt={};if(bisher)for(const H of HORIZONTE)for(const x of bisher.listen[H]||[])if(alle.has(x.s)&&!alt[x.s])alt[x.s]={einschaetzung:x.einschaetzung,warum:x.warum,ausblick:x.ausblick,szenarien:x.szenarien,treiber:x.treiber,risiken:x.risiken,termine:x.termine,quellen:x.quellen};
  const v={id:`b-${datum}-${slot}`,datum,slot,erstellt:new Date().toISOString(),
    _anleitung:"Siehe trading/KI-AUFGABE.md. Kurz: Für jeden Zeitraum (3, 7, 30 Handelstage) aus den kandidaten genau 5 Werte auswählen und begründen, mit echter Websuche und Quellen-Links. Nur Werte aus der jeweiligen Kandidatenliste. Keine Zahlen erfinden. Ergebnis als data/beste.json.",
    kostenUndZiel:{kostenHinUndZurueck:+(2*KOSTEN).toFixed(2),steuerProzent:+(STEUER*100).toFixed(2),zielProTag:+ZIEL_TAG.toFixed(3),noetigerAnstiegBrutto:NOETIG,hinweis:"3 und 7 Tage sind reine Kurzfrist-Trades: nur Werte wählen, bei denen ein Anstieg über noetigerAnstiegBrutto in diesem Zeitraum plausibel ist (typBew = übliche Bewegung). Träge Werte und langsame ETFs eher aussortieren. Ehrlich bleiben: sicher steigt nichts."},
    methode:{text:"Aktien und ETFs gemischt (typ a = Aktie, e = ETF). Rangliste nach risikobereinigtem Kursanstieg (Anstieg geteilt durch normale Schwankung) plus Trend, abzüglich Überhitzung (RSI über 75). rechenRang 1 = beste Punktzahl.",test:ST.test},
    kandidaten:kand,werteInfo:mel,_bisherHeute:Object.keys(alt).length?alt:undefined,
    _lernen:lernen?Object.assign({aufgabe:"Schlage höchstens EIN Update der Rechnung vor (Feld vorschlag), nur wenn es gut begründet ist. Grundlage: variantenTest (jede Einstellung einen Schritt verändert, getestet in beiden Jahreshälften), bilanzListen und bisherigeUpdates (abgelehnte nicht wiederholen). Bevorzuge Varianten mit beideBesser=true. Kein guter Kandidat: vorschlag weglassen. Der Wachmann testet deinen Vorschlag selbst noch einmal, der Nutzer muss zustimmen."},lernen):undefined,
    format:{id:"wie oben",datum:"wie oben",slot:"wie oben",erstellt:"ISO-Zeitstempel jetzt",markt:"2–3 Sätze zur Marktlage heute",marktQuellen:[{t:"Titel",u:"https://…",q:"Quelle",d:"JJJJ-MM-TT"}],
      listen:{"3":[{s:"Kürzel aus kandidaten[3]",einschaetzung:"1 kurzer Satz Fazit, z. B. Chancen überwiegen leicht",warum:"3–5 Sätze",ausblick:"2–4 Sätze: wie es im Zeitraum am wahrscheinlichsten weitergeht und warum",szenarien:{gut:"1 Satz: was passieren muss, damit es gut läuft",schlecht:"1 Satz: was es kippen würde"},treiber:["…"],risiken:["…"],termine:["…"],zuversicht:"niedrig|mittel|hoch",quellen:[{t:"Titel",u:"https://…",q:"Quelle",d:"JJJJ-MM-TT"}]}],"7":["…"],"30":["…"]},
      aussortiert:[{s:"Kürzel",h:3,grund:"1 Satz, warum trotz guter Rechnung nicht gewählt"}],
      vorschlag:lernen?{titel:"kurzer Titel",horizont:7,aenderung:{w20:0.75},warum:"3–5 Sätze in einfachen Worten: was geändert wird, welches Problem es löst, welche Testzahlen dafür sprechen, was dagegen spricht",erwartung:"1–2 Sätze, was sich dadurch an der Liste ändert"}:undefined}};
  fs.mkdirSync(ctx.P("data"),{recursive:true});fs.writeFileSync(ctx.P("data/beste-vorlage.json"),JSON.stringify(v,null,1));if(ctx.merk)ctx.merk("data/beste-vorlage.json");
  ctx.log("Top-Aktien: Vorlage",v.id,[...alle].length,"Werte")}

/* ---------- Telegram ---------- */
export const HINWEIS="Rangliste aus Kursdaten, von der KI mit Quellen geprüft. Vergangene Ergebnisse sind keine Garantie. Keine Anlageberatung.";
const esc=(ctx,s)=>ctx.esc?ctx.esc(s):String(s??"");
// Die App liegt in einem eigenen Repository (eigene Adresse = eigene App auf dem Handy)
const TOP_URL=(process.env.TOP_URL||"https://timaxgg.github.io/Top-Picks/").replace(/\/?$/,"/");
function link(ctx,s){return `\n<a href="${TOP_URL}${s?"#s-"+encodeURIComponent(s):""}">In der Top-Aktien-App öffnen ›</a>`}
export const HILFE_ZEILEN=`/beste – die besten Aktien und ETFs für 3, 7 und 30 Tage mit Grund (/beste 7 nur ein Zeitraum)
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
  if(x.einschaetzung)z.push(`\n<b>Einschätzung:</b> ${esc(ctx,x.einschaetzung)}`);
  if(x.warum)z.push(`\n<b>Warum</b>\n${esc(ctx,x.warum)}`);
  if(x.ausblick)z.push(`<b>Ausblick ${x.H} Tage</b>\n${esc(ctx,x.ausblick)}`);
  if(x.szenarien&&(x.szenarien.gut||x.szenarien.schlecht))z.push(`<b>Szenarien</b>\n${x.szenarien.gut?"🟢 "+esc(ctx,x.szenarien.gut):""}${x.szenarien.schlecht?"\n🔴 "+esc(ctx,x.szenarien.schlecht):""}`);else z.push("\n<i>Die KI-Recherche für diese Liste steht noch aus.</i>");
  if(x.treiber&&x.treiber.length)z.push(`<b>Treiber</b>\n${x.treiber.map(t=>"• "+esc(ctx,t)).join("\n")}`);
  if(x.risiken&&x.risiken.length)z.push(`<b>Risiken</b>\n${x.risiken.map(t=>"• "+esc(ctx,t)).join("\n")}`);
  if(x.termine&&x.termine.length)z.push(`<b>Termine</b>\n${x.termine.map(t=>"• "+esc(ctx,t)).join("\n")}`);
  if(x.zuversicht)z.push(`Zuversicht der KI: <b>${esc(ctx,x.zuversicht)}</b>`);
  if(x.quellen&&x.quellen.length)z.push(`<b>Quellen</b>\n${x.quellen.map(q=>`• <a href="${esc(ctx,q.u)}">${esc(ctx,q.t||q.q||"Quelle")}</a>${q.q?` (${esc(ctx,q.q)}${q.d?", "+esc(ctx,q.d):""})`:""}`).join("\n")}`);
  return ctx.send(`${z.filter(Boolean).join("\n")}\n\n<i>${HINWEIS}</i>${link(ctx,x.s)}`,{direkt:true})}
