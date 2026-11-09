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
  const { depot, trades, serien, hist, preis, warn, bench = "EUNL.DE", daempfung = 0.5 } = ctx;
  const heute = tagKey(Date.now()), out = { t: Date.now(), pos: {}, trades: [], zufall: null, bench };
  const B = serien[bench];
  // Vergleichswerte: alles mit Verlauf, keine Indizes, Wechselkurse, Terminkontrakte
  const uni = Object.entries(hist || {}).filter(([s, v]) => !/^\^|=X$|=F$/.test(s) && v && v.c && v.c.length > 10);
  const pcts = [];

  for (const d of depot) {
    if (d.test || d.demo) continue;
    const sr = serien[d.s], p = preis(d.s) || (sr && sr.c[sr.c.length - 1]);
    if (!sr || !p) continue;
    const kauf = d.d ? tagKey(d.d) : null, r = { kauf, since: (p / d.k - 1) * 100, gr: [] };
    { const i = kauf ? abIndex(sr.ts, kauf) : -1; r.hoch = Math.max(p, d.k, ...(i >= 0 ? sr.c.slice(i) : [])) }
    if (kauf) {
      const i0 = abIndex(sr.ts, kauf);
      if (i0 >= 0) {
        const nach = n => sr.c[i0 + n] != null ? (sr.c[i0 + n] / d.k - 1) * 100 : null;
        r.r1 = nach(1); r.r5 = nach(5); r.r21 = nach(21);
        r.tage = sr.c.length - 1 - i0;
        // Kaufzeitpunkt: Kaufpreis gegen Durchschnitt der 5 Handelstage danach
        const w = sr.c.slice(i0, i0 + 6); if (w.length >= 3) r.timing = (mean(w) / d.k - 1) * 100;
        // Vergleich mit MSCI World im selben Zeitraum
        if (B) { const b0 = kursAm(B, kauf) || B.c[abIndex(B.ts, kauf)], b1 = preis(bench) || B.c[B.c.length - 1]; if (b0) r.benchSince = (b1 / b0 - 1) * 100 }
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
    out.trades.push({ s: t.s, n: t.n, d: t.d, gewinn: (t.p / t.k - 1) * 100, seitVerkauf: (p / t.p - 1) * 100 });
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

// Kurzfassung für den Abend-Rückblick
export function text(rb, namen, kurz) {
  const zeilen = Object.entries(rb.pos).map(([s, r]) => {
    const n = esc(namen(s));
    if (kurz) return `${STAB[r.stab]} ${n}: seit Kauf ${sgn(r.since)}${r.benchSince != null ? ` (MSCI World ${sgn(r.benchSince)})` : ""} · über Kaufpreis in 1 Woche ${r.h5.ueberKauf} %, 3 Monaten ${r.h63.ueberKauf} %`;
    return `${STAB[r.stab]} <b>${n}</b>\n   Seit Kauf ${sgn(r.since)}${r.benchSince != null ? ` · MSCI World ${sgn(r.benchSince)}` : ""}${r.r1 != null ? `\n   Nach 1 Tag ${sgn(r.r1)}` : ""}${r.r5 != null ? ` · 1 Woche ${sgn(r.r5)}` : ""}${r.r21 != null ? ` · 1 Monat ${sgn(r.r21)}` : ""}${r.pct != null ? `\n   Besser als ${r.pct} % der Vergleichswerte` : ""}${r.timing != null ? `\n   Kaufzeitpunkt: ${r.timing >= 0 ? "günstig" : "eher teuer"} (${sgn(r.timing)} gegenüber den Tagen danach)` : ""}\n   Chance über Kaufpreis: morgen ${r.h1.ueberKauf} % · 1 Woche ${r.h5.ueberKauf} % · 3 Monate ${r.h63.ueberKauf} %\n   ${r.gr.join(", ")}`;
  });
  const ohne = Object.values(rb.pos).some(r => !r.kauf);
  const tr = rb.trades.slice(-5).map(t => `• ${esc(t.n)}: verkauft mit ${sgn(t.gewinn)}, seitdem ${sgn(t.seitVerkauf)} → ${t.seitVerkauf < 0 ? "Verkauf hat sich gelohnt" : "Halten wäre besser gewesen"}`);
  return `${zeilen.join(kurz ? "\n" : "\n\n")}${rb.zufall ? `\n\n${zufallText(rb.zufall)}` : ""}${tr.length && !kurz ? `\n\n<b>Verkäufe</b>\n${tr.join("\n")}` : ""}${ohne ? "\n\n<i>Bei manchen Käufen fehlt das Kaufdatum. Trag es in der App unter Ändern › Bearbeiten nach.</i>" : ""}\n\n<i>Chancen sind Schätzungen aus Trend und Schwankung, keine Garantie.</i>`;
}
