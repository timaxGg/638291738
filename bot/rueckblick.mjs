// Kaufrückblick: Wie haben sich deine Kauf- und Verkaufsentscheidungen entwickelt,
// wie zufällig ist deine Auswahl und wie stabil sind die Entscheidungen?
// Alles aus Kursdaten berechnet, ohne KI.

const TAG = 864e5;
const tagKey = t => new Date(t).toISOString().slice(0, 10);
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);

// Standardnormalverteilung (Näherung nach Abramowitz/Stegun)
function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Verlauf (1 Jahr, mit Datum) bei Yahoo holen
export async function serie(s) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1y&interval=1d`, { headers: { "user-agent": "Mozilla/5.0 (compatible; AktienHelfer/1.0)" } });
    if (!r.ok) return null;
    const j = await r.json(), res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res || !res.timestamp) return null;
    const cl = (res.indicators.quote[0] || {}).close || [], ts = [], c = [];
    res.timestamp.forEach((t, i) => { if (cl[i] != null) { ts.push(tagKey(t * 1000)); c.push(+cl[i]) } });
    return c.length > 5 ? { ts, c, d: tagKey(Date.now()) } : null;
  } catch (e) { return null }
}

// Index des ersten Handelstags am oder nach einem Datum
const abIndex = (ts, key) => { const i = ts.findIndex(x => x >= key); return i < 0 ? -1 : i };
// Kurs am letzten Handelstag am oder vor einem Datum
const kursAm = (sr, key) => { let v = null; for (let i = 0; i < sr.ts.length && sr.ts[i] <= key; i++)v = sr.c[i]; return v };

/**
 * ctx: { depot, trades, serien, hist, preis(s), warn(s), bench, daempfung }
 *  serien: { sym: {ts:[aufsteigend], c:[aufsteigend]} } (1 Jahr)
 *  hist:   { sym: {c:[neueste zuerst]} } (3 Monate, Vergleichswerte für den Zufalls-Check)
 */
export function bewerte(ctx) {
  const { depot, trades, serien, hist, preis, warn, bench = "EUNL.DE", daempfung = 0.5 } = ctx, eur = ctx.eur || ((v) => v);
  const heute = tagKey(Date.now()), out = { t: Date.now(), pos: {}, trades: [], zufall: null, bench };
  const B = serien[bench];
  // Vergleichswerte: alles mit Verlauf, keine Indizes, Wechselkurse, Terminkontrakte
  const uni = Object.entries(hist || {}).filter(([s, v]) => !/^\^|=X$|=F$/.test(s) && v && v.c && v.c.length > 10);
  const pcts = [];

  for (const d of depot) {
    if (d.test || d.demo) continue;
    const sr = serien[d.s], p = preis(d.s) || (sr && sr.c[sr.c.length - 1]);
    if (!sr || !p) continue;
    const kauf = d.d ? tagKey(d.d) : null, r = { kauf, since: (p / d.k - 1) * 100, gr: [], eur: eur((p - d.k) * d.q, d.s), einsatz: eur(d.k * d.q, d.s), p };
    { const i = kauf ? abIndex(sr.ts, kauf) : -1; r.hoch = Math.max(p, d.k, ...(i >= 0 ? sr.c.slice(i) : [])) }
    if (kauf) {
      const i0 = abIndex(sr.ts, kauf);
      if (i0 >= 0) {
        const nach = n => sr.c[i0 + n] != null ? (sr.c[i0 + n] / d.k - 1) * 100 : null;
        r.r1 = nach(1); r.r5 = nach(5); r.r21 = nach(21);
        r.tage = sr.c.length - 1 - i0;
        // Bester und schlechtester Stand seit Kauf
        const seit = [...sr.c.slice(i0), p]; r.tief = Math.min(d.k, ...seit);
        r.maxPlus = (r.hoch / d.k - 1) * 100; r.maxMinus = (r.tief / d.k - 1) * 100; r.vomHoch = (p / r.hoch - 1) * 100;
        // Rendite aufs Jahr gerechnet (erst ab 60 Tagen sinnvoll)
        const kal = (Date.now() - Date.parse(kauf)) / TAG; r.kalTage = Math.round(kal);
        if (kal >= 60) r.pa = (Math.pow(p / d.k, 365 / kal) - 1) * 100;
        // Kaufpreis im Vergleich zu den Schlusskursen 5 Handelstage davor und danach
        const fen = sr.c.slice(Math.max(0, i0 - 5), i0 + 6); if (fen.length >= 5) { r.billiger = fen.filter(v => v < d.k).length; r.fenster = fen.length }
        // Kaufzeitpunkt: Kaufpreis gegen Durchschnitt der 5 Handelstage danach
        const w = sr.c.slice(i0, i0 + 6); if (w.length >= 3) r.timing = (mean(w) / d.k - 1) * 100;
        // Vergleich mit MSCI World im selben Zeitraum
        if (B) { const b0 = kursAm(B, kauf) || B.c[abIndex(B.ts, kauf)], b1 = preis(bench) || B.c[B.c.length - 1]; if (b0) { r.benchSince = (b1 / b0 - 1) * 100; r.diffBench = r.since - r.benchSince; r.stattBench = r.einsatz * r.benchSince / 100; r.mehrAlsBench = r.eur - r.stattBench } }
        // Zufalls-Check: wie viele Vergleichswerte lagen im gleichen Zeitraum schlechter?
        const off = r.tage;
        if (off >= 1 && uni.length >= 8) {
          const meins = (p / sr.c[i0] - 1) * 100;
          const rets = uni.filter(([s, v]) => s !== d.s && v.c.length > off).map(([, v]) => (v.c[0] / v.c[off] - 1) * 100);
          if (rets.length >= 8) { r.pct = Math.round(rets.filter(x => x < meins).length / rets.length * 100); r.pctN = rets.length; pcts.push(r.pct) }
        }
      }
    }
    // Ausblick: Chance, über dem Kaufpreis zu liegen (aus Schwankung und Trend der letzten 3 Monate)
    const c = sr.c.slice(-64), lr = []; for (let i = 1; i < c.length; i++)lr.push(Math.log(c[i] / c[i - 1]));
    const mu = mean(lr), sd = Math.sqrt(mean(lr.map(x => (x - mu) ** 2))) || 1e-4;
    const chance = h => { const m = daempfung * mu * h, s = sd * Math.sqrt(h); return { ueberKauf: Math.round(phi((Math.log(p / d.k) + m) / s) * 100), steigt: Math.round(phi(m / s) * 100) } };
    r.h1 = chance(1); r.h5 = chance(5); r.h63 = chance(63); r.vol = sd * Math.sqrt(252) * 100;
    const ber = h => { const m = daempfung * mu * h, s = sd * Math.sqrt(h); return { mid: p * Math.exp(m), lo: p * Math.exp(m - s), hi: p * Math.exp(m + s) } };
    r.erw = { w1: ber(5), m3: ber(63) };
    // Stabilität der Entscheidung
    let sc = 0; const w = warn(d.s);
    const s20 = mean(c.slice(-20)), s50 = mean(c.slice(-50));
    if (p > s20 && s20 > s50) { sc++; r.gr.push("Trend intakt") } else if (p < s20 && s20 < s50) { sc--; r.gr.push("Trend zeigt nach unten") }
    if (w && w.lv >= 3) { sc -= 2; r.gr.push("Frühwarnung hoch") } else if (w && w.lv === 2) { r.gr.push("Frühwarnung erhöht") } else { sc++; r.gr.push("keine Warnzeichen") }
    if (r.benchSince != null) { if (r.since > r.benchSince) { sc++; r.gr.push("besser als der MSCI World seit Kauf") } else { sc--; r.gr.push("schwächer als der MSCI World seit Kauf") } }
    if (r.h63.ueberKauf >= 60) sc++; else if (r.h63.ueberKauf < 40) { sc--; r.gr.push("über Kaufpreis in 3 Monaten eher unwahrscheinlich") }
    r.stab = sc >= 2 ? "stabil" : sc >= 0 ? "wackelig" : "kritisch";
    out.pos[d.s] = r;
  }

  // Verkäufe: hat sich der Verkauf gelohnt?
  for (const t of (trades || []).filter(t => !t.test).slice(-20)) {
    const p = preis(t.s) || (serien[t.s] && serien[t.s].c[serien[t.s].c.length - 1]);
    if (!p) continue;
    out.trades.push({ s: t.s, n: t.n, d: t.d, gewinn: (t.p / t.k - 1) * 100, seitVerkauf: (p / t.p - 1) * 100, eur: eur((t.p - t.k) * t.q, t.s), verpasst: eur((p - t.p) * t.q, t.s) });
  }

  if (pcts.length) out.zufall = { avg: Math.round(mean(pcts)), n: pcts.length };
  return out;
}

const sgn = v => (v > 0 ? "+" : "") + v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const STAB = { stabil: "🟢 stabil", wackelig: "🟡 wackelig", kritisch: "🔴 kritisch" };

export function zufallText(z) {
  if (!z) return "";
  const urteil = z.avg >= 65 ? "deutlich besser als Zufall" : z.avg >= 55 ? "etwas besser als Zufall" : z.avg >= 45 ? "etwa wie Zufall" : "schwächer als Zufall";
  return `Zufalls-Check: Deine Käufe schlagen im Schnitt ${z.avg} % der Vergleichswerte im selben Zeitraum, also ${urteil}${z.n < 5 ? " (noch wenige Käufe, wenig aussagekräftig)" : ""}.`;
}

const eu = v => (v >= 0 ? "+" : "−") + Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const kz = v => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Ausführlicher Block für eine Position
function lang(n, r, cs = "") {
  const L = [`${STAB[r.stab]} <b>${n}</b>${r.kauf ? ` · gekauft am ${new Date(r.kauf).toLocaleDateString("de-DE")}${r.kalTage != null ? ` (vor ${r.kalTage} Tagen)` : ""}` : ""}`];
  L.push(`   Ergebnis: ${sgn(r.since)} = ${eu(r.eur)}${r.pa != null ? ` · aufs Jahr gerechnet ${sgn(r.pa)}` : ""}`);
  if (r.maxPlus != null) L.push(`   Spanne seit Kauf: bestenfalls ${sgn(r.maxPlus)}, schlechtestenfalls ${sgn(r.maxMinus)} · jetzt ${sgn(r.vomHoch)} unter dem Höchststand`);
  if (r.benchSince != null) L.push(`   MSCI World im selben Zeitraum: ${sgn(r.benchSince)} → du liegst ${r.diffBench >= 0 ? "vorn" : "hinten"} um ${kz(Math.abs(r.diffBench))} Prozentpunkte (${eu(r.mehrAlsBench)} gegenüber MSCI World)`);
  const nach = [r.r1 != null ? `1 Tag ${sgn(r.r1)}` : "", r.r5 != null ? `1 Woche ${sgn(r.r5)}` : "", r.r21 != null ? `1 Monat ${sgn(r.r21)}` : ""].filter(Boolean);
  if (nach.length) L.push(`   Direkt danach: ${nach.join(" · ")}`);
  if (r.billiger != null) L.push(`   Kaufzeitpunkt: an ${r.billiger} von ${r.fenster} Handelstagen rund um deinen Kauf (±5 Tage) war es günstiger → ${r.billiger <= r.fenster * 0.3 ? "guter Zeitpunkt" : r.billiger <= r.fenster * 0.6 ? "durchschnittlicher Zeitpunkt" : "eher teurer Zeitpunkt"}`);
  else if (r.timing != null) L.push(`   Kaufzeitpunkt: ${r.timing >= 0 ? "günstig" : "eher teuer"} (${sgn(r.timing)} gegenüber den Tagen danach)`);
  if (r.pct != null) L.push(`   Zufalls-Check: besser als ${r.pct} % von ${r.pctN} Vergleichswerten im selben Zeitraum`);
  L.push(`   Chance über Kaufpreis: morgen ${r.h1.ueberKauf} % · 1 Woche ${r.h5.ueberKauf} % · 3 Monate ${r.h63.ueberKauf} %`);
  if (r.erw) L.push(`   Erwartet: in 1 Woche ${kz(r.erw.w1.lo)}–${kz(r.erw.w1.hi)} ${cs}, in 3 Monaten ${kz(r.erw.m3.lo)}–${kz(r.erw.m3.hi)} ${cs} (Mitte ${kz(r.erw.m3.mid)})`);
  L.push(`   Schwankung ${kz(r.vol)} % pro Jahr · ${r.gr.join(", ")}`);
  return L.join("\n");
}

// Kurzfassung für den Abend-Rückblick
export function text(rb, namen, kurz, cs) {
  const zeilen = Object.entries(rb.pos).map(([s, r]) => {
    const n = esc(namen(s));
    if (kurz) return `${STAB[r.stab]} ${n}: ${sgn(r.since)}${r.eur != null ? ` (${eu(r.eur)})` : ""}${r.benchSince != null ? ` (MSCI World ${sgn(r.benchSince)})` : ""} · über Kaufpreis in 1 Woche ${r.h5.ueberKauf} %, 3 Monaten ${r.h63.ueberKauf} %`;
    return lang(n, r, cs ? cs(s) : "");
  });
  const ohne = Object.values(rb.pos).some(r => !r.kauf);
  const P = Object.values(rb.pos), ges = P.reduce((x, r) => x + (r.eur || 0), 0), mb = P.filter(r => r.mehrAlsBench != null), mbS = mb.reduce((x, r) => x + r.mehrAlsBench, 0);
  const kopf = !kurz && P.length ? `<b>Zusammen: ${eu(ges)}</b>${mb.length ? ` · gegenüber MSCI World ${eu(mbS)}` : ""}\n\n` : "";
  const tr = rb.trades.slice(-5).map(t => `• ${esc(t.n)}: verkauft mit ${sgn(t.gewinn)}${t.eur != null ? ` (${eu(t.eur)})` : ""}, seitdem ${sgn(t.seitVerkauf)} → ${t.seitVerkauf < 0 ? `Verkauf hat sich gelohnt${t.verpasst != null ? `, ${kz(Math.abs(t.verpasst))} € Verlust vermieden` : ""}` : `Halten wäre besser gewesen${t.verpasst != null ? ` (${kz(Math.abs(t.verpasst))} € entgangen)` : ""}`}`);
  return `${kopf}${zeilen.join(kurz ? "\n" : "\n\n")}${rb.zufall ? `\n\n${zufallText(rb.zufall)}` : ""}${tr.length && !kurz ? `\n\n<b>Verkäufe</b>\n${tr.join("\n")}` : ""}${ohne ? "\n\n<i>Bei manchen Käufen fehlt das Kaufdatum. Trag es in der App unter Ändern › Bearbeiten nach.</i>" : ""}\n\n<i>Chancen sind Schätzungen aus Trend und Schwankung, keine Garantie.</i>`;
}
