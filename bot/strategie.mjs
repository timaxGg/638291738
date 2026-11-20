// Reine Rechen-Logik des Anlageplans (ohne Internet), damit sie testbar ist.
import {UNIVERSUM, SPY, STOXX, GOLD, GELD, waehrung} from "./universum.mjs";

export const KOSTEN = 0.0015;
const last = a => a[a.length - 1];
export const sma = (a, n) => a.length < n ? null : a.slice(-n).reduce((x, y) => x + y, 0) / n;
export function vol21(c) {
  if (c.length < 22) return null;
  const r = []; for (let i = c.length - 21; i < c.length; i++) r.push(c[i] / c[i - 1] - 1);
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252) * 100;
}

// Serie in Euro umrechnen. h = {d:[datum], c:[kurs], a:[bereinigt]}, fx = {datum: kurs}
export function inEuro(s, h, fx) {
  const w = waehrung(s); if (w === "EUR") return h;
  const map = fx[w], tage = Object.keys(map).sort(); let j = 0, f = map[tage[0]];
  const c = [], a = [];
  for (let i = 0; i < h.d.length; i++) {
    while (j < tage.length && tage[j] <= h.d[i]) { f = map[tage[j]]; j++; }
    c.push(h.c[i] / f); a.push(h.a[i] / f);
  }
  return {d: h.d, c, a};
}

// Momentum 12-1: Anstieg von vor 12 Monaten (252 Tage) bis vor 1 Monat (21 Tage)
export function momentum(a) { if (a.length < 253) return null; const i = a.length - 1; return a[i - 21] / a[i - 252] - 1; }
export const rendite1J = a => a.length < 253 ? null : a[a.length - 1] / a[a.length - 253] - 1;
export const rendite6 = a => a.length < 127 ? null : last(a) / a[a.length - 127] - 1;

export function rangliste(H, region) {
  return UNIVERSUM.filter(u => !region || u[3] === region).map(([s, n, sec, reg]) => {
    const h = H[s]; const m = h ? momentum(h.a) : null;
    return {s, n, sec, reg, mom: m};
  }).filter(x => x.mom != null && isFinite(x.mom)).sort((a, b) => b.mom - a.mom);
}
export function auswahl(rank, k = 10, cap = 2) {
  const out = [], z = {};
  for (const r of rank) { if ((z[r.sec] || 0) >= cap) continue; out.push(r.s); z[r.sec] = (z[r.sec] || 0) + 1; if (out.length === k) break; }
  return out;
}

export function signale(H) {
  const spy = H[SPY].c, st = H[STOXX] ? H[STOXX].c : [], g = H[GOLD] ? H[GOLD].c : [];
  return {
    datum: last(H[SPY].d), spy: last(spy), spySma: sma(spy, 200), vol: vol21(spy), tageUeber: tageUeber(spy),
    stoxx: last(st), stoxxSma: sma(st, 200), gold: last(g), goldSma: sma(g, 200), gold6: H[GOLD] ? rendite6(H[GOLD].a) : null,
  };
}
export const crash = S => S.spy < S.spySma;
// Rückkehr erst, wenn der S&P 500 mindestens 2 Wochen (10 Handelstage) durchgehend über der Linie schließt
// (eigene Ergänzung, nicht im 20-Jahres-Test geprüft)
export const BESTAETIGUNG = 10;
export function tageUeber(c) {
  let n = 0;
  for (let i = c.length - 1; i >= 199; i--) { const m = c.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200; if (c[i] > m) n++; else break; }
  return n;
}
export const stufe = v => v == null ? 100 : v > 35 ? 50 : v > 25 ? 70 : 100;

// Ausweich wählen: EU-Aktien -> Gold -> Geldmarkt
export function ausweich(S) {
  if (S.stoxx != null && S.stoxxSma != null && S.stoxx > S.stoxxSma) return "E";
  if (S.gold != null && S.goldSma != null && S.gold > S.goldSma) return "G";
  return "M";
}
export function aktien6(H, picks) {
  const r = picks.map(s => H[s] && rendite6(H[s].a)).filter(x => x != null);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}
// Gold-Prüfung: 20 % Gold, wenn Gold (6 Monate) stärker als der Schnitt der Aktien
export function goldPruefung(H, picks) {
  const a = aktien6(H, picks), g = H[GOLD] ? rendite6(H[GOLD].a) : null;
  return {aktien: a, gold: g, anteil: a != null && g != null && g > a ? 20 : 0};
}

// Zielaufteilung (Anteile 0..1)
export function ziel(Z) {
  const w = {}, g = Z.gold / 100;
  if (Z.mode === "U") {
    const e = Z.expo / 100;
    for (const s of Z.picks) w[s] = e * (1 - g) / Z.picks.length;
    if (g) w[GOLD] = e * g;
    if (e < 1) w[GELD] = 1 - e;
  } else if (Z.mode === "E") {
    for (const s of Z.fallback) w[s] = (1 - g) / Z.fallback.length;
    if (g) w[GOLD] = g;
  } else if (Z.mode === "G") w[GOLD] = 1;
  else { if (g) w[GOLD] = g; w[GELD] = 1 - g; }
  return w;
}

// Aufträge aus Ziel und Depot. preis: s -> Euro-Kurs. depot = {cash, pos:{s:{n,p}}}
export function auftraege(w, depot, preis) {
  const pos = depot.pos || {}; let gesamt = +depot.cash || 0;
  for (const [s, x] of Object.entries(pos)) if (preis[s]) gesamt += x.n * preis[s];
  const alle = [...new Set([...Object.keys(pos), ...Object.keys(w)])], v = [], k = [];
  for (const s of alle) {
    const p = preis[s]; if (!p) continue;
    const ist = (pos[s] ? pos[s].n : 0), soll = (w[s] || 0) * gesamt * 0.997 / p; // kleiner Puffer für Gebühren
    if (!w[s] && ist > 0) { v.push({s, act: "verkauf", n: ist, preis: p, eur: ist * p}); continue; }
    const diff = soll - ist;
    if (Math.abs(diff * p) < Math.max(25, gesamt * 0.01)) continue; // Kleinkram ignorieren
    if (diff < 0) { const n = Math.ceil(-diff); v.push({s, act: "verkauf", n: Math.min(n, ist), preis: p, eur: Math.min(n, ist) * p}); }
    else { const n = Math.floor(diff); if (n > 0) k.push({s, act: "kauf", n, preis: p, eur: n * p}); }
  }
  return {gesamt, liste: [...v, ...k]};
}
export function anwenden(depot, liste) {
  const d = {cash: +depot.cash || 0, pos: JSON.parse(JSON.stringify(depot.pos || {}))};
  for (const o of liste) {
    const x = d.pos[o.s] || {n: 0, p: o.preis};
    if (o.act === "kauf") { x.p = (x.n * x.p + o.n * o.preis) / (x.n + o.n); x.n += o.n; d.cash -= o.n * o.preis * (1 + KOSTEN); d.pos[o.s] = x; }
    else { x.n -= o.n; d.cash += o.n * o.preis * (1 - KOSTEN); if (x.n <= 0) delete d.pos[o.s]; else d.pos[o.s] = x; }
  }
  d.cash = Math.round(d.cash * 100) / 100;
  return d;
}

/* Tages-Auswertung nach US-Börsenschluss. Z = Zustand (wird verändert), H = Kurse in Euro.
   Gibt Ereignisse zurück (Texte für Telegram + Log). */
export function auswerten(Z, H, S) {
  const ev = [], d = S.datum, [Y, M] = d.split("-").map(Number);
  const tag = new Date(d + "T12:00:00Z").getUTCDay();
  const rank = rangliste(H), euRank = rangliste(H, "EU");
  const vorher = JSON.stringify(ziel(Z));
  const neu = !Z.picks || !Z.picks.length;
  if (neu) {
    Z.picks = auswahl(rank); Z.picksYear = d >= `${Y}-11-21` ? Y : Y - 1; Z.lastYear = Z.picksYear; Z.gold = 0; Z.expo = 100;
    Z.mode = "U"; Z.fallback = []; Z.picksInit = true;
    ev.push({t: "start", text: `Plan gestartet. Auswahl berechnet (${d}).`});
    const gp = goldPruefung(H, Z.picks); Z.gold = gp.anteil; Z.lastGoldQ = `${Y}-${M}`;
    ev.push({t: "gold", text: `Gold-Prüfung: Aktien ${pc(gp.aktien)} vs. Gold ${pc(gp.gold)} (6 Monate) → ${gp.anteil} % Gold.`});
  }
  // 1) Jahreswechsel: erster Handelstag ab 21. November
  if (!neu && d >= `${Y}-11-21` && (Z.lastYear || 0) < Y) {
    Z.picks = auswahl(rank); Z.picksYear = Y; Z.lastYear = Y; Z.picksInit = false;
    ev.push({t: "jahr", text: `Jahreswechsel ${Y}: neue Top 10 ausgewählt.`});
    if (Z.mode === "U") {
      const gp = goldPruefung(H, Z.picks); Z.gold = gp.anteil; Z.lastGoldQ = `${Y}-${M}`;
      ev.push({t: "gold", text: `Gold-Prüfung: Aktien ${pc(gp.aktien)} vs. Gold ${pc(gp.gold)} → ${gp.anteil} % Gold.`});
    } else {
      Z.mode = ausweich(S); Z.fallback = Z.mode === "E" ? auswahl(euRank) : [];
      ev.push({t: "ausweich", text: `Crash-Modus bleibt. Ausweich neu festgelegt: ${MODUS[Z.mode]}.`});
    }
  }
  // 2) Gold-Prüfung alle 3 Monate (erster Handelstag Jan/Apr/Jul/Okt), nicht im Crash-Modus
  if ([1, 4, 7, 10].includes(M) && Z.lastGoldQ !== `${Y}-${M}`) {
    Z.lastGoldQ = `${Y}-${M}`;
    if (Z.mode === "U") {
      const gp = goldPruefung(H, Z.picks), alt = Z.gold; Z.gold = gp.anteil;
      ev.push({t: "gold", text: `Gold-Prüfung: Aktien ${pc(gp.aktien)} vs. Gold ${pc(gp.gold)} → ${gp.anteil} % Gold${alt !== gp.anteil ? " (geändert)" : " (unverändert)"}.`});
    } else ev.push({t: "gold", text: "Gold-Prüfung ausgesetzt (Crash-Modus)."});
  }
  // 3) Donnerstag (oder Start): Crash-Schutz und Schwankungs-Bremse
  if (tag === 4 || neu) {
    const c = crash(S);
    if (Z.mode === "U" && c) {
      Z.mode = ausweich(S); Z.fallback = Z.mode === "E" ? auswahl(euRank) : []; Z.expo = 100;
      ev.push({t: "crash", text: `🚨 Crash-Signal: S&P 500 ${f2(S.spy)} unter 200-Tage-Linie ${f2(S.spySma)}. Alle Aktien verkaufen → ${MODUS[Z.mode]}.`});
    } else if (Z.mode !== "U" && !c && S.tageUeber >= BESTAETIGUNG) {
      Z.mode = "U"; Z.fallback = [];
      ev.push({t: "zurueck", text: `✅ Entwarnung: S&P 500 ${f2(S.spy)} seit ${S.tageUeber} Handelstagen über der 200-Tage-Linie ${f2(S.spySma)} – bestätigt. Zurück zu den Top 10.`});
    }
    if (Z.mode === "U") {
      const e = stufe(S.vol);
      if (e !== Z.expo) { ev.push({t: "bremse", text: `Schwankungs-Bremse: Volatilität ${f1(S.vol)} % → ${e} % investiert (vorher ${Z.expo} %).`}); Z.expo = e; }
    }
  }
  Z.lastEval = d;
  const geaendert = JSON.stringify(ziel(Z)) !== vorher;
  return {ev, geaendert, rank, euRank};
}
export const MODUS = {U: "Top-10-Aktien", E: "Ausweich: EU-Aktien", G: "Ausweich: Gold", M: "Ausweich: Geldmarkt"};
const pc = v => v == null ? "–" : (v >= 0 ? "+" : "") + (v * 100).toFixed(1).replace(".", ",") + " %";
const f2 = v => v == null ? "–" : v.toFixed(2).replace(".", ",");
const f1 = v => v == null ? "–" : v.toFixed(1).replace(".", ",");
export {pc, f2, f1};
