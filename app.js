/* Mein Anlageplan – App. Liest data/plan.json (vom Wachmann), führt das Depot (verschlüsselt in data/depot.enc). */
"use strict";
const $ = s => document.querySelector(s), V = $("#view");
const KEY = "anlageplan";
let S = laden(), PLAN = null, DEP = S.depot || {cash: 0, pos: {}, updatedAt: 0};
const MODUS = {U: "Top-10-Aktien", E: "Ausweich: EU-Aktien", G: "Ausweich: Gold", M: "Ausweich: Geldmarkt"};
const GOLD = "4GLD.DE", GELD = "XEON.DE";

function laden() {
  let s = null; try { s = JSON.parse(localStorage.getItem(KEY) || "null") } catch (e) {}
  if (!s) { s = {settings: {}}; try { const alt = JSON.parse(localStorage.getItem("kah") || "null"); if (alt && alt.settings) s.settings = {ghRepo: alt.settings.ghRepo || "", ghToken: alt.settings.ghToken || "", syncPass: alt.settings.syncPass || ""} } catch (e) {} }
  s.settings = Object.assign({ghRepo: "timaxGg/638291738", ghToken: "", syncPass: ""}, s.settings || {});
  return s;
}
function speichern() { S.depot = DEP; try { localStorage.setItem(KEY, JSON.stringify(S)) } catch (e) {} }
function toast(t) { const x = $("#toast"); x.textContent = t; x.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => x.classList.remove("on"), 2600) }
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const eur = (v, d = 2) => (+v || 0).toLocaleString("de-DE", {minimumFractionDigits: d, maximumFractionDigits: d}) + " €";
const pc = (v, d = 1, sign = true) => v == null || !isFinite(v) ? "–" : (v = +v.toFixed(d) || 0, (sign && v > 0 ? "+" : "") + v.toLocaleString("de-DE", {minimumFractionDigits: d, maximumFractionDigits: d}) + " %");
const num = (v, d = 2) => v == null ? "–" : (+v).toLocaleString("de-DE", {minimumFractionDigits: d, maximumFractionDigits: d});
const datum = d => d ? new Date(d + "T12:00:00").toLocaleDateString("de-DE", {weekday: "short", day: "numeric", month: "short", year: "numeric"}) : "–";
const nm = s => (PLAN && PLAN.namen && PLAN.namen[s] ? PLAN.namen[s].n : s);
const kennung = s => { const x = (PLAN && PLAN.namen && PLAN.namen[s]) || {}; return x.isin ? `<span class="isin" data-copy="${esc(x.isin)}">${esc(x.art || "Aktie")} · ISIN ${esc(x.isin)} ⧉</span>` : esc(s) };
const zahlVon = t => { t = String(t || "").trim().replace(/[€\s]/g, ""); if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); return parseFloat(t) };
const preis = s => PLAN && PLAN.preise && PLAN.preise[s] ? PLAN.preise[s].eur : null;

/* ---------- Verschlüsselung (identisch zum Wachmann) ---------- */
const te = new TextEncoder(), td = new TextDecoder();
const b64 = u => btoa(String.fromCharCode(...u)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function cKey(pass, salt) { const k = await crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256"}, k, {name: "AES-GCM", length: 256}, false, ["encrypt", "decrypt"]) }
async function encJ(o, pass) { const sa = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const c = await crypto.subtle.encrypt({name: "AES-GCM", iv}, await cKey(pass, sa), te.encode(JSON.stringify(o))); return JSON.stringify({v: 1, s: b64(sa), i: b64(iv), c: b64(new Uint8Array(c))}) }
async function decJ(t, pass) { const o = JSON.parse(t); return JSON.parse(td.decode(await crypto.subtle.decrypt({name: "AES-GCM", iv: unb64(o.i)}, await cKey(pass, unb64(o.s)), unb64(o.c)))) }

/* ---------- GitHub-Abgleich ---------- */
async function gh(path, opt = {}) {
  const r = await fetch(`https://api.github.com/repos/${S.settings.ghRepo}/contents/${path}`, Object.assign({cache: "no-store", headers: {Authorization: `Bearer ${S.settings.ghToken}`, Accept: "application/vnd.github+json"}}, opt));
  if (r.status === 404) return null; if (!r.ok) throw new Error("GitHub " + r.status); return r.json();
}
async function depotHolen() {
  if (!S.settings.syncPass) return;
  try {
    let text = null;
    if (S.settings.ghToken) { const f = await gh("data/depot.enc"); if (f) text = td.decode(unb64(f.content.replace(/\n/g, ""))) }
    else { const r = await fetch("data/depot.enc?t=" + Date.now(), {cache: "no-store"}); if (r.ok) text = await r.text() }
    if (!text) return;
    const d = await decJ(text, S.settings.syncPass);
    if ((d.updatedAt || 0) > (DEP.updatedAt || 0)) { DEP = d; speichern(); S.syncInfo = "Depot geladen" } else if ((d.updatedAt || 0) < (DEP.updatedAt || 0) && S.syncInfo && !/abgeglichen|geladen/.test(S.syncInfo)) depotSenden();
  } catch (e) { S.syncInfo = "Depot: " + e.message }
}
async function depotSenden() { const ok = await depotSendenI(); toast("Gespeichert · " + S.syncInfo); return ok }
async function depotSendenI() {
  DEP.updatedAt = Date.now(); DEP.von = "app"; speichern();
  if (!S.settings.ghToken || !S.settings.syncPass) { S.syncInfo = "nur auf diesem Handy gespeichert"; return true }
  const inhalt = b64(te.encode(await encJ(DEP, S.settings.syncPass)));
  for (let i = 0; i < 3; i++) {
    try {
      const alt = await gh("data/depot.enc"), body = {message: "Depot aktualisiert (App)", content: inhalt};
      if (alt) body.sha = alt.sha;
      const r = await fetch(`https://api.github.com/repos/${S.settings.ghRepo}/contents/data/depot.enc`, {method: "PUT", headers: {Authorization: `Bearer ${S.settings.ghToken}`, Accept: "application/vnd.github+json"}, body: JSON.stringify(body)});
      if (r.ok) { S.syncInfo = "mit dem Bot abgeglichen"; return true }
      if (r.status !== 409 && r.status !== 422) throw new Error("GitHub " + r.status);
    } catch (e) { S.syncInfo = "Abgleich fehlgeschlagen (" + e.message + "), lokal gespeichert"; return false }
    await new Promise(r => setTimeout(r, 1500));
  }
  S.syncInfo = "Abgleich später erneut – lokal gespeichert"; return false;
}
/* ---------- Daten ---------- */
async function stummHolen() { try { const r = await fetch("data/stumm.json?t=" + Date.now(), {cache: "no-store"}); if (r.ok) { S.stumm = await r.json(); speichern() } } catch (e) {} }
async function planHolen() {
  stummHolen();
  try { const r = await fetch("data/plan.json?t=" + Date.now(), {cache: "no-store"}); if (r.ok) { PLAN = await r.json(); S.plan = PLAN; speichern() } }
  catch (e) { PLAN = S.plan || null }
  if (!PLAN) PLAN = S.plan || null;
  const kz = PLAN && (PLAN.kurseVon || PLAN.erstellt) ? new Date(PLAN.kurseVon || PLAN.erstellt).toLocaleString("de-DE", {weekday: "short", hour: "2-digit", minute: "2-digit"}) : "";
  $("#stand").textContent = PLAN ? `${MODUS[PLAN.modus]} · Kurse ${kz}` : "Noch keine Daten vom Wachmann";
}
function depotWerte() {
  let g = +DEP.cash || 0; const z = [];
  for (const [s, x] of Object.entries(DEP.pos || {})) { const p = preis(s) || x.p, v = x.n * p; g += v; z.push({s, n: x.n, p: x.p, akt: p, v}) }
  return {gesamt: g, z};
}
function auftraegeAktuell() {
  // Soll vs. Ist mit aktuellen Kursen (gleiche Rechnung wie der Bot)
  const w = (PLAN && PLAN.ziel) || {}, {gesamt} = depotWerte(), pos = DEP.pos || {}, l = [];
  for (const s of new Set([...Object.keys(pos), ...Object.keys(w)])) {
    const p = preis(s); if (!p) continue; const ist = pos[s] ? pos[s].n : 0, soll = (w[s] || 0) * gesamt * 0.997 / p;
    if (!w[s] && ist > 0) { l.push({s, act: "verkauf", n: ist, preis: p, eur: ist * p}); continue }
    const d = soll - ist; if (Math.abs(d * p) < Math.max(25, gesamt * 0.01)) continue;
    if (d < 0) { const n = Math.min(Math.ceil(-d), ist); l.push({s, act: "verkauf", n, preis: p, eur: n * p}) } else { const n = Math.floor(d); if (n > 0) l.push({s, act: "kauf", n, preis: p, eur: n * p}) }
  }
  return l.sort((a, b) => (a.act === "verkauf" ? 0 : 1) - (b.act === "verkauf" ? 0 : 1));
}
// gebuehr: nur für geschätzte Plan-Aufträge. Eigene Einträge werden genau so gebucht, wie du sie eingibst.
function anwenden(liste, gebuehr = true) {
  const f = gebuehr ? 0.0015 : 0;
  for (const o of liste) {
    const x = DEP.pos[o.s] || {n: 0, p: o.preis}, betrag = o.betrag != null ? o.betrag : o.n * o.preis;
    if (o.act === "kauf") { x.p = (x.n * x.p + betrag) / (x.n + o.n); x.n += o.n; DEP.cash -= betrag * (1 + f); DEP.pos[o.s] = x }
    else { x.n -= o.n; DEP.cash += betrag * (1 - f); if (x.n <= 1e-6) delete DEP.pos[o.s]; else DEP.pos[o.s] = x }
    if (DEP.pos[o.s]) DEP.pos[o.s].n = Math.round(DEP.pos[o.s].n * 1e6) / 1e6;
  }
  DEP.cash = Math.round(DEP.cash * 100) / 100;
}
/* ---------- Ansichten ---------- */
const R = {};
function orderHTML(l) {
  return l.map(o => `<div class="order"><span class="tag ${o.act === "kauf" ? "k" : "v"}">${o.act === "kauf" ? "KAUF" : "VERKAUF"}</span><div class="l" style="flex:1"><div class="t">${o.n} × ${esc(nm(o.s))}</div><div class="s">${kennung(o.s)}<br>je ≈ ${eur(o.preis)}</div></div><div class="r">${eur(o.eur, 0)}</div></div>`).join("");
}
R.status = () => {
  if (!PLAN) return `<div class="card">Der Wachmann hat noch keine Daten erstellt. Er läuft automatisch – schau in ein paar Minuten wieder rein.</div>`;
  const s = PLAN.signale, ab = (s.spy / s.spySma - 1) * 100, o = PLAN.orders, offen = o && !o.done && o.liste && o.liste.length;
  const leer = !DEP.cash && !Object.keys(DEP.pos || {}).length, live = !leer ? auftraegeAktuell() : [];
  const satz = {U: `${PLAN.expo} % investiert in die Top 10${PLAN.gold ? `, davon 20 % Gold` : ""}${PLAN.expo < 100 ? `, ${100 - PLAN.expo} % Geldmarkt (Schwankungs-Bremse)` : ""}.`,
    E: "S&P 500 unter seiner 200-Tage-Linie. Das Geld liegt in den 10 stärksten EU-Aktien.", G: "S&P 500 unter seiner 200-Tage-Linie. Das Geld liegt in Gold.", M: "S&P 500 unter seiner 200-Tage-Linie. Das Geld liegt sicher im Geldmarkt-ETF."}[PLAN.modus];
  let h = jetzt() + radar() + `<div class="hero m-${PLAN.modus}"><div class="k">Modus jetzt</div><div class="v">${MODUS[PLAN.modus]}</div><p>${satz}</p></div>`;
  h += `<h2>Was ist zu tun?</h2><div class="card">`;
  if (offen) h += `<div class="small">Grund: ${esc(o.grund)}</div>${orderHTML(o.liste)}<div class="small" style="margin-top:6px">Am nächsten Handelstag zur Eröffnung ausführen.</div><button class="btn" data-act="erledigt">✅ Erledigt – ins Depot übernehmen</button>`;
  else if (leer) h += `<b>Trag dein Depot ein</b><div class="small">Dann rechnet die App genaue Stückzahlen für dich aus.</div><button class="btn" data-go="depot">Zum Depot</button>`;
  else if (live.length) h += `<div class="small">Dein Depot weicht von der Ziel-Aufteilung ab. So kommst du hin:</div>${orderHTML(live)}<button class="btn sek" data-act="angleichen">Als erledigt eintragen</button>`;
  else h += `<b>Nichts zu tun 👍</b><div class="small">Dein Depot passt zum Plan. Nächste Prüfung: ${datum(PLAN.termine.donnerstag)} (Donnerstagabend).</div>`;
  h += `</div>`;
  if (PLAN.picksVorlaeufig) h += `<div class="hint vorwarnung"><b>Hinweis:</b> Die Top 10 sind vorläufig. Am ersten Handelstag ab 21. November wird die Jahresauswahl neu berechnet.</div>`;
  h += `<h2>Signale</h2><div class="card">`;
  h += sig("S&P 500 vs. 200-Tage-Linie", `${num(s.spy)} / ${num(s.spySma)}`, `${pc(ab)}`, ab >= 0 ? "ok" : "x", ab >= 0 ? "über Linie" : "unter Linie", Math.max(0, Math.min(100, 50 + ab * 5)), 50);
  h += sig("Schwankung (21 Tage)", `Bremse ab 25 % / 35 %`, pc(s.vol, 1, false), s.vol > 35 ? "x" : s.vol > 25 ? "w" : "ok", s.vol > 35 ? "50 %" : s.vol > 25 ? "70 %" : "100 %", Math.min(100, s.vol / 50 * 100), 50, 70);
  h += sig("STOXX Europe 600", "Ausweich 1", s.stoxx > s.stoxxSma ? "über Linie" : "unter Linie", s.stoxx > s.stoxxSma ? "ok" : "x", "", null);
  h += sig("Gold (€)", "Ausweich 2", s.gold > s.goldSma ? "über Linie" : "unter Linie", s.gold > s.goldSma ? "ok" : "x", "", null);
  h += sig("Gold-Prüfung (6 Monate)", `Aktien ${pc(s.aktien6 * 100)} · Gold ${pc(s.gold6 * 100)}`, s.gold6 > s.aktien6 ? "Gold vorn" : "Aktien vorn", s.gold6 > s.aktien6 ? "w" : "ok", "", null);
  h += `</div><div class="card chart">${chart()}<div class="leg"><span style="--c:#0b0b0b">S&amp;P 500 (SPY)</span><span style="--c:#e34948">200-Tage-Linie</span></div></div>`;
  const hw = (PLAN.hinweise || []).slice(0, 6);
  if (hw.length) h += `<h2>Hinweise</h2>` + hw.map(x => `<div class="hint ${x.art}"><div class="d">${datum(x.d)}</div>${esc(x.text)}${x.zusatz ? `<div class="z">🧪 Zusatz – nicht im 20-Jahres-Test geprüft</div>` : ""}</div>`).join("");
  h += `<h2>Termine</h2><div class="card">
   <div class="row"><div class="l"><div class="t">Crash- & Bremsen-Check</div><div class="s">jeden Donnerstagabend</div></div><div class="r">${datum(PLAN.termine.donnerstag)}</div></div>
   <div class="row"><div class="l"><div class="t">Gold-Prüfung</div><div class="s">Jan · Apr · Jul · Okt</div></div><div class="r">${datum(PLAN.termine.goldCheck)}</div></div>
   <div class="row"><div class="l"><div class="t">Jahreswechsel (neue Top 10)</div><div class="s">erster Handelstag ab 21. Nov.</div></div><div class="r">${datum(PLAN.termine.jahreswechsel)}</div></div></div>`;
  return h;
};
function radar() {
  if (!PLAN || PLAN.modus === "U") return "";
  const s = PLAN.signale, live = (PLAN.preise || {}).SPY, spy = live && live.cur ? live.cur : s.spy, ab = (spy / s.spySma - 1) * 100, noetig = (s.spySma / spy - 1) * 100;
  const r = (PLAN.radar || []).filter(v => v != null), vor = r.length > 5 ? r[r.length - 6] : null, trend = vor == null ? "" : ab > vor ? "🟢 kommt näher" : "🔴 entfernt sich";
  const W = 300, H = 60, mn = Math.min(-8, ...r), mx = Math.max(3, ...r), y = v => H - 4 - (v - mn) / (mx - mn) * (H - 8);
  const pfad = r.map((v, i) => `${i ? "L" : "M"}${(i / Math.max(1, r.length - 1) * W).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return `<div class="card"><div class="k" style="font-size:13px;font-weight:800;color:var(--warn);text-transform:uppercase;letter-spacing:.05em">📡 Markt-Radar: Wann wieder in Aktien?</div>
   <div class="row"><div class="l"><div class="t">S&amp;P 500 zur 200-Tage-Linie</div><div class="s">${ab >= 0 ? "darüber" : `muss noch ca. ${pc(noetig)} steigen`} ${trend ? "· " + trend : ""}</div></div><div class="r"><span class="badge ${ab >= 0 ? "ok" : "x"}">${pc(ab)}</span></div></div>
   <div class="row"><div class="l"><div class="t">Tage über der Linie</div><div class="s">${(s.tageUeber || 0) >= 10 ? "2 Wochen bestätigt – Donnerstagabend kommen die Kaufaufträge" : "Wiedereinstieg erst nach 10 Handelstagen (2 Wochen) durchgehend darüber"}</div>
     <div class="bar"><i style="width:${Math.min(100, (s.tageUeber || 0) * 10)}%;background:var(--gut)"></i></div></div><div class="r"><b>${Math.min(s.tageUeber || 0, 99)} / 10</b></div></div>
   <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;margin-top:6px" aria-label="Abstand zur Linie, 30 Tage"><line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#e34948" stroke-dasharray="4 3"/><path d="${pfad}" fill="none" stroke="#0b0b0b" stroke-width="2"/></svg>
   <div class="small mut">Abstand der letzten 30 Tage · rote Linie = Einstiegsschwelle</div>
   <div class="small" style="margin-top:6px">Nächste Entscheidung: <b>${datum(PLAN.termine.donnerstag)}</b> nach US-Börsenschluss. Der Bot meldet sich vorher, sobald es knapp wird – die Kaufliste mit ISIN steht unter „Auswahl“.</div></div>`;
}
function jetzt() {
  const w = PLAN.ziel || {}, m = PLAN.modus, r = PLAN.renditen || {}, {gesamt} = depotWerte();
    const sortiert = Object.keys(w).sort((a, b) => w[b] - w[a] || nm(a).localeCompare(nm(b)));
  const zeilen = sortiert.map(s => `<div class="row"><div class="l"><div class="t">${esc(nm(s))}</div><div class="s">${kennung(s)}</div></div><div class="r"><b>${pc(w[s] * 100, w[s] < 0.2 ? 1 : 0, false)}</b>${gesamt > 0 ? `<div class="s">≈ ${eur(w[s] * gesamt, 0)}</div>` : ""}</div></div>`).join("");
  const emp = {
    M: `Alles in den Geldmarkt-ETF (XEON). Der US-Markt ist im Abwärtstrend, Europa und Gold auch – dort ist dein Geld sicher und bekommt Zinsen.`,
    G: `Alles in Gold (Xetra-Gold). Der US-Markt ist im Abwärtstrend, Gold ist gerade der stärkste sichere Ort.`,
    E: `In die 10 stärksten EU-Aktien. Der US-Markt ist im Abwärtstrend, Europa aber nicht.`,
    U: `In die Top-10-Aktien (je gleicher Betrag)${PLAN.gold ? " plus 20 % Gold" : ""}${PLAN.expo < 100 ? `, ${100 - PLAN.expo} % Geldmarkt wegen hoher Schwankung` : ""}.`}[m];
  const erw = {
    M: `Erwartung: ca. ${pc(r.geldmarkt1J * 100)} pro Jahr (letzte 12 Monate), praktisch kein Verlustrisiko.`,
    G: `Gold letzte 12 Monate: ${pc(r.gold1J * 100)}. Schwankt stark, keine Garantie.`,
    E: `Ø der EU-Auswahl, letzte 12 Monate: ${pc(r.euMom * 100, 0)}. Vergangenheit, keine Garantie.`,
    U: `Ø der Top 10, letzte 12 Monate: ${pc(r.top10Mom * 100, 0)}. Im 20-Jahres-Test brachte der Plan Ø +16,9 % pro Jahr (einzelne Jahre zwischen −11 % und +54 %).`}[m];
  const weiter = m === "U" ? `Behalten bis zum Jahreswechsel – jeden Donnerstag prüft der Bot den Crash-Schutz.` : `Erst wenn der S&P 500 2 Wochen durchgehend über seiner 200-Tage-Linie liegt, wechselst du in die Top 10 (der Bot sagt Bescheid).`;
  return `<div class="card jetzt"><div class="k">👉 Jetzt anlegen in</div><p style="margin:2px 0 6px"><b>Empfehlung laut Plan:</b> ${emp}</p>${zeilen}<div class="small mut" style="margin-top:4px">Tipp: ISIN antippen = kopieren → in Trade Republic auf die Lupe und einfügen.</div><p class="small">${erw}</p><p class="small">${weiter}${PLAN.picksVorlaeufig ? ` Am ${datum(PLAN.termine.jahreswechsel)} wird die Jahresauswahl neu berechnet.` : ""}</p>${gesamt > 0 ? "" : `<button class="btn kl" data-go="depot" style="margin-top:8px">Betrag eintragen → Stückzahlen</button>`}</div>`;
}
function sig(t, s, v, cls, extra, fill, mark, mark2) {
  return `<div class="row"><div class="l"><div class="t">${t}</div><div class="s">${s}</div>${fill != null ? `<div class="bar"><i style="width:${fill}%;background:var(--${cls === "ok" ? "gut" : cls === "w" ? "warn" : "schlecht"})"></i>${mark != null ? `<b style="left:${mark}%"></b>` : ""}${mark2 != null ? `<b style="left:${mark2}%"></b>` : ""}</div>` : ""}</div><div class="r"><span class="badge ${cls}">${v}</span>${extra ? `<div class="s">${extra}</div>` : ""}</div></div>`;
}
function chart() {
  const c = PLAN.chart; if (!c || !c.c.length) return "";
  const W = 600, H = 200, p = 6, all = [...c.c, ...c.s.filter(Boolean)], mn = Math.min(...all), mx = Math.max(...all);
  const x = i => p + i / (c.c.length - 1) * (W - 2 * p), y = v => H - p - (v - mn) / (mx - mn) * (H - 2 * p);
  const line = (a, col, w) => `<path d="${a.map((v, i) => v == null ? "" : `${i && a[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"/>`;
  return `<div class="small" style="margin-bottom:4px"><b>S&amp;P 500, letztes Jahr</b></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="S&P 500 und 200-Tage-Linie">${line(c.s, "#e34948", 2)}${line(c.c, "#0b0b0b", 2)}</svg><div class="small mut" style="display:flex;justify-content:space-between"><span>${datum(c.d[0])}</span><span>${datum(c.d.at(-1))}</span></div>`;
}
R.depot = () => {
  const {gesamt, z} = depotWerte(), w = (PLAN && PLAN.ziel) || {};
  let h = `<div class="hero m-U"><div class="k">Depotwert</div><div class="v">${eur(gesamt)}</div><p>Bargeld: ${eur(DEP.cash || 0)} ${S.syncInfo ? `· <span class="small">${esc(S.syncInfo)}</span>` : ""}</p></div>`;
  h += `<h2>Soll / Ist</h2><div class="card">`;
  const syms = [...new Set([...Object.keys(w), ...z.map(x => x.s)])];
  if (!syms.length) h += `<div class="small">Noch nichts im Depot.</div>`;
  for (const s of syms.sort((a, b) => (w[b] || 0) - (w[a] || 0))) {
    const x = z.find(q => q.s === s), ist = x && gesamt ? x.v / gesamt * 100 : 0, soll = (w[s] || 0) * 100;
    h += `<div class="row"><div class="l"><div class="t">${esc(nm(s))}</div><div class="s">${x ? `${num(x.n, x.n % 1 ? 4 : 0)} St. (${eur(x.v)}) · Kauf ${eur(x.p)} · jetzt ${eur(x.akt)} <span class="${x.akt >= x.p ? "pos" : "neg"}">${pc((x.akt / x.p - 1) * 100)}</span>` : "nicht im Depot"}</div>
      <div class="bar"><i style="width:${Math.min(100, ist * 4)}%"></i>${soll ? `<b style="left:${Math.min(99, soll * 4)}%"></b>` : ""}</div></div>
      <div class="r">${pc(ist, 1, false)}<div class="s">Soll ${pc(soll, 0, false)}</div></div>${x ? `<button class="del ed" data-edit="${esc(s)}" aria-label="Korrigieren">✎</button><button class="del" data-del="${esc(s)}" aria-label="Löschen">×</button>` : ""}</div>`;
  }
  h += `<div class="small mut" style="margin-top:6px">Balken = Ist-Anteil, Strich = Soll laut Plan</div></div>`;
  h += `<h2>Eintragen</h2><div class="card">
   <label>Bargeld (€)<input id="cash" inputmode="decimal" value="${DEP.cash || 0}"></label><button class="btn sek" data-act="cash">Bargeld speichern</button>
   <label>Wertpapier<select id="sym">${optionen()}</select></label>
   <div class="grid2"><label>Betrag in € <input id="betrag" inputmode="decimal" placeholder="z. B. 1000"></label><label>oder Stück<input id="n" inputmode="decimal" placeholder="optional"></label></div>
   <label>Kurs je Stück (€) – leer = aktueller Kurs<input id="p" inputmode="decimal" placeholder="${"aktuell"}"></label>
   <div class="small">Am einfachsten: nur den <b>Betrag in €</b> eintragen, den du in Trade Republic investiert hast. Die App rechnet die Stücke selbst aus (auch Bruchstücke).</div>
   <div class="grid2"><button class="btn" data-act="kauf">Kauf eintragen</button><button class="btn sek" data-act="verkauf">Verkauf eintragen</button></div>
   <div class="small" style="margin-top:8px">Tipp: Wenn du die Aufträge vom Status-Tab ausführst, tippe dort einfach auf „Erledigt“.</div></div>`;
  return h;
};
function optionen() {
  if (!PLAN) return "";
  const w = PLAN.ziel || {}, alle = Object.keys(PLAN.namen).filter(s => !["SPY", "EXSA.DE"].includes(s));
  alle.sort((a, b) => (w[b] ? 1 : 0) - (w[a] ? 1 : 0) || nm(a).localeCompare(nm(b)));
  return alle.map(s => `<option value="${esc(s)}">${w[s] ? "★ " : ""}${esc(nm(s))} (${esc(s)})</option>`).join("");
}
R.liste = () => {
  if (!PLAN) return "";
  const rk = PLAN.rangliste || [], m = PLAN.modus;
  const zeile = (r, i) => `<div class="row"><div class="l"><div class="t">${i + 1}. ${esc(r.n)}</div><div class="s">${kennung(r.s)}</div><div class="s">${esc(r.sec)} · ${r.reg}${(PLAN.preise[r.s] || {}).chg != null ? ` · heute <span class="${PLAN.preise[r.s].chg >= 0 ? "pos" : "neg"}">${pc(PLAN.preise[r.s].chg)}</span>` : ""}</div></div><div class="r">${pc(r.mom * 100, 0)}<div>${r.pick ? '<span class="badge ok">Top 10</span>' : r.fb ? '<span class="badge ok">EU-Ausweich</span>' : ""}</div></div></div>`;
  const r = PLAN.renditen || {};
  let h = `<div class="hero m-${m}"><div class="k">${m === "U" ? "Jetzt gekauft" : "Gerade NICHT kaufen – Crash-Modus"}</div><div class="v">Top 10 ${PLAN.picksYear || ""}${PLAN.picksVorlaeufig ? " (vorläufig)" : ""}</div>
   <p>${m === "U" ? "Diese 10 Aktien sind laut Plan im Depot, je gleicher Betrag." : "Diese 10 kaufst du erst, wenn der S&amp;P 500 2 Wochen durchgehend über seiner 200-Tage-Linie liegt. Bis dahin: siehe Status."}</p></div>
   <div class="card"><div class="row"><div class="l"><div class="t">Ø Rendite der Top 10</div><div class="s">letzte 12 Monate ohne letzten Monat, in €</div></div><div class="r"><b>${pc(r.top10Mom * 100, 0)}</b></div></div>
   <div class="row"><div class="l"><div class="t">Was du erwarten kannst</div><div class="s">Ø im 20-Jahres-Test, einzelne Jahre −11 % bis +54 %</div></div><div class="r"><b>+16,9 %/Jahr</b></div></div>
   <div class="small mut" style="margin-top:6px">Die Prozentzahl bei jeder Aktie ist ihr Anstieg der letzten 12 Monate (ohne letzten Monat) – danach wird ausgewählt. Keine Garantie für die Zukunft.</div></div>`;
  h += `<h2>Die Top 10</h2><div class="card">` + (PLAN.picks || []).map((s, i) => { const r = rk.find(x => x.s === s) || {s, n: nm(s), sec: "", reg: "", mom: 0}; return zeile(Object.assign({}, r, {pick: true}), i) }).join("") + `</div>`;
  if (m === "E") h += `<h2>EU-Ausweich (aktiv)</h2><div class="card">` + (PLAN.fallback || []).map((s, i) => zeile(Object.assign({}, (PLAN.euRangliste || []).find(x => x.s === s) || {s, n: nm(s), sec: "", reg: "EU", mom: 0}, {fb: true, pick: false}), i)).join("") + `</div>`;
  const z = {}; h += `<h2>Rangliste (alle)</h2><div class="card">` + rk.map((r, i) => { const voll = !r.pick && (z[r.sec] || 0) >= 2 && i < 14; if (r.pick) z[r.sec] = (z[r.sec] || 0) + 1; return zeile(r, i) + (voll ? `<div class="small mut" style="margin:-4px 0 6px">↳ übersprungen: Branche ${esc(r.sec)} schon 2× dabei</div>` : "") }).join("") + `</div>`;
  return h;
};
R.verlauf = () => {
  if (!PLAN) return "";
  const ic = {start: "🟦", gold: "🟡", jahr: "📅", crash: "🚨", zurueck: "✅", bremse: "🧯", ausweich: "↪️"};
  return `<h2>Entscheidungen</h2><div class="card">` + (PLAN.log || []).map(l => `<div class="row"><div class="l"><div class="s">${datum(l.d)}</div><div>${ic[l.t] || "•"} ${esc(l.text)}</div></div></div>`).join("") + `</div>` +
    `<h2>Alle Hinweise</h2>` + (PLAN.hinweise || []).map(x => `<div class="hint ${x.art}"><div class="d">${datum(x.d)}</div>${esc(x.text)}${x.zusatz ? `<div class="z">🧪 Zusatz – nicht im 20-Jahres-Test geprüft</div>` : ""}</div>`).join("");
};
R.regeln = () => `<div class="hero m-U"><div class="k">20 Jahre getestet (2006–2026)</div><div class="v">1.000 € → 22.572 €</div><p>16,9 % pro Jahr · größter Rückgang −23 % (S&amp;P 500: −51 %)</p></div>
<h2>Die Regeln</h2><div class="card"><table class="rg">
<tr><td>Auswahl</td><td>Top 10 aus ~100 größten US- und EU-Firmen nach Anstieg 12 Monate bis 1 Monat vorher; max. 2 pro Branche; je 10 %. Erster Handelstag ab 21. November.</td></tr>
<tr><td>Gold</td><td>Jan/Apr/Jul/Okt + Stichtag: Aktien (Ø 6 Monate) schwächer als Gold (€) → 20 % Gold, sonst 0 %. Im Crash-Modus ausgesetzt.</td></tr>
<tr><td>Crash-Schutz</td><td>Donnerstag: S&amp;P 500 schließt unter 200-Tage-Linie → Freitag alle Aktien verkaufen.</td></tr>
<tr><td>Ausweich</td><td>1. EU-Top-10 (STOXX 600 über Linie) → 2. Gold (über Linie) → 3. Geldmarkt (XEON). Nur beim Ausstieg und am Stichtag gewählt.</td></tr>
<tr><td>Rückkehr</td><td>S&amp;P 500 schließt 2 Wochen (10 Handelstage) durchgehend über der Linie → am nächsten Donnerstag bestätigt, Freitag Top 10 zurückkaufen. <i>(2-Wochen-Bestätigung: eigene Ergänzung, nicht im 20-Jahres-Test)</i></td></tr>
<tr><td>Bremse</td><td>Schwankung 21 Tage: unter 25 % → 100 %, 25–35 % → 70 %, über 35 % → 50 % investiert, Rest Geldmarkt.</td></tr>
<tr><td>Sonstiges</td><td>Dividenden wieder anlegen · kein Hebel · keine Einzel-Stopps.</td></tr></table></div>
<h2>Hinweise vom Bot</h2><div class="card small">⚠️ Vorwarnungen und 🟡 Infos folgen direkt aus dem Plan. 🧪 <b>Zusatz-Hinweise</b> (z. B. Gewicht zurückführen, schwache Aktie ersetzen) sind <b>nicht</b> im 20-Jahres-Test geprüft – nur optional.</div>
<a class="btn" style="display:block;text-align:center;text-decoration:none" href="regelwerk.pdf" target="_blank">📘 Regelwerk als PDF öffnen</a>
<div class="small mut" style="margin-top:10px">Keine Anlageberatung. Vergangene Ergebnisse sind keine Garantie.</div>`;
R.einstellungen = () => `<h2>Benachrichtigungen (Telegram)</h2><div class="card">
<div class="row"><div class="l"><div class="t">Anlageplan</div><div class="s">Signale, Aufträge, Vorwarnungen, Hinweise</div></div><button class="btn kl ${S.stumm && S.stumm.plan ? "sek" : ""}" data-stumm="plan">${S.stumm && S.stumm.plan ? "🔕 stumm" : "🔔 an"}</button></div>
<div class="row"><div class="l"><div class="t">Top-Aktien</div><div class="s">Meldungen der Top-Aktien-App</div></div><button class="btn kl ${S.stumm && S.stumm.top ? "sek" : ""}" data-stumm="top">${S.stumm && S.stumm.top ? "🔕 stumm" : "🔔 an"}</button></div>
<div class="small mut" style="margin-top:6px">Antworten auf deine Befehle kommen immer. Geht auch im Bot mit /stumm.</div></div>
<h2>Abgleich mit dem Bot</h2><div class="card">
<div class="small">Damit der Telegram-Bot dein Depot kennt (Stückzahlen in Nachrichten), wird es verschlüsselt im Repository gespeichert. Gleiche Werte wie beim alten Aktien Helfer.</div>
<label>GitHub-Repository<input id="ghRepo" value="${esc(S.settings.ghRepo)}"></label>
<label>GitHub-Schlüssel (Token)<input id="ghToken" type="password" value="${esc(S.settings.ghToken)}"></label>
<label>Sync-Passwort (= SYNC_PASSWORD)<input id="syncPass" type="password" value="${esc(S.settings.syncPass)}"></label>
<button class="btn" data-act="settings">Speichern & Depot laden</button></div>
<h2>Telegram-Befehle</h2><div class="card small">/status · /auftrag · /erledigt · /depot · /liste · /bargeld 5000 · /kauf AAPL 3 210 · /verkauf AAPL 3 220 · /hilfe</div>
<h2>Daten</h2><div class="card"><button class="btn sek" data-act="reset">Lokale Daten löschen</button></div>`;

function zeigen() {
  const r = (location.hash.slice(1) || "status").split("-")[0], f = R[r] || R.status;
  V.innerHTML = f(); document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.go === r));
}
document.addEventListener("click", async e => {
  const cp = e.target.closest("[data-copy]"); if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast("ISIN kopiert – in Trade Republic suchen") } catch (_) { toast(cp.dataset.copy) } return }
  const st = e.target.closest("[data-stumm]");
  if (st) {
    if (!S.settings.ghToken) return toast("Dafür den GitHub-Schlüssel unten eintragen (oder im Bot /stumm)");
    const app = st.dataset.stumm; S.stumm = Object.assign({top: false, plan: false}, S.stumm); S.stumm[app] = !S.stumm[app]; speichern(); zeigen();
    try {
      const alt = await gh("data/stumm.json"), body = {message: "Benachrichtigungen geändert (App)", content: b64(te.encode(JSON.stringify(Object.assign({}, S.stumm, {geaendert: new Date().toISOString()}))))};
      if (alt) body.sha = alt.sha;
      const r = await fetch(`https://api.github.com/repos/${S.settings.ghRepo}/contents/data/stumm.json`, {method: "PUT", headers: {Authorization: `Bearer ${S.settings.ghToken}`, Accept: "application/vnd.github+json"}, body: JSON.stringify(body)});
      if (!r.ok) throw new Error("GitHub " + r.status);
      toast((app === "top" ? "Top-Aktien " : "Anlageplan ") + (S.stumm[app] ? "stumm" : "wieder an"));
    } catch (err) { toast("Nicht gespeichert: " + err.message) }
    return;
  }
  const g = e.target.closest("[data-go]"); if (g) { location.hash = g.dataset.go; return }
  const ed = e.target.closest("[data-edit]");
  if (ed) {
    const s = ed.dataset.edit, x = DEP.pos[s], akt = preis(s) || x.p, zahl = zahlVon;
    const inv = zahl(prompt(`${nm(s)}: Wie viel € hast du insgesamt investiert?`, (x.n * x.p).toFixed(2).replace(".", ",")));
    if (!isFinite(inv) || inv <= 0) return;
    const wert = zahl(prompt(`Und wie viel ist es laut Trade Republic jetzt wert (€)?`, (x.n * akt).toFixed(2).replace(".", ",")));
    if (!isFinite(wert) || wert <= 0) return;
    const n = Math.round(wert / akt * 1e6) / 1e6; DEP.pos[s] = {n, p: inv / n};
    await depotSenden(); zeigen(); return;
  }
  const d = e.target.closest("[data-del]"); if (d) { if (confirm(`${nm(d.dataset.del)} aus dem Depot löschen?`)) { delete DEP.pos[d.dataset.del]; await depotSenden(); zeigen() } return }
  const a = e.target.closest("[data-act]"); if (!a) return; const act = a.dataset.act;
  if (act === "erledigt") { anwenden(PLAN.orders.liste); PLAN.orders.done = true; S.erledigt = PLAN.orders.id; DEP.erledigt = PLAN.orders.id; await depotSenden(); zeigen() }
  if (act === "angleichen") { anwenden(auftraegeAktuell()); await depotSenden(); zeigen() }
  if (act === "cash") { const v = parseFloat($("#cash").value.replace(",", ".")); if (!isFinite(v)) return toast("Betrag prüfen"); DEP.cash = v; await depotSenden(); zeigen() }
  if (act === "kauf" || act === "verkauf") {
    const s = $("#sym").value, zahl = id => zahlVon($("#" + id).value);
    let p = zahl("p"), n = zahl("n"); const b = zahl("betrag"), akt = preis(s);
    if (!isFinite(p)) p = akt; if (!p) return toast("Kurs eingeben");
    if (!isFinite(n)) { if (!isFinite(b) || b <= 0) return toast("Betrag in € oder Stück eingeben"); n = b / p }
    if (n <= 0) return toast("Stück prüfen");
    if (akt && Math.abs(p / akt - 1) > 0.25 && !confirm(`Der Kurs ${eur(p)} weicht stark vom aktuellen Kurs ${eur(akt)} ab. Trotzdem speichern?`)) return;
    if (act === "verkauf" && !(DEP.pos[s] && DEP.pos[s].n >= n - 1e-6)) return toast("So viele Stück sind nicht im Depot");
    if (act === "verkauf" && DEP.pos[s].n - n < 1e-4) n = DEP.pos[s].n; // Rest komplett
    anwenden([{s, act, n, preis: p, betrag: isFinite(b) && b > 0 ? b : n * p}], false); await depotSenden(); zeigen();
    toast(`${act === "kauf" ? "Kauf" : "Verkauf"} eingetragen: ${eur(isFinite(b) && b > 0 ? b : n * p)} · Bargeld ${eur(DEP.cash)} · ${S.syncInfo || ""}`);
  }
  if (act === "settings") { for (const k of ["ghRepo", "ghToken", "syncPass"]) S.settings[k] = $("#" + k).value.trim(); speichern(); await depotHolen(); toast(S.syncInfo || "Gespeichert"); zeigen() }
  if (act === "reset") { if (confirm("Alle lokalen Daten löschen?")) { localStorage.removeItem(KEY); S = laden(); DEP = {cash: 0, pos: {}, updatedAt: 0}; zeigen() } }
});
window.addEventListener("hashchange", zeigen);
$("#reload").onclick = async () => { await planHolen(); await depotHolen(); zeigen(); toast("Aktualisiert") };
(async () => {
  PLAN = S.plan || null; zeigen();
  await planHolen();
  if (PLAN && PLAN.orders && S.erledigt === PLAN.orders.id) PLAN.orders.done = true;
  await depotHolen(); zeigen();
  // immer aktuell halten: alle 2 Minuten und beim Zurückkehren in die App neu laden
  const neu = async () => {
    if (document.hidden) return; await planHolen();
    const r = (location.hash.slice(1) || "status").split("-")[0];
    if (["depot", "einstellungen"].includes(r)) return; // Eingaben nicht überschreiben
    await depotHolen(); zeigen() };
  setInterval(neu, 120000); document.addEventListener("visibilitychange", neu);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
