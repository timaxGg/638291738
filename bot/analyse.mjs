// /analyse: Wie sicher sind deine Werte, warum genau, wie sieht die Zukunft aus,
// und welche Alternativen gibt es (mit Begründung)? Alles aus Kursdaten, Frühwarnung und KI-Texten.

const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
function phi(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p }
const de = (v, n = 1) => (+v).toLocaleString("de-DE", { minimumFractionDigits: n, maximumFractionDigits: n });
const sg = (v, n = 1) => (v > 0 ? "+" : v < 0 ? "−" : "") + de(Math.abs(v), n) + " %";
const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Welche Alternativen passen zu welcher Art von Wert
const TECH = /^(NVDA|AAPL|MSFT|AMZN|GOOGL|META|TSLA|AMD|INTC|NFLX|ASML\.AS|SAP|SAP\.DE|IFX\.DE)$/;
const BREIT_US = /^(SPY|SXR8\.DE|URTH|EUNL\.DE|XDWL\.DE|XWEU\.DE|SXRV\.DE|EXI3\.DE|XLV|XDEW\.DE)$/;
const EUROPA_ETF = /^(EUNK\.DE|EXSA\.DE|EXW1\.DE|SXRT\.DE|EXS1\.DE|EXS3\.DE)$/;
const DEFENSIV = /^(EUNH|IBCI|XEON|XGLE)\.DE$/, GOLD = /^(4GLD\.DE|GC=F)$/, KRYPTO = /-(EUR|USD)$/;
const EU = /\.(DE|F|AS|PA|MI|L|SW|VI|MC|BR|CO|ST|HE|OL|LS|IR)$/;
function kandidaten(s, etf) {
  if (KRYPTO.test(s)) return [["IUSQ.DE", "breit gestreut über die ganze Welt statt eines einzelnen Coins"], ["4GLD.DE", "Gold als klassischer Wertspeicher, deutlich ruhiger"]];
  if (GOLD.test(s)) return [["XEON.DE", "Geldmarkt: fast keine Schwankung, Zinsen wie Tagesgeld"], ["EUNH.DE", "Euro-Staatsanleihen: ebenfalls Krisenschutz, mit Zinsen"]];
  if (DEFENSIV.test(s)) return [["XEON.DE", "Geldmarkt: kaum Kursschwankungen"], ["IBCI.DE", "inflationsgeschützte Anleihen"], ["4GLD.DE", "Gold als Krisenschutz"]];
  if (BREIT_US.test(s)) return [["IUSQ.DE", "Welt inklusive Schwellenländer, weniger USA (ca. 63 % statt 72 %)"], ["EXUS.DE", "Welt ohne USA, als Ergänzung gegen das US-Klumpenrisiko"], ["XDEW.DE", "S&P 500 gleichgewichtet: weniger Abhängigkeit von den großen Tech-Werten"], ["EUNK.DE", "Europa: unabhängiger vom US-Markt und Dollar"]];
  if (EUROPA_ETF.test(s)) return [["IUSQ.DE", "breiter: ganze Welt statt nur Europa"], ["EXSA.DE", "breiter innerhalb Europas: 600 Firmen"], ["XMME.DE", "Schwellenländer als Ergänzung"]];
  if (etf) return [["IUSQ.DE", "die ganze Welt in einem ETF, breiter gestreut"], ["EUNL.DE", "MSCI World: 1.500 Firmen aus Industrieländern"], ["EXSA.DE", "600 europäische Firmen"]];
  if (/\.DE$/.test(s)) return [["EXS1.DE", "alle 40 DAX-Firmen statt einer"], ["EXSA.DE", "600 europäische Firmen, viel breiter gestreut"], ...(TECH.test(s) ? [["SXRV.DE", "Technologie breit gestreut (Nasdaq 100)"]] : []), ["IUSQ.DE", "die ganze Welt in einem ETF"]];
  if (EU.test(s)) return [["EXSA.DE", "600 europäische Firmen statt einer"], ["EXW1.DE", "die 50 größten Firmen der Eurozone"], ["IUSQ.DE", "die ganze Welt in einem ETF"]];
  if (TECH.test(s)) return [["SXRV.DE", "Nasdaq 100: Technologie breit gestreut statt einer Firma"], ["SXR8.DE", "S&P 500: 500 US-Firmen statt einer"], ["XDEW.DE", "S&P 500 gleichgewichtet: weniger Tech-Klumpen"], ["IUSQ.DE", "die ganze Welt in einem ETF"]];
  return [["SXR8.DE", "500 US-Firmen statt einer"], ["XDEW.DE", "S&P 500 gleichgewichtet"], ["IUSQ.DE", "die ganze Welt in einem ETF"]];
}
export const kandidatenFuer = (s, re) => kandidaten(s, re && re.test(s)).map(x => x[0]);
const artVon = (s, ctx) => KRYPTO.test(s) ? "Krypto" : GOLD.test(s) ? "Gold" : DEFENSIV.test(s) ? "Anleihen/Geldmarkt" : ctx.istEtf(s) ? "ETF" : "Einzelaktie";
const LANGFRIST = { ETF: "breite Aktien-ETFs historisch im Schnitt etwa 6–8 % pro Jahr, mit einzelnen Verlustjahren", Einzelaktie: "Einzelaktien sehr unterschiedlich, vom Totalverlust bis zur Vervielfachung", Krypto: "kein verlässlicher Langfrist-Durchschnitt, extreme Schwankungen", Gold: "langfristig schwankend, keine Zinsen oder Dividenden", "Anleihen/Geldmarkt": "langfristig meist weniger Rendite als Aktien, dafür deutlich ruhiger" };

// Kennzahlen aus einem Kursverlauf (älteste zuerst)
export function kennzahlen(c, p, opt = {}) {
  if (!c || c.length < 25) return null;
  c = c.slice(); if (p && Math.abs(p / c[c.length - 1] - 1) > 1e-6) c.push(p); const last = c[c.length - 1];
  const lr = []; for (let i = 1; i < c.length; i++)lr.push(Math.log(c[i] / c[i - 1]));
  const r63 = lr.slice(-63), mu = mean(r63), sd = Math.sqrt(mean(r63.map(x => (x - mu) ** 2))) || 1e-4;
  const sma = n => c.length >= n ? mean(c.slice(-n)) : null;
  let peak = c[0], dd = 0; c.forEach(v => { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1) });
  const c3 = c.slice(-64); let p3 = c3[0], dd3 = 0; c3.forEach(v => { p3 = Math.max(p3, v); dd3 = Math.min(dd3, v / p3 - 1) });
  const damp = opt.damp ?? 0.5, band = opt.band ?? 1;
  const proj = h => { const m = damp * mu * h, s = sd * Math.sqrt(h) * band; return { mid: last * Math.exp(m), lo: last * Math.exp(m - s), hi: last * Math.exp(m + s), steigt: Math.round(phi(m / s) * 100), ueber: k => Math.round(phi((Math.log(last / k) + m) / s) * 100) } };
  return { last, vol: sd * Math.sqrt(252) * 100, s20: sma(20), s50: sma(50), s200: sma(200), dd1j: dd * 100, dd3m: dd3 * 100, tage: c.length,
    ch20: (last / c[Math.max(0, c.length - 21)] - 1) * 100, ch3m: (last / c[Math.max(0, c.length - 64)] - 1) * 100, ch1j: c.length > 200 ? (last / c[0] - 1) * 100 : null, w1: proj(5), m3: proj(63) };
}

// Sicherheits-Punkte (0–100) mit genauer Aufschlüsselung
export function sicherheit(s, ctx) {
  const k = kennzahlen(ctx.verlauf(s), ctx.preis(s), ctx.opt); if (!k) return null;
  const pkt = [], add = (v, t) => { pkt.push([Math.round(v), t]) };
  const art = artVon(s, ctx);
  add(-Math.min(45, k.vol), `Schwankung ${de(k.vol, 0)} % pro Jahr (${k.vol < 15 ? "ruhig" : k.vol < 25 ? "normal für Aktien-ETFs" : k.vol < 40 ? "deutlich" : "sehr stark"})`);
  const dd = k.dd1j != null && k.tage > 200 ? k.dd1j : k.dd3m;
  add(-Math.min(20, Math.abs(dd) * 0.4), `größter Rückgang ${k.tage > 200 ? "im letzten Jahr" : "in 3 Monaten"}: ${sg(dd)}`);
  if (k.s50 && k.s20 && k.last < k.s20 && k.s20 < k.s50) add(-8, `Abwärtstrend: Kurs ${de(k.last, 2)} unter 20-Tage-Schnitt (${de(k.s20, 2)}) und 50-Tage-Schnitt (${de(k.s50, 2)})`);
  else if (k.s50 && k.last > k.s20 && k.s20 > k.s50) add(+3, `Aufwärtstrend: Kurs über 20- und 50-Tage-Schnitt`);
  if (k.s200) { if (k.last < k.s200) add(-5, `unter dem 200-Tage-Schnitt (${de(k.s200, 2)}), langfristig geschwächt`); else add(+2, `über dem 200-Tage-Schnitt (${de(k.s200, 2)}), langfristig intakt`) }
  const w = ctx.warn(s); if (w && w.lv >= 3) add(-18, `Frühwarnung hoch: ${w.gr.join("; ")}`); else if (w && w.lv === 2) add(-8, `Frühwarnung erhöht: ${w.gr.join("; ")}`);
  const ki = ctx.ki(s); if (ki && +ki.warn > 0) add(-5 * ki.warn, `Nachrichtenlage (KI): ${ki.warnGrund || ["", "leicht negativ", "deutlich negativ", "ernst"][+ki.warn] || "negativ"}`);
  if (art === "Einzelaktie") add(-5, "Einzelaktie: hängt an einer einzigen Firma");
  if (art === "Krypto") add(-15, "Kryptowährung: keine Gewinne oder Erträge dahinter, rein angebotsgetrieben");
  if (art === "ETF") add(+5, "ETF: Risiko auf viele Firmen verteilt");
  if (art === "Anleihen/Geldmarkt") add(+10, "Anleihen/Geldmarkt: von Natur aus schwankungsarm");
  const anteil = ctx.anteil(s); if (anteil != null && art !== "ETF" && anteil > 10) add(-Math.min(10, (anteil - 10) * 0.5), `${de(anteil, 0)} % deines Depots in diesem einen Wert (Klumpenrisiko)`);
  if (ctx.waehrung(s) === "USD") add(-3, "in Dollar: der Euro-Wert schwankt zusätzlich mit dem Wechselkurs");
  const term = ctx.termin(s); if (term) add(-3, `Quartalszahlen am ${term}: danach oft starke Bewegung`);
  const score = Math.max(0, Math.min(100, 100 + pkt.reduce((x, [v]) => x + v, 0)));
  const stufe = score >= 75 ? "sehr sicher" : score >= 60 ? "eher sicher" : score >= 45 ? "mittel" : score >= 30 ? "eher unsicher" : "unsicher";
  return { score, stufe, pkt, k, art, w, ki };
}
const AMPEL = sc => sc >= 75 ? "🟢" : sc >= 60 ? "🟢" : sc >= 45 ? "🟡" : sc >= 30 ? "🟠" : "🔴";

// Bericht zu einem Wert
export function bericht(s, ctx, pos) {
  const S = sicherheit(s, ctx); if (!S) return `<b>${esc(ctx.name(s))}</b>: Noch nicht genug Kursdaten. Versuch es in ein paar Minuten nochmal.`;
  const { k } = S, cs = ctx.cs(s), L = [];
  L.push(`${AMPEL(S.score)} <b>${esc(ctx.name(s))}</b> · ${S.art}`);
  L.push(`Sicherheit: <b>${S.stufe}</b> (${S.score} von 100 Punkten)`);
  if (pos) L.push(`Deine Position: ${de(pos.q, pos.q % 1 ? 3 : 0)} Stk. · Kauf ${de(pos.k, 2)} ${cs} · jetzt ${de(k.last, 2)} ${cs} (${sg((k.last / pos.k - 1) * 100)})${ctx.anteil(s) != null ? ` · ${de(ctx.anteil(s), 0)} % deines Depots` : ""}`);
  L.push(""); L.push("<b>Warum genau</b>");
  S.pkt.slice().sort((a, b) => a[0] - b[0]).forEach(([v, t]) => L.push(`${v < 0 ? "▼" : "▲"} ${v > 0 ? "+" : ""}${v} Pkt.: ${esc(t)}`));
  L.push(""); L.push("<b>Zukunft</b> <i>(Schätzung aus Trend und Schwankung, keine Garantie)</i>");
  L.push(`• 1 Woche: erwartet ${de(k.w1.mid, 2)} ${cs}, wahrscheinlicher Bereich ${de(k.w1.lo, 2)}–${de(k.w1.hi, 2)} · Chance auf Plus ${k.w1.steigt} %`);
  L.push(`• 3 Monate: erwartet ${de(k.m3.mid, 2)} ${cs}, wahrscheinlicher Bereich ${de(k.m3.lo, 2)}–${de(k.m3.hi, 2)} · Chance auf Plus ${k.m3.steigt} %`);
  if (pos) L.push(`• Chance, über deinem Kaufpreis zu liegen: in 1 Woche ${k.w1.ueber(pos.k)} %, in 3 Monaten ${k.m3.ueber(pos.k)} %`);
  if (k.ch1j != null) L.push(`• Letztes Jahr: ${sg(k.ch1j)} · letzte 3 Monate: ${sg(k.ch3m)} · letzte 4 Wochen: ${sg(k.ch20)}`);
  else L.push(`• Letzte 3 Monate: ${sg(k.ch3m)} · letzte 4 Wochen: ${sg(k.ch20)}`);
  const ki = S.ki; if (ki) {
    const t = ki.why || ki.text; if (t) L.push(`• KI-Einschätzung${ki.h ? ` (${ki.h === "kurz" ? "kurzfristig" : ki.h === "lang" ? "langfristig" : ki.h})` : ""}: ${esc(t)}`);
    if (ki.ausblick) L.push(`   Ausblick (KI): ${esc(ki.ausblick)}`);
    if (Array.isArray(ki.pro) && ki.pro.length) L.push(`   Dafür: ${ki.pro.map(esc).join("; ")}`);
    if (Array.isArray(ki.con) && ki.con.length) L.push(`   Dagegen: ${ki.con.map(esc).join("; ")}`);
  }
  L.push(`• Langfrist-Durchschnitt (Info): ${LANGFRIST[S.art]}`);
  const q = ctx.quellen(s); if (q.length) { L.push(""); L.push("<b>Quellen</b>"); q.slice(0, 4).forEach(x => L.push(`• <a href="${esc(x.u)}">${esc(x.t)}</a>`)) }
  // Alternativen
  const alt = kandidaten(s, ctx.istEtf(s)).filter(([x]) => x !== s && !ctx.imDepot(x)).map(([x, warum]) => ({ x, warum, S: sicherheit(x, ctx) })).filter(a => a.S)
    .map(a => Object.assign(a, { rot: !!(a.S.w && a.S.w.lv >= 3) })).sort((a, b) => (a.rot - b.rot) || (b.S.score - a.S.score)).slice(0, 3);
  if (alt.length) {
    L.push(""); L.push("<b>Alternativen</b>");
    alt.forEach(a => {
      const v = a.S.k, d = a.S.score - S.score, gr = [];
      gr.push(`Sicherheit ${a.S.stufe} (${a.S.score} Pkt., ${d >= 0 ? "+" : ""}${d} gegenüber ${esc(ctx.name(s))})`);
      gr.push(`Schwankung ${de(v.vol, 0)} % statt ${de(k.vol, 0)} %`);
      gr.push(`letzte 3 Monate ${sg(v.ch3m)}`);
      gr.push(v.s20 && v.s50 ? (v.last > v.s20 && v.s20 > v.s50 ? "Trend aufwärts" : v.last < v.s20 && v.s20 < v.s50 ? "Trend abwärts" : "Trend seitwärts") : "");
      gr.push(`Chance auf Plus in 3 Monaten ${v.m3.steigt} %`);
      if (a.rot) gr.push(`⚠️ hat gerade selbst eine Frühwarnung (${esc(a.S.w.gr.slice(0, 2).join("; "))}), also eher abwarten`);
      const ak = ctx.ki(a.x); if (ak && (ak.text || ak.why)) gr.push(`KI: ${esc(ak.text || ak.why)}`);
      L.push(`➡️ <b>${esc(ctx.name(a.x))}</b> (${a.x}): ${esc(a.warum)}\n   ${gr.filter(Boolean).join(" · ")}`);
    });
    L.push("<i>Vergleich aus Kursdaten, keine Kaufempfehlung.</i>");
  }
  return L.join("\n");
}

// Übersicht über das ganze Depot (erste Nachricht)
export function uebersicht(depot, ctx) {
  const zeilen = depot.map(d => ({ d, S: sicherheit(d.s, ctx) })).filter(x => x.S).sort((a, b) => a.S.score - b.S.score);
  if (!zeilen.length) return null;
  const sum = zeilen.reduce((x, z) => x + (ctx.anteil(z.d.s) || 0) * z.S.score, 0) / Math.max(1, zeilen.reduce((x, z) => x + (ctx.anteil(z.d.s) || 0), 0));
  return `🛡️ <b>Sicherheits-Analyse deines Depots</b>\nGesamt (nach Anteil gewichtet): <b>${de(sum, 0)} von 100</b>\n\n${zeilen.map(z => `${AMPEL(z.S.score)} ${esc(z.d.n)}: ${z.S.stufe} (${z.S.score})${ctx.anteil(z.d.s) != null ? ` · ${de(ctx.anteil(z.d.s), 0)} % des Depots` : ""}`).join("\n")}\n\nDie Einzelberichte mit Gründen, Ausblick und Alternativen folgen, der unsicherste zuerst.`;
}
